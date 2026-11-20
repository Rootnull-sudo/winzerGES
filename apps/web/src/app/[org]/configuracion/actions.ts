'use server';
/**
 * Configuración — temporadas (ADR 0011). Online: se crean y cierran aquí; el resto de la app las recibe por sync.
 */
import { ConflictError, guardarTemporada, TemporadaError, withOrg } from '@winzer/db';
import { PermissionError, temporadaInput } from '@winzer/domain';
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
