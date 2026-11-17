# Modelo de datos, multi-viña y migraciones

## Conexiones y roles de Postgres

| Rol | Usado por | RLS |
|---|---|---|
| `winzer` (dueño / superusuario en local) | migraciones, seed, tests (`adminDb()`) | la salta |
| `winzer_app` (`NOSUPERUSER NOBYPASSRLS`) | la app (`db()`) | **sujeto a RLS** |

`winzer_app` se crea en `packages/db/docker-init.sql` (local y CI) o en `0001_rls.sql` (si no existe, sin login:
en producción se le asigna contraseña aparte). Recibe permisos sobre todas las tablas por `ALTER DEFAULT PRIVILEGES`.

## Tablas

### Identidad (Better Auth) — globales, sin RLS
`user`, `session`, `account` (contraseña hasheada por Better Auth), `verification`.

### Acceso — globales, sin RLS (se consultan siempre filtrando por usuario en `orgs.ts`)
| Tabla | Clave | Contenido |
|---|---|---|
| `organization` | `id` | Viña: `slug` (URL), `nombre`, `razon_social`, `rut`, `plan`, `settings` (overrides de `OrgConfig`) |
| `member` | `(org_id, user_id)` | Rol del usuario en esa viña (`role` = id de rol), `estado` |
| `invitation` | `id` | `email`, `role`, `token_hash` (SHA-256), `expires_at`, `accepted_at` |

### Negocio — con `org_id` y **RLS automática**
| Tabla | Módulo | Offline | Notas |
|---|---|---|---|
| `org_role` | usuarios | no | Roles personalizados: `permisos` jsonb `{modulo: 'vcedx'}` |
| `audit_log` | usuarios | no | Cambios de entidades `sensitive`, escritos en la misma transacción |
| `cliente` | clientes | no | |
| `cobro` | clientes | no | `monto` en CLP (bigint), `cliente_id` → cliente |
| `cuartel` | catastro | **sí** | Único `(org_id, lower(codigo))` entre no borrados |
| `variedad` | configuracion | **sí** | Único `(org_id, lower(nombre))` |

### Columnas comunes (`base()` en `schema.ts`)

| Columna | Para qué |
|---|---|
| `id text` | Lo genera el cliente (UUID) → idempotencia offline. Al importar de v1 se usa un UUID determinista por viña (`mapId`). |
| `org_id` | Viña dueña; RLS la compara con `app.org_id` |
| `version int` | Concurrencia optimista: sube en cada escritura |
| `created_at/by`, `updated_at/by` | Trazabilidad |
| `deleted_at` | Borrado lógico (se sincroniza; los listados filtran `deleted_at is null`) |
| `demo bool` | Registros de ejemplo |

Tablas offline agregan `...syncCols()`: `seq bigint` (secuencia global `sync_seq`) y `xid xid8` (transacción que
escribió). Un trigger los actualiza en cada UPDATE. Ver [sync-offline.md](sync-offline.md).

### Tipos
- Dinero CLP: `bigint` (modo `number`, enteros). Superficies, litros, kg: `numeric` (modo `number`).
- Fechas de negocio (`fecha`, vencimientos): `text` ISO `YYYY-MM-DD` como en v1 (sin zona horaria).
- Marcas de tiempo técnicas: `timestamptz`.

## Cómo funciona el aislamiento (RLS)

```ts
await withOrg(actor.orgId, async (tx) => {
  // dentro: SET LOCAL app.org_id = '<orgId>'
  return tx.select().from(schema.cliente);   // sin WHERE org_id: Postgres filtra
});
```

- Política `tenant_isolation`: `USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id())` → no se puede
  leer, insertar, actualizar ni "mover" filas a otra viña. `FORCE ROW LEVEL SECURITY` la aplica incluso al dueño
  de la tabla (salvo superusuario).
- Sin `withOrg`, `app_org_id()` es `''` → **cero filas** (falla cerrada, nunca abierta).
- `set_config(…, true)` es local a la transacción: seguro con pool de conexiones.
- **Automático**: `tables.ts` considera *tenant* toda tabla con `org_id` excepto `NO_RLS_TABLES` (`member`,
  `invitation`), y `ensure.ts` (corre en cada `db:migrate`) aplica la política. `test/schema.test.ts` falla si una
  tabla con `org_id` queda sin RLS.

## Escribir datos: `repo.ts`

| Función | Hace |
|---|---|
| `upsert(tx, tabla, actor, meta, data, {baseVersion, checkVersion})` | Bloquea la fila (`FOR UPDATE`), verifica permiso `c` o `e` del rol en `meta.module`, compara versión si se pide (→ `ConflictError` 409), inserta o actualiza subiendo `version`, audita si `meta.sensitive` |
| `softDelete(tx, tabla, actor, meta, id)` | Verifica permiso `d`, marca `deleted_at`, sube versión, audita. Idempotente |
| `stripSystem(data)` | Quita columnas de sistema que el cliente no puede fijar (`org_id`, `version`, `demo`…) |

`EntityMeta = { entity, module, label (plural), sensitive?, display? }`. El `module` decide qué permiso se exige.

## Migraciones

- Se generan con `npm run db:generate -- --name <nombre>` desde `schema.ts`. **No se editan a mano** ni se
  modifica una migración ya fusionada en `main`.
- `0000_init.sql`: esquema inicial. `0001_rls.sql`: rol `winzer_app`, permisos por defecto y funciones
  `app_org_id()`, `apply_tenant_rls(regclass)`, `bump_sync_cursor()`, `apply_sync(regclass)`.
- `npm run db:migrate` = migraciones de Drizzle + `ensureTenancy()` (RLS, trigger e índice `(org_id, xid, seq)`
  de cada tabla que corresponda). Es idempotente.
- Trabajo en paralelo: [colaboracion.md › Migraciones](colaboracion.md#migraciones-de-base-de-datos-en-paralelo).

### Agregar una tabla

```ts
/* --- Cosecha --- */
export const cosecha = pgTable('cosecha', {
  ...base(),
  ...syncCols(),                 // solo si el módulo es offline
  fecha: text('fecha').notNull(),
  cuartelId: text('cuartel_id').notNull().references(() => cuartel.id),
  kg: num('kg').notNull()
}, (t) => [index('cosecha_org_fecha_idx').on(t.orgId, t.fecha)]);
```

Luego `npm run db:generate -- --name cosecha && npm run db:migrate`. Nada más: RLS y sync se aplican solos.
Si es offline, registra la entidad en `SYNC_ENTITIES` (un test verifica que tablas y entidades coincidan).

## Configuración por viña

`organization.settings` (jsonb) guarda solo lo que la viña cambió; `resolveConfig(settings)` de
`@winzer/domain` lo mezcla con `DEFAULT_CONFIG` (tasas IVA/ILA/PPM, UTM, umbrales de SO₂, etc.). Los cálculos
reciben la configuración como argumento.

## Importador de v1

`importV1(actor, dump)` (`packages/db/src/import-v1.ts`), expuesto en `POST /api/<viña>/import-v1` y en
*Configuración*. Valida cada registro con el mismo Zod, transforma ids con `mapId(orgId, idV1)` (reimportar
actualiza), respeta `_demo`, informa omitidos y entidades pendientes. Para agregar una entidad: una línea en
`IMPORTERS` (en orden maestros → dependientes, con `refs` para claves foráneas).
