/**
 * Órdenes de envasado (F5-2, online). `confirmarEnvasado` escribe en UNA transacción (withOrg):
 *   bodega (−L del lote en el estanque) + insumos (consumo de cada material) + producto terminado (+unidades)
 *   + costo congelado + lote a "Envasado" si quedó vacío.
 * v1 lo hacía en un listener sin atomicidad y sin validar insumos. Los movimientos usan ids derivados de la orden:
 * reintentar no duplica y anular los borra todos.
 */
import {
  cajasNecesarias,
  costoEnvasado,
  costoLitroLote,
  LITROS_LOTE_ENVASADO,
  ordenEnvasadoInput,
  validarDO,
  type OrdenEnvasadoInput,
  type PartesCosto
} from '@winzer/domain';
import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../client';
import { idDerivado } from '../ids';
import { ReglaError, softDelete, upsert, type Actor, type EntityMeta } from '../repo';
import {
  adicionSO2,
  aditivo,
  aplicacion,
  cosecha,
  etiqueta,
  fermentacion,
  formato,
  insumo,
  jornal,
  labor,
  lote,
  movBodega,
  movInsumo,
  movProducto,
  ordenEnvasado
} from '../schema';
import { siguienteCodigo } from './secuencias';

export const metaOrden: EntityMeta = {
  entity: 'orden_envasado',
  module: 'envasado',
  label: 'órdenes de envasado',
  sensitive: true,
  display: (r) => String(r.codigo ?? 'Orden en borrador')
};
const L = (x: number) => Math.round(x * 100) / 100;
const vivo = <T extends { deletedAt: unknown }>(t: T) => isNull(t.deletedAt as never);

/** Costo por litro de un lote armado desde Postgres (mismas fórmulas que v1, en `costoLitroLote`). */
export async function costoLitroLoteDb(tx: Tx, loteId: string) {
  const [l] = await tx.select().from(lote).where(eq(lote.id, loteId));
  if (!l) return { total: 0, litros: 0, costoLitro: 0, partes: { cosecha: 0, agricola: 0, enologico: 0, comprada: 0 } };
  const temp = l.temporadaId;
  const cosechas = await tx
    .select()
    .from(cosecha)
    .where(and(vivo(cosecha), or(eq(cosecha.loteId, loteId), temp ? eq(cosecha.temporadaId, temp) : sql`false`)));
  const ids = cosechas.map((c) => c.id);
  const fichas = await tx
    .select({ id: fermentacion.id, loteId: fermentacion.loteId })
    .from(fermentacion)
    .where(and(eq(fermentacion.loteId, loteId), vivo(fermentacion)));
  const [jornales, apls, labs, adits, adics, movs] = await Promise.all([
    ids.length
      ? tx
          .select()
          .from(jornal)
          .where(and(inArray(jornal.cosechaId, ids), vivo(jornal)))
      : [],
    temp
      ? tx
          .select()
          .from(aplicacion)
          .where(and(eq(aplicacion.temporadaId, temp), vivo(aplicacion)))
      : [],
    temp
      ? tx
          .select()
          .from(labor)
          .where(and(eq(labor.temporadaId, temp), vivo(labor)))
      : [],
    tx
      .select()
      .from(aditivo)
      .where(and(eq(aditivo.loteId, loteId), vivo(aditivo))),
    fichas.length
      ? tx
          .select()
          .from(adicionSO2)
          .where(
            and(
              inArray(
                adicionSO2.fermentacionId,
                fichas.map((f) => f.id)
              ),
              vivo(adicionSO2)
            )
          )
      : [],
    tx
      .select()
      .from(movBodega)
      .where(and(eq(movBodega.loteId, loteId), vivo(movBodega)))
  ]);
  return costoLitroLote(l, {
    cosechas,
    jornales,
    aplicaciones: apls,
    labores: labs,
    aditivos: adits,
    fichas,
    adicionesSO2: adics,
    movsBodega: movs.map((m) => ({ ...m, litros: Number(m.litros) }))
  });
}

