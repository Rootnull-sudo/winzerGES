/** Compras (F3-2): registrarCompra, stock, precio vigente, NC, guía, folio, anulación y v_por_pagar. */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb } from '../src/client';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import { anularCompra, registrarCompra } from '../src/services/compras';
import { guardarInsumo, stockActual } from '../src/services/insumos';
import { guardarProveedor } from '../src/services/proveedores';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_co_${run}`,
  B = `test_cp_${run}`;
const adm: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'administrativo' };
let P = '',
  P2 = '',
  INS_A = '',
  INS_B = '';

const precio = async (id: string) =>
  Number((await withOrg(A, (tx) => tx.execute<{ precio: string }>(sql`select precio from insumo where id = ${id}`)))[0]!.precio);
const stock = (id: string) => withOrg(A, (tx) => stockActual(tx, id));
const porPagar = (orgId = A) =>
  withOrg(orgId, (tx) =>
    tx.execute<{ folio: string; total: string; notas_credito: string; saldo: string }>(
      sql`select folio, total, notas_credito, saldo from v_por_pagar order by folio`
    )
  );
const compra = (data: Record<string, unknown>, id?: string) =>
  withOrg(A, (tx) => registrarCompra(tx, adm, { fecha: '2026-11-01', proveedorId: P, documento: 'factura', ...data, ...(id ? { id } : {}) } as never));

beforeAll(async () => {
  await adminDb()
    .insert(organization)
    .values([
      { id: A, slug: A, nombre: 'A' },
      { id: B, slug: B, nombre: 'B' }
    ]);
  const admin = { ...adm, role: 'admin' };
  P = String((await withOrg(A, (tx) => guardarProveedor(tx, adm, { nombre: 'Prov', rut: '76.111.222-8', plazo: 30 }))).id);
  P2 = String((await withOrg(A, (tx) => guardarProveedor(tx, adm, { nombre: 'Otro', rut: '76.333.444-9' }))).id);
  INS_A = String(
    (
      await withOrg(A, (tx) =>
        guardarInsumo(tx, admin, { nombre: 'Botella', categoria: 'envasado', unidad: 'un', precio: 800, stockInicial: 0 }, undefined, '2026-01-01')
      )
    ).id
  );
  INS_B = String(
    (
      await withOrg(A, (tx) =>
        guardarInsumo(tx, admin, { nombre: 'Corcho', categoria: 'envasado', unidad: 'un', precio: 100, stockInicial: 0 }, undefined, '2026-01-01')
      )
    ).id
  );
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id in (${A}, ${B})`);
});

