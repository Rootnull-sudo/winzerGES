'use server';
/** DTE — módulo ONLINE: estados, notas de crédito y débito, folios (CAF) y datos del emisor. */
import { cambiarEstadoDte, eliminarCaf, emitirNota, guardarCaf, guardarEmisor, withOrg } from '@winzer/db';
import { cafInput, emisorInput, notaInput, type CafInput, type EmisorInput, type NotaInput } from '@winzer/domain';
import { ejecutar, invalido, type Result } from '../acciones-comunes';

const ruta = (slug: string) => [`/${slug}/dte`, `/${slug}/ventas`];

export async function cambiarEstadoAction(slug: string, id: string, estado: string): Promise<Result> {
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => cambiarEstadoDte(tx, actor, id, estado)));
}

export async function emitirNotaAction(slug: string, input: Record<string, unknown>): Promise<Result> {
  const p = notaInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => emitirNota(tx, actor, input as NotaInput)));
}

export async function saveCaf(slug: string, input: Record<string, unknown>): Promise<Result> {
  const p = cafInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => guardarCaf(tx, actor, input as CafInput)));
}
export async function deleteCaf(slug: string, id: string): Promise<Result> {
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => eliminarCaf(tx, actor, id)));
}

export async function saveEmisor(slug: string, input: Record<string, unknown>): Promise<Result> {
  const p = emisorInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => guardarEmisor(tx, actor, input as EmisorInput)));
}
