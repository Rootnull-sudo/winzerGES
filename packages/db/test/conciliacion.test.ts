/** Conciliación bancaria (F6-3): cartola con huella, conciliación automática y manual, diferencias, gasto financiero. */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularAlertas } from '../src/alertas/motor';
import { diferenciasConciliacion, movimientosSinConciliar } from '../src/alertas/reglas/conciliacion';
import { adminDb } from '../src/client';
import { upsert, type Actor } from '../src/repo';
import { cliente, organization } from '../src/schema';
import { registrarCobro } from '../src/services/cobros';
import { candidatosLibres, conciliar, desconciliar, guardarCuenta, importarCartola, registrarDiferencia } from '../src/services/conciliacion';
import { guardarGasto } from '../src/services/gastos';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_cb_${run}`;
const admin: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'admin' };
let CTA = '',
  CLI = '';
const filas = [
  { fecha: '2026-10-05', glosa: 'Transferencia de cliente', monto: 500_000 },
  { fecha: '2026-10-07', glosa: 'Pago asesoría', monto: -119_000 },
  { fecha: '2026-10-31', glosa: 'Comisión mantención', monto: -8_900 },
  { fecha: '2026-10-31', glosa: 'Intereses', monto: 3_200 },
  { fecha: '2026-10-31', glosa: 'Intereses', monto: 3_200 }
];
const movs = () =>
  withOrg(A, (tx) =>
    tx.execute<{ id: string; glosa: string; estado: string; nota: string | null }>(
      sql`select id, glosa, estado, nota from mov_banco where deleted_at is null order by fecha, glosa`
    )
  );
const mov = async (glosa: string) => (await movs()).find((m) => m.glosa === glosa)!;

beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'A' });
  CTA = String(
    (await withOrg(A, (tx) => guardarCuenta(tx, admin, { banco: 'Banco Prueba', numero: '000-1', fechaInicio: '2026-09-01', saldoInicial: 1_000_000 }))).id
  );
  CLI = randomUUID();
  await withOrg(A, (tx) =>
    upsert(
      tx,
      cliente,
      admin,
      { entity: 'cliente', module: 'clientes', label: 'clientes' },
      { id: CLI, nombre: 'Cliente Banco', rut: '76.888.999-0', tipo: 'Empresa', plazo: 0 }
    )
  );
  await withOrg(A, (tx) => registrarCobro(tx, admin, { fecha: '2026-10-04', clienteId: CLI, monto: 500_000, medio: 'transferencia', aplicaciones: [] }));
  await withOrg(A, (tx) => registrarCobro(tx, admin, { fecha: '2026-10-30', clienteId: CLI, monto: 3_000, medio: 'transferencia', aplicaciones: [] }));
  await withOrg(A, (tx) => registrarCobro(tx, admin, { fecha: '2026-10-05', clienteId: CLI, monto: 500_000, medio: 'efectivo', aplicaciones: [] }));
  await withOrg(A, (tx) =>
    guardarGasto(tx, admin, {
      fecha: '2026-10-06',
      descripcion: 'Asesoría',
      categoria: 'profesionales',
      monto: 100_000,
      afectoIVA: true,
      documento: 'factura',
      folio: '44',
      estado: 'pagado',
      medioPago: 'transferencia'
    } as never)
  );
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('conciliación bancaria', () => {
  it('importa la cartola sin duplicados y concilia sola lo que calza (el cobro en efectivo no es candidato)', async () => {
    const r = await withOrg(A, (tx) => importarCartola(tx, admin, { cuentaId: CTA, archivo: 'cartola.csv', mapeo: { fecha: 0, glosa: 1, monto: 2 }, filas }));
    expect([r.importados, r.duplicadas, r.conciliados]).toEqual([4, 1, 2]);
    expect((await mov('Transferencia de cliente')).estado).toBe('conciliado');
    expect((await mov('Pago asesoría')).estado).toBe('conciliado');
    const again = await withOrg(A, (tx) => importarCartola(tx, admin, { cuentaId: CTA, mapeo: { fecha: 0, glosa: 1, monto: 2 }, filas }));
    expect([again.importados, again.duplicadas]).toEqual([0, 5]);
    const libres = await withOrg(A, candidatosLibres);
    expect(libres.map((c) => c.monto)).toEqual([3_000]);
  });

  it('manual con monto distinto queda en diferencia; un documento no se concilia dos veces', async () => {
    const [c] = await withOrg(A, candidatosLibres);
    const m = await mov('Intereses');
    await withOrg(A, (tx) => conciliar(tx, admin, { movId: m.id, origenTipo: c!.origenTipo, origenId: c!.origenId }));
    expect(await mov('Intereses')).toMatchObject({ estado: 'diferencia', nota: 'Diferencia $200' });
    const otro = await mov('Comisión mantención');
    await expect(withOrg(A, (tx) => conciliar(tx, admin, { movId: otro.id, origenTipo: c!.origenTipo, origenId: c!.origenId }))).rejects.toThrow();
    const r = await calcularAlertas(A, [movimientosSinConciliar, diferenciasConciliacion], '2026-11-24');
    expect(r.errores).toEqual([]);
    const al = await withOrg(A, (tx) =>
      tx.execute<{ regla: string; titulo: string }>(sql`select regla, titulo from alerta where estado = 'abierta' order by regla`)
    );
    expect(al.map((a) => a.titulo)).toEqual(['Diferencias de conciliación', '1 movimientos sin conciliar en Banco Prueba']);
  });

  it('la diferencia como gasto financiero queda conciliada; deshacer elimina el gasto', async () => {
    const m = await mov('Comisión mantención');
    await withOrg(A, (tx) => registrarDiferencia(tx, admin, { movId: m.id, motivo: 'Comisión bancaria', crearGasto: true }));
    expect((await mov('Comisión mantención')).estado).toBe('conciliado');
    const g = async () =>
      (await withOrg(A, (tx) => tx.execute<{ n: number }>(sql`select count(*)::int as n from gasto where categoria = 'financiero' and deleted_at is null`)))[0]!
        .n;
    expect(await g()).toBe(1);
    expect((await withOrg(A, candidatosLibres)).length).toBe(0);
    await withOrg(A, (tx) => desconciliar(tx, admin, m.id));
    expect([(await mov('Comisión mantención')).estado, await g()]).toEqual(['pendiente', 0]);
    // El rol ventas no ve conciliación.
    await expect(withOrg(A, (tx) => desconciliar(tx, { ...admin, role: 'ventas' }, m.id))).rejects.toThrow();
  });
});
