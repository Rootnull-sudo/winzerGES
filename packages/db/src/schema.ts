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
  bigint,
  boolean,
  customType,
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
