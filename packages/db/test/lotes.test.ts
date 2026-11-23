/** Lotes y ventanas (F2-1) con Postgres real. */
import type { Mutation } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb } from '../src/client';
import { importV1, mapId } from '../src/import-v1';
import { createOrganization } from '../src/orgs';
import type { Actor } from '../src/repo';
import { organization, user } from '../src/schema';
import { listarTemporadas } from '../src/services/temporadas';
import * as sync from '../src/sync';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const U = `test_lu_${run}`;
let A = '';
let T = '';
const agro = (): Actor => ({ orgId: A, userId: U, userName: 'Test', role: 'agronomo' });
const push = async (entity: string, data: Record<string, unknown>, id: string = randomUUID(), baseVersion: number | null = null) => {
  const m: Mutation = { mutationId: randomUUID(), entity, op: 'upsert', id, baseVersion, data, createdAt: new Date().toISOString() };
  return (await sync.push(agro(), [m]))[0]!;
};
const estado = async (id: string) =>
  (
    await withOrg(A, (tx) =>
      tx.execute<{ estado: string; inicio: string | null }>(sql`select estado, inicio_vendimia_real as inicio from lote where id = ${id}`)
    )
  )[0]!;

beforeAll(async () => {
  await adminDb()
    .insert(user)
    .values({ id: U, name: 'Test', email: `${U}@test.local` });
  A = (await createOrganization(U, { nombre: `Lotes ${run}` })).id;
  T = (await withOrg(A, listarTemporadas))[0]!.id;
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
  await adminDb()
    .delete(user)
    .where(sql`id = ${U}`);
});

describe('lotes', () => {
  it('una viña nueva trae las 30 ventanas de referencia', async () => {
    const [r] = await withOrg(A, (tx) => tx.execute<{ n: number }>(sql`select count(*)::int n from ventana`));
    expect(r!.n).toBe(30);
    expect((await push('ventana', { variedad: 'syrah', valle: 'MAIPO', desde: '03-01', hasta: '03-30' })).status).toBe('rejected');
  });

  it('código único y cosecha → lote "En vendimia" (también al asignar el lote después)', async () => {
    const t = (await withOrg(A, listarTemporadas))[0]!;
    const fechaPlan = `${t.anio}-03-15`;
    const L = randomUUID();
    expect((await push('lote', { codigo: 'L-X', temporadaId: T, variedad: 'Syrah', tipo: 'tinto', fechaVendimiaPlan: fechaPlan }, L)).status).toBe('ok');
    expect((await push('lote', { codigo: 'l-x', temporadaId: T, variedad: 'Syrah', tipo: 'tinto', fechaVendimiaPlan: fechaPlan })).status).toBe('rejected');
    const C = randomUUID();
    await push('cuartel', { codigo: 'LX-1', variedad: 'Syrah', tipo: 'tinto', superficie: 1 }, C);
    const cid = randomUUID();
    const fecha = t.inicio > `${t.anio}-03-16` ? t.inicio : `${t.anio}-03-16`;
    expect((await push('cosecha', { fecha, temporadaId: T, cuartelId: C, cajones: 10, kg: 190 }, cid)).status).toBe('ok');
    expect((await estado(L)).estado).toBe('Planificado');
    expect((await push('cosecha', { fecha, temporadaId: T, cuartelId: C, cajones: 10, kg: 190, loteId: L }, cid, 1)).status).toBe('ok');
    expect(await estado(L)).toEqual({ estado: 'En vendimia', inicio: fecha });
  });

  it('importa lotes de v1 con sus cuarteles remapeados', async () => {
    const r = await importV1(agro(), {
      app: 'vina-gestion',
      data: {
        cuartel: [{ id: 'cu_1', codigo: 'LI-1', variedad: 'País', tipo: 'tinto', superficie: 1 }],
        lote: [
          {
            id: 'lo_1',
            codigo: 'L-IMP',
            temporada: 2025,
            cuartelIds: ['cu_1'],
            variedad: 'País',
            tipo: 'tinto',
            valle: 'Itata',
            estado: 'En guarda',
            fechaVendimiaPlan: '2025-03-20'
          }
        ]
      }
    });
    expect(r.omitidos).toEqual([]);
    const [l] = await withOrg(A, (tx) => tx.execute<{ cuartel_ids: string[] }>(sql`select cuartel_ids from lote where id = ${mapId(A, 'lo_1')}`));
    expect(l!.cuartel_ids).toEqual([mapId(A, 'cu_1')]);
  });
});
