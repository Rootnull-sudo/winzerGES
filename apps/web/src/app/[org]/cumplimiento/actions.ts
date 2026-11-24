'use server';
/** Cumplimiento normativo — módulo ONLINE: registro de obligaciones. */
import { eliminarCumplimiento, guardarCumplimiento, withOrg } from '@winzer/db';
import { cumplimientoInput, type CumplimientoInput } from '@winzer/domain';
import { ejecutar, invalido, type Result } from '../acciones-comunes';

const ruta = (slug: string) => [`/${slug}/cumplimiento`];

export async function saveCumplimiento(slug: string, input: Record<string, unknown>, version?: number): Promise<Result> {
  const p = cumplimientoInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => guardarCumplimiento(tx, actor, input as CumplimientoInput, version)));
}
export async function deleteCumplimiento(slug: string, id: string): Promise<Result> {
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => eliminarCumplimiento(tx, actor, id)));
}
