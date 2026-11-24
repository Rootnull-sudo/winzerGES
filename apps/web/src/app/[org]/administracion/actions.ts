'use server';
/** Sueldos y gastos — módulo ONLINE: Server Actions → servicios de @winzer/db dentro de withOrg (RLS). */
import {
  ConflictError,
  eliminarGasto,
  eliminarTrabajador,
  guardarGasto,
  guardarPresupuesto,
  guardarTrabajador,
  ReglaError,
  schema,
  softDelete,
  upsert,
  withOrg
} from '@winzer/db';
import {
  activoInput,
  gastoInput,
  PermissionError,
  presupuestoInput,
  trabajadorInput,
  type GastoInput,
  type PresupuestoInput,
  type TrabajadorInput
} from '@winzer/domain';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireOrg } from '@/lib/session';
import type { Result } from '../proveedores/actions';

function fallo(e: unknown): Result {
  if (e instanceof PermissionError || e instanceof ConflictError || e instanceof ReglaError) return { ok: false, error: e.message };
  console.error('[administracion]', e);
  return { ok: false, error: 'No se pudo guardar. Inténtalo de nuevo.' };
}
const invalido = (issues: { path: PropertyKey[]; message: string }[]): Result => ({
  ok: false,
  error: 'Revisa los campos marcados.',
  fieldErrors: Object.fromEntries(issues.map((i) => [i.path.map(String).join('.'), i.message]))
});

async function ejecutar(slug: string, fn: (actor: Awaited<ReturnType<typeof requireOrg>>['actor']) => Promise<unknown>): Promise<Result> {
  const { actor } = await requireOrg(slug);
  try {
    await fn(actor);
    revalidatePath(`/${slug}/administracion`);
    revalidatePath(`/${slug}/proveedores`);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function saveGasto(slug: string, input: Record<string, unknown>, version?: number): Promise<Result> {
  const p = gastoInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, (actor) => withOrg(actor.orgId, (tx) => guardarGasto(tx, actor, input as GastoInput, version)));
}

export async function deleteGasto(slug: string, id: string): Promise<Result> {
  return ejecutar(slug, (actor) => withOrg(actor.orgId, (tx) => eliminarGasto(tx, actor, id)));
}

export async function savePresupuesto(slug: string, input: Record<string, unknown>): Promise<Result> {
  const p = presupuestoInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, (actor) => withOrg(actor.orgId, (tx) => guardarPresupuesto(tx, actor, input as PresupuestoInput)));
}

const metaActivo = {
  entity: 'activo',
  module: 'administracion',
  label: 'activos fijos',
  sensitive: true,
  display: (r: Record<string, unknown>) => String(r.nombre)
};

export async function saveActivo(slug: string, input: Record<string, unknown>, version?: number): Promise<Result> {
  const p = activoInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, (actor) =>
    withOrg(actor.orgId, (tx) =>
      upsert(tx, schema.activo, actor, metaActivo, { ...p.data, id: p.data.id ?? randomUUID() }, { baseVersion: version, checkVersion: version != null })
    )
  );
}

export async function deleteActivo(slug: string, id: string): Promise<Result> {
  return ejecutar(slug, (actor) => withOrg(actor.orgId, (tx) => softDelete(tx, schema.activo, actor, metaActivo, id)));
}

export async function saveTrabajador(slug: string, input: Record<string, unknown>, version?: number): Promise<Result> {
  const p = trabajadorInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, (actor) => withOrg(actor.orgId, (tx) => guardarTrabajador(tx, actor, input as TrabajadorInput, version)));
}

export async function deleteTrabajador(slug: string, id: string): Promise<Result> {
  return ejecutar(slug, (actor) => withOrg(actor.orgId, (tx) => eliminarTrabajador(tx, actor, id)));
}
