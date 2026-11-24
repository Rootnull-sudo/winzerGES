'use server';
/** Ventas — módulo ONLINE. */
import { anularVenta, confirmarVenta, eliminarVenta, guardarVenta, withOrg } from '@winzer/db';
import { ventaInput, type VentaInput } from '@winzer/domain';
import { ejecutar, invalido, type Result } from '../acciones-comunes';

const ruta = (slug: string) => [`/${slug}/ventas`, `/${slug}/clientes`, `/${slug}/inventarios`, `/${slug}/envasado`];

export async function saveVenta(slug: string, input: Record<string, unknown>, version?: number): Promise<Result> {
  const p = ventaInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => guardarVenta(tx, actor, input as VentaInput, version)));
}
/** Guarda los últimos cambios del borrador y lo confirma en la misma transacción. */
export async function confirmarVentaAction(slug: string, input: Record<string, unknown>, version?: number): Promise<Result> {
  const p = ventaInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, ruta(slug), (actor) =>
    withOrg(actor.orgId, async (tx) => {
      const v = await guardarVenta(tx, actor, input as VentaInput, version);
      return confirmarVenta(tx, actor, String(v.id));
    })
  );
}
export async function anularVentaAction(slug: string, id: string): Promise<Result> {
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => anularVenta(tx, actor, id)));
}
export async function deleteVenta(slug: string, id: string): Promise<Result> {
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => eliminarVenta(tx, actor, id)));
}
