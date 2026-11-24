/** DTE (F6-1): folios con CAF, DTE desde ventas, NC/ND, recibidos desde compras y gastos, transiciones y alertas. */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularAlertas } from '../src/alertas/motor';
import { dteRechazado, foliosPorAgotarse } from '../src/alertas/reglas/dte';
import { adminDb } from '../src/client';
import { upsert, type Actor } from '../src/repo';
import { cliente, organization } from '../src/schema';
import { anularCompra, registrarCompra } from '../src/services/compras';
import { cambiarEstadoDte, eliminarCaf, emisorDe, emitirNota, guardarCaf, guardarEmisor, siguienteFolio } from '../src/services/dte';
import { eliminarGasto, guardarGasto } from '../src/services/gastos';
import { guardarProveedor } from '../src/services/proveedores';
import { anularVenta, confirmarVenta, guardarVenta } from '../src/services/ventas';
import { asegurarTemporada, listarTemporadas } from '../src/services/temporadas';
import * as sync from '../src/sync';
import type { Mutation } from '@winzer/domain';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_dte_${run}`;
const admin: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'admin' };
let CLI = '',
  LV = '',
  EV = '',
  P = '';

const push = async (entity: string, data: Record<string, unknown>, id: string = randomUUID()) => {
  const m: Mutation = { mutationId: randomUUID(), entity, op: 'upsert', id, baseVersion: null, data, createdAt: new Date().toISOString() };
  const [r] = await sync.push(admin, [m]);
  expect(r, JSON.stringify(r)).toMatchObject({ status: 'ok' });
  return id;
};
type Fila = { id: string; tipo: number; folio: string; estado: string; neto: string; iva: string; ila: string; total: string; dte_ref_id: string | null };
const dtes = (where = sql`true`) =>
  withOrg(A, (tx) =>
    tx.execute<Fila>(sql`select id, tipo, folio, estado, neto, iva, ila, total, dte_ref_id from dte where deleted_at is null and ${where} order by created_at`)
  );
const venta = async (documento: string, litros = 10, precio = 10_000) => {
  const v = await withOrg(A, (tx) =>
    guardarVenta(tx, admin, {
      fecha: '2026-11-10',
      clienteId: CLI,
      documento,
      lineas: [{ tipo: 'granel', estanqueId: EV, loteId: LV, cantidad: litros, precio }]
    } as never)
  );
  return withOrg(A, (tx) => confirmarVenta(tx, admin, String(v.id)));
};

beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'Viña Test', rut: '76.543.210-3', razonSocial: 'Viña Test SpA' });
  await withOrg(A, (tx) => asegurarTemporada(tx, A, '2026-03-01'));
  const T = (await withOrg(A, listarTemporadas))[0]!.id;
  LV = await push('lote', { codigo: 'L-DTE', temporadaId: T, variedad: 'Carmenere', tipo: 'tinto', estado: 'En guarda', fechaVendimiaPlan: '2026-03-01' });
  EV = await push('estanque', { codigo: 'DTE-1', capacidad: 9000, tipo: 'Guarda', estado: 'operativo' });
  await push('mov_bodega', { fecha: '2026-07-15', estanqueId: EV, loteId: LV, litros: 5000, tipo: 'entrada', origen: 'vino' });
  CLI = randomUUID();
  await withOrg(A, (tx) =>
    upsert(
      tx,
      cliente,
      admin,
      { entity: 'cliente', module: 'clientes', label: 'clientes' },
      { id: CLI, nombre: 'Bar Ñandú & Cía', rut: '76.888.999-0', tipo: 'Empresa', plazo: 30 }
    )
  );
  P = String((await withOrg(A, (tx) => guardarProveedor(tx, admin, { nombre: 'Proveedor DTE', rut: '76.111.222-8', plazo: 30 }))).id);
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('DTE emitidos', () => {
  it('confirmar una factura emite el DTE 33 con sus líneas y los datos del cliente', async () => {
    const v = await venta('factura');
    const [d] = await dtes(sql`venta_id = ${v.id}`);
    expect([d!.tipo, d!.folio, d!.estado, Number(d!.total)]).toEqual([33, String(v.dteFolio), 'generado', Number(v.total)]);
    const [l] = await withOrg(A, (tx) => tx.execute<{ nombre: string; unidad: string }>(sql`select nombre, unidad from dte_linea where dte_id = ${d!.id}`));
    expect(l).toMatchObject({ nombre: 'Vino a granel', unidad: 'L' });
  });

  it('anular una factura emite la NC 61 con los montos originales; la boleta queda anulada sin NC', async () => {
    const f = await venta('factura', 20);
    const a = await withOrg(A, (tx) => anularVenta(tx, admin, String(f.id)));
    const [orig] = await dtes(sql`venta_id = ${f.id} and tipo = 33`);
    const [nc] = await dtes(sql`dte_ref_id = ${orig!.id}`);
    expect([nc!.tipo, nc!.folio, nc!.total, nc!.iva]).toEqual([61, String(a.ncFolio), orig!.total, orig!.iva]);

    const b = await venta('boleta', 5);
    await withOrg(A, (tx) => anularVenta(tx, admin, String(b.id)));
    const docs = await dtes(sql`venta_id = ${b.id}`);
    expect(docs.map((d) => [d.tipo, d.estado])).toEqual([[39, 'anulado']]);
  });

  it('NC parcial prorratea IVA e ILA y no puede superar el documento; ND con monto', async () => {
    const f = await venta('factura', 30);
    const [orig] = await dtes(sql`venta_id = ${f.id} and tipo = 33`);
    const nc = await withOrg(A, (tx) => emitirNota(tx, admin, { dteId: orig!.id, tipo: 61, fecha: '2026-11-15', razon: 'Descuento', neto: 100_000 }));
    expect([nc.tipo, nc.neto, nc.iva]).toEqual([61, 100_000, 19_000]);
    await expect(
      withOrg(A, (tx) => emitirNota(tx, admin, { dteId: orig!.id, tipo: 61, fecha: '2026-11-15', razon: 'Otra', neto: Number(orig!.neto) }))
    ).rejects.toThrow(/más que el documento/);
    const nd = await withOrg(A, (tx) => emitirNota(tx, admin, { dteId: orig!.id, tipo: 56, fecha: '2026-11-15', razon: 'Flete', neto: 10_000 }));
    expect([nd.tipo, nd.total]).toEqual([56, 11_900]);
    // El rol ventas puede vender (emite el DTE) pero no anular a mano.
    await expect(withOrg(A, (tx) => cambiarEstadoDte(tx, { ...admin, role: 'ventas' }, nc.id, 'enviado'))).rejects.toThrow();
  });

  it('transiciones validadas; la factura de una venta vigente no se anula a mano', async () => {
    const f = await venta('factura', 5);
    const [d] = await dtes(sql`venta_id = ${f.id}`);
    await expect(withOrg(A, (tx) => cambiarEstadoDte(tx, admin, d!.id, 'aceptado'))).rejects.toThrow(/No se puede pasar/);
    await expect(withOrg(A, (tx) => cambiarEstadoDte(tx, admin, d!.id, 'anulado'))).rejects.toThrow(/anula la venta/);
    await withOrg(A, (tx) => cambiarEstadoDte(tx, admin, d!.id, 'enviado'));
    await withOrg(A, (tx) => cambiarEstadoDte(tx, admin, d!.id, 'rechazado'));
    const r = await calcularAlertas(A, [dteRechazado], '2026-11-24');
    expect(r.errores).toEqual([]);
    const [al] = await withOrg(A, (tx) => tx.execute<{ titulo: string }>(sql`select titulo from alerta where regla = 'dte.rechazado' and estado = 'abierta'`));
    expect(al!.titulo).toMatch(/rechazad/);
  });
});

describe('folios y CAF', () => {
  it('el folio cae en el CAF, salta al siguiente rango y se agota; nunca se repite', async () => {
    await withOrg(A, (tx) => guardarCaf(tx, admin, { tipo: 34, desde: 5, hasta: 6, fechaAutorizacion: '2026-01-01' }));
    await withOrg(A, (tx) => guardarCaf(tx, admin, { tipo: 34, desde: 20, hasta: 20, fechaAutorizacion: '2026-01-01' }));
    await expect(withOrg(A, (tx) => guardarCaf(tx, admin, { tipo: 34, desde: 6, hasta: 8, fechaAutorizacion: '2026-01-01' }))).rejects.toThrow(/se cruza/);
    const folios = [];
    for (let i = 0; i < 3; i++) folios.push(await withOrg(A, (tx) => siguienteFolio(tx, 34)));
    expect(folios).toEqual([5, 6, 20]);
    await expect(withOrg(A, (tx) => siguienteFolio(tx, 34))).rejects.toThrow(/Se agotaron/);
    const r = await calcularAlertas(A, [foliosPorAgotarse], '2026-11-24');
    expect(r.errores).toEqual([]);
  });

  it('sin CAF en ambiente de producción no hay folios; un CAF usado no se elimina', async () => {
    await withOrg(A, (tx) => guardarEmisor(tx, admin, { giro: 'Vinos', ambiente: 'produccion' }));
    await expect(withOrg(A, (tx) => siguienteFolio(tx, 56))).rejects.toThrow(/No hay folios autorizados/);
    await withOrg(A, (tx) => guardarEmisor(tx, admin, { giro: 'Vinos', ambiente: 'simulado' }));
    const e = await withOrg(A, emisorDe);
    expect([e.rut, e.razonSocial, e.giro]).toEqual(['76.543.210-3', 'Viña Test SpA', 'Vinos']);
    const c = await withOrg(A, (tx) => guardarCaf(tx, admin, { tipo: 39, desde: 1, hasta: 1000, fechaAutorizacion: '2026-01-01' }));
    await venta('boleta', 1);
    await expect(withOrg(A, (tx) => eliminarCaf(tx, admin, String(c.id)))).rejects.toThrow(/folios emitidos/);
  });
});

describe('DTE recibidos', () => {
  it('compra con factura → recibido 33; NC de compra → 61 positivo que resta en el libro; anular quita el DTE', async () => {
    const f = await withOrg(A, (tx) =>
      registrarCompra(tx, admin, {
        fecha: '2026-11-03',
        proveedorId: P,
        documento: 'factura',
        folio: '7001',
        lineas: [{ descripcion: 'Servicio', cantidad: 1, precioUnitario: 100_000 }]
      })
    );
    const nc = await withOrg(A, (tx) =>
      registrarCompra(tx, admin, {
        fecha: '2026-11-04',
        proveedorId: P,
        documento: 'nota_credito',
        folio: '55',
        referenciaCompraId: String(f.id),
        lineas: [{ descripcion: 'Devolución', cantidad: 1, precioUnitario: 20_000 }]
      })
    );
    const rec = await dtes(sql`direccion = 'recibido' and compra_id in (${f.id}, ${nc.id})`);
    expect(rec.map((d) => [d.tipo, d.folio, Number(d.iva)])).toEqual([
      [33, '7001', 19_000],
      [61, '55', 3_800]
    ]);
    await withOrg(A, (tx) => anularCompra(tx, admin, String(nc.id)));
    expect(await dtes(sql`compra_id = ${nc.id}`)).toEqual([]);
  });

  it('gasto con factura afecta → recibido; al cambiar a boleta o eliminarlo, se quita', async () => {
    const g = await withOrg(A, (tx) =>
      guardarGasto(tx, admin, {
        fecha: '2026-11-05',
        descripcion: 'Asesoría',
        categoria: 'profesionales',
        monto: 50_000,
        documento: 'factura',
        folio: '88',
        afectoIVA: true,
        estado: 'pagado'
      } as never)
    );
    expect((await dtes(sql`gasto_id = ${g.id}`)).map((d) => d.tipo)).toEqual([33]);
    await withOrg(A, (tx) =>
      guardarGasto(tx, admin, {
        id: g.id,
        fecha: '2026-11-05',
        descripcion: 'Asesoría',
        categoria: 'profesionales',
        monto: 50_000,
        documento: 'boleta',
        afectoIVA: false,
        estado: 'pagado'
      } as never)
    );
    expect(await dtes(sql`gasto_id = ${g.id}`)).toEqual([]);
    await withOrg(A, (tx) => eliminarGasto(tx, admin, String(g.id)));
  });
});
