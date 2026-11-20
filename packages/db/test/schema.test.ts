/**
 * Guardas del esquema: fallan si alguien agrega una tabla que rompería el aislamiento o el sync.
 * Corren contra la base migrada (npm run db:migrate).
 */
import { SYNC_ENTITIES } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { adminDb } from '../src/client';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../src/schema';
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

  it('tenant tables se derivan del esquema: toda tabla con org_id salvo las excepciones declaradas', () => {
    // Regla, no lista: así agregar una tabla en un PR no obliga a editar este test (y no hay conflictos en paralelo).
    const conOrg = (Object.values(schema) as unknown[])
      .filter((x): x is PgTable => x instanceof PgTable)
      .filter((t) => getTableConfig(t).columns.some((c) => c.name === 'org_id'))
      .map(tableName);
    const esperadas = conOrg.filter((n) => !(schema.NO_RLS_TABLES as readonly string[]).includes(n)).sort();
    expect(tenantTables.map(tableName).sort()).toEqual(esperadas);
    expect(esperadas).toEqual(expect.arrayContaining(['audit_log', 'cliente', 'cuartel', 'temporada']));
    expect(esperadas).not.toContain('member');
  });
});
