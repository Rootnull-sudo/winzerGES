'use server';
/**
 * Configuración — temporadas y parámetros con vigencia (ADR 0011). Online.
 * Las temporadas se crean y cierran aquí; el resto de la app las recibe por sync.
 */
import { ConflictError, eliminarParametro, guardarParametro, guardarTemporada, TemporadaError, withOrg } from '@winzer/db';
import { parametroInput, PermissionError, temporadaInput } from '@winzer/domain';
import { revalidatePath } from 'next/cache';
import { requireOrg } from '@/lib/session';

export type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function saveTemporada(slug: string, input: Record<string, unknown>, version?: number): Promise<Result> {
  const { actor } = await requireOrg(slug);
  const p = temporadaInput.safeParse(input);
  if (!p.success) {
    return { ok: false, error: 'Revisa los campos marcados.', fieldErrors: Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])) };
  }
  try {
    await withOrg(actor.orgId, (tx) => guardarTemporada(tx, actor, p.data, version));
  } catch (e) {
    if (e instanceof TemporadaError || e instanceof PermissionError || e instanceof ConflictError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: 'No se pudo guardar. Inténtalo de nuevo.' };
  }
  // El selector de temporada vive en el layout: se revalida toda la viña.
  revalidatePath(`/${slug}`, 'layout');
  return { ok: true };
}

function fallo(e: unknown): Result {
  if (e instanceof PermissionError || e instanceof ConflictError) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: 'No se pudo guardar. Inténtalo de nuevo.' };
}

/** Registra el valor de un parámetro desde una fecha (agrega historia; misma fecha = corrección). */
export async function saveParametro(slug: string, input: Record<string, unknown>): Promise<Result> {
  const { actor } = await requireOrg(slug);
  const p = parametroInput.safeParse(input);
  if (!p.success) {
    return { ok: false, error: 'Revisa los campos marcados.', fieldErrors: Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])) };
  }
  try {
    await withOrg(actor.orgId, (tx) => guardarParametro(tx, actor, p.data));
  } catch (e) {
    return fallo(e);
  }
  revalidatePath(`/${slug}/configuracion`);
  return { ok: true };
}

/** Quita un valor de la historia: vuelve a regir el anterior o el valor por defecto. */
export async function deleteParametro(slug: string, id: string): Promise<Result> {
  const { actor } = await requireOrg(slug);
  try {
    await withOrg(actor.orgId, (tx) => eliminarParametro(tx, actor, id));
  } catch (e) {
    return fallo(e);
  }
  revalidatePath(`/${slug}/configuracion`);
  return { ok: true };
}
