'use server';
/** Envasado y etiquetado — módulo ONLINE. */
import { anularOrden, confirmarEnvasado, eliminarFormato, eliminarOrden, guardarFormato, guardarOrden, withOrg } from '@winzer/db';
import { formatoInput, ordenEnvasadoInput, type FormatoInput, type OrdenEnvasadoInput } from '@winzer/domain';
import { ejecutar, invalido, type Result } from '../acciones-comunes';

const ruta = (slug: string) => [`/${slug}/envasado`, `/${slug}/inventarios`, `/${slug}/marca`];

export async function saveFormato(slug: string, input: Record<string, unknown>, version?: number): Promise<Result> {
  const p = formatoInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => guardarFormato(tx, actor, input as FormatoInput, version)));
}
export async function deleteFormato(slug: string, id: string): Promise<Result> {
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => eliminarFormato(tx, actor, id)));
}

export async function saveOrden(slug: string, input: Record<string, unknown>, version?: number): Promise<Result> {
  const p = ordenEnvasadoInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => guardarOrden(tx, actor, input as OrdenEnvasadoInput, version)));
}
export async function deleteOrden(slug: string, id: string): Promise<Result> {
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => eliminarOrden(tx, actor, id)));
}
/** Guarda los últimos cambios del borrador y lo confirma en la misma transacción. */
export async function confirmarOrden(slug: string, input: Record<string, unknown>, version?: number): Promise<Result> {
  const p = ordenEnvasadoInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, ruta(slug), (actor) =>
    withOrg(actor.orgId, async (tx) => {
      const o = await guardarOrden(tx, actor, input as OrdenEnvasadoInput, version);
      return confirmarEnvasado(tx, actor, String(o.id));
    })
  );
}
export async function anularOrdenAction(slug: string, id: string): Promise<Result> {
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => anularOrden(tx, actor, id)));
}
