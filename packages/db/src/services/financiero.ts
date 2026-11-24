/**
 * Datos financieros de un período (F7): reúne desde la base lo que las funciones puras de
 * `@winzer/domain/financiero` necesitan. Solo lectura.
 */
import { amortizacionMarca, depreciacionEntre, type DatosFinancieros, type Periodo } from '@winzer/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../client';
import { activo, lote, marca, ordenEnvasado } from '../schema';
import { costoLitroLoteDb } from './envasado';

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
