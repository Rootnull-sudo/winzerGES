/** Reacciones de cosecha. */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { jornal } from '../schema';
import type { Reaccion } from './index';

/**
 * Borrar una cosecha borra sus jornales (v1 lo hacía en afterRemove, pero el borrado masivo no lo llamaba y los
 * dejaba huérfanos). Idempotente: solo toca los que siguen vivos.
 * La reacción "lote Planificado → En vendimia" se agrega con los lotes (F2-1).
 */
export const jornalesDeCosechaBorrada: Reaccion = async (tx, actor, { op, registro }) => {
  if (op !== 'delete' && !registro.deletedAt) return;
  await tx
    .update(jornal)
    .set({ deletedAt: new Date(), version: sql`${jornal.version} + 1`, updatedAt: new Date(), updatedBy: actor.userId })
    .where(and(eq(jornal.cosechaId, String(registro.id)), isNull(jornal.deletedAt)));
};
