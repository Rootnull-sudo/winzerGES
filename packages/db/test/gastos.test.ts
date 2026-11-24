/** Gastos y presupuesto (F3-4): IVA en el servidor, gastos a crédito en v_por_pagar con pagos, presupuesto único. */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb } from '../src/client';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import { eliminarGasto, guardarGasto, guardarPresupuesto } from '../src/services/gastos';
import { eliminarPago, registrarPago } from '../src/services/pagos';
import { eliminarProveedor, guardarProveedor } from '../src/services/proveedores';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_ga_${run}`;
const adm: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'administrativo' };
let P = '';
const base = { fecha: '2026-11-08', categoria: 'servicios', descripcion: 'Electricidad', monto: 500_000, documento: 'factura', afectoIVA: true } as const;

beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'A' });
  P = String((await withOrg(A, (tx) => guardarProveedor(tx, adm, { nombre: 'Eléctrica', rut: '76.999.000-3' }))).id);
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('gastos', () => {
  it('IVA y total en el servidor; boleta sin IVA aunque venga marcada afecta', async () => {
    const g = await withOrg(A, (tx) => guardarGasto(tx, adm, base));
    expect([g.iva, g.total]).toEqual([95_000, 595_000]);
    const b = await withOrg(A, (tx) => guardarGasto(tx, adm, { ...base, documento: 'boleta' }));
    expect([b.afectoIVA, b.iva, b.total]).toEqual([false, 0, 500_000]);
  });

  it('a crédito: aparece por pagar, recibe pagos y queda bloqueado mientras los tenga', async () => {
    const g = await withOrg(A, (tx) => guardarGasto(tx, adm, { ...base, proveedorId: P, estado: 'pendiente', folio: '77' }));
    const saldo = async () =>
      Number((await withOrg(A, (tx) => tx.execute<{ saldo: string }>(sql`select saldo from v_por_pagar where documento_id = ${g.id}`)))[0]!.saldo);
    expect(await saldo()).toBe(595_000);
    const pago = await withOrg(A, (tx) =>
      registrarPago(tx, adm, { fecha: '2026-11-20', proveedorId: P, monto: 300_000, aplicaciones: [{ gastoId: String(g.id), monto: 300_000 }] })
    );
    expect(await saldo()).toBe(295_000);
    await expect(withOrg(A, (tx) => guardarGasto(tx, adm, { ...base, id: String(g.id), proveedorId: P, estado: 'pagado' }))).rejects.toThrow(/pagos aplicados/);
    await expect(withOrg(A, (tx) => eliminarGasto(tx, adm, String(g.id)))).rejects.toThrow(/pagos aplicados/);
    await expect(withOrg(A, (tx) => eliminarProveedor(tx, adm, P))).rejects.toThrow(/gastos asociados/);
    await withOrg(A, (tx) => eliminarPago(tx, adm, String(pago.id)));
    await withOrg(A, (tx) => eliminarGasto(tx, adm, String(g.id)));
  });

  it('presupuesto: una fila por año y categoría (guardar dos veces actualiza)', async () => {
    await withOrg(A, (tx) => guardarPresupuesto(tx, adm, { anio: 2026, categoria: 'servicios', monto: 6_000_000 }));
    await withOrg(A, (tx) => guardarPresupuesto(tx, adm, { anio: 2026, categoria: 'servicios', monto: 6_500_000 }));
    const filas = await withOrg(A, (tx) => tx.execute<{ monto: string }>(sql`select monto from presupuesto where anio = 2026 and categoria = 'servicios'`));
    expect(filas.map((f) => Number(f.monto))).toEqual([6_500_000]);
  });

  it('el enólogo no registra gastos', async () => {
    await expect(withOrg(A, (tx) => guardarGasto(tx, { ...adm, role: 'enologo' }, base))).rejects.toThrow();
  });
});
