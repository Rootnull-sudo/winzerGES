/** Reacciones de insumos (ADR 0010). */
import { cantidadAditivo } from '@winzer/domain';
import { eq, sql } from 'drizzle-orm';
import { idDerivado } from '../ids';
import { ReglaError } from '../repo';
import { insumo, movInsumo } from '../schema';
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

/**
 * Un aditivo descuenta su producto en la unidad real del insumo (v1 trataba todo lo que no era "g" como kg). La
 * cantidad se recalcula aquí con la dosis y el volumen; si el insumo no se dosifica por volumen, se rechaza.
 */
export const consumoDeAditivo: Reaccion = async (tx, actor, { op, registro }) => {
  const id = idDerivado(actor.orgId, `aditivo:${registro.id}`, 'reaccion');
  if (op === 'delete' || registro.deletedAt) {
    await tx
      .update(movInsumo)
      .set({ deletedAt: new Date(), version: sql`${movInsumo.version} + 1`, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(movInsumo.id, id));
    return;
  }
  const [ins] = await tx
    .select({ unidad: insumo.unidad })
    .from(insumo)
    .where(eq(insumo.id, String(registro.insumoId)));
  const cantidad = cantidadAditivo(registro.dosis, registro.volumen, ins?.unidad);
  if (cantidad == null) throw new ReglaError(`El producto debe estar en kg, g, L o mL para dosificarlo (está en ${ins?.unidad ?? '—'}).`);
  const fila = {
    fecha: String(registro.fecha),
    insumoId: String(registro.insumoId),
    cantidad: -cantidad,
    tipo: 'aditivo',
    origenTipo: 'aditivo',
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
