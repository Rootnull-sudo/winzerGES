/** Reacciones del catastro. */
import { and, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { variedad } from '../schema';
import type { Reaccion } from './index';

/**
 * Un cuartel con una variedad que no está en el maestro la agrega (con el tipo de uva del cuartel), para que
 * aparezca en los formularios y reportes. Idempotente: si ya existe (sin distinguir mayúsculas), no hace nada.
 */
export const variedadDesdeCuartel: Reaccion = async (tx, actor, { op, registro }) => {
  if (op !== 'upsert' || registro.deletedAt) return;
  const nombre = String(registro.variedad ?? '').trim();
  if (!nombre) return;
  const [existe] = await tx
    .select({ id: variedad.id })
    .from(variedad)
    .where(and(sql`lower(${variedad.nombre}) = lower(${nombre})`, isNull(variedad.deletedAt)))
    .limit(1);
  if (existe) return;
  await tx.insert(variedad).values({
    id: randomUUID(),
    orgId: actor.orgId,
    nombre,
    tipo: registro.tipo === 'blanco' ? 'blanco' : 'tinto',
    createdBy: actor.userId,
    updatedBy: actor.userId
  });
};
