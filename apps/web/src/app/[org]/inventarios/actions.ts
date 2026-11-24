'use server';
/** Inventarios — módulo ONLINE: ajustes de producto terminado (quiebre, muestra o conteo). */
import { ajustarProducto, withOrg } from '@winzer/db';
import { ajusteProductoInput, type AjusteProductoInput } from '@winzer/domain';
import { ejecutar, invalido, type Result } from '../acciones-comunes';

export async function ajustarProductoAction(slug: string, input: Record<string, unknown>): Promise<Result> {
  const p = ajusteProductoInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, [`/${slug}/inventarios`, `/${slug}/envasado`, `/${slug}/ventas`], (actor) =>
    withOrg(actor.orgId, (tx) => ajustarProducto(tx, actor, input as AjusteProductoInput))
  );
}
