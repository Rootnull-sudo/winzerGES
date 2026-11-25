/**
 * Datos financieros de un período (F7): reúne desde la base lo que las funciones puras de
 * `@winzer/domain/financiero` necesitan. Solo lectura.
 */
import { amortizacionMarca, costoCosecha, depreciacionEntre, type DatosFinancieros, type MovCaja, type Periodo } from '@winzer/domain';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../client';
import { activo, cosecha, jornal, lote, marca, ordenEnvasado } from '../schema';
import { costoLitroLoteDb } from './envasado';
import { f29Periodos } from './tributario';

/** Ventas confirmadas (por línea), gastos, remuneraciones, honorarios, depreciación y amortización del período. */
export async function datosPeriodo(tx: Tx, p: Periodo): Promise<DatosFinancieros> {
  const lineas = await tx.execute<{
    venta_id: string;
    fecha: string;
    tipo: string;
    canal: string | null;
    formato_id: string | null;
    cantidad: string;
    litros: string | null;
    neto: string;
    costo_unitario: string | null;
  }>(sql`
    select v.id as venta_id, v.fecha, l.tipo, v.canal, l.formato_id, l.cantidad, l.litros, l.neto, l.costo_unitario
    from venta_linea l join venta v on v.id = l.venta_id
    where l.deleted_at is null and v.deleted_at is null and v.estado = 'confirmada' and v.fecha between ${p.desde} and ${p.hasta}`);
  const gastos = await tx.execute<{ fecha: string; categoria: string; area: string; monto: string; tipo_costo: string; no_deducible: boolean }>(sql`
    select fecha, categoria, area, monto, tipo_costo, no_deducible from gasto
    where deleted_at is null and fecha between ${p.desde} and ${p.hasta}`);
  // v1 ubica la remuneración del período a mitad de mes (periodo-15). El área viene de la foto del trabajador.
  const rem = await tx.execute<{ area: string | null; costo_empresa: string }>(sql`
    select coalesce(r.trabajador_foto->>'area', t.area) as area, r.costo_empresa
    from remuneracion r left join trabajador t on t.id = r.trabajador_id
    where r.deleted_at is null and (r.periodo || '-15') between ${p.desde} and ${p.hasta}`);
  const hon = await tx.execute<{ bruto: string }>(sql`
    select bruto from honorario where deleted_at is null and fecha between ${p.desde} and ${p.hasta}`);
  const activos = await tx.select().from(activo).where(isNull(activo.deletedAt));
  const marcas = await tx.select().from(marca).where(isNull(marca.deletedAt));
  return {
    lineas: lineas.map((l) => ({
      fecha: l.fecha,
      tipo: l.tipo === 'granel' ? 'granel' : 'envasado',
      canal: l.canal,
      formatoId: l.formato_id,
      cantidad: Number(l.cantidad),
      litros: Number(l.litros ?? 0),
      neto: Number(l.neto),
      costoUnitario: Number(l.costo_unitario ?? 0)
    })),
    ventasN: new Set(lineas.map((l) => l.venta_id)).size,
    gastos: gastos.map((g) => ({
      fecha: g.fecha,
      categoria: g.categoria,
      area: g.area,
      monto: Number(g.monto),
      tipoCosto: g.tipo_costo,
      noDeducible: g.no_deducible
    })),
    remuneraciones: rem.map((r) => ({ area: r.area ?? 'produccion', costoEmpresa: Number(r.costo_empresa) })),
    honorarios: hon.map((h) => ({ bruto: Number(h.bruto) })),
    depreciacion: activos.reduce((s, a) => s + depreciacionEntre(a, p.desde, p.hasta), 0),
    amortizacion: marcas
      .filter((m) => m.fechaRegistro && m.vencimiento)
      .reduce((s, m) => s + amortizacionMarca({ costo: m.costo, fechaRegistro: m.fechaRegistro!, vencimiento: m.vencimiento! }, p.desde, p.hasta), 0)
  };
}

