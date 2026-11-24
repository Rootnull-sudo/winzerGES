/**
 * Personas (F4, online): trabajadores. Datos sensibles: cada cambio queda auditado.
 * Siempre dentro de withOrg() con la conexión de la app.
 */
import { trabajadorInput, type TrabajadorInput } from '@winzer/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../client';
import { ReglaError, softDelete, upsert, type Actor, type EntityMeta } from '../repo';
import { trabajador } from '../schema';

export const metaTrabajador: EntityMeta = {
  entity: 'trabajador',
  module: 'administracion',
  label: 'trabajadores',
  sensitive: true,
  display: (r) => String(r.nombre)
};

export async function guardarTrabajador(tx: Tx, actor: Actor, input: TrabajadorInput, baseVersion?: number) {
  const data = trabajadorInput.parse(input);
  const id = data.id ?? randomUUID();
  const [dup] = await tx
    .select({ nombre: trabajador.nombre })
    .from(trabajador)
    .where(and(eq(trabajador.rut, data.rut), sql`${trabajador.id} <> ${id}`, isNull(trabajador.deletedAt)))
    .limit(1);
  if (dup) throw new ReglaError(`El RUT ${data.rut} ya está registrado para ${dup.nombre}.`);
  return upsert(tx, trabajador, actor, metaTrabajador, { ...data, id }, { baseVersion, checkVersion: baseVersion != null });
}

/** Elimina un trabajador (F4-2: bloqueado si tiene remuneraciones; se registra su fecha de término). */
export async function eliminarTrabajador(tx: Tx, actor: Actor, id: string) {
  return softDelete(tx, trabajador, actor, metaTrabajador, id);
}
