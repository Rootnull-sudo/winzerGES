/**
 * Guardas del esquema: fallan si alguien agrega una tabla que rompería el aislamiento o el sync.
 * Corren contra la base migrada (npm run db:migrate).
 */
import { SYNC_ENTITIES } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { adminDb } from '../src/client';
import { NO_RLS_TABLES } from '../src/schema';
import { syncTables, tableName, tenantTables } from '../src/tables';

describe('esquema multi-viña', () => {
  it('toda tabla con org_id tiene RLS forzada y la política tenant_isolation (salvo el mapa de acceso)', async () => {
    const rows = await adminDb().execute<{ t: string; rls: boolean; force: boolean; pol: number }>(sql`
      select c.relname as t, c.relrowsecurity as rls, c.relforcerowsecurity as force,
             (select count(*)::int from pg_policies p where p.tablename = c.relname and p.policyname = 'tenant_isolation') as pol
      from pg_class c join information_schema.columns k on k.table_name = c.relname and k.column_name = 'org_id' and k.table_schema = 'public'
      where c.relkind = 'r'`);
    const sinRls = rows.filter((r) => !(NO_RLS_TABLES as readonly string[]).includes(r.t) && !(r.rls && r.force && r.pol === 1)).map((r) => r.t);
    expect(sinRls, 'Tablas con org_id sin RLS: corre npm run db:migrate').toEqual([]);
    expect(rows.length).toBeGreaterThanOrEqual(tenantTables.length);
  });

  it('las tablas sincronizables y SYNC_ENTITIES (@winzer/domain) coinciden', () => {
    expect(Object.keys(syncTables).sort()).toEqual(Object.keys(SYNC_ENTITIES).sort());
  });

  it('las tablas sincronizables tienen trigger de cursor', async () => {
    const rows = await adminDb().execute<{ t: string }>(
      sql`select event_object_table as t from information_schema.triggers where trigger_name = 'sync_cursor'`
    );
    for (const t of Object.keys(syncTables)) expect(rows.map((r) => r.t)).toContain(t);
  });

  it('tenant tables se derivan del esquema', () => {
    expect(tenantTables.map(tableName).sort()).toEqual([
      'audit_log',
      'cliente',
      'cobro',
      'cuartel',
      'org_role',
      'parametro_org',
      'secuencia',
      'temporada',
      'variedad'
    ]);
  });
});