/** Botellas producidas con una etiqueta en órdenes confirmadas (base del prorrateo del diseño). */
async function producidasConEtiqueta(tx: Tx, etiquetaId: string, excluir?: string) {
  const [r] = await tx
    .select({ n: sql<string>`coalesce(sum(${ordenEnvasado.unidades}), 0)` })
    .from(ordenEnvasado)
    .where(
      and(
        eq(ordenEnvasado.etiquetaId, etiquetaId),
        eq(ordenEnvasado.estado, 'confirmada'),
        vivo(ordenEnvasado),
        excluir ? ne(ordenEnvasado.id, excluir) : sql`true`
      )
    );
  return Number(r?.n ?? 0);
}

type OrdenRow = typeof ordenEnvasado.$inferSelect;

/** Costo estimado de una orden (en vivo antes de confirmar; congelado al confirmar). */
export async function calcularCostoOrden(tx: Tx, o: Pick<OrdenRow, 'id' | 'loteId' | 'formatoId' | 'etiquetaId'> & Parameters<typeof costoEnvasado>[0]) {
  const [f] = await tx.select().from(formato).where(eq(formato.id, o.formatoId));
  const [et] = o.etiquetaId ? await tx.select().from(etiqueta).where(eq(etiqueta.id, o.etiquetaId)) : [];
  const ids = [o.envaseId, o.cierreId, o.capsulaId, o.cajaId, o.etiquetaInsumoId].filter((x): x is string => !!x);
  const precios = new Map(
    (ids.length ? await tx.select({ id: insumo.id, precio: insumo.precio }).from(insumo).where(inArray(insumo.id, ids)) : []).map((i) => [
      i.id,
      Number(i.precio)
    ])
  );
  const cl = await costoLitroLoteDb(tx, o.loteId);
  const prod = et ? (await producidasConEtiqueta(tx, et.id, o.id)) + Number(o.unidades) : 0;
  return {
    formato: f ?? null,
    ...costoEnvasado(o, {
      formato: f ? { litros: Number(f.litros), unidadesCaja: f.unidadesCaja } : null,
      costoLitro: cl.costoLitro,
      precioInsumo: (id) => (id ? (precios.get(id) ?? 0) : 0),
      etiqueta: et ? { ...et, costoImpresion: Number(et.costoImpresion) } : null,
      producidasEtiqueta: prod
    })
  };
}

export async function guardarOrden(tx: Tx, actor: Actor, input: OrdenEnvasadoInput, baseVersion?: number) {
  const data = ordenEnvasadoInput.parse(input);
  const id = data.id ?? randomUUID();
  const [previa] = await tx.select({ estado: ordenEnvasado.estado }).from(ordenEnvasado).where(eq(ordenEnvasado.id, id));
  if (previa && previa.estado !== 'borrador') throw new ReglaError('La orden ya está confirmada o anulada: no se puede editar.');
  return upsert(tx, ordenEnvasado, actor, metaOrden, { ...data, id, estado: 'borrador' }, { baseVersion, checkVersion: baseVersion != null });
}

export async function eliminarOrden(tx: Tx, actor: Actor, id: string) {
  const [o] = await tx.select({ estado: ordenEnvasado.estado }).from(ordenEnvasado).where(eq(ordenEnvasado.id, id));
  if (o && o.estado !== 'borrador') throw new ReglaError('Solo se eliminan órdenes en borrador; una confirmada se anula.');
  return softDelete(tx, ordenEnvasado, actor, metaOrden, id);
}

const MATERIALES = [
  ['envaseId', 'Envase'],
  ['cierreId', 'Cierre'],
  ['capsulaId', 'Cápsula'],
  ['etiquetaInsumoId', 'Etiqueta'],
  ['cajaId', 'Caja']
] as const;

export interface FotoCosto {
  codigo?: string | null;
  costoUnitario: number;
  costoTotal: number;
  litrosConsumidos: number;
  costoPartes: Partial<PartesCosto>;
}

/**
 * Confirma una orden en borrador. `importando`: usa la foto de costo de v1 y no revalida stock (el respaldo ya
 * reflejaba lo ocurrido).
 */
