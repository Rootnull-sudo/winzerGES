/**
 * Personas (F4, online): trabajadores. Datos sensibles: cada cambio queda auditado.
 * Siempre dentro de withOrg() con la conexión de la app.
 */
import { calcularHonorario, honorarioInput, trabajadorInput, type HonorarioInput, type TrabajadorInput } from '@winzer/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../client';
import { ReglaError, softDelete, upsert, type Actor, type EntityMeta } from '../repo';
import { honorario, trabajador } from '../schema';
import { configVigente } from './parametros';
import { tieneRemuneraciones } from './remuneraciones';

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

/** Elimina un trabajador sin remuneraciones; si ya tiene, se registra su fecha de término (v1 tampoco lo permitía). */
export async function eliminarTrabajador(tx: Tx, actor: Actor, id: string) {
  if (await tieneRemuneraciones(tx, id)) throw new ReglaError('No se puede eliminar: tiene remuneraciones registradas. Registra su fecha de término.');
  return softDelete(tx, trabajador, actor, metaTrabajador, id);
}

export const metaHonorario: EntityMeta = {
  entity: 'honorario',
  module: 'administracion',
  label: 'honorarios',
  sensitive: true,
  display: (r) => `${r.nombre} N° ${r.numero ?? '—'}`
};

/**
 * Registra una boleta de honorarios: retención con la tasa vigente en la fecha de la boleta (foto). Una boleta
 * pagada no se edita (revierte el pago primero). N° único por RUT.
 */
export async function guardarHonorario(tx: Tx, actor: Actor, input: HonorarioInput, baseVersion?: number, tasaImportada?: number) {
  const data = honorarioInput.parse(input);
  const id = data.id ?? randomUUID();
  const [previo] = await tx.select({ estado: honorario.estado }).from(honorario).where(eq(honorario.id, id));
  if (previo?.estado === 'pagada') throw new ReglaError('La boleta está pagada: revierte el pago para modificarla.');
  if (data.numero != null) {
    const [dup] = await tx
      .select({ id: honorario.id })
      .from(honorario)
      .where(and(eq(honorario.rut, data.rut), eq(honorario.numero, data.numero), sql`${honorario.id} <> ${id}`, isNull(honorario.deletedAt)))
      .limit(1);
    if (dup) throw new ReglaError(`La boleta N° ${data.numero} de ${data.rut} ya está registrada.`);
  }
  const tasa = tasaImportada ?? (await configVigente(tx, data.fecha)).tributario.retencionHonorarios;
  return upsert(
    tx,
    honorario,
    actor,
    metaHonorario,
    { ...data, id, ...calcularHonorario(data.bruto, tasa) },
    { baseVersion, checkVersion: baseVersion != null }
  );
}

export async function marcarHonorarioPagado(tx: Tx, actor: Actor, id: string, fechaPago: string | null) {
  if (fechaPago && !/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) throw new ReglaError('Fecha de pago inválida.');
  return upsert(tx, honorario, actor, metaHonorario, { id, estado: fechaPago ? 'pagada' : 'pendiente', fechaPago });
}

export async function eliminarHonorario(tx: Tx, actor: Actor, id: string) {
  const [h] = await tx.select({ estado: honorario.estado }).from(honorario).where(eq(honorario.id, id));
  if (h?.estado === 'pagada') throw new ReglaError('No se puede eliminar una boleta pagada.');
  return softDelete(tx, honorario, actor, metaHonorario, id);
}
