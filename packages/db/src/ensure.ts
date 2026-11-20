/**
 * Paso posterior a las migraciones (idempotente): aplica RLS a todas las tablas tenant y el trigger +
 * índice de cursor a todas las sincronizables. Las funciones SQL apply_tenant_rls/apply_sync están en
 * drizzle/0001_rls.sql. Así ninguna rama necesita escribir migraciones SQL a mano por cada tabla nueva.
 */
import { sql } from 'drizzle-orm';
import type { DB } from './client';
import { GLOBAL_READONLY_TABLES } from './schema';
import { syncTables, tableName, tenantTables } from './tables';

export async function ensureTenancy(db: DB) {
  for (const t of tenantTables) await db.execute(sql`select apply_tenant_rls(${tableName(t)}::regclass)`);
  for (const name of Object.keys(syncTables)) {
    await db.execute(sql`select apply_sync(${name}::regclass)`);
    await db.execute(sql.raw(`create index if not exists ${name}_xid_idx on "${name}" (org_id, xid, seq)`));
  }
  // Las tablas nuevas heredan permisos por ALTER DEFAULT PRIVILEGES; esto cubre bases creadas antes.
  await db.execute(sql`grant select, insert, update, delete on all tables in schema public to winzer_app`);
  await db.execute(sql`grant usage, select on all sequences in schema public to winzer_app`);
  for (const t of GLOBAL_READONLY_TABLES) await db.execute(sql.raw(`revoke insert, update, delete, truncate on "${t}" from winzer_app`));
  return { tenant: tenantTables.map(tableName), sync: Object.keys(syncTables) };
}