export async function confirmarEnvasado(tx: Tx, actor: Actor, id: string, importando?: FotoCosto) {
  const [o] = await tx.select().from(ordenEnvasado).where(eq(ordenEnvasado.id, id)).for('update');
  if (!o || o.deletedAt) throw new ReglaError('La orden no existe.');
  if (o.estado !== 'borrador') throw new ReglaError('La orden ya está confirmada o anulada.');
  const errDO = validarDO(o);
  if (errDO && !importando) throw new ReglaError(errDO);

  const c = await calcularCostoOrden(tx, { ...o, unidades: o.unidades, mermaPct: Number(o.mermaPct), manoObra: o.manoObra, energiaAgua: o.energiaAgua });
  if (!c.formato) throw new ReglaError('El formato de la orden no existe.');
  const foto: FotoCosto = importando ?? {
    costoUnitario: c.unitario,
    costoTotal: Math.round(c.total),
    litrosConsumidos: L(c.litrosConsumidos),
    costoPartes: c.partes
  };
  const litros = L(foto.litrosConsumidos);

  // Materiales que se consumen (la caja, en cajas enteras).
  const consumos = MATERIALES.filter(([k]) => o[k]).map(([k, nombre]) => ({
    campo: k,
    nombre,
    insumoId: o[k]!,
    cantidad: k === 'cajaId' ? cajasNecesarias(o.unidades, c.formato!.unidadesCaja) : o.unidades
  }));
  if (!importando) {
    const [b] = await tx.execute<{ litros: string }>(
      sql`select coalesce(sum(litros), 0) as litros from mov_bodega where estanque_id = ${o.estanqueId} and lote_id = ${o.loteId} and deleted_at is null`
    );
    const disponibles = Number(b?.litros ?? 0);
    if (litros > disponibles + 0.01)
      throw new ReglaError(
        `No hay vino suficiente en el estanque: se necesitan ${litros.toLocaleString('es-CL')} L y hay ${disponibles.toLocaleString('es-CL')} L del lote.`
      );
    if (consumos.length) {
      const stocks = new Map(
        (
          await tx.execute<{ insumo_id: string; nombre: string; unidad: string; stock: string }>(
            sql`select insumo_id, nombre, unidad, stock from v_stock_insumo where insumo_id in ${consumos.map((x) => x.insumoId)}`
          )
        ).map((s) => [s.insumo_id, s])
      );
      const faltan = consumos.filter((x) => Number(stocks.get(x.insumoId)?.stock ?? 0) < x.cantidad);
      if (faltan.length)
        throw new ReglaError(
          `Falta stock de insumos: ${faltan
            .map((x) => {
              const s = stocks.get(x.insumoId);
              return `${s?.nombre ?? x.nombre} (se necesitan ${x.cantidad.toLocaleString('es-CL')}, hay ${Number(s?.stock ?? 0).toLocaleString('es-CL')} ${s?.unidad ?? ''})`;
            })
            .join('; ')}.`
        );
    }
  }

  const anio = o.fecha.slice(0, 4);
  const codigo = o.codigo ?? importando?.codigo ?? (await siguienteCodigo(tx, `orden_envasado:${anio}`, `OE-${anio}-`));
  const sello = { deletedAt: null, updatedAt: new Date(), updatedBy: actor.userId };
  const motivo = `Envasado ${codigo}`;
  const filaBodega = {
    fecha: o.fecha,
    estanqueId: o.estanqueId,
    loteId: o.loteId,
    litros: -litros,
    tipo: 'envasado',
    motivo,
    origenTipo: 'orden_envasado',
    origenId: o.id,
    ...sello
  };
  await tx
    .insert(movBodega)
    .values({ ...filaBodega, id: idDerivado(actor.orgId, `envasado:${o.id}`, 'servicio'), orgId: actor.orgId, createdBy: actor.userId })
    .onConflictDoUpdate({ target: movBodega.id, set: { ...filaBodega, version: sql`${movBodega.version} + 1` } });
  for (const x of consumos) {
    const fila = {
      fecha: o.fecha,
      insumoId: x.insumoId,
      cantidad: -x.cantidad,
      tipo: 'consumo_envasado',
      motivo,
      origenTipo: 'orden_envasado',
      origenId: o.id,
      ...sello
    };
    await tx
      .insert(movInsumo)
      .values({ ...fila, id: idDerivado(actor.orgId, `envasado:${o.id}:${x.campo}`, 'servicio'), orgId: actor.orgId, createdBy: actor.userId })
      .onConflictDoUpdate({ target: movInsumo.id, set: { ...fila, version: sql`${movInsumo.version} + 1` } });
  }
  const filaProd = {
    fecha: o.fecha,
    ordenEnvasadoId: o.id,
    formatoId: o.formatoId,
    loteId: o.loteId,
    unidades: o.unidades,
    tipo: 'envasado',
    costoUnitario: foto.costoUnitario,
    motivo,
    ...sello
  };
  await tx
    .insert(movProducto)
    .values({ ...filaProd, id: idDerivado(actor.orgId, `envasado:${o.id}`, 'servicio'), orgId: actor.orgId, createdBy: actor.userId })
    .onConflictDoUpdate({ target: movProducto.id, set: { ...filaProd, version: sql`${movProducto.version} + 1` } });

  const rec = await upsert(tx, ordenEnvasado, actor, metaOrden, {
    id: o.id,
    codigo,
    estado: 'confirmada',
    costoUnitario: foto.costoUnitario,
    costoTotal: Math.round(foto.costoTotal),
    litrosConsumidos: litros,
    costoPartes: foto.costoPartes,
    confirmadaEn: new Date()
  });
  // Lote vacío → "Envasado" (v1: < 1 L).
  const [r] = await tx.execute<{ litros: string }>(
    sql`select coalesce(sum(litros), 0) as litros from mov_bodega where lote_id = ${o.loteId} and deleted_at is null`
  );
  if (Number(r?.litros ?? 0) < LITROS_LOTE_ENVASADO)
    await tx
      .update(lote)
      .set({ estado: 'Envasado', version: sql`${lote.version} + 1`, updatedAt: new Date(), updatedBy: actor.userId })
      .where(and(eq(lote.id, o.loteId), sql`${lote.estado} not in ('Envasado', 'Finalizado')`));
  return rec;
}

