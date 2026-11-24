'use server';
/** Envasado y etiquetado — módulo ONLINE. */
import { eliminarFormato, guardarFormato, withOrg } from '@winzer/db';
import { formatoInput, type FormatoInput } from '@winzer/domain';
import { ejecutar, invalido, type Result } from '../acciones-comunes';

const ruta = (slug: string) => [`/${slug}/envasado`, `/${slug}/inventarios`];

export async function saveFormato(slug: string, input: Record<string, unknown>, version?: number): Promise<Result> {
  const p = formatoInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => guardarFormato(tx, actor, input as FormatoInput, version)));
}
export async function deleteFormato(slug: string, id: string): Promise<Result> {
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => eliminarFormato(tx, actor, id)));
}
