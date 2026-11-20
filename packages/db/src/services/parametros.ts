/**
 * Parámetros con vigencia e indicadores (ADR 0011, F0-2). Lecturas y escrituras de la viña dentro de withOrg().
 * Los cálculos piden `configVigente(tx, fecha)` y reciben la OrgConfig de esa fecha.
 */
import { configEn, fechaHoy, parametroInput, type OrgConfig, type ParametroInput } from '@winzer/domain';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DB, Tx } from '../client';
import { softDelete, upsert, type Actor, type EntityMeta } from '../repo';
import { indicador, parametroOrg } from '../schema';

export const metaParametro: EntityMeta = {
  entity: 'parametro_org',
  module: 'configuracion',
  label: 'parámetros',
  sensitive: true,
  display: (r) => `${r.clave} desde ${r.vigenteDesde}`
};

export interface ParametroRow {
  id: string;
  version: number;
  clave: string;
  valor: unknown;
  vigenteDesde: string;
}

export interface IndicadorRow {
  clave: string;
  fecha: string;
  valor: number;
  fuente: string | null;
}

/** Todas las filas de parámetros de la viña (historia incluida), por clave y fecha. */
export async function listarParametros(tx: Tx): Promise<ParametroRow[]> {
  return tx
    .select({
      id: parametroOrg.id,
      version: parametroOrg.version,
      clave: parametroOrg.clave,
      valor: parametroOrg.valor,
      vigenteDesde: parametroOrg.vigenteDesde
    })
    .from(parametroOrg)
    .where(isNull(parametroOrg.deletedAt))
    .orderBy(asc(parametroOrg.clave), asc(parametroOrg.vigenteDesde));
}

/** Indicadores globales (pocas filas por año), por clave y fecha. */
export async function listarIndicadores(tx: Tx | DB): Promise<IndicadorRow[]> {
  return tx
    .select({ clave: indicador.clave, fecha: indicador.fecha, valor: indicador.valor, fuente: indicador.fuente })
    .from(indicador)
    .orderBy(asc(indicador.clave), asc(indicador.fecha));
}

/** Configuración de la viña vigente en `fecha` (por defecto hoy). */
export async function configVigente(tx: Tx, fecha: string = fechaHoy()): Promise<OrgConfig> {
  const [params, inds] = await Promise.all([listarParametros(tx), listarIndicadores(tx)]);
  return configEn(
    params.map((p) => ({ clave: p.clave, valor: p.valor, desde: p.vigenteDesde })),
    inds.map((i) => ({ clave: i.clave, valor: i.valor, desde: i.fecha })),
    fecha
  );
}

/**
 * Registra el valor de un parámetro desde una fecha. Si ya hay una fila para esa misma fecha, se corrige esa
 * (no se duplica); si la fecha es nueva, se agrega a la historia.
 */
export async function guardarParametro(tx: Tx, actor: Actor, input: ParametroInput) {
  const data = parametroInput.parse(input);
  const [existe] = await tx
    .select({ id: parametroOrg.id })
    .from(parametroOrg)
    .where(and(eq(parametroOrg.clave, data.clave), eq(parametroOrg.vigenteDesde, data.vigenteDesde), isNull(parametroOrg.deletedAt)));
  return upsert(tx, parametroOrg, actor, metaParametro, { id: existe?.id ?? randomUUID(), ...data });
}

/** Quita un valor de la historia (vuelve a regir el anterior o el valor por defecto). */
export async function eliminarParametro(tx: Tx, actor: Actor, id: string) {
  return softDelete(tx, parametroOrg, actor, metaParametro, id);
}

/**
 * Carga o corrige indicadores. Solo con la conexión de administración (seed, job de indicadores): la app no
 * tiene permiso de escritura sobre `indicador`.
 */
export async function cargarIndicadores(admin: DB, filas: IndicadorRow[]) {
  if (!filas.length) return;
  await admin
    .insert(indicador)
    .values(filas)
    .onConflictDoUpdate({
      target: [indicador.clave, indicador.fecha],
      set: { valor: sql`excluded.valor`, fuente: sql`excluded.fuente`, updatedAt: new Date() }
    });
}
