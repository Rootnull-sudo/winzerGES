/** Insumos (F1-1): servicio, historial de precios, ajustes, v_stock_insumo y sync de solo lectura. */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb } from '../src/client';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import { ajustarStock, eliminarInsumo, guardarInsumo, historialPrecios, stockActual } from '../src/services/insumos';
import { importV1, mapId } from '../src/import-v1';
import * as sync from '../src/sync';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_in_${run}`,
  B = `test_ib_${run}`;
const admin = (orgId = A): Actor => ({ orgId, userId: 'u', userName: 'Test', role: 'admin' });
const azufre = {
  nombre: 'Azufre mojable',
  categoria: 'agricola',
  tipo: 'Fungicida',
  unidad: 'kg',
  precio: 1800,
  stockInicial: 100,
  stockMinimo: 20,
  carencia: 7
} as const;

beforeAll(async () => {
  await adminDb()
    .insert(organization)
    .values([
      { id: A, slug: A, nombre: 'A' },
      { id: B, slug: B, nombre: 'B' }
    ]);
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id in (${A}, ${B})`);
});

describe('insumos', () => {
  let id = '';
  it('crear guarda el precio inicial en el historial; cambiarlo agrega otra entrada', async () => {
    const r = await withOrg(A, (tx) => guardarInsumo(tx, admin(), azufre, undefined, '2026-09-01'));
    id = String(r.id);
    await withOrg(A, (tx) => guardarInsumo(tx, admin(), { ...azufre, id, nombre: 'Azufre mojable' }, Number(r.version), '2026-09-01'));
    await withOrg(A, (tx) => guardarInsumo(tx, admin(), { ...azufre, id, precio: 1950 }, undefined, '2026-10-01'));
    expect((await withOrg(A, (tx) => historialPrecios(tx, id))).map((p) => [p.fecha, p.precio])).toEqual([
      ['2026-10-01', 1950],
      ['2026-09-01', 1800]
    ]);
  });

  it('nombre único sin distinguir mayúsculas', async () => {
    await expect(withOrg(A, (tx) => guardarInsumo(tx, admin(), { ...azufre, nombre: 'AZUFRE MOJABLE' }))).rejects.toThrow(/Ya existe un insumo/);
  });

  it('ajustes por conteo y por diferencia; v_stock_insumo los refleja y aísla por viña', async () => {
    await withOrg(A, (tx) => ajustarStock(tx, admin(), { insumoId: id, fecha: '2026-10-02', modo: 'conteo', cantidad: 92, motivo: 'Toma de inventario' }));
    expect(await withOrg(A, (tx) => stockActual(tx, id))).toBe(92);
    await withOrg(A, (tx) => ajustarStock(tx, admin(), { insumoId: id, fecha: '2026-10-03', modo: 'diferencia', cantidad: -2, motivo: 'Merma' }));
    expect(await withOrg(A, (tx) => stockActual(tx, id))).toBe(90);
    await expect(
      withOrg(A, (tx) => ajustarStock(tx, admin(), { insumoId: id, fecha: '2026-10-03', modo: 'conteo', cantidad: 90, motivo: 'x' }))
    ).rejects.toThrow(/no hay nada que ajustar/);
    const [v] = await withOrg(A, (tx) => tx.execute<{ stock: string; valor: string }>(sql`select stock, valor from v_stock_insumo where insumo_id = ${id}`));
    expect([Number(v!.stock), Number(v!.valor)]).toEqual([90, 90 * 1950]);
    expect(await withOrg(B, (tx) => tx.execute(sql`select * from v_stock_insumo`))).toHaveLength(0);
  });

  it('no se elimina un insumo con movimientos', async () => {
    await expect(withOrg(A, (tx) => eliminarInsumo(tx, admin(), id))).rejects.toThrow(/tiene movimientos/);
  });

  it('se lee offline pero el push de sync rechaza escribirlo', async () => {
    const pulled = await sync.pull(admin(), null);
    expect(pulled.records.filter((r) => r.entity === 'insumo').map((r) => r.data.nombre)).toEqual(['Azufre mojable']);
    expect(pulled.records.filter((r) => r.entity === 'mov_insumo')).toHaveLength(2);
    const [r] = await sync.push(admin(), [
      { mutationId: randomUUID(), entity: 'insumo', op: 'upsert', id: randomUUID(), baseVersion: null, data: azufre, createdAt: new Date().toISOString() }
    ]);
    expect(r).toMatchObject({ status: 'rejected', message: expect.stringMatching(/se editan con conexión/) });
    // El enólogo (insumos: ver) también lo recibe offline.
    expect((await sync.pull({ ...admin(), role: 'enologo' }, null)).records.some((x) => x.entity === 'insumo')).toBe(true);
  });

  it('importa insumos y movimientos de v1 (sin los consumos de aplicaciones, que regenera la reacción)', async () => {
    const r = await importV1(admin(B), {
      app: 'vina-gestion',
      data: {
        insumo: [
          {
            id: 'ins_1',
            nombre: 'Cobre',
            categoria: 'agricola',
            tipo: 'Fungicida',
            unidad: 'kg',
            precio: 5200,
            stockInicial: 40,
            carencia: 14,
            historialPrecios: [
              { fecha: '2026-08-01', precio: 5000 },
              { fecha: '2026-09-15', precio: 5200 }
            ]
          }
        ],
        movInsumo: [
          { id: 'mov_1', fecha: '2026-08-01', insumoId: 'ins_1', cantidad: 20, tipo: 'compra', ref: 'compra:com_1', costoUnitario: 5000 },
          { id: 'mov_2', fecha: '2026-10-01', insumoId: 'ins_1', cantidad: -5, tipo: 'aplicacion', ref: 'aplicacion:apl_1' },
          { id: 'mov_3', fecha: '2026-10-05', insumoId: 'ins_1', cantidad: -1, tipo: 'ajuste', motivo: 'Merma' }
        ]
      }
    });
    expect(r.importados).toMatchObject({ insumo: 1, movInsumo: 2 });
    const id = mapId(B, 'ins_1');
    expect(await withOrg(B, (tx) => stockActual(tx, id))).toBe(40 + 20 - 1);
    expect((await withOrg(B, (tx) => historialPrecios(tx, id))).map((p) => p.precio)).toEqual([5200, 5000]);
    const [m] = await withOrg(B, (tx) =>
      tx.execute<{ origen_tipo: string; origen_id: string }>(sql`select origen_tipo, origen_id from mov_insumo where tipo = 'compra'`)
    );
    expect(m).toEqual({ origen_tipo: 'compra', origen_id: mapId(B, 'com_1') });
    // Reimportar no duplica el historial.
    await importV1(admin(B), {
      app: 'vina-gestion',
      data: {
        insumo: [{ id: 'ins_1', nombre: 'Cobre', categoria: 'agricola', unidad: 'kg', precio: 5200, historialPrecios: [{ fecha: '2026-08-01', precio: 5000 }] }]
      }
    });
    expect(await withOrg(B, (tx) => historialPrecios(tx, id))).toHaveLength(1);
  });
});
