/** Reacciones de cosecha. */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { jornal, lote } from '../schema';
import type { Reaccion } from './index';

/**
 * Borrar una cosecha borra sus jornales (v1 lo hacía en afterRemove, pero el borrado masivo no lo llamaba y los
 * dejaba huérfanos). Idempotente: solo toca los que siguen vivos.
 */
export const jornalesDeCosechaBorrada: Reaccion = async (tx, actor, { op, registro }) => {
  if (op !== 'delete' && !registro.deletedAt) return;
  await tx
    .update(jornal)
    .set({ deletedAt: new Date(), version: sql`${jornal.version} + 1`, updatedAt: new Date(), updatedBy: actor.userId })
    .where(and(eq(jornal.cosechaId, String(registro.id)), isNull(jornal.deletedAt)));
};

/**
 * Una cosecha con lote pasa el lote de "Planificado" a "En vendimia" y anota el inicio real de la vendimia
 * (v1: domain.js:90-93). A diferencia de v1, también ocurre si el lote se asigna después de crear la cosecha.
 */
export const loteEnVendimia: Reaccion = async (tx, actor, { op, registro }) => {
  if (op !== 'upsert' || registro.deletedAt || !registro.loteId) return;
  await tx
    .update(lote)
    .set({
      estado: 'En vendimia',
      inicioVendimiaReal: sql`coalesce(${lote.inicioVendimiaReal}, ${String(registro.fecha)})`,
      version: sql`${lote.version} + 1`,
      updatedAt: new Date(),
      updatedBy: actor.userId
    })
    .where(and(eq(lote.id, String(registro.loteId)), eq(lote.estado, 'Planificado')));
};
