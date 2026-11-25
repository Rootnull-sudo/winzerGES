'use server';
/** Tributario — módulo ONLINE: estado del F29, pagos de impuesto y obligaciones del calendario. */
import { eliminarPagoImpuesto, guardarF29, guardarRenta, marcarObligacion, registrarPagoImpuesto, withOrg } from '@winzer/db';
import {
  f29EstadoInput,
  obligacionInput,
  pagoImpuestoInput,
  rentaEstadoInput,
  type RentaEstadoInput,
  type F29EstadoInput,
  type ObligacionInput,
  type PagoImpuestoInput
} from '@winzer/domain';
import { ejecutar, invalido, type Result } from '../acciones-comunes';

const ruta = (slug: string) => [`/${slug}/tributario`];

export async function guardarF29Action(slug: string, input: Record<string, unknown>): Promise<Result> {
  const p = f29EstadoInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => guardarF29(tx, actor, input as F29EstadoInput)));
}

export async function savePagoImpuesto(slug: string, input: Record<string, unknown>): Promise<Result> {
  const p = pagoImpuestoInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => registrarPagoImpuesto(tx, actor, input as PagoImpuestoInput)));
}
export async function deletePagoImpuesto(slug: string, id: string): Promise<Result> {
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => eliminarPagoImpuesto(tx, actor, id)));
}

export async function marcarObligacionAction(slug: string, input: Record<string, unknown>): Promise<Result> {
  const p = obligacionInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => marcarObligacion(tx, actor, input as ObligacionInput)));
}

export async function guardarRentaAction(slug: string, input: Record<string, unknown>): Promise<Result> {
  const p = rentaEstadoInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => guardarRenta(tx, actor, input as RentaEstadoInput)));
}
