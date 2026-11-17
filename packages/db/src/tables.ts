/**
 * Clasificación automática de tablas a partir del esquema (sin listas que mantener a mano):
 *  - tenant: tiene columna `org_id` y no está en NO_RLS_TABLES → RLS por viña.
 *  - sync:   además tiene columna `xid` (usó `...syncCols()`) → sincronizable offline.
 * El nombre de la tabla es el nombre de la entidad (igual que en v1).
 * Esto elimina los "puntos de registro" donde dos ramas en paralelo chocarían.
 */
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import * as schema from './schema';

const all: PgTable[] = (Object.values(schema) as unknown[]).filter((x): x is PgTable => x instanceof PgTable);
const cols = (t: PgTable) => getTableConfig(t).columns.map((c) => c.name);

export const tableName = (t: PgTable) => getTableConfig(t).name;

export const tenantTables: PgTable[] = all.filter((t) => cols(t).includes('org_id') && !(schema.NO_RLS_TABLES as readonly string[]).includes(tableName(t)));

/** Entidad → tabla sincronizable. Tipada como cuartel: todas comparten las columnas base + sync. */
export const syncTables: Record<string, typeof schema.cuartel> = Object.fromEntries(
  tenantTables.filter((t) => cols(t).includes('xid')).map((t) => [tableName(t), t as unknown as typeof schema.cuartel])
);
