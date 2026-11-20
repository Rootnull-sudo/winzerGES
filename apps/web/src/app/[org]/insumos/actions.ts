'use server';
/**
 * Insumos — el maestro y los ajustes se escriben EN LÍNEA (SYNC_ENTITIES.insumo.soloLectura): estas acciones
 * llaman a los servicios; el cliente luego sincroniza para ver el cambio en IndexedDB.
 */
import { ajustarStock, ConflictError, eliminarInsumo, guardarInsumo, historialPrecios, ReglaError, withOrg, type PrecioRow } from '@winzer/db';
import { ajusteStockInput, insumoInput, PermissionError } from '@winzer/domain';
import { requireOrg } from '@/lib/session';

export type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

function fallo(e: unknown): Result {
  if (e instanceof PermissionError || e instanceof ConflictError || e instanceof ReglaError) return { ok: false, error: e.message };
  console.error('[insumos]', e);
  return { ok: false, error: 'No se pudo guardar. Inténtalo de nuevo.' };
}
const campos = (issues: { path: PropertyKey[]; message: string }[]) => Object.fromEntries(issues.map((i) => [String(i.path[0]), i.message]));

export async function saveInsumo(slug: string, input: Record<string, unknown>, version?: number): Promise<Result> {
  const { actor } = await requireOrg(slug);
  const p = insumoInput.safeParse(input);
  if (!p.success) return { ok: false, error: 'Revisa los campos marcados.', fieldErrors: campos(p.error.issues) };
  try {
    await withOrg(actor.orgId, (tx) => guardarInsumo(tx, actor, p.data, version));
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function deleteInsumo(slug: string, id: string): Promise<Result> {
  const { actor } = await requireOrg(slug);
  try {
    await withOrg(actor.orgId, (tx) => eliminarInsumo(tx, actor, id));
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function ajustarStockAction(slug: string, input: Record<string, unknown>): Promise<Result> {
  const { actor } = await requireOrg(slug);
  const p = ajusteStockInput.safeParse(input);
  if (!p.success) return { ok: false, error: 'Revisa los campos marcados.', fieldErrors: campos(p.error.issues) };
  try {
    await withOrg(actor.orgId, (tx) => ajustarStock(tx, actor, p.data));
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function preciosDe(slug: string, insumoId: string): Promise<PrecioRow[]> {
  const { actor } = await requireOrg(slug);
  return withOrg(actor.orgId, (tx) => historialPrecios(tx, insumoId));
}
