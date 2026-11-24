/**
 * Esquema Postgres de Winzer v2.
 *
 * Convenciones (ver docs/v2/datos.md):
 *  - Tablas de negocio: `...base()` (incluye `org_id`). Al migrar reciben RLS automáticamente (tables.ts + ensure.ts):
 *    no se escribe SQL por tabla. La app fija `app.org_id` por transacción (tenancy.ts).
 *  - Ids `text`: el cliente genera UUID (necesario offline) y se aceptan ids de v1 al importar.
 *  - `version` (concurrencia optimista) y `deleted_at` (borrado lógico, necesario para sync).
 *  - Tablas offline además llevan `...syncCols()` (`seq`/`xid`, cursor de sync); el trigger también es automático.
 *  - Nombres de campo TS = nombres de v1 (js/data/schema.js) para que importar y portar sea directo.
 *  - Montos CLP en bigint (mode number: < 2^53), superficies/litros en numeric.
 */
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  customType,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const money = (name: string) => bigint(name, { mode: 'number' });
const num = (name: string) => numeric(name, { mode: 'number' });
/** Id de transacción de 64 bits (Postgres 13+), comparable y sin wraparound. Se lee como string. */
const xid8 = customType<{ data: string; driverData: string }>({ dataType: () => 'xid8' });

/* ------------------------------------------------------------------ */
/* Autenticación (Better Auth). Globales: sin org_id ni RLS.           */
/* ------------------------------------------------------------------ */
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow()
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: ts('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' })
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: ts('access_token_expires_at'),
  refreshTokenExpiresAt: ts('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow()
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: ts('expires_at').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow()
});

/* ------------------------------------------------------------------ */
/* Tenancy: viñas, membresías, invitaciones, roles personalizados       */
/* ------------------------------------------------------------------ */
export const organization = pgTable('organization', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  nombre: text('nombre').notNull(),
  razonSocial: text('razon_social'),
  rut: text('rut'),
  plan: text('plan').notNull().default('piloto'),
  /** Overrides de OrgConfig (@winzer/domain): tributario, remuneraciones, enología… */
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow()
});

export const member = pgTable(
  'member',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Id de rol: predefinido (@winzer/domain ROLES) o personalizado (org_role.id). */
    role: text('role').notNull(),
    estado: text('estado').notNull().default('activo'),
    /** Recibir por correo el resumen diario de avisos nuevos de esta viña (F0-8). */
    resumenAlertas: boolean('resumen_alertas').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow()
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index('member_user_idx').on(t.userId)]
);

export const invitation = pgTable('invitation', {
  id: text('id').primaryKey(),
  orgId: text('org_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull(),
  /** Hash SHA-256 del token del enlace (el token en claro solo se muestra al crearla). */
  tokenHash: text('token_hash').notNull().unique(),
  invitedBy: text('invited_by')
    .notNull()
    .references(() => user.id),
  expiresAt: ts('expires_at').notNull(),
  acceptedAt: ts('accepted_at'),
  createdAt: ts('created_at').notNull().defaultNow()
});

export const orgRole = pgTable(
  'org_role',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    nombre: text('nombre').notNull(),
    descripcion: text('descripcion').notNull().default(''),
    permisos: jsonb('permisos').$type<Record<string, string>>().notNull().default({})
  },
  (t) => [primaryKey({ columns: [t.orgId, t.id] })]
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    at: ts('at').notNull().defaultNow(),
    userId: text('user_id'),
    userName: text('user_name'),
    accion: text('accion').notNull(),
    entidad: text('entidad').notNull(),
    registroId: text('registro_id'),
    descripcion: text('descripcion'),
    campos: text('campos')
  },
  (t) => [index('audit_org_at_idx').on(t.orgId, t.at)]
);

/**
 * Tablas con `org_id` que NO llevan RLS: son el mapa de acceso (quién pertenece a qué viña) y se consultan
 * siempre filtrando por usuario desde orgs.ts. Cualquier otra tabla con `org_id` recibe RLS automáticamente
 * al migrar (ver tables.ts y migrate.ts): agregar una tabla de negocio NO requiere SQL escrito a mano.
 */
export const NO_RLS_TABLES = ['member', 'invitation'] as const;

/**
 * Tablas globales (sin org_id) que la app solo lee: las escriben el seed, las migraciones y los jobs con la conexión
 * de administración. ensure.ts revoca a winzer_app todo permiso salvo SELECT.
 */
export const GLOBAL_READONLY_TABLES = ['indicador', 'plan'] as const;

/* ------------------------------------------------------------------ */
/* Columnas comunes                                                    */
/* ------------------------------------------------------------------ */
export const syncSeq = pgSequence('sync_seq');

