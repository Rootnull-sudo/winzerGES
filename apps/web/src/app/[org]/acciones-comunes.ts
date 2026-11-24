import 'server-only';
/** Ayudas compartidas por las Server Actions de los módulos online (errores de regla, de campo y revalidación). */
import { ConflictError, ReglaError } from '@winzer/db';
import { PermissionError } from '@winzer/domain';
import { revalidatePath } from 'next/cache';
import { requireOrg } from '@/lib/session';

export type Result = { ok: true; id?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };
type Actor = Awaited<ReturnType<typeof requireOrg>>['actor'];

export function fallo(e: unknown, origen = 'accion'): Result {
  if (e instanceof PermissionError || e instanceof ConflictError || e instanceof ReglaError) return { ok: false, error: e.message };
  console.error(`[${origen}]`, e);
  return { ok: false, error: 'No se pudo guardar. Inténtalo de nuevo.' };
}

/** Errores de Zod con la ruta completa del campo (`lineas.0.cantidad`). */
export const invalido = (issues: { path: PropertyKey[]; message: string }[]): Result => ({
  ok: false,
  error: 'Revisa los campos marcados.',
  fieldErrors: Object.fromEntries(issues.map((i) => [i.path.map(String).join('.'), i.message]))
});

/** requireOrg → fn → revalidatePath de las rutas afectadas. Devuelve el id del registro si fn lo entrega. */
export async function ejecutar(slug: string, rutas: string[], fn: (actor: Actor) => Promise<unknown>): Promise<Result> {
  const { actor } = await requireOrg(slug);
  try {
    const r = (await fn(actor)) as { id?: unknown } | null | undefined;
    for (const p of rutas) revalidatePath(p);
    return { ok: true, id: r && typeof r === 'object' && 'id' in r && r.id ? String(r.id) : undefined };
  } catch (e) {
    return fallo(e, rutas[0]);
  }
}
