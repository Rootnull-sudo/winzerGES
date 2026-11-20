/** Cosecha y jornales (F1-4) con Postgres real: pago en servidor, cascada al borrar e importación v1. */
import type { Mutation } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb } from '../src/client';
import { importV1, mapId } from '../src/import-v1';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import { guardarTemporada, listarTemporadas } from '../src/services/temporadas';
import * as sync from '../src/sync';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_co2_${run}`;
const agro: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'agronomo' };
const mut = (entity: string, id: string, data: Record<string, unknown>, op: Mutation['op'] = 'upsert', baseVersion: number | null = null): Mutation => ({
  mutationId: randomUUID(),
  entity,
  op,
  id,
  baseVersion,
  data,
  createdAt: new Date().toISOString()
});
let T = '',
  C = '';

beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'A' });
  await withOrg(A, (tx) => guardarTemporada(tx, { ...agro, role: 'admin' }, { anio: 2027, inicio: '2026-07-01', fin: '2027-06-30' }));
  T = (await withOrg(A, listarTemporadas))[0]!.id;
  C = randomUUID();
  await sync.push(agro, [mut('cuartel', C, { codigo: 'K-01', variedad: 'Carménère', tipo: 'tinto', superficie: 2.5 })]);
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('cosecha', () => {
  const cid = randomUUID();
  it('cosecha y cuadrilla: el pago lo calcula el servidor', async () => {
    const [c] = await sync.push(agro, [
      mut('cosecha', cid, { fecha: '2027-03-15', temporadaId: T, cuartelId: C, cajones: 200, kg: 3800, destino: 'propia', costoBins: 40000 })
    ]);
    expect(c!.status).toBe('ok');
    const [j] = await sync.push(agro, [
      mut('jornal', randomUUID(), { cosechaId: cid, nombre: 'Cuadrilla Norte', trabajadores: 8, tarifaTipo: 'cajon', tarifa: 650, cajones: 200, pago: 1 })
    ]);
    expect(j).toMatchObject({ status: 'ok', record: { data: { pago: 130000 } } });
    // El rol Ventas no ve ni escribe cosecha.
    const [v] = await sync.push({ ...agro, role: 'ventas' }, [
      mut('jornal', randomUUID(), { cosechaId: cid, nombre: 'X', tarifaTipo: 'kg', tarifa: 40, kg: 10 })
    ]);
    expect(v!.status).toBe('rejected');
  });

  it('borrar la cosecha borra sus jornales', async () => {
    await sync.push(agro, [mut('cosecha', cid, {}, 'delete', 1)]);
    const vivos = await withOrg(A, (tx) => tx.execute(sql`select id from jornal where cosecha_id = ${cid} and deleted_at is null`));
    expect(vivos).toHaveLength(0);
  });

  it('importa cosechas y jornales de v1 (destino por texto, pago recalculado)', async () => {
    const r = await importV1(agro, {
      app: 'vina-gestion',
      data: {
        cuartel: [{ id: 'cu_k', codigo: 'K-09', variedad: 'Syrah', tipo: 'tinto', superficie: 1 }],
        cosecha: [{ id: 'co_1', fecha: '2027-03-20', temporada: 2027, cuartelId: 'cu_k', cajones: 50, kg: 950, destino: 'Venta de uva', loteId: 'lot_1' }],
        jornal: [{ id: 'jo_1', cosechaId: 'co_1', nombre: 'Juan', tarifaTipo: 'kg', tarifa: 40, kg: 950, fecha: '2027-03-20', pago: 1 }]
      }
    });
    expect(r.omitidos).toEqual([]);
    const [c] = await withOrg(A, (tx) =>
      tx.execute<{ destino: string; lote_id: string }>(sql`select destino, lote_id from cosecha where id = ${mapId(A, 'co_1')}`)
    );
    expect(c).toEqual({ destino: 'venta', lote_id: mapId(A, 'lot_1') });
    const [j] = await withOrg(A, (tx) => tx.execute<{ pago: string }>(sql`select pago from jornal where id = ${mapId(A, 'jo_1')}`));
    expect(Number(j!.pago)).toBe(38000);
  });
});
