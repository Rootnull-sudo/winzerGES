import 'server-only';
import { listarTemporadas, withOrg, type TemporadaRow } from '@winzer/db';
import { elegirTemporada, fechaHoy, type TemporadaRango } from '@winzer/domain';
import { cache } from 'react';
import { requireOrg } from './session';

/** Temporadas de la viña (memoizadas por render). */
export const getTemporadas = cache(async (orgId: string): Promise<TemporadaRow[]> => withOrg(orgId, listarTemporadas));

/**
 * Temporada que debe mostrar una página: la de `?t=2026` si existe, si no la actual (ADR 0011).
 * Uso en una página: `const t = await temporadaDe(slug, await searchParams);` y filtrar por `t.inicio`–`t.fin`
 * (comerciales) o por `temporada_id` (viñedo y bodega).
 */
export async function temporadaDe(slug: string, searchParams: Record<string, string | string[] | undefined> = {}): Promise<TemporadaRango> {
  const { org } = await requireOrg(slug);
  const t = searchParams.t;
  return elegirTemporada(await getTemporadas(org.id), Array.isArray(t) ? t[0] : t, fechaHoy());
}
