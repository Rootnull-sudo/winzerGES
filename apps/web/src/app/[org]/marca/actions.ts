'use server';
/** Marca y etiquetas — módulo ONLINE. */
import { eliminarEtiqueta, eliminarMarca, guardarEtiqueta, guardarMarca, withOrg } from '@winzer/db';
import { etiquetaInput, marcaInput, type EtiquetaInput, type MarcaInput } from '@winzer/domain';
import { ejecutar, invalido, type Result } from '../acciones-comunes';

const ruta = (slug: string) => [`/${slug}/marca`, `/${slug}/envasado`];

export async function saveMarca(slug: string, input: Record<string, unknown>, version?: number): Promise<Result> {
  const p = marcaInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => guardarMarca(tx, actor, input as MarcaInput, version)));
}
export async function deleteMarca(slug: string, id: string): Promise<Result> {
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => eliminarMarca(tx, actor, id)));
}
export async function saveEtiqueta(slug: string, input: Record<string, unknown>, version?: number): Promise<Result> {
  const p = etiquetaInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => guardarEtiqueta(tx, actor, input as EtiquetaInput, version)));
}
export async function deleteEtiqueta(slug: string, id: string): Promise<Result> {
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => eliminarEtiqueta(tx, actor, id)));
}
