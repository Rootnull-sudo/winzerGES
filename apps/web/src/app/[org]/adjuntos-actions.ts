'use server';
/** Adjuntos (ADR 0013): el componente <Adjuntos> llama a estas acciones; los permisos se verifican en el servicio. */
import { AdjuntoError, confirmarSubida, eliminarAdjunto, listarAdjuntos, prepararSubida, urlDescarga, withOrg, type AdjuntoRow } from '@winzer/db';
import { PermissionError, subidaInput } from '@winzer/domain';
import { requireOrg } from '@/lib/session';

type R<T> = ({ ok: true } & T) | { ok: false; error: string };

function fallo(e: unknown): { ok: false; error: string } {
  if (e instanceof AdjuntoError || e instanceof PermissionError) return { ok: false, error: e.message };
  console.error('[adjuntos]', e);
  return { ok: false, error: 'No se pudo completar la operación con el archivo. Inténtalo de nuevo.' };
}

export async function prepararAdjunto(slug: string, input: Record<string, unknown>): Promise<R<{ id: string; clave: string; url: string }>> {
  const { actor } = await requireOrg(slug);
  const p = subidaInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  try {
    return { ok: true, ...(await withOrg(actor.orgId, (tx) => prepararSubida(tx, actor, p.data))) };
  } catch (e) {
    return fallo(e);
  }
}

export async function confirmarAdjunto(
  slug: string,
  input: { id: string; clave: string; entidad: string; registroId: string; nombre: string }
): Promise<R<object>> {
  const { actor } = await requireOrg(slug);
  try {
    await withOrg(actor.orgId, (tx) => confirmarSubida(tx, actor, input));
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function listarAdjuntosDe(slug: string, entidad: string, registroId: string): Promise<R<{ adjuntos: AdjuntoRow[] }>> {
  const { actor } = await requireOrg(slug);
  try {
    return { ok: true, adjuntos: await withOrg(actor.orgId, (tx) => listarAdjuntos(tx, actor, entidad, registroId)) };
  } catch (e) {
    return fallo(e);
  }
}

export async function descargarAdjunto(slug: string, id: string): Promise<R<{ url: string }>> {
  const { actor } = await requireOrg(slug);
  try {
    return { ok: true, url: await withOrg(actor.orgId, (tx) => urlDescarga(tx, actor, id)) };
  } catch (e) {
    return fallo(e);
  }
}

export async function eliminarAdjuntoDe(slug: string, id: string): Promise<R<object>> {
  const { actor } = await requireOrg(slug);
  try {
    await withOrg(actor.orgId, (tx) => eliminarAdjunto(tx, actor, id));
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
