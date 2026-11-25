/** Finanzas (F7): datos del período desde la base para el estado de resultados y los costos. */
import { estadoResultados, flujoCaja, type Mutation } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb } from '../src/client';
import { upsert, type Actor } from '../src/repo';
import { activo, cliente, organization } from '../src/schema';
import { datosPeriodo, costosPorLote, movimientosCaja } from '../src/services/financiero';
import { calcularRenta, guardarRenta, rentaDelAnio } from '../src/services/renta';
import { guardarGasto } from '../src/services/gastos';
import { asegurarTemporada, listarTemporadas } from '../src/services/temporadas';
import { confirmarVenta, guardarVenta } from '../src/services/ventas';
import * as sync from '../src/sync';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_fi_${run}`;
const admin: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'admin' };
const P = { desde: '2026-07-01', hasta: '2027-06-30' };
const push = async (entity: string, data: Record<string, unknown>, id: string = randomUUID()) => {
  const m: Mutation = { mutationId: randomUUID(), entity, op: 'upsert', id, baseVersion: null, data, createdAt: new Date().toISOString() };
  const [r] = await sync.push(admin, [m]);
  expect(r, JSON.stringify(r)).toMatchObject({ status: 'ok' });
  return id;
};

beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'A' });
  await withOrg(A, (tx) => asegurarTemporada(tx, A, '2026-11-01'));
  const T = (await withOrg(A, listarTemporadas))[0]!.id;
  const L = await push('lote', { codigo: 'L-FI', temporadaId: T, variedad: 'Malbec', tipo: 'tinto', estado: 'En guarda', fechaVendimiaPlan: '2026-03-01' });
  const E = await push('estanque', { codigo: 'FI-1', capacidad: 5000, tipo: 'Guarda', estado: 'operativo' });
  await push('mov_bodega', { fecha: '2026-08-01', estanqueId: E, loteId: L, litros: 3000, tipo: 'entrada', origen: 'vino' });
  const C = randomUUID();
  await withOrg(A, (tx) =>
    upsert(
      tx,
      cliente,
      admin,
      { entity: 'cliente', module: 'clientes', label: 'clientes' },
      { id: C, nombre: 'Granelero', rut: '76.888.999-0', tipo: 'Empresa', plazo: 0 }
    )
  );
  const v = await withOrg(A, (tx) =>
    guardarVenta(tx, admin, {
      fecha: '2026-10-01',
      clienteId: C,
      documento: 'factura',
      lineas: [{ tipo: 'granel', estanqueId: E, loteId: L, cantidad: 1000, precio: 1500 }]
    } as never)
  );
  await withOrg(A, (tx) => confirmarVenta(tx, admin, String(v.id)));
  await withOrg(A, (tx) =>
    guardarGasto(tx, admin, {
      fecha: '2026-09-10',
      descripcion: 'Luz',
      categoria: 'servicios',
      monto: 200_000,
      documento: 'boleta',
      estado: 'pagado',
      area: 'produccion',
      tipoCosto: 'variable'
    } as never)
  );
  await withOrg(A, (tx) =>
    upsert(
      tx,
      activo,
      admin,
      { entity: 'activo', module: 'administracion', label: 'activos' },
      { id: randomUUID(), nombre: 'Prensa', valor: 3_650_000, vidaUtilAnios: 10, fechaCompra: '2026-01-01' }
    )
  );
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('datos financieros del período', () => {
  it('ventas por línea con su costo congelado, gastos y depreciación diaria', async () => {
    const d = await withOrg(A, (tx) => datosPeriodo(tx, P));
    expect(d.lineas).toHaveLength(1);
    expect(d.lineas[0]).toMatchObject({ tipo: 'granel', cantidad: 1000, litros: 1000, neto: 1_500_000 });
    expect(d.lineas[0]!.costoUnitario).toBe(0); // lote sin costos registrados
    expect(d.gastos.map((g) => [g.area, g.tipoCosto, g.monto])).toEqual([['produccion', 'variable', 200_000]]);
    // 365.000/año → 1.000 por día × 365 días de la temporada.
    expect(Math.round(d.depreciacion)).toBe(365_000);
    const er = estadoResultados(d, P, { tasaIDPC: 0.25 });
    expect([er.ingresos, er.indirectos, er.ebitda, Math.round(er.ebit)]).toEqual([1_500_000, 200_000, 1_300_000, 935_000]);
    const fuera = await withOrg(A, (tx) => datosPeriodo(tx, { desde: '2025-07-01', hasta: '2026-06-30' }));
    expect(fuera.lineas).toEqual([]);
  });

  it('costo directo por lote con litros', async () => {
    const ls = await withOrg(A, costosPorLote);
    expect(ls.map((l) => [l.codigo, l.litros])).toEqual([['L-FI', 3000]]);
  });
});

describe('renta y flujo de caja', () => {
  it('renta: declarar congela la foto; pagar registra el pago y cumple la obligación; revertir lo deshace', async () => {
    const r0 = await withOrg(A, (tx) => rentaDelAnio(tx, 2026));
    expect(r0.registro).toBeNull();
    expect(r0.calculo.anioTributario).toBe(2027);
    await withOrg(A, (tx) => guardarRenta(tx, admin, { anio: 2026, estado: 'declarado', folioSii: 'R-1' }));
    // Un gasto nuevo del año no cambia la renta declarada.
    await withOrg(A, (tx) =>
      guardarGasto(tx, admin, {
        fecha: '2026-12-01',
        descripcion: 'Multa',
        categoria: 'otros',
        monto: 90_000,
        documento: 'otro',
        estado: 'pagado',
        noDeducible: true
      } as never)
    );
    const r1 = await withOrg(A, (tx) => rentaDelAnio(tx, 2026));
    expect(r1.calculo).toEqual(r0.calculo);
    const r2 = await withOrg(A, (tx) => calcularRenta(tx, 2026));
    expect(r2.agregados).toBe(90_000);
    await withOrg(A, (tx) => guardarRenta(tx, admin, { anio: 2026, estado: 'pagado', folioSii: 'R-1', fechaPago: '2027-04-30' }));
    const pagos = () =>
      withOrg(A, (tx) => tx.execute<{ tipo: string; monto: string }>(sql`select tipo, monto from pago_impuesto where deleted_at is null and tipo = 'renta'`));
    const ob = () => withOrg(A, (tx) => tx.execute<{ estado: string }>(sql`select estado from obligacion where clave = 'RENTA-2027' and deleted_at is null`));
    const aPagar = r0.calculo.aPagar;
    expect((await pagos()).map((p) => Number(p.monto))).toEqual(aPagar > 0 ? [aPagar] : []);
    expect((await ob())[0]?.estado).toBe('cumplida');
    await withOrg(A, (tx) => guardarRenta(tx, admin, { anio: 2026, estado: 'revisado' }));
    expect(await pagos()).toEqual([]);
    expect((await ob())[0]?.estado).toBe('pendiente');
  });

  it('flujo: el cobro real entra y el saldo por cobrar se proyecta a su vencimiento; F29 una sola vez', async () => {
    const movs = await withOrg(A, (tx) => movimientosCaja(tx, 2026, 20));
    const cobros = movs.filter((m) => m.concepto === 'cobros');
    // La venta de octubre no tiene cobros: entra su total como saldo por cobrar.
    expect(cobros.map((m) => m.monto)).toEqual([1_785_000]);
    expect(movs.filter((m) => m.concepto === 'gastos').length).toBeGreaterThan(0);
    const fc = flujoCaja(2026, movs, 0, '2026-11');
    expect(fc.rows).toHaveLength(12);
  });
});
