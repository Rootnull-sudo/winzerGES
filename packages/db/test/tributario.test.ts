/** F29 (F6-2): cálculo desde los DTE, remanente encadenado, foto congelada, pagos de impuesto, obligaciones y alerta. */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularAlertas } from '../src/alertas/motor';
import { vencimientosTributarios } from '../src/alertas/reglas/tributario';
import { adminDb } from '../src/client';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import { importarDte, type FilaDte } from '../src/services/dte';
import { eliminarPagoImpuesto, f29Periodos, guardarF29, marcarObligacion, registrarPagoImpuesto } from '../src/services/tributario';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_f29_${run}`;
const admin: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'admin' };

const doc = (direccion: 'emitido' | 'recibido', fecha: string, neto: number, folio: string) => {
  const iva = Math.round(neto * 0.19);
  const fila: FilaDte = {
    direccion,
    tipo: 33,
    folio,
    fecha,
    estado: 'aceptado',
    fechasEstado: {},
    contraparteRut: '76.111.222-8',
    contraparte: 'X',
    giro: null,
    direccionContraparte: null,
    comuna: null,
    neto,
    exento: 0,
    iva,
    ila: 0,
    total: neto + iva,
    formaPago: 1,
    vencimiento: null,
    referencia: null,
    dteRefId: null,
    ventaId: null,
    compraId: null,
    gastoId: null
  };
  return withOrg(A, (tx) => importarDte(tx, admin, randomUUID(), fila, []));
};
const pagos = () =>
  withOrg(A, (tx) => tx.execute<{ tipo: string; monto: string }>(sql`select tipo, monto from pago_impuesto where deleted_at is null order by tipo`));
const oblig = (clave: string) =>
  withOrg(A, async (tx) => (await tx.execute<{ estado: string }>(sql`select estado from obligacion where clave = ${clave} and deleted_at is null`))[0]?.estado);

beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'A' });
  await doc('emitido', '2026-09-05', 100_000, '1');
  await doc('recibido', '2026-09-10', 500_000, '900');
  await doc('emitido', '2026-10-05', 1_000_000, '2');
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('F29', () => {
  it('remanente de septiembre pasa a octubre', async () => {
    const [sep, oct] = await withOrg(A, (tx) => f29Periodos(tx, '2026-09', '2026-10'));
    expect([sep!.calculo.ivaDebito, sep!.calculo.ivaCredito, sep!.calculo.remanenteSiguiente]).toEqual([19_000, 95_000, 76_000]);
    expect([oct!.calculo.remanenteAnterior, oct!.calculo.ivaPagar]).toEqual([76_000, 190_000 - 76_000]);
  });

  it('declarado congela la foto; un documento nuevo no cambia el remanente que encadena', async () => {
    await withOrg(A, (tx) => guardarF29(tx, admin, { periodo: '2026-09', estado: 'declarado', folioSii: '123' }));
    await doc('recibido', '2026-09-28', 100_000, '901');
    const [sep, oct] = await withOrg(A, (tx) => f29Periodos(tx, '2026-09', '2026-10'));
    expect(sep!.calculo.ivaCredito).toBe(95_000);
    expect(oct!.calculo.remanenteAnterior).toBe(76_000);
    expect(await oblig('F29-2026-09')).toBe('cumplida');
    // Al volver a revisado se recalcula con el documento nuevo.
    await withOrg(A, (tx) => guardarF29(tx, admin, { periodo: '2026-09', estado: 'revisado' }));
    const [sep2] = await withOrg(A, (tx) => f29Periodos(tx, '2026-09', '2026-09'));
    expect(sep2!.calculo.ivaCredito).toBe(114_000);
    expect(await oblig('F29-2026-09')).toBe('pendiente');
  });

  it('pagado crea los pagos F29 y PPM; revertir los quita; no se borran a mano', async () => {
    await expect(withOrg(A, (tx) => guardarF29(tx, admin, { periodo: '2026-10', estado: 'pagado' }))).rejects.toThrow();
    const f = await withOrg(A, (tx) => guardarF29(tx, admin, { periodo: '2026-10', estado: 'pagado', fechaPago: '2026-11-20', folioSii: '456' }));
    const snap = f.snapshot as { total: number; ppm: number };
    expect((await pagos()).map((p) => [p.tipo, Number(p.monto)])).toEqual([
      ['F29', snap.total],
      ['PPM', snap.ppm]
    ]);
    const [pid] = await withOrg(A, (tx) => tx.execute<{ id: string }>(sql`select id from pago_impuesto where tipo = 'F29' and deleted_at is null`));
    await expect(withOrg(A, (tx) => eliminarPagoImpuesto(tx, admin, pid!.id))).rejects.toThrow(/lo creó el F29/);
    await withOrg(A, (tx) => guardarF29(tx, admin, { periodo: '2026-10', estado: 'revisado' }));
    expect(await pagos()).toEqual([]);
    // Pagar de nuevo reactiva los mismos pagos (id determinista).
    await withOrg(A, (tx) => guardarF29(tx, admin, { periodo: '2026-10', estado: 'pagado', fechaPago: '2026-11-21' }));
    expect((await pagos()).length).toBe(2);
    await withOrg(A, (tx) => registrarPagoImpuesto(tx, admin, { tipo: 'patente', periodo: '2026-07', fecha: '2026-07-30', monto: 150_000 }));
    expect((await pagos()).length).toBe(3);
  });

  it('alerta de vencimientos: aviso cerca de la fecha, nada si está cumplida', async () => {
    await withOrg(A, (tx) => marcarObligacion(tx, admin, { clave: 'CONTRIB-2026-4ª', estado: 'pendiente' }));
    const r = await calcularAlertas(A, [vencimientosTributarios], '2026-11-24');
    expect(r.errores).toEqual([]);
    const titulos = (
      await withOrg(A, (tx) => tx.execute<{ titulo: string }>(sql`select titulo from alerta where regla = 'tributario.calendario' and estado = 'abierta'`))
    ).map((x) => x.titulo);
    expect(titulos).toContain('Vence pronto: Contribuciones 4ª cuota');
    await withOrg(A, (tx) => marcarObligacion(tx, admin, { clave: 'CONTRIB-2026-4ª', estado: 'cumplida' }));
    await calcularAlertas(A, [vencimientosTributarios], '2026-11-24');
    const abiertas = await withOrg(A, (tx) =>
      tx.execute<{ titulo: string }>(
        sql`select titulo from alerta where regla = 'tributario.calendario' and estado = 'abierta' and titulo like '%Contribuciones%'`
      )
    );
    expect(abiertas).toEqual([]);
    // El rol ventas no ve tributario: no puede marcar obligaciones.
    await expect(withOrg(A, (tx) => marcarObligacion(tx, { ...admin, role: 'ventas' }, { clave: 'X', estado: 'cumplida' }))).rejects.toThrow();
  });
});
