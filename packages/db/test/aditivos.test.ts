/** Aditivos (F2-4): descuento de insumo en su unidad real, con Postgres real. */
import type { Mutation } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb } from '../src/client';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import { guardarInsumo, stockActual } from '../src/services/insumos';
import { guardarTemporada, listarTemporadas } from '../src/services/temporadas';
import * as sync from '../src/sync';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_ad2_${run}`;
const eno: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'enologo' };
const mut = (data: Record<string, unknown>, id: string = randomUUID(), op: Mutation['op'] = 'upsert', baseVersion: number | null = null): Mutation => ({
  mutationId: randomUUID(),
  entity: data.entity ? String(data.entity) : 'aditivo',
  op,
  id,
  baseVersion,
  data,
  createdAt: new Date().toISOString()
});
let L = '';
const ins = async (nombre: string, unidad: 'kg' | 'g' | 'L' | 'mL' | 'un' | 'caja' | 'rollo', stockInicial: number) =>
  String((await withOrg(A, (tx) => guardarInsumo(tx, { ...eno, role: 'admin' }, { nombre, categoria: 'enologico', unidad, precio: 1000, stockInicial }))).id);

beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'A' });
  await withOrg(A, (tx) => guardarTemporada(tx, { ...eno, role: 'admin' }, { anio: 2027, inicio: '2026-07-01', fin: '2027-06-30' }));
  const T = (await withOrg(A, listarTemporadas))[0]!.id;
  L = randomUUID();
  const [r] = await sync.push(eno, [
    { ...mut({ codigo: 'L-A', temporadaId: T, variedad: 'País', tipo: 'tinto', fechaVendimiaPlan: '2027-03-20' }, L), entity: 'lote' }
  ]);
  expect(r!.status).toBe('ok');
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('aditivos', () => {
  const base = () => ({ fecha: '2027-04-10', loteId: L, tipo: 'bentonita', volumen: 5000, cantidad: 0, costo: 0 });
  it('descuenta en kg (g/hL) y en L (mL/hL); borrar lo devuelve', async () => {
    const bento = await ins('Bentonita', 'kg', 10);
    const id = randomUUID();
    const [r] = await sync.push(eno, [mut({ ...base(), insumoId: bento, dosis: 30, unidadDosis: 'g/hL' }, id)]);
    expect(r!.status).toBe('ok');
    expect(await withOrg(A, (tx) => stockActual(tx, bento))).toBe(8.5);
    const goma = await ins('Goma arábiga', 'L', 5);
    const [r2] = await sync.push(eno, [mut({ ...base(), tipo: 'clarificante', insumoId: goma, dosis: 20, unidadDosis: 'mL/hL' })]);
    expect(r2!.status).toBe('ok');
    expect(await withOrg(A, (tx) => stockActual(tx, goma))).toBe(4);
    await sync.push(eno, [mut({}, id, 'delete', 1)]);
    expect(await withOrg(A, (tx) => stockActual(tx, bento))).toBe(10);
  });
  it('rechaza productos que no se dosifican por volumen', async () => {
    const cajas = await ins('Kit en cajas', 'caja', 3);
    const [r] = await sync.push(eno, [mut({ ...base(), tipo: 'otro', insumoId: cajas, dosis: 1, unidadDosis: 'g/hL' })]);
    expect(r).toMatchObject({ status: 'rejected', message: expect.stringMatching(/kg, g, L o mL/) });
  });
});
