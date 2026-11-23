/** Tareas (F2-3): las crean reacciones y servicios; cada usuario ve las de su rol, las suyas y las de toda la viña. */
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { Tx } from '../client';
import type { Actor } from '../repo';
import { ReglaError } from '../repo';
import { tarea } from '../schema';

const visible = (actor: Actor) => or(eq(tarea.rol, actor.role), eq(tarea.userId, actor.userId), and(isNull(tarea.rol), isNull(tarea.userId)));

export interface TareaVisible {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  ruta: string | null;
}

/** Tareas pendientes del usuario, de la más antigua a la más reciente. */
export async function tareasPara(tx: Tx, actor: Actor): Promise<TareaVisible[]> {
  return tx
    .select({ id: tarea.id, titulo: tarea.titulo, descripcion: tarea.descripcion, fecha: tarea.fecha, ruta: tarea.ruta })
    .from(tarea)
    .where(and(eq(tarea.estado, 'pendiente'), isNull(tarea.deletedAt), visible(actor)))
    .orderBy(tarea.fecha, desc(tarea.createdAt));
}

/** Marca una tarea como hecha (o la reabre). Solo si es del usuario, de su rol o de toda la viña. */
export async function marcarTarea(tx: Tx, actor: Actor, id: string, hecha: boolean) {
  const [r] = await tx
    .update(tarea)
    .set({
      estado: hecha ? 'hecha' : 'pendiente',
      hechaEn: hecha ? new Date() : null,
      hechaPor: hecha ? actor.userId : null,
      version: sql`${tarea.version} + 1`,
      updatedAt: new Date(),
      updatedBy: actor.userId
    })
    .where(and(eq(tarea.id, id), isNull(tarea.deletedAt), visible(actor)))
    .returning({ id: tarea.id });
  if (!r) throw new ReglaError('La tarea no existe o no es tuya.');
}
