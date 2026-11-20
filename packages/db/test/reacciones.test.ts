/** Reacciones de sync (F0-4, ADR 0010) con Postgres real. */
import { SYNC_ENTITIES, type Mutation } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb } from '../src/client';
import { REACCIONES } from '../src/reacciones';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import * as sync from '../src/sync';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_re_${run}`;
const agronomo: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'agronomo' };
const mut = (entity: string, id: string, data: Record<string, unknown>, baseVersion: number | null = null): Mutation => ({
  mutationId: randomUUID(),
  entity,
  op: 'upsert',
  id,
  baseVersion,
  data,
  createdAt: new Date().toISOString()
});
const variedades = () => withOrg(A, (tx) => tx.execute<{ nombre: string; tipo: string }>(sql`select nombre, tipo from variedad where deleted_at is null`));

beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'A' });
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('reacciones de sync', () => {
  it('solo se registran para entidades sincronizables', () => {
    for (const e of Object.keys(REACCIONES)) expect(Object.keys(SYNC_ENTITIES)).toContain(e);
  });

  it('un cuartel con variedad nueva la agrega al maestro, aunque el rol no edite configuración', async () => {
    const id = randomUUID();
    const [r] = await sync.push(agronomo, [mut('cuartel', id, { codigo: 'T-01', variedad: 'Cinsault', tipo: 'tinto', superficie: 1 })]);
    expect(r!.status).toBe('ok');
    expect((await variedades()).map((v) => [v.nombre, v.tipo])).toEqual([['Cinsault', 'tinto']]);

    // Editar el cuartel o crear otro con la misma variedad (otras mayúsculas) no la duplica.
    await sync.push(agronomo, [mut('cuartel', id, { codigo: 'T-01', variedad: 'Cinsault', tipo: 'tinto', superficie: 2 }, 1)]);
    await sync.push(agronomo, [mut('cuartel', randomUUID(), { codigo: 'T-02', variedad: 'cinsault', tipo: 'tinto', superficie: 1 })]);
    expect(await variedades()).toHaveLength(1);
  });

  it('si una reacción falla, la mutación completa se revierte', async () => {
    const reg = REACCIONES as Record<string, unknown>;
    const antes = reg.cuartel;
    reg.cuartel = [
      async () => {
        throw Object.assign(new Error('Reacción de prueba falló.'), { status: 422 });
      }
    ];
    try {
      const id = randomUUID();
      const [r] = await sync.push(agronomo, [mut('cuartel', id, { codigo: 'T-99', variedad: 'Malbec', tipo: 'tinto', superficie: 1 })]);
      expect(r).toMatchObject({ status: 'rejected', message: 'Reacción de prueba falló.' });
      const filas = await withOrg(A, (tx) => tx.execute(sql`select id from cuartel where id = ${id}`));
      expect(filas).toHaveLength(0);
    } finally {
      reg.cuartel = antes;
    }
  });
});
