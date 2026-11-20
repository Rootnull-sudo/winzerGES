/** Reacciones de insumos (ADR 0010). */
import { eq, sql } from 'drizzle-orm';
import { idDerivado } from '../ids';
import { movInsumo } from '../schema';
import type { Reaccion } from './index';

/**
 * Una aplicación descuenta su insumo: un movimiento `aplicacion` con id derivado de la aplicación (un reintento
 * o una edición reescriben el mismo movimiento, nunca lo duplican). Al borrarla, el movimiento se borra.
 * Corrige v1, donde el borrado masivo dejaba consumos huérfanos y el seed duplicaba consumos al editar.
 */
export const consumoDeAplicacion: Reaccion = async (tx, actor, { op, registro }) => {
  const id = idDerivado(actor.orgId, `aplicacion:${registro.id}`, 'reaccion');
  const borrar = op === 'delete' || !!registro.deletedAt || !(Number(registro.cantidad) > 0);
  if (borrar) {
    await tx
      .update(movInsumo)
      .set({ deletedAt: new Date(), version: sql`${movInsumo.version} + 1`, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(movInsumo.id, id));
    return;
  }
  const fila = {
    fecha: String(registro.fecha),
    insumoId: String(registro.insumoId),
    cantidad: -Number(registro.cantidad),
    tipo: 'aplicacion',
    origenTipo: 'aplicacion',
    origenId: String(registro.id),
    motivo: null,
    deletedAt: null,
    updatedAt: new Date(),
    updatedBy: actor.userId
  };
  await tx
    .insert(movInsumo)
    .values({ ...fila, id, orgId: actor.orgId, createdBy: actor.userId })
    .onConflictDoUpdate({ target: movInsumo.id, set: { ...fila, version: sql`${movInsumo.version} + 1` } });
};