const base = () => ({
  id: text('id').primaryKey(),
  orgId: text('org_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),
  createdAt: ts('created_at').notNull().defaultNow(),
  createdBy: text('created_by'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  updatedBy: text('updated_by'),
  deletedAt: ts('deleted_at'),
  /** Marcado al cargar datos de ejemplo o importar el demo de v1. */
  demo: boolean('demo').notNull().default(false)
});

/** Para entidades offline: cursor de sincronización. `xid` permite un pull sin saltos con transacciones concurrentes. */
const syncCols = () => ({
  seq: bigint('seq', { mode: 'number' })
    .notNull()
    .default(sql`nextval('sync_seq')`),
  xid: xid8('xid')
    .notNull()
    .default(sql`pg_current_xact_id()`)
});

/* ==================================================================
 * Tablas de módulos. Cada módulo agrega SU bloque al final del archivo
 * (así dos ramas en paralelo no editan las mismas líneas).
 * ================================================================== */

/* --- Clientes y cobranza (online) --- */
export const cliente = pgTable(
  'cliente',
  {
    ...base(),
    nombre: text('nombre').notNull(),
    rut: text('rut').notNull(),
    tipo: text('tipo').notNull(),
    giro: text('giro'),
    canal: text('canal'),
    contacto: text('contacto'),
    email: text('email'),
    telefono: text('telefono'),
    direccion: text('direccion'),
    comuna: text('comuna'),
    condiciones: text('condiciones'),
    plazo: integer('plazo').notNull().default(30)
  },
  (t) => [index('cliente_org_idx').on(t.orgId, t.nombre)]
);

export const cobro = pgTable(
  'cobro',
  {
    ...base(),
    fecha: text('fecha').notNull(),
    clienteId: text('cliente_id')
      .notNull()
      .references(() => cliente.id),
    ventaId: text('venta_id'),
    monto: money('monto').notNull(),
    medio: text('medio').notNull().default('transferencia'),
    glosa: text('glosa')
  },
  (t) => [index('cobro_org_fecha_idx').on(t.orgId, t.fecha)]
);

/* --- Catastro (offline) --- */
export const cuartel = pgTable(
  'cuartel',
  {
    ...base(),
    ...syncCols(),
    codigo: text('codigo').notNull(),
    variedad: text('variedad').notNull(),
    tipo: text('tipo').notNull(),
    valle: text('valle'),
    sector: text('sector'),
    superficie: num('superficie').notNull(),
    anioPlantacion: integer('anio_plantacion'),
    patron: text('patron'),
    conduccion: text('conduccion'),
    densidad: integer('densidad'),
    plantas: integer('plantas'),
    cajonesEstimados: integer('cajones_estimados'),
    estadoSanitario: text('estado_sanitario'),
    costoPlantacion: money('costo_plantacion'),
    observaciones: text('observaciones')
  },
  (t) => [
    uniqueIndex('cuartel_codigo_uq')
      .on(t.orgId, sql`lower(${t.codigo})`)
      .where(sql`${t.deletedAt} is null`),
    index('cuartel_sync_idx').on(t.orgId, t.seq)
  ]
);

/* --- Configuración: maestros (offline) --- */
export const variedad = pgTable(
  'variedad',
  {
    ...base(),
    ...syncCols(),
    nombre: text('nombre').notNull(),
    tipo: text('tipo').notNull()
  },
  (t) => [
    uniqueIndex('variedad_nombre_uq')
      .on(t.orgId, sql`lower(${t.nombre})`)
      .where(sql`${t.deletedAt} is null`),
    index('variedad_sync_idx').on(t.orgId, t.seq)
  ]
);

/* --- Núcleo: temporadas (offline, ADR 0011) --- */
export const temporada = pgTable(
  'temporada',
  {
    ...base(),
    ...syncCols(),
    /** Año de la vendimia: la temporada 2026 va por defecto de 2025-07-01 a 2026-06-30. */
    anio: integer('anio').notNull(),
    inicio: text('inicio').notNull(),
    fin: text('fin').notNull(),
    /** abierta | cerrada (cerrada = solo lectura para los registros de esa temporada). */
    estado: text('estado').notNull().default('abierta')
  },
  (t) => [
    uniqueIndex('temporada_anio_uq')
      .on(t.orgId, t.anio)
      .where(sql`${t.deletedAt} is null`),
    index('temporada_sync_idx').on(t.orgId, t.seq)
  ]
);

/* --- Núcleo: secuencias de códigos y folios (online) --- */
/**
 * Contador por viña y clave (`venta`, `orden_envasado:2026`, `dte:33`…). Se incrementa con un upsert que bloquea
 * la fila hasta el fin de la transacción: dos ventas simultáneas nunca reciben el mismo número, y si la transacción
 * se revierte el número no se consume (sin huecos). Ver services/secuencias.ts.
 */
export const secuencia = pgTable(
  'secuencia',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    clave: text('clave').notNull(),
    /** Próximo número a entregar. */
    siguiente: bigint('siguiente', { mode: 'number' }).notNull().default(1),
    updatedAt: ts('updated_at').notNull().defaultNow()
  },
  (t) => [primaryKey({ columns: [t.orgId, t.clave] })]
);

/* --- Núcleo: parámetros con vigencia (online, ADR 0011) --- */
/** Valor de un parámetro de la viña desde una fecha. Un cambio es una fila nueva: la historia no se pisa. */
export const parametroOrg = pgTable(
  'parametro_org',
  {
    ...base(),
    /** `grupo.campo` del catálogo PARAMETROS (@winzer/domain). */
    clave: text('clave').notNull(),
    valor: jsonb('valor').notNull(),
    vigenteDesde: text('vigente_desde').notNull()
  },
  (t) => [
    uniqueIndex('parametro_org_vigencia_uq')
      .on(t.orgId, t.clave, t.vigenteDesde)
      .where(sql`${t.deletedAt} is null`)
  ]
);

/** Indicadores públicos (UF, UTM, IMM, retención de honorarios) por fecha. Global: sin org_id ni RLS, solo lectura para la app. */
export const indicador = pgTable(
  'indicador',
  {
    clave: text('clave').notNull(),
    fecha: text('fecha').notNull(),
    valor: num('valor').notNull(),
    fuente: text('fuente'),
    updatedAt: ts('updated_at').notNull().defaultNow()
  },
  (t) => [primaryKey({ columns: [t.clave, t.fecha] })]
);

/* --- Núcleo: alertas calculadas por el job (ADR 0012) --- */
/**
 * Hallazgos del motor de reglas. Una abierta por (regla, registro): el job la crea, la actualiza mientras se
 * cumple y la pasa a `resuelta` cuando deja de cumplirse. La campana de la barra superior lee las abiertas.
 */
export const alerta = pgTable(
  'alerta',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    regla: text('regla').notNull(),
    /** info | warn | bad */
    severidad: text('severidad').notNull(),
    /** Módulo dueño: solo la ven los roles con permiso de ver ese módulo. */
    modulo: text('modulo').notNull(),
    entidad: text('entidad'),
    /** Registro al que apunta ('' si la alerta es de la viña completa). */
    registroId: text('registro_id').notNull().default(''),
    titulo: text('titulo').notNull(),
    mensaje: text('mensaje'),
    /** Ruta relativa a la viña (`configuracion#temporadas`). */
    ruta: text('ruta'),
    /** abierta | resuelta */
    estado: text('estado').notNull().default('abierta'),
    detectadaEn: ts('detectada_en').notNull().defaultNow(),
    actualizadaEn: ts('actualizada_en').notNull().defaultNow(),
    resueltaEn: ts('resuelta_en')
  },
  (t) => [
    uniqueIndex('alerta_abierta_uq')
      .on(t.orgId, t.regla, t.registroId)
      .where(sql`${t.estado} = 'abierta'`),
    index('alerta_org_estado_idx').on(t.orgId, t.estado)
  ]
);

/** Alertas que cada usuario ya vio (para el contador de la campana). */
export const alertaVista = pgTable(
  'alerta_vista',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    alertaId: text('alerta_id')
      .notNull()
      .references(() => alerta.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    vistaEn: ts('vista_en').notNull().defaultNow()
  },
  (t) => [primaryKey({ columns: [t.alertaId, t.userId] })]
);

