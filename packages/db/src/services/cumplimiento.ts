/**
 * Cumplimiento normativo (F6-4, online): registro de obligaciones, verificaciones automáticas (lotes sin análisis
 * autorizado SAG, D.O. sin respaldo, inscripción de productos) y libro de existencias.
 */
import { cumplimientoInput, esInscripcionProductos, libroExistencias, type CumplimientoInput } from '@winzer/domain';
import { isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../client';
import { softDelete, upsert, type Actor, type EntityMeta } from '../repo';
import { cumplimiento } from '../schema';

export const metaCumplimiento: EntityMeta = {
  entity: 'cumplimiento',
  module: 'cumplimiento',
  label: 'obligaciones normativas',
  display: (r) => String(r.nombre)
};

export async function guardarCumplimiento(tx: Tx, actor: Actor, input: CumplimientoInput, baseVersion?: number) {
  const c = cumplimientoInput.parse(input);
  return upsert(tx, cumplimiento, actor, metaCumplimiento, { ...c, id: c.id ?? randomUUID() }, { baseVersion, checkVersion: baseVersion != null });
}

export async function eliminarCumplimiento(tx: Tx, actor: Actor, id: string) {
  return softDelete(tx, cumplimiento, actor, metaCumplimiento, id);
}

/**
 * Verificaciones automáticas (v1: cumplimiento/index.js:33-44). Lotes de la temporada vigente con entradas y sin
 * análisis autorizado SAG; órdenes que declaran D.O. con menos de 75 % de uva de la zona o sin certificado.
 */
export async function controlesCumplimiento(tx: Tx, hoy: string) {
  const lotes = await tx.execute<{ codigo: string }>(sql`
    select l.codigo from lote l
    join temporada t on t.id = l.temporada_id
    where l.deleted_at is null and ${hoy} between t.inicio and t.fin
      and exists (select 1 from mov_bodega m where m.lote_id = l.id and m.tipo = 'entrada' and m.deleted_at is null and m.litros > 0)
      and not exists (select 1 from analisis a where a.lote_id = l.id and a.autorizado_sag and a.deleted_at is null)
    order by l.codigo`);
  const ordenes = await tx.execute<{ codigo: string | null }>(sql`
    select codigo from orden_envasado
    where deleted_at is null and estado <> 'anulada' and declara_do
      and (coalesce(pct_uva_zona, 0) < 75 or coalesce(certificado_do, '') = '')
    order by codigo`);
  const registros = await tx.select({ nombre: cumplimiento.nombre }).from(cumplimiento).where(isNull(cumplimiento.deletedAt));
  return {
    lotesSinAnalisis: lotes.map((l) => l.codigo),
    ordenesDoSinRespaldo: ordenes.map((o) => o.codigo ?? 'Borrador'),
    faltaInscripcion: !registros.some((r) => esInscripcionProductos(r.nombre))
  };
}

/** Libro de existencias desde los libros de bodega y de producto terminado. */
export async function existenciasDb(tx: Tx) {
  const granel = await tx.execute<{ estanque: string; lote: string; variedad: string | null; tipo: string | null; anada: number | null; litros: string }>(sql`
    select e.codigo as estanque, l.codigo as lote, l.variedad, l.tipo, t.anio as anada, s.litros
    from v_stock_estanque s join estanque e on e.id = s.estanque_id join lote l on l.id = s.lote_id
    left join temporada t on t.id = l.temporada_id
    order by e.codigo, l.codigo`);
  const producto = await tx.execute<{
    lote: string | null;
    variedad: string | null;
    tipo: string | null;
    anada: number | null;
    formato: string;
    litros_formato: string;
    stock: string;
  }>(sql`
    select l.codigo as lote, l.variedad, l.tipo, t.anio as anada, f.nombre as formato, f.litros as litros_formato, s.stock
    from v_stock_producto s join formato f on f.id = s.formato_id
    left join lote l on l.id = s.lote_id left join temporada t on t.id = l.temporada_id
    order by f.nombre, s.codigo`);
  return libroExistencias(
    granel.map((g) => ({ ...g, litros: Number(g.litros) })),
    producto.map((p) => ({ ...p, lote: p.lote ?? '—', litrosFormato: Number(p.litros_formato), stock: Number(p.stock) }))
  );
}
