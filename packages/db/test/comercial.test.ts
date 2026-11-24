/** Comercial (F5): formatos, marcas y etiquetas; envasado, ventas y cobros se agregan en F5-2…F5-4. */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularAlertas } from '../src/alertas/motor';
import { marcaPorVencer, marcaVencida, ventasEnMora } from '../src/alertas/reglas/comercial';
import { adminDb } from '../src/client';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import type { Mutation } from '@winzer/domain';
import { anularOrden, confirmarEnvasado, guardarOrden } from '../src/services/envasado';
import { guardarInsumo } from '../src/services/insumos';
import { eliminarFormato, eliminarMarca, guardarEtiqueta, guardarFormato, guardarMarca } from '../src/services/marcas';
import { guardarTemporada, listarTemporadas } from '../src/services/temporadas';
import * as sync from '../src/sync';
import { upsert } from '../src/repo';
import { cliente } from '../src/schema';
import { anularVenta, clienteTieneVentas, confirmarVenta, guardarVenta } from '../src/services/ventas';
import { eliminarCobro, registrarCobro } from '../src/services/cobros';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_cm_${run}`;
const admin: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'admin' };

beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'A' });
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('formatos, marcas y etiquetas', () => {
  it('la versión del diseño no pisa el control de versión del registro', async () => {
    const m = await withOrg(A, (tx) => guardarMarca(tx, admin, { nombre: 'Marca Test', fechaRegistro: '2017-03-10' }));
    expect(m.vencimiento).toBe('2027-03-10');
    const e = await withOrg(A, (tx) => guardarEtiqueta(tx, admin, { nombre: 'Etiqueta', versionDiseno: 3, marcaId: String(m.id) }));
    expect([e.versionDiseno, e.version]).toEqual([3, 1]);
    const e2 = await withOrg(A, (tx) => guardarEtiqueta(tx, admin, { id: String(e.id), nombre: 'Etiqueta', versionDiseno: 3, marcaId: String(m.id) }, 1));
    expect([e2.versionDiseno, e2.version]).toEqual([3, 2]);
    await expect(withOrg(A, (tx) => eliminarMarca(tx, admin, String(m.id)))).rejects.toThrow(/tiene etiquetas/);
  });

  it('el enólogo ve marcas pero no las crea; crea formatos (envasado)', async () => {
    const eno = { ...admin, role: 'enologo' };
    await expect(withOrg(A, (tx) => guardarMarca(tx, eno, { nombre: 'X', fechaRegistro: '2020-01-01' }))).rejects.toThrow();
    const f = await withOrg(A, (tx) => guardarFormato(tx, eno, { nombre: 'Botella 0,75 L', litros: 0.75 }));
    expect(Number(f.litros)).toBe(0.75);
  });

  it('alerta de marca: aviso a ≤ 180 días y error si venció (textos de v1)', async () => {
    const r = await calcularAlertas(A, [marcaVencida, marcaPorVencer], '2026-11-24');
    expect(r.errores).toEqual([]);
    const filas = await withOrg(A, (tx) =>
      tx.execute<{ regla: string; titulo: string; mensaje: string }>(sql`select regla, titulo, mensaje from alerta where estado = 'abierta'`)
    );
    expect(filas).toEqual([{ regla: 'marca.por_vencer', titulo: 'Renovar marca Marca Test (INAPI)', mensaje: 'Vence el 10-03-2027.' }]);
    await calcularAlertas(A, [marcaVencida, marcaPorVencer], '2027-04-01');
    const [v] = await withOrg(A, (tx) => tx.execute<{ regla: string }>(sql`select regla from alerta where estado = 'abierta'`));
    expect(v!.regla).toBe('marca.vencida');
  });
});

describe('órdenes de envasado', () => {
  const push = async (entity: string, data: Record<string, unknown>, id: string = randomUUID()) => {
    const m: Mutation = { mutationId: randomUUID(), entity, op: 'upsert', id, baseVersion: null, data, createdAt: new Date().toISOString() };
    const [r] = await sync.push(admin, [m]);
    expect(r, JSON.stringify(r)).toMatchObject({ status: 'ok' });
    return id;
  };
  const stock = async (insumoId: string) =>
    Number((await withOrg(A, (tx) => tx.execute<{ stock: string }>(sql`select stock from v_stock_insumo where insumo_id = ${insumoId}`)))[0]!.stock);
  const litros = async () =>
    Number(
      (
        await withOrg(A, (tx) =>
          tx.execute<{ l: string }>(sql`select coalesce(sum(litros), 0) as l from mov_bodega where lote_id = ${LT} and deleted_at is null`)
        )
      )[0]!.l
    );
  const prod = async (ordenId: string) =>
    Number(
      (await withOrg(A, (tx) => tx.execute<{ stock: string }>(sql`select stock from v_stock_producto where orden_envasado_id = ${ordenId}`)))[0]?.stock ?? 0
    );
  let LT = '',
    E = '',
    F = '',
    BOT = '',
    COR = '',
    CAJA = '';
  const orden = (extra: Record<string, unknown> = {}) =>
    withOrg(A, (tx) =>
      guardarOrden(tx, admin, {
        fecha: '2026-08-01',
        estanqueId: E,
        loteId: LT,
        formatoId: F,
        unidades: 1200,
        mermaPct: 1.5,
        envaseId: BOT,
        cierreId: COR,
        cajaId: CAJA,
        manoObra: 120_000,
        ...extra
      })
    );

  beforeAll(async () => {
    await withOrg(A, (tx) => guardarTemporada(tx, admin, { anio: 2027, inicio: '2026-07-01', fin: '2027-06-30' }));
    const T = (await withOrg(A, listarTemporadas))[0]!.id;
    LT = await push('lote', { codigo: 'L-EN', temporadaId: T, variedad: 'Syrah', tipo: 'tinto', estado: 'En guarda', fechaVendimiaPlan: '2026-03-01' });
    E = await push('estanque', { codigo: 'EN-1', capacidad: 5000, tipo: 'Guarda', estado: 'operativo' });
    await push('mov_bodega', { fecha: '2026-07-15', estanqueId: E, loteId: LT, litros: 1000, tipo: 'entrada', origen: 'vino' });
    F = String((await withOrg(A, (tx) => guardarFormato(tx, admin, { nombre: 'Botella test', litros: 0.75, unidadesCaja: 12 }))).id);
    const ins = async (nombre: string, tipo: 'Envase vidrio' | 'Cierre' | 'Caja', precio: number, stockInicial: number) =>
      String((await withOrg(A, (tx) => guardarInsumo(tx, admin, { nombre, categoria: 'envasado', tipo, unidad: 'un', precio, stockInicial }))).id);
    BOT = await ins('Botella EN', 'Envase vidrio', 420, 2000);
    COR = await ins('Corcho EN', 'Cierre', 170, 1250);
    CAJA = await ins('Caja EN', 'Caja', 960, 100);
  });

  it('confirmar descuenta bodega, insumos (caja entera) y suma botellas, con costo congelado y código', async () => {
    const o = await orden();
    const c = await withOrg(A, (tx) => confirmarEnvasado(tx, admin, String(o.id)));
    expect(c.codigo).toBe('OE-2026-0001');
    expect(Number(c.litrosConsumidos)).toBe(913.5); // 1.200 × 0,75 × 1,015
    expect(await litros()).toBeCloseTo(1000 - 913.5, 6);
    expect([await stock(BOT), await stock(COR), await stock(CAJA)]).toEqual([800, 50, 0]); // 100 cajas de 12
    expect(await prod(String(o.id))).toBe(1200);
    // costo unitario = vino (0) + botella 420 + corcho 170 + caja 960/12 + MO 120.000/1.200
    expect(Number(c.costoUnitario)).toBeCloseTo(420 + 170 + 80 + 100, 6);
    await expect(withOrg(A, (tx) => eliminarFormato(tx, admin, F))).rejects.toThrow(/órdenes de envasado/);
  });

  it('si falta un insumo no se escribe nada (atómico)', async () => {
    const o = await orden({ unidades: 100 });
    await expect(withOrg(A, (tx) => confirmarEnvasado(tx, admin, String(o.id)))).rejects.toThrow(/Falta stock de insumos: Corcho EN/);
    expect(await litros()).toBeCloseTo(86.5, 6);
    expect(await stock(BOT)).toBe(800);
  });

  it('anular revierte todo; con ventas o ajustes de sus botellas, no', async () => {
    const [o] = await withOrg(A, (tx) => tx.execute<{ id: string }>(sql`select id from orden_envasado where codigo = 'OE-2026-0001'`));
    await withOrg(A, (tx) => anularOrden(tx, admin, o!.id));
    expect(await litros()).toBeCloseTo(1000, 6);
    expect([await stock(BOT), await stock(COR), await stock(CAJA)]).toEqual([2000, 1250, 100]);
    const o2 = await orden({ unidades: 120 });
    await withOrg(A, (tx) => confirmarEnvasado(tx, admin, String(o2.id)));
    await withOrg(A, (tx) =>
      tx.execute(
        sql`insert into mov_producto (id, org_id, fecha, orden_envasado_id, formato_id, unidades, tipo) values (${randomUUID()}, ${A}, '2026-08-05', ${o2.id}, ${F}, -12, 'quiebre')`
      )
    );
    await expect(withOrg(A, (tx) => anularOrden(tx, admin, String(o2.id)))).rejects.toThrow(/ventas o ajustes/);
  });

  it('el lote pasa a "Envasado" cuando queda bajo 1 L', async () => {
    const quedan = await litros();
    const unidades = Math.floor(quedan / (0.75 * 1.015));
    const o = await orden({ unidades, cierreId: null, cajaId: null });
    await withOrg(A, (tx) => confirmarEnvasado(tx, admin, String(o.id)));
    expect(await litros()).toBeLessThan(1);
    const [l] = await withOrg(A, (tx) => tx.execute<{ estado: string }>(sql`select estado from lote where id = ${LT}`));
    expect(l!.estado).toBe('Envasado');
  });
});

describe('ventas', () => {
  const push = async (entity: string, data: Record<string, unknown>, id: string = randomUUID()) => {
    const m: Mutation = { mutationId: randomUUID(), entity, op: 'upsert', id, baseVersion: null, data, createdAt: new Date().toISOString() };
    const [r] = await sync.push(admin, [m]);
    expect(r, JSON.stringify(r)).toMatchObject({ status: 'ok' });
    return id;
  };
  let LV = '',
    EV = '',
    OE = '',
    CLI = '';
  const stockOrden = async () =>
    Number((await withOrg(A, (tx) => tx.execute<{ stock: string }>(sql`select stock from v_stock_producto where orden_envasado_id = ${OE}`)))[0]!.stock);
  const litrosLote = async () =>
    Number(
      (
        await withOrg(A, (tx) =>
          tx.execute<{ l: string }>(sql`select coalesce(sum(litros), 0) as l from mov_bodega where lote_id = ${LV} and deleted_at is null`)
        )
      )[0]!.l
    );
  const nueva = (extra: Record<string, unknown>) =>
    withOrg(A, (tx) => guardarVenta(tx, admin, { fecha: '2026-11-10', clienteId: CLI, documento: 'factura', ...extra } as never));

  beforeAll(async () => {
    const T = (await withOrg(A, listarTemporadas))[0]!.id;
    LV = await push('lote', { codigo: 'L-VE', temporadaId: T, variedad: 'Merlot', tipo: 'tinto', estado: 'En guarda', fechaVendimiaPlan: '2026-03-01' });
    EV = await push('estanque', { codigo: 'VE-1', capacidad: 5000, tipo: 'Guarda', estado: 'operativo' });
    await push('mov_bodega', { fecha: '2026-07-15', estanqueId: EV, loteId: LV, litros: 2000, tipo: 'entrada', origen: 'vino' });
    const F2 = String((await withOrg(A, (tx) => guardarFormato(tx, admin, { nombre: 'Botella venta', litros: 0.75, unidadesCaja: 12 }))).id);
    const BOT = String(
      (
        await withOrg(A, (tx) =>
          guardarInsumo(tx, admin, { nombre: 'Botella VE', categoria: 'envasado', tipo: 'Envase vidrio', unidad: 'un', precio: 400, stockInicial: 1000 })
        )
      ).id
    );
    const o = await withOrg(A, (tx) =>
      guardarOrden(tx, admin, { fecha: '2026-08-01', estanqueId: EV, loteId: LV, formatoId: F2, unidades: 600, mermaPct: 0, envaseId: BOT })
    );
    await withOrg(A, (tx) => confirmarEnvasado(tx, admin, String(o.id)));
    OE = String(o.id);
    CLI = randomUUID();
    await withOrg(A, (tx) =>
      upsert(
        tx,
        cliente,
        admin,
        { entity: 'cliente', module: 'clientes', label: 'clientes' },
        { id: CLI, nombre: 'Distribuidora Test', rut: '76.888.999-0', tipo: 'Empresa', plazo: 30 }
      )
    );
  });

  it('venta mixta (envasado + granel): descuenta ambos stocks, congela costos, código y folio', async () => {
    expect([await stockOrden(), await litrosLote()]).toEqual([600, 1550]);
    const v = await nueva({
      lineas: [
        { tipo: 'envasado', ordenEnvasadoId: OE, cantidad: 100, precio: 5000 },
        { tipo: 'granel', estanqueId: EV, loteId: LV, cantidad: 300, precio: 2000 }
      ]
    });
    expect(v.estado).toBe('borrador');
    const c = await withOrg(A, (tx) => confirmarVenta(tx, admin, String(v.id)));
    expect([c.codigo, c.dteTipo, c.dteFolio]).toEqual(['V-0001', 33, 1]);
    // neto 500.000 + 600.000; ILA solo envasado (20,5 % de 500.000); IVA 19 %.
    expect([c.neto, c.ila, c.iva]).toEqual([1_100_000, 102_500, 209_000]);
    expect([await stockOrden(), await litrosLote()]).toEqual([500, 1250]);
    const lin = await withOrg(A, (tx) =>
      tx.execute<{ tipo: string; costo_unitario: string; litros: string }>(
        sql`select tipo, costo_unitario, litros from venta_linea where venta_id = ${c.id} order by tipo`
      )
    );
    expect(lin.map((l) => [l.tipo, Number(l.litros)])).toEqual([
      ['envasado', 75],
      ['granel', 300]
    ]);
    await expect(
      withOrg(A, (tx) =>
        guardarVenta(tx, admin, {
          id: String(c.id),
          fecha: '2026-11-10',
          clienteId: CLI,
          lineas: [{ tipo: 'envasado', ordenEnvasadoId: OE, cantidad: 1, precio: 1 }]
        })
      )
    ).rejects.toThrow(/confirmada/);
    expect(await withOrg(A, (tx) => clienteTieneVentas(tx, CLI))).toBe(true);
  });

  it('sin stock no se confirma y no escribe nada; boleta con su propia secuencia', async () => {
    const v = await nueva({ lineas: [{ tipo: 'envasado', ordenEnvasadoId: OE, cantidad: 501, precio: 5000 }] });
    await expect(withOrg(A, (tx) => confirmarVenta(tx, admin, String(v.id)))).rejects.toThrow(/No hay stock suficiente/);
    expect(await stockOrden()).toBe(500);
    const b = await nueva({ documento: 'boleta', lineas: [{ tipo: 'envasado', ordenEnvasadoId: OE, cantidad: 2, precio: 8990 }] });
    const c = await withOrg(A, (tx) => confirmarVenta(tx, admin, String(b.id)));
    expect([c.codigo, c.dteTipo, c.dteFolio]).toEqual(['V-0002', 39, 1]);
    expect(Number(c.total)).toBeCloseTo(17_980, -1);
  });

  it('anular revierte stocks y asigna el folio de la nota de crédito a la factura', async () => {
    const [f] = await withOrg(A, (tx) => tx.execute<{ id: string }>(sql`select id from venta where codigo = 'V-0001'`));
    const a = await withOrg(A, (tx) => anularVenta(tx, admin, f!.id));
    expect([a.estado, a.ncFolio]).toEqual(['anulada', 1]);
    expect([await stockOrden(), await litrosLote()]).toEqual([598, 1550]);
  });

  it('cobros: parcial baja el saldo; no más que el saldo ni de otro cliente; anular bloqueado; mora', async () => {
    const v = await nueva({ vencimiento: '2026-11-15', lineas: [{ tipo: 'envasado', ordenEnvasadoId: OE, cantidad: 10, precio: 10_000 }] });
    const c = await withOrg(A, (tx) => confirmarVenta(tx, admin, String(v.id)));
    const total = Number(c.total);
    const saldo = async () =>
      Number((await withOrg(A, (tx) => tx.execute<{ saldo: string }>(sql`select saldo from v_por_cobrar where venta_id = ${c.id}`)))[0]!.saldo);
    const cob = await withOrg(A, (tx) =>
      registrarCobro(tx, admin, { fecha: '2026-11-20', clienteId: CLI, monto: 60_000, aplicaciones: [{ ventaId: String(c.id), monto: 50_000 }] })
    );
    expect(await saldo()).toBe(total - 50_000); // 10.000 quedan como anticipo
    await expect(
      withOrg(A, (tx) =>
        registrarCobro(tx, admin, { fecha: '2026-11-20', clienteId: CLI, monto: total, aplicaciones: [{ ventaId: String(c.id), monto: total }] })
      )
    ).rejects.toThrow(/su saldo es/);
    const OTRO = randomUUID();
    await withOrg(A, (tx) =>
      upsert(
        tx,
        cliente,
        admin,
        { entity: 'cliente', module: 'clientes', label: 'clientes' },
        { id: OTRO, nombre: 'Otro', rut: '66.666.666-6', tipo: 'Persona', plazo: 0 }
      )
    );
    await expect(
      withOrg(A, (tx) =>
        registrarCobro(tx, admin, { fecha: '2026-11-20', clienteId: OTRO, monto: 1000, aplicaciones: [{ ventaId: String(c.id), monto: 1000 }] })
      )
    ).rejects.toThrow(/otro cliente/);
    await expect(withOrg(A, (tx) => anularVenta(tx, admin, String(c.id)))).rejects.toThrow(/cobros aplicados/);
    const r = await calcularAlertas(A, [ventasEnMora], '2026-11-24');
    expect(r.errores).toEqual([]);
    const [m] = await withOrg(A, (tx) => tx.execute<{ titulo: string }>(sql`select titulo from alerta where regla = 'clientes.mora' and estado = 'abierta'`));
    expect(m!.titulo).toMatch(/ventas en mora/);
    await withOrg(A, (tx) => eliminarCobro(tx, admin, String(cob.id)));
    expect(await saldo()).toBe(total);
    await withOrg(A, (tx) => anularVenta(tx, admin, String(c.id)));
  });
});