/** Órdenes de envasado confirmadas con sus partes de costo congeladas (costo por formato). */
export async function ordenesConCosto(tx: Tx) {
  const os = await tx
    .select({ formatoId: ordenEnvasado.formatoId, unidades: ordenEnvasado.unidades, costoPartes: ordenEnvasado.costoPartes })
    .from(ordenEnvasado)
    .where(and(eq(ordenEnvasado.estado, 'confirmada'), isNull(ordenEnvasado.deletedAt)));
  return os.map((o) => ({ formatoId: o.formatoId, unidades: o.unidades, costoPartes: (o.costoPartes as Record<string, number> | null) ?? null }));
}

/** Costo directo de cada lote con litros (cosecha, agrícola prorrateado, enológico y uva comprada). */
export async function costosPorLote(tx: Tx) {
  const lotes = await tx
    .select({ id: lote.id, codigo: lote.codigo, tipo: lote.tipo, variedad: lote.variedad, temporadaId: lote.temporadaId })
    .from(lote)
    .where(isNull(lote.deletedAt));
  const out = [];
  for (const l of lotes) {
    const c = await costoLitroLoteDb(tx, l.id);
    if (c.litros > 0) out.push({ ...l, ...c });
  }
  return out;
}

/** Inventario valorizado para la rotación: producto terminado + granel × costo por litro + insumos (v1: ratios). */
export async function inventarioValorizado(tx: Tx): Promise<number> {
  const [pt] = await tx.execute<{ v: string }>(sql`select coalesce(sum(valor), 0) as v from v_stock_producto`);
  const [ins] = await tx.execute<{ v: string }>(sql`select coalesce(sum(valor), 0) as v from v_stock_insumo`);
  const granel = await tx.execute<{ lote_id: string; litros: string }>(sql`select lote_id, sum(litros) as litros from v_stock_estanque group by lote_id`);
  let vGranel = 0;
  for (const g of granel) vGranel += Number(g.litros) * (await costoLitroLoteDb(tx, g.lote_id)).costoLitro;
  return Number(pt?.v ?? 0) + Number(ins?.v ?? 0) + vGranel;
}

/**
 * Movimientos de caja del año (flujo corregido): cobros y pagos reales (también parciales) y saldos por cobrar y por
 * pagar a su vencimiento; sueldos y honorarios por su líquido; gastos al contado por su total; F29 del mes anterior
 * en su día de vencimiento y otros pagos de impuesto (patente, contribuciones, renta) en su fecha.
 */
export async function movimientosCaja(tx: Tx, anio: number, diaF29: number): Promise<MovCaja[]> {
  const y = String(anio);
  const q = <T extends Record<string, unknown>>(s: ReturnType<typeof sql>) => tx.execute<T>(s);
  const out: MovCaja[] = [];
  const add = (rows: { fecha: string; monto: string }[], concepto: MovCaja['concepto']) => {
    for (const r of rows) if (r.fecha?.startsWith(y) && Number(r.monto) > 0) out.push({ fecha: r.fecha, concepto, monto: Number(r.monto) });
  };
  add(await q(sql`select fecha, monto from cobro where deleted_at is null`), 'cobros');
  add(await q(sql`select coalesce(vencimiento, fecha) as fecha, saldo as monto from v_por_cobrar where saldo > 0`), 'cobros');
  add(await q(sql`select fecha, monto from pago where deleted_at is null`), 'pagosProv');
  add(await q(sql`select coalesce(vencimiento, fecha) as fecha, saldo as monto from v_por_pagar where saldo > 0`), 'pagosProv');
  add(await q(sql`select coalesce(fecha_pago, periodo || '-28') as fecha, liquido as monto from remuneracion where deleted_at is null`), 'sueldos');
  add(await q(sql`select coalesce(fecha_pago, fecha) as fecha, liquido as monto from honorario where deleted_at is null`), 'sueldos');
  add(await q(sql`select fecha, total as monto from gasto where deleted_at is null and estado = 'pagado'`), 'gastos');
  add(await q(sql`select fecha, monto from pago_impuesto where deleted_at is null and tipo not in ('F29', 'PPM')`), 'impuestos');
  // F29 de diciembre del año anterior a noviembre: se paga el mes siguiente, el día de vencimiento.
  for (const f of await f29Periodos(tx, `${anio - 1}-12`, `${y}-11`)) {
    const [py, pm] = f.periodo.split('-').map(Number) as [number, number];
    const mes = pm === 12 ? `${py + 1}-01` : `${py}-${String(pm + 1).padStart(2, '0')}`;
    if (f.calculo.total > 0) out.push({ fecha: `${mes}-${String(diaF29).padStart(2, '0')}`, concepto: 'impuestos', monto: f.calculo.total });
  }
  return out;
}