describe('compras', () => {
  let F1 = '';
  it('factura con 2 líneas: totales en el servidor, stock y precio (el administrativo no necesita permiso de insumos)', async () => {
    const c = await compra({
      folio: '100',
      lineas: [
        { insumoId: INS_A, descripcion: 'Botella 750', cantidad: 1000, precioUnitario: 1000 },
        { descripcion: 'Flete', cantidad: 1, precioUnitario: 50000, exenta: true }
      ]
    });
    F1 = String(c.id);
    expect([c.neto, c.exento, c.iva, c.total]).toEqual([1_000_000, 50_000, 190_000, 1_240_000]);
    expect(await stock(INS_A)).toBe(1000);
    expect(await precio(INS_A)).toBe(1000);
  });

  it('una compra más nueva fija el precio; editar la antigua no lo retrocede (bug de v1)', async () => {
    await compra({ fecha: '2026-11-10', folio: '101', lineas: [{ insumoId: INS_A, descripcion: 'Botella', cantidad: 100, precioUnitario: 1200 }] });
    expect(await precio(INS_A)).toBe(1200);
    const [l] = await withOrg(A, (tx) => tx.execute<{ id: string }>(sql`select id from compra_linea where compra_id = ${F1} and insumo_id is not null`));
    await compra(
      {
        folio: '100',
        lineas: [
          { id: l!.id, insumoId: INS_A, descripcion: 'Botella 750', cantidad: 1000, precioUnitario: 900 },
          { descripcion: 'Flete', cantidad: 1, precioUnitario: 50000, exenta: true }
        ]
      },
      F1
    );
    expect(await precio(INS_A)).toBe(1200);
    expect(await stock(INS_A)).toBe(1100); // la edición reescribe el mismo movimiento
  });

  it('folio único por proveedor y documento', async () => {
    await expect(compra({ folio: '100', lineas: [{ descripcion: 'x', cantidad: 1, precioUnitario: 1 }] })).rejects.toThrow(/folio 100/);
    await compra({ proveedorId: P2, folio: '100', lineas: [{ descripcion: 'otro proveedor', cantidad: 1, precioUnitario: 1000 }] });
  });

  it('nota de crédito: positiva, baja stock y saldo; no puede superar el saldo', async () => {
    const nc = await compra({
      documento: 'nota_credito',
      folio: '7',
      referenciaCompraId: F1,
      lineas: [{ insumoId: INS_A, descripcion: 'Devolución', cantidad: 100, precioUnitario: 900 }]
    });
    expect([nc.neto, nc.iva, nc.total]).toEqual([90_000, 17_100, 107_100]);
    expect(await stock(INS_A)).toBe(1000);
    const f = (await porPagar()).find((r) => r.folio === '100' && Number(r.total) === 1_121_000)!;
    expect(Number(f.notas_credito)).toBe(107_100);
    expect(Number(f.saldo)).toBe(1_121_000 - 107_100);
    await expect(
      compra({ documento: 'nota_credito', folio: '8', referenciaCompraId: F1, lineas: [{ descripcion: 'Demasiado', cantidad: 1, precioUnitario: 5_000_000 }] })
    ).rejects.toThrow(/supera el saldo/);
  });

  it('guía mueve stock sin deuda; su factura no vuelve a sumar stock', async () => {
    const g = await compra({ documento: 'guia', folio: 'G1', lineas: [{ insumoId: INS_B, descripcion: 'Corcho', cantidad: 500, precioUnitario: 110 }] });
    expect(await stock(INS_B)).toBe(500);
    expect((await porPagar()).some((r) => r.folio === 'G1')).toBe(false);
    await compra({ folio: '200', referenciaCompraId: String(g.id), lineas: [{ insumoId: INS_B, descripcion: 'Corcho', cantidad: 500, precioUnitario: 110 }] });
    expect(await stock(INS_B)).toBe(500);
    expect((await porPagar()).some((r) => r.folio === '200')).toBe(true);
    expect(await precio(INS_B)).toBe(110);
  });

  it('anular: bloqueado con NC vigente; anulada revierte stock y precio y libera el folio', async () => {
    await expect(withOrg(A, (tx) => anularCompra(tx, adm, F1))).rejects.toThrow(/que la referencia/);
    const [nc] = await withOrg(A, (tx) => tx.execute<{ id: string }>(sql`select id from compra where documento = 'nota_credito'`));
    await withOrg(A, (tx) => anularCompra(tx, adm, nc!.id));
    expect(await stock(INS_A)).toBe(1100);
    await withOrg(A, (tx) => anularCompra(tx, adm, F1));
    expect(await stock(INS_A)).toBe(100);
    expect(await precio(INS_A)).toBe(1200);
    await expect(compra({ lineas: [{ descripcion: 'x', cantidad: 1, precioUnitario: 1 }], folio: '100' }, F1)).rejects.toThrow(/anulada/);
    await compra({ folio: '100', lineas: [{ descripcion: 'Reemitida', cantidad: 1, precioUnitario: 1000 }] });
  });

  it('quitar una línea al editar borra su movimiento', async () => {
    const c = await compra({
      folio: '300',
      lineas: [
        { insumoId: INS_B, descripcion: 'Corcho', cantidad: 10, precioUnitario: 120 },
        { insumoId: INS_A, descripcion: 'Botella', cantidad: 5, precioUnitario: 1200 }
      ]
    });
    expect(await stock(INS_B)).toBe(510);
    const [l] = await withOrg(A, (tx) => tx.execute<{ id: string }>(sql`select id from compra_linea where compra_id = ${c.id} and insumo_id = ${INS_A}`));
    await compra({ folio: '300', lineas: [{ id: l!.id, insumoId: INS_A, descripcion: 'Botella', cantidad: 5, precioUnitario: 1200 }] }, String(c.id));
    expect(await stock(INS_B)).toBe(500);
  });

  it('v_por_pagar respeta el RLS y el agrónomo no registra compras', async () => {
    expect(await porPagar(B)).toEqual([]);
    await expect(
      withOrg(A, (tx) =>
        registrarCompra(
          tx,
          { ...adm, role: 'agronomo' },
          { fecha: '2026-11-01', proveedorId: P, documento: 'factura', folio: '999', lineas: [{ descripcion: 'x', cantidad: 1, precioUnitario: 1 }] }
        )
      )
    ).rejects.toThrow();
  });
});
