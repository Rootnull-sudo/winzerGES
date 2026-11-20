/**
 * Temporadas de la viña (ADR 0011). Se llama siempre dentro de withOrg(): RLS limita todo a la viña activa.
 */
import { anioDeFecha, rangoPorDefecto, seSolapan, temporadaInput, type TemporadaInput, type TemporadaRango } from '@winzer/domain';
import { asc, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../client';
import { upsert, type Actor, type EntityMeta } from '../repo';
import { temporada } from '../schema';

export const metaTemporada: EntityMeta = {
  entity: 'temporada',
  module: 'configuracion',
  label: 'temporadas',
  sensitive: true,
  display: (r) => `Temporada ${r.anio}`
};

export interface TemporadaRow extends TemporadaRango {
  id: string;
  version: number;
  estado: 'abierta' | 'cerrada';
}

/** Temporadas vigentes (no borradas), de la más antigua a la más reciente. */
export async function listarTemporadas(tx: Tx): Promise<TemporadaRow[]> {
  const rows = await tx
    .select({ id: temporada.id, version: temporada.version, anio: temporada.anio, inicio: temporada.inicio, fin: temporada.fin, estado: temporada.estado })
    .from(temporada)
    .where(isNull(temporada.deletedAt))
    .orderBy(asc(temporada.anio));
  return rows as TemporadaRow[];
}

export class TemporadaError extends Error {
  readonly status = 422;
}

/**
 * Crea o edita una temporada validando que el año no se repita y que las fechas no se solapen con otra
 * (una fecha pertenece a una sola temporada). Devuelve el registro guardado.
 */
export async function guardarTemporada(tx: Tx, actor: Actor, input: TemporadaInput, baseVersion?: number) {
  const data = temporadaInput.parse(input);
  const id = data.id ?? randomUUID();
  const otras = (await listarTemporadas(tx)).filter((t) => t.id !== id);
  if (otras.some((t) => t.anio === data.anio)) throw new TemporadaError(`Ya existe la temporada ${data.anio}.`);
  const choca = otras.find((t) => seSolapan(t, data));
  if (choca) throw new TemporadaError(`Las fechas se cruzan con la temporada ${choca.anio} (${choca.inicio} a ${choca.fin}).`);
  return upsert(tx, temporada, actor, metaTemporada, { ...data, id }, { baseVersion, checkVersion: baseVersion != null });
}

/**
 * Asegura que exista la temporada por defecto que contiene `fecha` (si no se cruza con otra ya registrada).
 * Se usa al crear una viña y al importar datos de v1. Escribe directo, sin permisos de rol: es infraestructura.
 */
export async function asegurarTemporada(tx: Tx, orgId: string, fecha: string, opts: { demo?: boolean } = {}) {
  const rango = rangoPorDefecto(anioDeFecha(fecha));
  const existentes = await listarTemporadas(tx);
  if (existentes.some((t) => t.anio === rango.anio || seSolapan(t, rango))) return;
  await tx.insert(temporada).values({ id: randomUUID(), orgId, ...rango, estado: 'abierta', demo: opts.demo ?? false });
}
