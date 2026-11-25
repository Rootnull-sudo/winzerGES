/** Reacciones del control de bodega (F2-2). */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { ReglaError } from '../repo';
import { estanque, lote, movBodega } from '../schema';
import type { Reaccion } from './index';

const int = (v: number) => Math.round(v).toLocaleString('es-CL');

/**
 * Valida el estado del estanque DESPUÉS del movimiento (en la misma transacción; si falla, se revierte todo, y en
 * un trasiego se revierte el grupo completo):
 *  - si el movimiento sumó litros: el estanque no está en mantención (entradas) y no supera su capacidad;
 *  - si restó litros: el lote no queda con litros negativos en ese estanque.
 * Aplica también a ajustes y a borrados (v1 no validaba ninguno de los dos).
 */
export const validarMovimientoBodega: Reaccion = async (tx, _actor, { op, previo, registro, importando }) => {
  // Al importar v1 las salidas por envasado y venta a granel llegan después (las regeneran sus servicios): validar
  // la capacidad movimiento a movimiento rechazaría vendimias que en v1 eran válidas. La paridad se verifica al final.
  if (importando) return;
  const antes = previo && !previo.deletedAt ? Number(previo.litros) : 0;
  const despues = op === 'delete' || registro.deletedAt ? 0 : Number(registro.litros);
  const delta = despues - antes;
  if (delta === 0) return;
  const estanqueId = String(registro.estanqueId);
  const [e] = await tx
    .select({ codigo: estanque.codigo, capacidad: estanque.capacidad, estado: estanque.estado })
    .from(estanque)
    .where(eq(estanque.id, estanqueId));
  if (!e) throw new ReglaError('Selecciona un estanque válido.');
  const sumar = async (loteId?: string) => {
    const [r] = await tx
      .select({ l: sql<string>`coalesce(sum(${movBodega.litros}), 0)` })
      .from(movBodega)
      .where(and(eq(movBodega.estanqueId, estanqueId), isNull(movBodega.deletedAt), loteId ? eq(movBodega.loteId, loteId) : undefined));
    return Number(r?.l ?? 0);
  };
  if (delta > 0) {
    if (registro.tipo === 'entrada' && op === 'upsert' && e.estado === 'mantencion') throw new ReglaError(`El estanque ${e.codigo} está en mantención.`);
    const total = await sumar();
    if (total > Number(e.capacidad) + 0.01)
      throw new ReglaError(`Sobrecapacidad: ${e.codigo} tiene ${int(Number(e.capacidad) - (total - delta))} L libres y se intentan ingresar ${int(delta)} L.`);
  } else {
    const delLote = await sumar(String(registro.loteId));
    if (delLote < -0.01)
      throw new ReglaError(
        op === 'delete'
          ? `No se puede eliminar: el vino de ese movimiento ya salió de ${e.codigo}.`
          : `No hay suficiente vino en ${e.codigo}: disponibles ${int(delLote - delta)} L, solicitados ${int(-delta)} L.`
      );
  }
};

/**
 * Una entrada de uva o mosto pasa el lote a "En molienda" si estaba Planificado o En vendimia, y anota la fecha
 * real de molienda (v1: domain.js:73). La ficha de fermentación en borrador se crea con F2-3.
 */
export const loteEnMolienda: Reaccion = async (tx, actor, { op, registro }) => {
  if (op !== 'upsert' || registro.deletedAt || registro.tipo !== 'entrada' || registro.origen === 'vino') return;
  await tx
    .update(lote)
    .set({
      estado: 'En molienda',
      fechaMoliendaReal: sql`coalesce(${lote.fechaMoliendaReal}, ${String(registro.fecha)})`,
      version: sql`${lote.version} + 1`,
      updatedAt: new Date(),
      updatedBy: actor.userId
    })
    .where(and(eq(lote.id, String(registro.loteId)), inArray(lote.estado, ['Planificado', 'En vendimia'])));
};
