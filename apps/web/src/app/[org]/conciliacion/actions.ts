'use server';
/** Conciliación bancaria — módulo ONLINE: cuentas, cartolas, movimientos y conciliaciones. */
import {
  autoConciliarCuenta,
  conciliar,
  desconciliar,
  eliminarCuenta,
  guardarCuenta,
  importarCartola,
  movimientoManual,
  registrarDiferencia,
  withOrg
} from '@winzer/db';
import {
  cuentaBancoInput,
  diferenciaInput,
  importarCartolaInput,
  movManualInput,
  type CuentaBancoInput,
  type DiferenciaInput,
  type ImportarCartolaInput,
  type MovManualInput
} from '@winzer/domain';
import { requireOrg } from '@/lib/session';
import { ejecutar, fallo, invalido, type Result } from '../acciones-comunes';
import { revalidatePath } from 'next/cache';

const ruta = (slug: string) => [`/${slug}/conciliacion`, `/${slug}/administracion`];

export async function saveCuenta(slug: string, input: Record<string, unknown>, version?: number): Promise<Result> {
  const p = cuentaBancoInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => guardarCuenta(tx, actor, input as CuentaBancoInput, version)));
}
export async function deleteCuenta(slug: string, id: string): Promise<Result> {
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => eliminarCuenta(tx, actor, id)));
}

export async function movimientoManualAction(slug: string, input: Record<string, unknown>): Promise<Result> {
  const p = movManualInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => movimientoManual(tx, actor, input as MovManualInput)));
}

export type ResultadoCartola = { ok: true; cartolaId: string; importados: number; duplicadas: number; conciliados: number } | { ok: false; error: string };
export async function importarCartolaAction(slug: string, input: ImportarCartolaInput): Promise<ResultadoCartola> {
  const p = importarCartolaInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Revisa la cartola.' };
  const { actor } = await requireOrg(slug);
  try {
    const r = await withOrg(actor.orgId, (tx) => importarCartola(tx, actor, input));
    for (const x of ruta(slug)) revalidatePath(x);
    return { ok: true, ...r };
  } catch (e) {
    const f = fallo(e, 'cartola');
    return { ok: false, error: f.ok ? '' : f.error };
  }
}

export async function autoConciliarAction(slug: string, cuentaId: string): Promise<Result & { n?: number }> {
  let n = 0;
  const r = await ejecutar(slug, ruta(slug), async (actor) => {
    n = await withOrg(actor.orgId, (tx) => autoConciliarCuenta(tx, actor, cuentaId));
  });
  return r.ok ? { ...r, n } : r;
}

export async function conciliarAction(slug: string, input: { movId: string; origenTipo: string; origenId: string }): Promise<Result> {
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => conciliar(tx, actor, input)));
}
export async function desconciliarAction(slug: string, movId: string): Promise<Result> {
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => desconciliar(tx, actor, movId)));
}
export async function diferenciaAction(slug: string, input: Record<string, unknown>): Promise<Result> {
  const p = diferenciaInput.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  return ejecutar(slug, ruta(slug), (actor) => withOrg(actor.orgId, (tx) => registrarDiferencia(tx, actor, input as DiferenciaInput)));
}