/** Cuentas por cobrar y por pagar (saldo real). */
export async function saldosCxcCxp(tx: Tx) {
  const [c] = await tx.execute<{ v: string }>(sql`select coalesce(sum(saldo), 0) as v from v_por_cobrar where saldo > 0`);
  const [p] = await tx.execute<{ v: string }>(sql`select coalesce(sum(saldo), 0) as v from v_por_pagar where saldo > 0`);
  return { cxc: Number(c?.v ?? 0), cxp: Number(p?.v ?? 0) };
}

/** Participación del envase en el costo congelado de la última orden confirmada de cada formato (sensibilidad). */
export async function participacionEnvase(tx: Tx): Promise<Record<string, number>> {
  const os = await tx
    .select({ formatoId: ordenEnvasado.formatoId, costoPartes: ordenEnvasado.costoPartes })
    .from(ordenEnvasado)
    .where(and(eq(ordenEnvasado.estado, 'confirmada'), isNull(ordenEnvasado.deletedAt)))
    .orderBy(ordenEnvasado.fecha, ordenEnvasado.createdAt);
  const out: Record<string, number> = {};
  for (const o of os) {
    const p = (o.costoPartes as Record<string, number> | null) ?? {};
    const unit = Object.values(p).reduce((s, v) => s + (Number(v) || 0), 0);
    out[o.formatoId] = unit ? (Number(p.envase) || 0) / unit : 0.3;
  }
  return out;
}

/** Datos para la rentabilidad por cuartel de una temporada (costo de campo e ingresos atribuidos por lote). */
export async function datosRentabilidad(tx: Tx, temporadaId: string) {
  const cuarteles = await tx.execute<{ id: string; nombre: string; superficie: string | null }>(sql`
    select id, codigo || coalesce(' ' || variedad, '') as nombre, superficie from cuartel where deleted_at is null order by codigo`);
  const cos = await tx
    .select()
    .from(cosecha)
    .where(and(eq(cosecha.temporadaId, temporadaId), isNull(cosecha.deletedAt)));
  const jor = cos.length
    ? await tx
        .select()
        .from(jornal)
        .where(
          and(
            inArray(
              jornal.cosechaId,
              cos.map((c) => c.id)
            ),
            isNull(jornal.deletedAt)
          )
        )
    : [];
  const campo = await tx.execute<{ cuartel_id: string; costo: string }>(sql`
    select cuartel_id, sum(costo) as costo from (
      select cuartel_id, coalesce(costo, 0) as costo from aplicacion where deleted_at is null and temporada_id = ${temporadaId}
      union all
      select cuartel_id, coalesce(costo, 0) from labor where deleted_at is null and temporada_id = ${temporadaId}
    ) x where cuartel_id is not null group by cuartel_id`);
  const ing = await tx.execute<{ lote_id: string; neto: string }>(sql`
    select coalesce(l.lote_id, o.lote_id) as lote_id, sum(l.neto) as neto
    from venta_linea l join venta v on v.id = l.venta_id left join orden_envasado o on o.id = l.orden_envasado_id
    where l.deleted_at is null and v.deleted_at is null and v.estado = 'confirmada' and coalesce(l.lote_id, o.lote_id) is not null
    group by 1`);
  const kg = await tx.execute<{ lote_id: string; kg: string }>(sql`
    select lote_id, sum(kg) as kg from cosecha where deleted_at is null and lote_id is not null group by lote_id`);
  return {
    cuarteles: cuarteles.map((c) => ({ id: c.id, nombre: c.nombre, superficie: Number(c.superficie ?? 0) })),
    cosechas: cos.map((c) => ({ cuartelId: c.cuartelId, loteId: c.loteId, kg: Number(c.kg ?? 0), costo: costoCosecha(c, jor).total })),
    costosCampo: Object.fromEntries(campo.map((c) => [c.cuartel_id, Number(c.costo)])),
    ingresosLote: Object.fromEntries(ing.map((r) => [r.lote_id, Number(r.neto)])),
    kgLote: Object.fromEntries(kg.map((r) => [r.lote_id, Number(r.kg)]))
  };
}