/**
 * Anula una orden confirmada: borra sus movimientos de bodega, insumos y producto. Bloqueado si ya se vendieron o
 * ajustaron sus botellas (el stock debe ser lo producido).
 */
export async function anularOrden(tx: Tx, actor: Actor, id: string) {
  const [o] = await tx.select().from(ordenEnvasado).where(eq(ordenEnvasado.id, id)).for('update');
  if (!o || o.deletedAt) throw new ReglaError('La orden no existe.');
  if (o.estado !== 'confirmada') throw new ReglaError('Solo se anulan órdenes confirmadas.');
  const [otros] = await tx
    .select({ id: movProducto.id })
    .from(movProducto)
    .where(and(eq(movProducto.ordenEnvasadoId, id), ne(movProducto.tipo, 'envasado'), vivo(movProducto)))
    .limit(1);
  if (otros) throw new ReglaError('No se puede anular: ya hay ventas o ajustes de estas botellas.');
  const marca = { deletedAt: new Date(), updatedAt: new Date(), updatedBy: actor.userId };
  await tx
    .update(movBodega)
    .set({ ...marca, version: sql`${movBodega.version} + 1` })
    .where(and(eq(movBodega.origenTipo, 'orden_envasado'), eq(movBodega.origenId, id), vivo(movBodega)));
  await tx
    .update(movInsumo)
    .set({ ...marca, version: sql`${movInsumo.version} + 1` })
    .where(and(eq(movInsumo.origenTipo, 'orden_envasado'), eq(movInsumo.origenId, id), vivo(movInsumo)));
  await tx
    .update(movProducto)
    .set({ ...marca, version: sql`${movProducto.version} + 1` })
    .where(and(eq(movProducto.ordenEnvasadoId, id), vivo(movProducto)));
  // v1 dejaba el lote en "Envasado" aunque se deshiciera: vuelve a "En guarda" si recuperó vino.
  await tx
    .update(lote)
    .set({ estado: 'En guarda', version: sql`${lote.version} + 1`, updatedAt: new Date(), updatedBy: actor.userId })
    .where(and(eq(lote.id, o.loteId), eq(lote.estado, 'Envasado')));
  return upsert(tx, ordenEnvasado, actor, metaOrden, { id, estado: 'anulada' });
}

/** ¿Lo usa alguna orden de envasado vigente? (formato o etiqueta). */
export async function usadoPorOrdenes(tx: Tx, campo: 'formatoId' | 'etiquetaId', id: string) {
  const [x] = await tx
    .select({ id: ordenEnvasado.id })
    .from(ordenEnvasado)
    .where(and(eq(ordenEnvasado[campo], id), vivo(ordenEnvasado)))
    .limit(1);
  return !!x;
}
