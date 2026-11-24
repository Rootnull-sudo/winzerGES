/**
 * Paso posterior a las migraciones (idempotente): aplica RLS a todas las tablas tenant y el trigger +
 * índice de cursor a todas las sincronizables. Las funciones SQL apply_tenant_rls/apply_sync están en
 * drizzle/0001_rls.sql. Así ninguna rama necesita escribir migraciones SQL a mano por cada tabla nueva.
 */
import { sql } from 'drizzle-orm';
import type { DB } from './client';
import { PLANES } from '@winzer/domain';
import { GLOBAL_READONLY_TABLES, plan } from './schema';
import { syncTables, tableName, tenantTables } from './tables';
import { VISTAS } from './vistas';

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
  // Vistas de derivados: después de los permisos, con security_invoker para que apliquen el RLS de quien consulta.
  for (const v of VISTAS) {
    // drop + create (no `create or replace`): así una vista puede cambiar sus columnas entre versiones.
    await db.execute(sql.raw(`drop view if exists "${v.nombre}"`));
    await db.execute(sql.raw(`create view "${v.nombre}" with (security_invoker = true) as ${v.sql}`));
    await db.execute(sql.raw(`grant select on "${v.nombre}" to winzer_app`));
  }
  // Catálogo de planes: la fuente es PLANES (@winzer/domain); aquí se refleja en la tabla global.
  for (const p of Object.values(PLANES)) {
    const fila = { id: p.id, nombre: p.nombre, modulos: p.modulos ? [...p.modulos] : null, maxUsuarios: p.maxUsuarios, maxGb: p.maxGb, precioClp: p.precioClp };
    await db.insert(plan).values(fila).onConflictDoUpdate({ target: plan.id, set: fila });
  }
  return { tenant: tenantTables.map(tableName), sync: Object.keys(syncTables) };
}
