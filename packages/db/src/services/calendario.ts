/** Calendario de vendimia: ventanas de referencia (F2-1). */
import { FUENTE_VENTANAS_BASE, VENTANAS_BASE } from '@winzer/domain';
import { isNull } from 'drizzle-orm';
import type { Tx } from '../client';
import { idDerivado } from '../ids';
import { ventana } from '../schema';

/**
 * Carga las 30 ventanas referenciales de v1 si la viña no tiene ninguna (v1: calendario.onInstall). Ids
 * deterministas: llamarla dos veces no duplica. Devuelve cuántas cargó.
 */
export async function cargarVentanasBase(tx: Tx, orgId: string, userId: string | null = null): Promise<number> {
  const [hay] = await tx.select({ id: ventana.id }).from(ventana).where(isNull(ventana.deletedAt)).limit(1);
  if (hay) return 0;
  await tx
    .insert(ventana)
    .values(
      VENTANAS_BASE.map(([variedad, valle, desde, hasta]) => ({
        id: idDerivado(orgId, `ventana:${variedad}:${valle}`, 'base'),
        orgId,
        variedad,
        valle,
        desde,
        hasta,
        fuente: FUENTE_VENTANAS_BASE,
        createdBy: userId,
        updatedBy: userId
      }))
    )
    .onConflictDoNothing();
  return VENTANAS_BASE.length;
}
