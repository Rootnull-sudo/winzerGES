'use server';
/**
 * Proveedores y compras — módulo ONLINE: Server Actions → servicios de @winzer/db dentro de withOrg (RLS).
 */
import { ConflictError, eliminarProveedor, guardarProveedor, ReglaError, withOrg } from '@winzer/db';
import { PermissionError, proveedorInput } from '@winzer/domain';
import { revalidatePath } from 'next/cache';
import { requireOrg } from '@/lib/session';

export type Result = { ok: true; id?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

function fallo(e: unknown): Result {
  if (e instanceof PermissionError || e instanceof ConflictError || e instanceof ReglaError) return { ok: false, error: e.message };
  console.error('[proveedores]', e);
  return { ok: false, error: 'No se pudo guardar. Inténtalo de nuevo.' };
}
const campos = (issues: { path: PropertyKey[]; message: string }[]) => Object.fromEntries(issues.map((i) => [String(i.path[0]), i.message]));
const invalido = (issues: { path: PropertyKey[]; message: string }[]): Result => ({
  ok: false,
  error: 'Revisa los campos marcados.',
  fieldErrors: campos(issues)
});

export async function saveProveedor(slug: string, input: Record<string, unknown>, version?: number): Promise<Result> {
  const { actor } = await requireOrg(slug);
  const p = proveedorInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  try {
    const r = await withOrg(actor.orgId, (tx) => guardarProveedor(tx, actor, p.data, version));
    revalidatePath(`/${slug}/proveedores`);
    return { ok: true, id: String(r.id) };
  } catch (e) {
    return fallo(e);
  }
}

export async function deleteProveedor(slug: string, id: string): Promise<Result> {
  const { actor } = await requireOrg(slug);
  try {
    await withOrg(actor.orgId, (tx) => eliminarProveedor(tx, actor, id));
    revalidatePath(`/${slug}/proveedores`);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