/* --- Núcleo: planes y suscripción (ADR 0014) --- */
/** Catálogo de planes. Global y de solo lectura para la app: migrate.ts lo sincroniza desde PLANES (@winzer/domain). */
export const plan = pgTable('plan', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  /** null = todos los módulos. */
  modulos: jsonb('modulos').$type<string[] | null>(),
  maxUsuarios: integer('max_usuarios').notNull(),
  maxGb: num('max_gb').notNull(),
  /** Mensual en CLP; null = por definir. */
  precioClp: money('precio_clp')
});

/**
 * Suscripción vigente de la viña (una por viña). La lee requireOrg para calcular el acceso (accesoDe en
 * @winzer/domain). La crea createOrganization (prueba de 30 días) y la cambia `npm run plan` hasta que exista el
 * cobro real (F8-1); ninguna pantalla de la app la modifica.
 */
export const suscripcion = pgTable('suscripcion', {
  orgId: text('org_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  planId: text('plan_id')
    .notNull()
    .references(() => plan.id),
  /** prueba | activa | morosa | cancelada */
  estado: text('estado').notNull(),
  periodoInicio: text('periodo_inicio').notNull(),
  periodoFin: text('periodo_fin'),
  /** manual | flow | mercadopago | stripe */
  proveedor: text('proveedor').notNull().default('manual'),
  idExterno: text('id_externo'),
  updatedAt: ts('updated_at').notNull().defaultNow()
});

/* --- Núcleo: adjuntos (online, ADR 0013) --- */
/** Metadatos de un archivo guardado en el almacenamiento S3 (R2). El archivo nunca pasa por Postgres. */
export const adjunto = pgTable(
  'adjunto',
  {
    ...base(),
    entidad: text('entidad').notNull(),
    registroId: text('registro_id').notNull(),
    /** `org_id/entidad/registro_id/uuid-nombre`. */
    claveObjeto: text('clave_objeto').notNull(),
    nombre: text('nombre').notNull(),
    mime: text('mime').notNull(),
    bytes: bigint('bytes', { mode: 'number' }).notNull()
  },
  (t) => [index('adjunto_registro_idx').on(t.orgId, t.entidad, t.registroId)]
);

/* --- Insumos (F1-1): maestro offline de solo lectura, historial de precios y libro de movimientos --- */
export const insumo = pgTable(
  'insumo',
  {
    ...base(),
    ...syncCols(),
    nombre: text('nombre').notNull(),
    categoria: text('categoria').notNull(),
    tipo: text('tipo'),
    unidad: text('unidad').notNull(),
    npk: text('npk'),
    /** Último precio por unidad (CLP). La historia está en insumo_precio. */
    precio: money('precio').notNull().default(0),
    /** Proveedor habitual (F3-1). */
    proveedorId: text('proveedor_id').references((): AnyPgColumn => proveedor.id),
    stockMinimo: num('stock_minimo'),
    stockInicial: num('stock_inicial'),
    vencimiento: text('vencimiento'),
    /** Días de carencia (agrícolas). */
    carencia: integer('carencia'),
    quimico: text('quimico'),
    so2Pct: num('so2_pct'),
    plazoEntrega: integer('plazo_entrega'),
    condiciones: text('condiciones')
  },
  (t) => [
    uniqueIndex('insumo_nombre_uq')
      .on(t.orgId, sql`lower(${t.nombre})`)
      .where(sql`${t.deletedAt} is null`),
    index('insumo_sync_idx').on(t.orgId, t.seq)
  ]
);

/** Historial de precios de un insumo (reemplaza historialPrecios de v1). */
export const insumoPrecio = pgTable(
  'insumo_precio',
  {
    ...base(),
    insumoId: text('insumo_id')
      .notNull()
      .references(() => insumo.id),
    fecha: text('fecha').notNull(),
    precio: money('precio').notNull(),
    proveedorId: text('proveedor_id').references((): AnyPgColumn => proveedor.id),
    /** manual | compra */
    origen: text('origen').notNull().default('manual'),
    compraId: text('compra_id').references((): AnyPgColumn => compra.id)
  },
  (t) => [index('insumo_precio_insumo_idx').on(t.orgId, t.insumoId, t.fecha)]
);

/** Libro de movimientos de insumos (solo agregar). Stock = stock_inicial + Σ cantidad (v_stock_insumo). */
export const movInsumo = pgTable(
  'mov_insumo',
  {
    ...base(),
    ...syncCols(),
    fecha: text('fecha').notNull(),
    insumoId: text('insumo_id')
      .notNull()
      .references(() => insumo.id),
    /** Con signo, en la unidad del insumo. */
    cantidad: num('cantidad').notNull(),
    /** compra | aplicacion | aditivo | so2 | consumo_envasado | ajuste | nota_credito */
    tipo: text('tipo').notNull(),
    costoUnitario: num('costo_unitario'),
    motivo: text('motivo'),
    /** Documento que lo originó (p. ej. aplicacion + su id): las reacciones lo reescriben por aquí. */
    origenTipo: text('origen_tipo'),
    origenId: text('origen_id')
  },
  (t) => [
    index('mov_insumo_insumo_idx').on(t.orgId, t.insumoId),
    index('mov_insumo_origen_idx').on(t.orgId, t.origenTipo, t.origenId),
    index('mov_insumo_sync_idx').on(t.orgId, t.seq)
  ]
);

/* --- Desborre, fenología y clima (F1-2, offline) --- */
export const fenologia = pgTable(
  'fenologia',
  {
    ...base(),
    ...syncCols(),
    cuartelId: text('cuartel_id')
      .notNull()
      .references(() => cuartel.id),
    temporadaId: text('temporada_id')
      .notNull()
      .references(() => temporada.id),
    desborreInicio: text('desborre_inicio').notNull(),
    desborre50: text('desborre_50'),
    desborreFin: text('desborre_fin'),
    bbch: text('bbch'),
    floracion: text('floracion'),
    envero: text('envero'),
    observaciones: text('observaciones')
  },
  (t) => [
    uniqueIndex('fenologia_cuartel_temporada_uq')
      .on(t.orgId, t.cuartelId, t.temporadaId)
      .where(sql`${t.deletedAt} is null`),
    index('fenologia_sync_idx').on(t.orgId, t.seq)
  ]
);

export const clima = pgTable(
  'clima',
  {
    ...base(),
    ...syncCols(),
    fecha: text('fecha').notNull(),
    temporadaId: text('temporada_id')
      .notNull()
      .references(() => temporada.id),
    tmax: num('tmax').notNull(),
    tmin: num('tmin').notNull(),
    estacion: text('estacion')
  },
  (t) => [
    uniqueIndex('clima_fecha_estacion_uq')
      .on(t.orgId, t.fecha, sql`lower(coalesce(${t.estacion}, ''))`)
      .where(sql`${t.deletedAt} is null`),
    index('clima_sync_idx').on(t.orgId, t.seq)
  ]
);

/* --- Aplicaciones y labores (F1-3, offline) --- */
export const aplicacion = pgTable(
  'aplicacion',
  {
    ...base(),
    ...syncCols(),
    fecha: text('fecha').notNull(),
    temporadaId: text('temporada_id')
      .notNull()
      .references(() => temporada.id),
    cuartelId: text('cuartel_id')
      .notNull()
      .references(() => cuartel.id),
    insumoId: text('insumo_id')
      .notNull()
      .references(() => insumo.id),
    /** Por hectárea, en la unidad del insumo. */
    dosis: num('dosis').notNull(),
    cantidad: num('cantidad').notNull(),
    /** Foto de la carencia del insumo (días). */
    carencia: integer('carencia'),
    /** Foto: cantidad × precio del insumo al registrar. */
    costo: money('costo').notNull().default(0),
    responsable: text('responsable'),
    observaciones: text('observaciones')
  },
  (t) => [index('aplicacion_cuartel_idx').on(t.orgId, t.cuartelId, t.fecha), index('aplicacion_sync_idx').on(t.orgId, t.seq)]
);

export const labor = pgTable(
  'labor',
  {
    ...base(),
    ...syncCols(),
    fecha: text('fecha').notNull(),
    temporadaId: text('temporada_id')
      .notNull()
      .references(() => temporada.id),
    cuartelId: text('cuartel_id')
      .notNull()
      .references(() => cuartel.id),
    tipo: text('tipo').notNull(),
    jornadas: num('jornadas'),
    valorJornada: money('valor_jornada'),
    otrosCostos: money('otros_costos'),
    /** jornadas × valor + otros (calculado al guardar). */
    costo: money('costo').notNull().default(0),
    responsable: text('responsable')
  },
  (t) => [index('labor_cuartel_idx').on(t.orgId, t.cuartelId, t.fecha), index('labor_sync_idx').on(t.orgId, t.seq)]
);

/* --- Cosecha y jornales (F1-4, offline) --- */
export const cosecha = pgTable(
  'cosecha',
  {
    ...base(),
    ...syncCols(),
    fecha: text('fecha').notNull(),
    temporadaId: text('temporada_id')
      .notNull()
      .references(() => temporada.id),
    cuartelId: text('cuartel_id')
      .notNull()
      .references(() => cuartel.id),
    /** Lote de bodega (reacción: lote Planificado → En vendimia). */
    loteId: text('lote_id').references((): AnyPgColumn => lote.id),
    cajones: integer('cajones').notNull(),
    kg: num('kg').notNull(),
    /** propia | venta | descarte */
    destino: text('destino').notNull().default('propia'),
    costoBins: money('costo_bins'),
    costoTransporte: money('costo_transporte'),
    costoAlimentacion: money('costo_alimentacion'),
    otrosCostos: money('otros_costos'),
    observaciones: text('observaciones')
  },
  (t) => [index('cosecha_cuartel_idx').on(t.orgId, t.cuartelId, t.fecha), index('cosecha_sync_idx').on(t.orgId, t.seq)]
);

export const jornal = pgTable(
  'jornal',
  {
    ...base(),
    ...syncCols(),
    cosechaId: text('cosecha_id')
      .notNull()
      .references(() => cosecha.id),
    nombre: text('nombre').notNull(),
    rut: text('rut'),
    cuadrilla: text('cuadrilla'),
    trabajadores: integer('trabajadores').notNull().default(1),
    horas: num('horas'),
    /** kg | cajon | dia */
    tarifaTipo: text('tarifa_tipo').notNull(),
    tarifa: money('tarifa').notNull(),
    kg: num('kg'),
    cajones: integer('cajones'),
    jornadas: num('jornadas'),
    /** tarifa × cantidad, calculado al guardar. */
    pago: money('pago').notNull().default(0)
  },
  (t) => [index('jornal_cosecha_idx').on(t.orgId, t.cosechaId), index('jornal_sync_idx').on(t.orgId, t.seq)]
);

/* --- Calendario de vendimia: lotes y ventanas (F2-1, offline) --- */
export const lote = pgTable(
  'lote',
  {
    ...base(),
    ...syncCols(),
    codigo: text('codigo').notNull(),
    temporadaId: text('temporada_id')
      .notNull()
      .references(() => temporada.id),
    /** Cuarteles de origen (v1: cuartelIds). Lista en el lote para que funcione igual offline. */
    cuartelIds: jsonb('cuartel_ids').$type<string[]>().notNull().default([]),
    variedad: text('variedad').notNull(),
    tipo: text('tipo').notNull(),
    valle: text('valle'),
    /** Planificado → En vendimia → En molienda → Fermentando → (Macerando) → FML → En guarda → Envasado → Finalizado */
    estado: text('estado').notNull().default('Planificado'),
    litrosEstimados: num('litros_estimados'),
    costoUvaComprada: money('costo_uva_comprada'),
    fechaVendimiaPlan: text('fecha_vendimia_plan').notNull(),
    diasVendimia: integer('dias_vendimia'),
    diasFA: integer('dias_fa'),
    diasMaceracion: integer('dias_maceracion'),
    diasFML: integer('dias_fml'),
    diasGuarda: integer('dias_guarda'),
    inicioVendimiaReal: text('inicio_vendimia_real'),
    fechaMoliendaReal: text('fecha_molienda_real'),
    inicioFAReal: text('inicio_fa_real'),
    finFAReal: text('fin_fa_real')
  },
  (t) => [
    uniqueIndex('lote_codigo_uq')
      .on(t.orgId, sql`lower(${t.codigo})`)
      .where(sql`${t.deletedAt} is null`),
    index('lote_sync_idx').on(t.orgId, t.seq)
  ]
);

export const ventana = pgTable(
  'ventana',
  {
    ...base(),
    ...syncCols(),
    variedad: text('variedad').notNull(),
    valle: text('valle').notNull(),
    /** mm-dd */
    desde: text('desde').notNull(),
    hasta: text('hasta').notNull(),
    fuente: text('fuente')
  },
  (t) => [
    uniqueIndex('ventana_variedad_valle_uq')
      .on(t.orgId, sql`lower(${t.variedad})`, sql`lower(${t.valle})`)
      .where(sql`${t.deletedAt} is null`),
    index('ventana_sync_idx').on(t.orgId, t.seq)
  ]
);

/* --- Control de bodega: estanques y libro de movimientos (F2-2, offline) --- */
export const estanque = pgTable(
  'estanque',
  {
    ...base(),
    ...syncCols(),
    codigo: text('codigo').notNull(),
    /** Litros. */
    capacidad: num('capacidad').notNull(),
    material: text('material'),
    tipo: text('tipo'),
    ubicacion: text('ubicacion'),
    /** operativo | mantencion | reservado (ocupado/vacío se calcula con los movimientos). */
    estado: text('estado').notNull().default('operativo'),
    costoMantencion: money('costo_mantencion')
  },
  (t) => [
    uniqueIndex('estanque_codigo_uq')
      .on(t.orgId, sql`lower(${t.codigo})`)
      .where(sql`${t.deletedAt} is null`),
    index('estanque_sync_idx').on(t.orgId, t.seq)
  ]
);

/** Libro de movimientos de vino (solo agregar). Litros del estanque = Σ litros (v_stock_estanque). */
export const movBodega = pgTable(
  'mov_bodega',
  {
    ...base(),
    ...syncCols(),
    fecha: text('fecha').notNull(),
    estanqueId: text('estanque_id')
      .notNull()
      .references(() => estanque.id),
    loteId: text('lote_id')
      .notNull()
      .references(() => lote.id),
    /** Con signo: + entra, − sale. */
    litros: num('litros').notNull(),
    /** entrada | trasiego_salida | trasiego_entrada | merma | vinagre | envasado | venta_granel | ajuste */
    tipo: text('tipo').notNull(),
    /** uva | mosto | vino (solo entradas). */
    origen: text('origen'),
    kgUva: num('kg_uva'),
    /** Movimientos de una misma operación (trasiego). */
    grupo: text('grupo'),
    motivo: text('motivo'),
    glosa: text('glosa'),
    origenTipo: text('origen_tipo'),
    origenId: text('origen_id')
  },
  (t) => [
    index('mov_bodega_estanque_idx').on(t.orgId, t.estanqueId),
    index('mov_bodega_lote_idx').on(t.orgId, t.loteId),
    index('mov_bodega_grupo_idx').on(t.orgId, t.grupo),
    index('mov_bodega_sync_idx').on(t.orgId, t.seq)
  ]
);

/* --- Fermentación: fichas, seguimiento y SO₂ (F2-3, offline) --- */
export const fermentacion = pgTable(
  'fermentacion',
  {
    ...base(),
    ...syncCols(),
    codigo: text('codigo').notNull(),
    loteId: text('lote_id')
      .notNull()
      .references(() => lote.id),
    estanqueId: text('estanque_id').references(() => estanque.id),
    tipo: text('tipo').notNull(),
    variedad: text('variedad'),
    volumen: num('volumen').notNull(),
    brixInicial: num('brix_inicial'),
    phInicial: num('ph_inicial'),
    acidezInicial: num('acidez_inicial'),
    levadura: text('levadura'),
    nutrientes: text('nutrientes'),
    temperaturaObjetivo: text('temperatura_objetivo'),
    diasPlanificados: integer('dias_planificados'),
    fechaMolienda: text('fecha_molienda'),
    inicioFA: text('inicio_fa'),
    inicioTumultuosa: text('inicio_tumultuosa'),
    fechaCorte: text('fecha_corte'),
    finFA: text('fin_fa'),
    inicioMaceracion: text('inicio_maceracion'),
    finMaceracion: text('fin_maceracion'),
    inicioFML: text('inicio_fml'),
    finFML: text('fin_fml'),
    alcoholFinal: num('alcohol_final'),
    azucarResidual: num('azucar_residual'),
    /** borrador | activa | cerrada */
    estado: text('estado').notNull().default('activa')
  },
  (t) => [
    uniqueIndex('fermentacion_codigo_uq')
      .on(t.orgId, sql`lower(${t.codigo})`)
      .where(sql`${t.deletedAt} is null`),
    index('fermentacion_lote_idx').on(t.orgId, t.loteId),
    index('fermentacion_sync_idx').on(t.orgId, t.seq)
  ]
);

export const seguimiento = pgTable(
  'seguimiento',
  {
    ...base(),
    ...syncCols(),
    fermentacionId: text('fermentacion_id')
      .notNull()
      .references(() => fermentacion.id),
    fecha: text('fecha').notNull(),
    responsable: text('responsable'),
    densidad: num('densidad'),
    brix: num('brix'),
    temperatura: num('temperatura'),
    ph: num('ph'),
    acidezVolatil: num('acidez_volatil'),
    so2Libre: num('so2_libre'),
    so2Total: num('so2_total'),
    observaciones: text('observaciones')
  },
  (t) => [index('seguimiento_ficha_idx').on(t.orgId, t.fermentacionId, t.fecha), index('seguimiento_sync_idx').on(t.orgId, t.seq)]
);

export const adicionSO2 = pgTable(
  'adicion_so2',
  {
    ...base(),
    ...syncCols(),
    fermentacionId: text('fermentacion_id')
      .notNull()
      .references(() => fermentacion.id),
    fecha: text('fecha').notNull(),
    insumoId: text('insumo_id')
      .notNull()
      .references(() => insumo.id),
    producto: text('producto'),
    fraccion: num('fraccion').notNull(),
    gramos: num('gramos').notNull(),
    volumen: num('volumen').notNull(),
    dosisMgL: num('dosis_mgl').notNull(),
    so2Previo: num('so2_previo'),
    so2Medido: num('so2_medido'),
    so2Teorico: num('so2_teorico').notNull(),
    modo: text('modo').notNull().default('suave'),
    motivo: text('motivo'),
    responsable: text('responsable'),
    costo: money('costo').notNull().default(0)
  },
  (t) => [index('adicion_so2_ficha_idx').on(t.orgId, t.fermentacionId), index('adicion_so2_sync_idx').on(t.orgId, t.seq)]
);

/* --- Núcleo: tareas (online, las crean las reacciones y servicios; se ven en la campana) --- */
export const tarea = pgTable(
  'tarea',
  {
    ...base(),
    titulo: text('titulo').notNull(),
    descripcion: text('descripcion'),
    fecha: text('fecha').notNull(),
    /** Para quién: un rol (p. ej. enologo) o un usuario; ambos null = toda la viña. */
    rol: text('rol'),
    userId: text('user_id'),
    /** pendiente | hecha */
    estado: text('estado').notNull().default('pendiente'),
    /** Ruta relativa a la viña. */
    ruta: text('ruta'),
    modulo: text('modulo'),
    origenTipo: text('origen_tipo'),
    origenId: text('origen_id'),
    hechaEn: ts('hecha_en'),
    hechaPor: text('hecha_por')
  },
  (t) => [index('tarea_estado_idx').on(t.orgId, t.estado)]
);

/* --- Vinificación: aditivos (F2-4, offline) --- */
export const aditivo = pgTable(
  'aditivo',
  {
    ...base(),
    ...syncCols(),
    fecha: text('fecha').notNull(),
    loteId: text('lote_id')
      .notNull()
      .references(() => lote.id),
    estanqueId: text('estanque_id').references(() => estanque.id),
    /** bentonita | tartarico | tanino | enzima | levadura | nutriente | clarificante | otro (el SO₂ va en la ficha). */
    tipo: text('tipo').notNull(),
    insumoId: text('insumo_id')
      .notNull()
      .references(() => insumo.id),
    volumen: num('volumen').notNull(),
    dosis: num('dosis').notNull(),
    /** g/hL (productos de masa) o mL/hL (líquidos). */
    unidadDosis: text('unidad_dosis').notNull(),
    /** Foto: cantidad en la unidad del insumo y su costo al registrar. */
    cantidad: num('cantidad').notNull(),
    costo: money('costo').notNull().default(0),
    objetivo: text('objetivo'),
    responsable: text('responsable'),
    observaciones: text('observaciones')
  },
  (t) => [index('aditivo_lote_idx').on(t.orgId, t.loteId), index('aditivo_sync_idx').on(t.orgId, t.seq)]
);

/* --- Laboratorio: análisis (F2-5, offline; el informe va como adjunto) --- */
export const analisis = pgTable(
  'analisis',
  {
    ...base(),
    ...syncCols(),
    fecha: text('fecha').notNull(),
    loteId: text('lote_id')
      .notNull()
      .references(() => lote.id),
    laboratorio: text('laboratorio').notNull(),
    autorizadoSAG: boolean('autorizado_sag').notNull().default(false),
    ph: num('ph'),
    acidezTotal: num('acidez_total'),
    acidezVolatil: num('acidez_volatil'),
    so2Libre: num('so2_libre'),
    so2Total: num('so2_total'),
    alcohol: num('alcohol'),
    azucarResidual: num('azucar_residual'),
    turbidez: num('turbidez'),
    densidad: num('densidad'),
    color: text('color'),
    certificadoDO: boolean('certificado_do').notNull().default(false),
    observaciones: text('observaciones')
  },
  (t) => [index('analisis_lote_idx').on(t.orgId, t.loteId), index('analisis_sync_idx').on(t.orgId, t.seq)]
);

/* --- Abastecimiento: proveedores (F3-1, online) --- */
export const proveedor = pgTable(
  'proveedor',
  {
    ...base(),
    nombre: text('nombre').notNull(),
    rut: text('rut').notNull(),
    categoria: text('categoria'),
    contacto: text('contacto'),
    email: text('email'),
    telefono: text('telefono'),
    condiciones: text('condiciones'),
    /** Días de crédito (0 = contado). */
    plazo: integer('plazo').notNull().default(30)
  },
  (t) => [
    uniqueIndex('proveedor_rut_uq')
      .on(t.orgId, t.rut)
      .where(sql`${t.deletedAt} is null`)
  ]
);

/* --- Abastecimiento: compras con líneas (F3-2, online) --- */
export const compra = pgTable(
  'compra',
  {
    ...base(),
    fecha: text('fecha').notNull(),
    proveedorId: text('proveedor_id')
      .notNull()
      .references(() => proveedor.id),
    /** factura | factura_exenta | boleta | guia | nota_credito */
    documento: text('documento').notNull(),
    folio: text('folio').notNull(),
    /** NC: compra que corrige. Factura: guía que factura (no vuelve a mover stock). */
    referenciaCompraId: text('referencia_compra_id').references((): AnyPgColumn => compra.id),
    vencimiento: text('vencimiento'),
    /** registrada | anulada */
    estado: text('estado').notNull().default('registrada'),
    /** Totales SIEMPRE positivos: el signo lo da el documento. */
    neto: money('neto').notNull().default(0),
    exento: money('exento').notNull().default(0),
    iva: money('iva').notNull().default(0),
    total: money('total').notNull().default(0),
    observaciones: text('observaciones')
  },
  (t) => [
    uniqueIndex('compra_folio_uq')
      .on(t.orgId, t.proveedorId, t.documento, t.folio)
      .where(sql`${t.deletedAt} is null and ${t.estado} <> 'anulada'`),
    index('compra_fecha_idx').on(t.orgId, t.fecha)
  ]
);

export const compraLinea = pgTable(
  'compra_linea',
  {
    ...base(),
    compraId: text('compra_id')
      .notNull()
      .references(() => compra.id),
    insumoId: text('insumo_id').references(() => insumo.id),
    descripcion: text('descripcion').notNull(),
    cantidad: num('cantidad').notNull(),
    precioUnitario: num('precio_unitario').notNull(),
    exenta: boolean('exenta').notNull().default(false),
    /** round(cantidad × precio). */
    neto: money('neto').notNull()
  },
  (t) => [index('compra_linea_compra_idx').on(t.orgId, t.compraId)]
);

/* --- Abastecimiento: pagos a proveedores y sus aplicaciones (F3-3, online) --- */
export const pago = pgTable(
  'pago',
  {
    ...base(),
    fecha: text('fecha').notNull(),
    proveedorId: text('proveedor_id').references(() => proveedor.id),
    monto: money('monto').notNull(),
    /** transferencia | cheque | efectivo | tarjeta */
    medio: text('medio').notNull().default('transferencia'),
    referencia: text('referencia'),
    observaciones: text('observaciones')
  },
  (t) => [index('pago_fecha_idx').on(t.orgId, t.fecha)]
);

/** Parte de un pago aplicada a UN documento (compra o gasto). El saldo se deriva en v_por_pagar. */
export const pagoAplicacion = pgTable(
  'pago_aplicacion',
  {
    ...base(),
    pagoId: text('pago_id')
      .notNull()
      .references(() => pago.id),
    compraId: text('compra_id').references(() => compra.id),
    gastoId: text('gasto_id').references((): AnyPgColumn => gasto.id),
    monto: money('monto').notNull()
  },
  (t) => [
    index('pago_aplicacion_pago_idx').on(t.orgId, t.pagoId),
    index('pago_aplicacion_compra_idx').on(t.orgId, t.compraId),
    check('pago_aplicacion_un_documento', sql`(${t.compraId} is null) <> (${t.gastoId} is null)`)
  ]
);

/* --- Administración: gastos y presupuesto (F3-4, online) --- */
export const gasto = pgTable(
  'gasto',
  {
    ...base(),
    fecha: text('fecha').notNull(),
    categoria: text('categoria').notNull(),
    descripcion: text('descripcion').notNull(),
    proveedorId: text('proveedor_id').references(() => proveedor.id),
    /** Neto. */
    monto: money('monto').notNull(),
    /** factura | boleta | otro */
    documento: text('documento').notNull().default('factura'),
    folio: text('folio'),
    afectoIVA: boolean('afecto_iva').notNull().default(false),
    /** Foto al registrar: IVA con la tasa de la fecha y total. */
    iva: money('iva').notNull().default(0),
    total: money('total').notNull(),
    medioPago: text('medio_pago').notNull().default('transferencia'),
    /** pagado (al contado) | pendiente (a crédito: v_por_pagar). */
    estado: text('estado').notNull().default('pagado'),
    /** fijo | variable */
    tipoCosto: text('tipo_costo').notNull().default('fijo'),
    /** admin | ventas | produccion */
    area: text('area').notNull().default('admin'),
    noDeducible: boolean('no_deducible').notNull().default(false),
    observaciones: text('observaciones')
  },
  (t) => [index('gasto_fecha_idx').on(t.orgId, t.fecha)]
);

export const presupuesto = pgTable(
  'presupuesto',
  {
    ...base(),
    anio: integer('anio').notNull(),
    categoria: text('categoria').notNull(),
    monto: money('monto').notNull()
  },
  (t) => [
    uniqueIndex('presupuesto_uq')
      .on(t.orgId, t.anio, t.categoria)
      .where(sql`${t.deletedAt} is null`)
  ]
);

/* --- Administración: activos fijos (F3-5, online; la depreciación se calcula, no se guarda) --- */
export const activo = pgTable('activo', {
  ...base(),
  nombre: text('nombre').notNull(),
  valor: money('valor').notNull(),
  vidaUtilAnios: integer('vida_util_anios').notNull(),
  fechaCompra: text('fecha_compra').notNull(),
  fechaBaja: text('fecha_baja'),
  compraId: text('compra_id').references(() => compra.id),
  observaciones: text('observaciones')
});

/* --- Personas: trabajadores (F4-1, online, sensible) --- */
export const trabajador = pgTable(
  'trabajador',
  {
    ...base(),
    nombre: text('nombre').notNull(),
    rut: text('rut').notNull(),
    cargo: text('cargo').notNull(),
    /** produccion | admin | ventas */
    area: text('area').notNull().default('produccion'),
    /** indefinido | plazo_fijo | obra */
    contrato: text('contrato').notNull().default('indefinido'),
    ingreso: text('ingreso'),
    termino: text('termino'),
    sueldoBase: money('sueldo_base').notNull(),
    /** art50 | fija | ninguna */
    gratificacion: text('gratificacion').notNull().default('art50'),
    gratificacionMonto: money('gratificacion_monto').notNull().default(0),
    bonos: money('bonos').notNull().default(0),
    comisiones: money('comisiones').notNull().default(0),
    colacion: money('colacion').notNull().default(0),
    movilizacion: money('movilizacion').notNull().default(0),
    afp: text('afp').notNull().default('Modelo'),
    tasaAfp: num('tasa_afp'),
    /** Fonasa | Isapre */
    salud: text('salud').notNull().default('Fonasa'),
    planSalud: money('plan_salud').notNull().default(0),
    vacacionesPendientes: num('vacaciones_pendientes').notNull().default(0),
    observaciones: text('observaciones')
  },
  (t) => [
    uniqueIndex('trabajador_rut_uq')
      .on(t.orgId, t.rut)
      .where(sql`${t.deletedAt} is null`)
  ]
);

/* --- Personas: remuneraciones del mes (F4-2, online, sensible) --- */
export const remuneracion = pgTable(
  'remuneracion',
  {
    ...base(),
    trabajadorId: text('trabajador_id')
      .notNull()
      .references(() => trabajador.id),
    /** YYYY-MM */
    periodo: text('periodo').notNull(),
    /** calculada | pagada */
    estado: text('estado').notNull().default('calculada'),
    fechaPago: text('fecha_pago'),
    // Novedades del mes.
    diasTrabajados: integer('dias_trabajados').notNull().default(30),
    horasExtraCantidad: num('horas_extra_cantidad').notNull().default(0),
    // Resultado de tax.liquidacion (foto).
    base: money('base').notNull(),
    gratificacion: money('gratificacion').notNull(),
    bonos: money('bonos').notNull().default(0),
    comisiones: money('comisiones').notNull().default(0),
    horasExtra: money('horas_extra').notNull().default(0),
    noImponible: money('no_imponible').notNull().default(0),
    imponible: money('imponible').notNull(),
    afp: money('afp').notNull(),
    salud: money('salud').notNull(),
    cesantia: money('cesantia').notNull(),
    tributable: money('tributable').notNull(),
    impuestoUnico: money('impuesto_unico').notNull(),
    anticipos: money('anticipos').notNull().default(0),
    descuentos: money('descuentos').notNull(),
    liquido: money('liquido').notNull(),
    cesantiaEmpleador: money('cesantia_empleador').notNull(),
    sis: money('sis').notNull(),
    aporteEmpleador: money('aporte_empleador').notNull(),
    costoEmpresa: money('costo_empresa').notNull(),
    /** Foto del trabajador: { nombre, rut, cargo, area, contrato, afp, salud }. */
    trabajadorFoto: jsonb('trabajador_foto').notNull(),
    /** Foto de los indicadores y tasas usados ({} si se importó de v1, donde no se conocían). */
    parametros: jsonb('parametros').notNull()
  },
  (t) => [
    uniqueIndex('remuneracion_periodo_uq')
      .on(t.orgId, t.trabajadorId, t.periodo)
      .where(sql`${t.deletedAt} is null`),
    index('remuneracion_periodo_idx').on(t.orgId, t.periodo)
  ]
);

/* --- Personas: honorarios (F4-3, online, sensible) --- */
export const honorario = pgTable(
  'honorario',
  {
    ...base(),
    fecha: text('fecha').notNull(),
    nombre: text('nombre').notNull(),
    rut: text('rut').notNull(),
    /** N° de boleta electrónica. */
    numero: integer('numero'),
    descripcion: text('descripcion'),
    bruto: money('bruto').notNull(),
    /** Foto: tasa vigente en la fecha de la boleta. */
    tasaRetencion: num('tasa_retencion').notNull(),
    retencion: money('retencion').notNull(),
    liquido: money('liquido').notNull(),
    /** pendiente | pagada */
    estado: text('estado').notNull().default('pendiente'),
    fechaPago: text('fecha_pago')
  },
  (t) => [
    uniqueIndex('honorario_boleta_uq')
      .on(t.orgId, t.rut, t.numero)
      .where(sql`${t.deletedAt} is null and ${t.numero} is not null`),
    index('honorario_fecha_idx').on(t.orgId, t.fecha)
  ]
);

/* --- Comercial: formatos, marcas y etiquetas (F5-1, online) --- */
export const formato = pgTable('formato', {
  ...base(),
  nombre: text('nombre').notNull(),
  litros: num('litros').notNull(),
  /** vidrio | PET | BIB | lata */
  envase: text('envase').notNull().default('vidrio'),
  unidadesCaja: integer('unidades_caja').notNull().default(12),
  stockMinimo: integer('stock_minimo').notNull().default(0)
});

export const marca = pgTable('marca', {
  ...base(),
  nombre: text('nombre').notNull(),
  titular: text('titular'),
  numeroINAPI: text('numero_inapi'),
  clases: text('clases'),
  fechaRegistro: text('fecha_registro').notNull(),
  vencimiento: text('vencimiento').notNull(),
  costo: money('costo').notNull().default(0)
});

export const etiqueta = pgTable('etiqueta', {
  ...base(),
  nombre: text('nombre').notNull(),
  /** Versión del diseño (no confundir con `version` de base(), que es el control de concurrencia). */
  versionDiseno: integer('version_diseno').notNull().default(1),
  marcaId: text('marca_id').references(() => marca.id),
  fecha: text('fecha'),
  disenador: text('disenador'),
  aprobacionLegal: boolean('aprobacion_legal').notNull().default(false),
  costoDiseno: money('costo_diseno').notNull().default(0),
  costoFotografia: money('costo_fotografia').notNull().default(0),
  costoIlustracion: money('costo_ilustracion').notNull().default(0),
  tirajeEstimado: integer('tiraje_estimado').notNull().default(0),
  tirajeMinimo: integer('tiraje_minimo').notNull().default(0),
  costoImpresion: num('costo_impresion').notNull().default(0),
  proveedorId: text('proveedor_id').references(() => proveedor.id),
  varietal: text('varietal'),
  graduacion: num('graduacion'),
  do: text('do'),
  denominacion: text('denominacion'),
  contenido: text('contenido')
});

/* --- Comercial: órdenes de envasado y libro de producto terminado (F5-2, online) --- */
export const ordenEnvasado = pgTable(
  'orden_envasado',
  {
    ...base(),
    codigo: text('codigo'),
    fecha: text('fecha').notNull(),
    estanqueId: text('estanque_id')
      .notNull()
      .references(() => estanque.id),
    loteId: text('lote_id')
      .notNull()
      .references(() => lote.id),
    formatoId: text('formato_id')
      .notNull()
      .references(() => formato.id),
    unidades: integer('unidades').notNull(),
    mermaPct: num('merma_pct').notNull().default(1.5),
    responsable: text('responsable'),
    envaseId: text('envase_id')
      .notNull()
      .references(() => insumo.id),
    cierreId: text('cierre_id').references(() => insumo.id),
    capsulaId: text('capsula_id').references(() => insumo.id),
    cajaId: text('caja_id').references(() => insumo.id),
    etiquetaId: text('etiqueta_id').references(() => etiqueta.id),
    etiquetaInsumoId: text('etiqueta_insumo_id').references(() => insumo.id),
    manoObra: money('mano_obra').notNull().default(0),
    energiaAgua: money('energia_agua').notNull().default(0),
    graduacion: num('graduacion'),
    declaraDO: boolean('declara_do').notNull().default(false),
    pctUvaZona: num('pct_uva_zona'),
    certificadoDO: text('certificado_do'),
    observaciones: text('observaciones'),
    /** borrador | confirmada | anulada */
    estado: text('estado').notNull().default('borrador'),
    // Congelados al confirmar.
    costoUnitario: num('costo_unitario'),
    costoTotal: money('costo_total'),
    litrosConsumidos: num('litros_consumidos'),
    costoPartes: jsonb('costo_partes'),
    confirmadaEn: ts('confirmada_en')
  },
  (t) => [
    uniqueIndex('orden_envasado_codigo_uq')
      .on(t.orgId, t.codigo)
      .where(sql`${t.deletedAt} is null and ${t.codigo} is not null`),
    index('orden_envasado_fecha_idx').on(t.orgId, t.fecha)
  ]
);

/** Libro de botellas: + envasar, − vender, ± ajustes. El stock se deriva (v_stock_producto). */
export const movProducto = pgTable(
  'mov_producto',
  {
    ...base(),
    fecha: text('fecha').notNull(),
    ordenEnvasadoId: text('orden_envasado_id')
      .notNull()
      .references(() => ordenEnvasado.id),
    formatoId: text('formato_id')
      .notNull()
      .references(() => formato.id),
    loteId: text('lote_id').references(() => lote.id),
    unidades: integer('unidades').notNull(),
    /** envasado | venta | anulacion | ajuste | muestra | quiebre */
    tipo: text('tipo').notNull(),
    costoUnitario: num('costo_unitario'),
    /** FK a venta_linea: la agrega F5-3. */
    ventaLineaId: text('venta_linea_id'),
    motivo: text('motivo')
  },
  (t) => [index('mov_producto_orden_idx').on(t.orgId, t.ordenEnvasadoId)]
);
