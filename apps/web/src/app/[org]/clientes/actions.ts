'use server';
/**
 * Clientes y cobranza — módulo ONLINE: escribe directo en Postgres vía Server Actions.
 * Patrón: requireOrg → withOrg (RLS) → upsert/softDelete o servicio (permisos + versión + auditoría) → revalidatePath.
 */
import { clienteTieneVentas, ConflictError, eliminarCobro, registrarCobro, ReglaError, schema, softDelete, upsert, withOrg } from '@winzer/db';
import { clienteInput, cobroInput, PermissionError, type CobroInput } from '@winzer/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { requireOrg } from '@/lib/session';

export type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const metaCliente = { entity: 'cliente', module: 'clientes', label: 'clientes', display: (r: Record<string, unknown>) => String(r.nombre) };

function fail(e: unknown): Result {
  if (e instanceof PermissionError || e instanceof ConflictError || e instanceof ReglaError) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: 'No se pudo guardar. Inténtalo de nuevo.' };
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  return Object.fromEntries(issues.map((i) => [i.path.map(String).join('.'), i.message]));
}

export async function saveCliente(slug: string, input: Record<string, unknown>, version?: number): Promise<Result> {
  const { actor } = await requireOrg(slug);
  const p = clienteInput.safeParse(input);
  if (!p.success) return { ok: false, error: 'Revisa los campos marcados.', fieldErrors: fieldErrors(p.error.issues) };
  try {
    await withOrg(actor.orgId, (tx) =>
      upsert(tx, schema.cliente, actor, metaCliente, { ...p.data, id: p.data.id ?? randomUUID() }, { baseVersion: version, checkVersion: version != null })
    );
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/${slug}/clientes`);
  return { ok: true };
}

export async function deleteCliente(slug: string, id: string): Promise<Result> {
  const { actor } = await requireOrg(slug);
  try {
    await withOrg(actor.orgId, async (tx) => {
      const cobros = await tx
        .select({ id: schema.cobro.id })
        .from(schema.cobro)
        .where(and(eq(schema.cobro.clienteId, id), isNull(schema.cobro.deletedAt)))
        .limit(1);
      if (cobros.length) throw new PermissionError('No se puede eliminar: el cliente tiene cobros registrados.');
      if (await clienteTieneVentas(tx, id)) throw new PermissionError('No se puede eliminar: el cliente tiene ventas registradas.');
      await softDelete(tx, schema.cliente, actor, metaCliente, id);
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/${slug}/clientes`);
  return { ok: true };
}

/** Registra un cobro con sus aplicaciones a ventas; lo no aplicado queda como anticipo del cliente. */
export async function saveCobro(slug: string, input: Record<string, unknown>): Promise<Result> {
  const { actor } = await requireOrg(slug);
  const p = cobroInput.safeParse(input);
  if (!p.success) return { ok: false, error: 'Revisa los campos marcados.', fieldErrors: fieldErrors(p.error.issues) };
  try {
    await withOrg(actor.orgId, (tx) => registrarCobro(tx, actor, input as CobroInput));
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/${slug}/clientes`);
  revalidatePath(`/${slug}/ventas`);
  return { ok: true };
}

export async function deleteCobro(slug: string, id: string): Promise<Result> {
  const { actor } = await requireOrg(slug);
  try {
    await withOrg(actor.orgId, (tx) => eliminarCobro(tx, actor, id));
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/${slug}/clientes`);
  revalidatePath(`/${slug}/ventas`);
  return { ok: true };
}
