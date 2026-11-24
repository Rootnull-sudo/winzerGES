/** Pagos (F3-3): aplicaciones parciales, saldo en v_por_pagar, validaciones, eliminación y alerta por pagar. */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularAlertas } from '../src/alertas/motor';
import { porPagar } from '../src/alertas/reglas/proveedores';
import { adminDb } from '../src/client';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import { anularCompra, registrarCompra } from '../src/services/compras';
import { eliminarPago, registrarPago } from '../src/services/pagos';
import { guardarProveedor } from '../src/services/proveedores';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_pg_${run}`;
const adm: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'administrativo' };
let P = '',
  P2 = '',
  F1 = '',
  F2 = '';
const saldo = async (id: string) =>
  Number((await withOrg(A, (tx) => tx.execute<{ saldo: string }>(sql`select saldo from v_por_pagar where documento_id = ${id}`)))[0]!.saldo);
const factura = async (prov: string, folio: string, precio: number, vencimiento: string) =>
  String(
    (
      await withOrg(A, (tx) =>
        registrarCompra(tx, adm, {
          fecha: '2026-11-01',
          proveedorId: prov,
          documento: 'factura',
          folio,
          vencimiento,
          lineas: [{ descripcion: 'Servicio', cantidad: 1, precioUnitario: precio }]
        })
      )
    ).id
  );
const pagar = (aplicaciones: { compraId: string; monto: number }[], proveedorId = P) =>
  withOrg(A, (tx) => registrarPago(tx, adm, { fecha: '2026-11-20', proveedorId, monto: aplicaciones.reduce((s, a) => s + a.monto, 0), aplicaciones }));

beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'A' });
  P = String((await withOrg(A, (tx) => guardarProveedor(tx, adm, { nombre: 'Prov', rut: '76.111.222-8' }))).id);
  P2 = String((await withOrg(A, (tx) => guardarProveedor(tx, adm, { nombre: 'Otro', rut: '76.333.444-9' }))).id);
  F1 = await factura(P, '1', 100_000, '2026-11-10'); // total 119.000, vencida al 20-11
  F2 = await factura(P, '2', 50_000, '2026-12-30'); // total 59.500
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('pagos', () => {
  let pagoId = '';
  it('pago parcial a dos documentos: baja cada saldo', async () => {
    pagoId = String(
      (
        await pagar([
          { compraId: F1, monto: 100_000 },
          { compraId: F2, monto: 9_500 }
        ])
      ).id
    );
    expect(await saldo(F1)).toBe(19_000);
    expect(await saldo(F2)).toBe(50_000);
  });

  it('rechaza aplicar más que el saldo, documentos de otro proveedor y repetidos', async () => {
    await expect(pagar([{ compraId: F1, monto: 20_000 }])).rejects.toThrow(/su saldo es \$19\.000/);
    await expect(pagar([{ compraId: F1, monto: 1_000 }], P2)).rejects.toThrow(/otro proveedor/);
    await expect(
      pagar([
        { compraId: F1, monto: 1_000 },
        { compraId: F1, monto: 1_000 }
      ])
    ).rejects.toThrow(/dos veces/);
  });

  it('con pagos aplicados la compra no se anula; al eliminar el pago vuelve el saldo', async () => {
    await expect(withOrg(A, (tx) => anularCompra(tx, adm, F1))).rejects.toThrow(/pagos aplicados/);
    await withOrg(A, (tx) => eliminarPago(tx, adm, pagoId));
    expect(await saldo(F1)).toBe(119_000);
    expect(await saldo(F2)).toBe(59_500);
  });

  it('alerta por pagar con el texto de v1 (vencidas o por vencer en 7 días)', async () => {
    await pagar([{ compraId: F2, monto: 59_500 }]);
    const r = await calcularAlertas(A, [porPagar], '2026-11-20');
    expect(r.errores).toEqual([]);
    const [a] = await withOrg(A, (tx) => tx.execute<{ titulo: string; mensaje: string }>(sql`select titulo, mensaje from alerta where estado = 'abierta'`));
    expect(a).toEqual({ titulo: '1 facturas de proveedores por pagar', mensaje: 'Vencidas o por vencer en 7 días: $119.000.' });
  });
});
