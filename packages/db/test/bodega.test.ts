/** Control de bodega (F2-2) con Postgres real: validaciones del servidor, trasiego atómico, reacciones y vistas. */
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
const A = `test_bo_${run}`,
  B = `test_bb_${run}`;
const eno = (orgId = A): Actor => ({ orgId, userId: 'u', userName: 'Test', role: 'enologo' });
const mut = (entity: string, data: Record<string, unknown>, extra: Partial<Mutation> = {}): Mutation => ({
  mutationId: randomUUID(),
  entity,
  op: 'upsert',
  id: randomUUID(),
  baseVersion: null,
  data,
  createdAt: new Date().toISOString(),
  ...extra
});
let L = '',
  E1 = '',
  E2 = '';
const F = '2027-03-21';
const litros = async (estanqueId: string) =>
  Number(
    (
      await withOrg(A, (tx) =>
        tx.execute<{ l: string }>(sql`select coalesce(sum(litros),0) l from mov_bodega where estanque_id = ${estanqueId} and deleted_at is null`)
      )
    )[0]!.l
  );

beforeAll(async () => {
  await adminDb()
    .insert(organization)
    .values([
      { id: A, slug: A, nombre: 'A' },
      { id: B, slug: B, nombre: 'B' }
    ]);
  await withOrg(A, (tx) => guardarTemporada(tx, { ...eno(), role: 'admin' }, { anio: 2027, inicio: '2026-07-01', fin: '2027-06-30' }));
  const T = (await withOrg(A, listarTemporadas))[0]!.id;
  const ms = [
    mut('lote', { codigo: 'L-B', temporadaId: T, variedad: 'Syrah', tipo: 'tinto', fechaVendimiaPlan: '2027-03-20' }),
    mut('estanque', { codigo: 'B-1', capacidad: 10000 }),
    mut('estanque', { codigo: 'B-2', capacidad: 3000 })
  ];
  [L, E1, E2] = ms.map((m) => m.id) as [string, string, string];
  for (const r of await sync.push(eno(), ms)) expect(r.status).toBe('ok');
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id in (${A}, ${B})`);
});

describe('bodega', () => {
  it('entrada: valida capacidad y pasa el lote a «En molienda»', async () => {
    const [mal] = await sync.push(eno(), [mut('mov_bodega', { fecha: F, estanqueId: E2, loteId: L, litros: 3500, tipo: 'entrada', origen: 'mosto' })]);
    expect(mal).toMatchObject({ status: 'rejected', message: 'Sobrecapacidad: B-2 tiene 3.000 L libres y se intentan ingresar 3.500 L.' });
    const [ok] = await sync.push(eno(), [
      mut('mov_bodega', { fecha: F, estanqueId: E1, loteId: L, litros: 8000, tipo: 'entrada', origen: 'uva', kgUva: 11000 })
    ]);
    expect(ok!.status).toBe('ok');
    const [l] = await withOrg(A, (tx) => tx.execute<{ estado: string; f: string }>(sql`select estado, fecha_molienda_real f from lote where id = ${L}`));
    expect(l).toEqual({ estado: 'En molienda', f: F });
  });

  it('trasiego atómico: si el destino no tiene capacidad, no se aplica nada', async () => {
    const g = randomUUID();
    const res = await sync.push(eno(), [
      mut('mov_bodega', { fecha: F, estanqueId: E1, loteId: L, litros: -4000, tipo: 'trasiego_salida', grupo: g }, { grupo: g }),
      mut('mov_bodega', { fecha: F, estanqueId: E2, loteId: L, litros: 3900, tipo: 'trasiego_entrada', grupo: g }, { grupo: g }),
      mut('mov_bodega', { fecha: F, estanqueId: E1, loteId: L, litros: -100, tipo: 'merma', motivo: 'Borras de trasiego', grupo: g }, { grupo: g })
    ]);
    expect(res.map((r) => r.status)).toEqual(['rejected', 'rejected', 'rejected']);
    expect(res[1]!.status === 'rejected' && res[1]!.message).toMatch(/Sobrecapacidad: B-2/);
    expect(await litros(E1)).toBe(8000);
    expect(await litros(E2)).toBe(0);
  });

  it('trasiego que cabe: los tres movimientos entran juntos', async () => {
    const g = randomUUID();
    const res = await sync.push(eno(), [
      mut('mov_bodega', { fecha: F, estanqueId: E1, loteId: L, litros: -2900, tipo: 'trasiego_salida', grupo: g }, { grupo: g }),
      mut('mov_bodega', { fecha: F, estanqueId: E2, loteId: L, litros: 2800, tipo: 'trasiego_entrada', grupo: g }, { grupo: g }),
      mut('mov_bodega', { fecha: F, estanqueId: E1, loteId: L, litros: -100, tipo: 'merma', grupo: g }, { grupo: g })
    ]);
    expect(res.map((r) => r.status)).toEqual(['ok', 'ok', 'ok']);
    expect([await litros(E1), await litros(E2)]).toEqual([5000, 2800]);
  });

  it('salidas y ajustes no dejan stock negativo; borrar una entrada ya trasegada se rechaza', async () => {
    const [m] = await sync.push(eno(), [mut('mov_bodega', { fecha: F, estanqueId: E2, loteId: L, litros: -3000, tipo: 'merma', motivo: 'Derrame' })]);
    expect(m).toMatchObject({ status: 'rejected', message: 'No hay suficiente vino en B-2: disponibles 2.800 L, solicitados 3.000 L.' });
    // Los ajustes también validan capacidad (v1 no lo hacía): +500 L no caben en B-2; +100 L sí.
    const ajuste = (litros: number) => mut('mov_bodega', { fecha: F, estanqueId: E2, loteId: L, litros, tipo: 'ajuste', motivo: 'Diferencia de inventario' });
    const [a] = await sync.push(eno(), [ajuste(500)]);
    expect(a).toMatchObject({ status: 'rejected', message: expect.stringMatching(/Sobrecapacidad/) });
    const [a2] = await sync.push(eno(), [ajuste(100)]);
    expect(a2!.status).toBe('ok');
    const [entrada] = await withOrg(A, (tx) => tx.execute<{ id: string; version: number }>(sql`select id, version from mov_bodega where tipo = 'entrada'`));
    const [d] = await sync.push(eno(), [mut('mov_bodega', {}, { op: 'delete', id: entrada!.id, baseVersion: entrada!.version })]);
    expect(d).toMatchObject({ status: 'rejected', message: 'No se puede eliminar: el vino de ese movimiento ya salió de B-1.' });
  });

  it('vistas: stock por estanque y lote, ocupación y balance con kg de uva; aisladas por viña', async () => {
    const stock = await withOrg(A, (tx) =>
      tx.execute<{ estanque_id: string; litros: string }>(sql`select estanque_id, litros from v_stock_estanque order by litros desc`)
    );
    expect(stock.map((s) => [s.estanque_id, Number(s.litros)])).toEqual([
      [E1, 5000],
      [E2, 2900]
    ]);
    const [b] = await withOrg(A, (tx) =>
      tx.execute<{ entradas: string; merma: string; ajustes: string; stock: string }>(
        sql`select entradas, merma, ajustes, stock from v_balance_lote where lote_id = ${L}`
      )
    );
    expect([b!.entradas, b!.merma, b!.ajustes, b!.stock].map(Number)).toEqual([8000, 100, 100, 7900]);
    const [o] = await withOrg(A, (tx) => tx.execute<{ pct: string }>(sql`select pct from v_ocupacion where estanque_id = ${E2}`));
    expect(Number(o!.pct)).toBeCloseTo(2900 / 3000, 5);
    expect(await withOrg(B, (tx) => tx.execute(sql`select * from v_ocupacion`))).toHaveLength(0);
  });

  it('importa estanques y movimientos de v1 (sin envasado ni ventas, que llegan con F5)', async () => {
    const r = await importV1(eno(B), {
      app: 'vina-gestion',
      data: {
        lote: [{ id: 'lo', codigo: 'L-I', temporada: 2027, variedad: 'País', tipo: 'tinto', fechaVendimiaPlan: '2027-03-20' }],
        estanque: [{ id: 'es', codigo: 'I-1', capacidad: 5000, estado: 'operativo' }],
        movBodega: [
          { id: 'm1', fecha: '2027-03-21', estanqueId: 'es', loteId: 'lo', litros: 3000, tipo: 'entrada', origen: 'mosto' },
          { id: 'm2', fecha: '2027-05-01', estanqueId: 'es', loteId: 'lo', litros: -500, tipo: 'envasado', ref: 'envasado:oe1' }
        ]
      }
    });
    expect(r.importados).toMatchObject({ estanque: 1, movBodega: 1 });
    const [s] = await withOrg(B, (tx) => tx.execute<{ litros: string }>(sql`select litros from v_stock_estanque where estanque_id = ${mapId(B, 'es')}`));
    expect(Number(s!.litros)).toBe(3000);
  });
});
