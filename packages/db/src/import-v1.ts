/**
 * Importador de respaldos de v1 (archivo JSON de "Configuración › Datos y respaldos › Exportar",
 * generado por VG.db.dump() en js/data/db.js) hacia una viña de v2.
 *
 * - Solo importa entidades ya migradas a v2 (IMPORTERS); el resto se informa como pendiente.
 * - Los ids de v1 (p. ej. "cli_dist") solo son únicos dentro de un navegador, así que se
 *   transforman en un UUID determinista por viña: reimportar el mismo archivo actualiza en vez de duplicar.
 * - Cada registro se valida con el mismo esquema Zod que usa la app; los inválidos se reportan y se omiten.
 */
import { anioDeFecha, clienteInput, cobroInput, cuartelInput, rangoPorDefecto, variedadInput } from '@winzer/domain';
import { eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { reaccionar } from './reacciones';
import { upsert, type Actor, type EntityMeta } from './repo';
import { asegurarTemporada, listarTemporadas } from './services/temporadas';
import { cliente, cobro, cuartel, variedad } from './schema';
import { withOrg } from './tenancy';

export interface V1Dump {
  app: string;
  version?: string;
  data: Record<string, Record<string, unknown>[]>;
}

export interface ImportReport {
  importados: Record<string, number>;
  omitidos: { entidad: string; id: string; motivo: string }[];
  pendientes: Record<string, number>;
}

/** UUID determinista (formato v8) a partir de viña + id de v1. */
export function mapId(orgId: string, legacyId: string): string {
  const h = createHash('sha256').update(`winzer-v1|${orgId}|${legacyId}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

interface Importer {
  table: PgTable & { id: any; orgId: any; version: any; deletedAt: any; demo: any };
  schema: z.ZodType;
  meta: EntityMeta;
  /** Campos que referencian a otras entidades (se remapean). */
  refs?: string[];
  /** v1 guarda `temporada` (año): se convierte a `temporadaId`, creando la temporada por defecto si falta. */
  temporada?: boolean;
  /** Ajuste del registro de v1 antes de validar (renombrar valores, quitar campos). null = omitir el registro. */
  adaptar?: (r: Record<string, unknown>, orgId: string) => Record<string, unknown> | null;
  /** Entidad de v2 si el nombre cambia (p. ej. movInsumo → mov_insumo); por defecto, la misma clave. */
  entidadV2?: string;
}

/** Orden importa: primero los maestros, después lo que los referencia. */
const IMPORTERS: Record<string, Importer> = {
  variedad: { table: variedad, schema: variedadInput, meta: { entity: 'variedad', module: 'configuracion', label: 'variedades' } },
  cuartel: { table: cuartel, schema: cuartelInput, meta: { entity: 'cuartel', module: 'catastro', label: 'cuarteles' } },
  cliente: { table: cliente, schema: clienteInput, meta: { entity: 'cliente', module: 'clientes', label: 'clientes' } },
  cobro: { table: cobro, schema: cobroInput, meta: { entity: 'cobro', module: 'clientes', label: 'cobros' }, refs: ['clienteId', 'ventaId'] }
};
export const IMPORTABLE_ENTITIES = Object.keys(IMPORTERS);

export function isV1Dump(x: unknown): x is V1Dump {
  return !!x && typeof x === 'object' && (x as V1Dump).app === 'vina-gestion' && typeof (x as V1Dump).data === 'object';
}

export async function importV1(actor: Actor, dump: V1Dump): Promise<ImportReport> {
  if (!isV1Dump(dump)) throw Object.assign(new Error('El archivo no es un respaldo de Winzer Gestión v1.'), { status: 422 });
  const report: ImportReport = { importados: {}, omitidos: [], pendientes: {} };
  for (const [entidad, recs] of Object.entries(dump.data)) {
    if (!IMPORTERS[entidad] && recs.length && !['config', 'usuario', 'rol', 'auditoria'].includes(entidad)) report.pendientes[entidad] = recs.length;
  }
  const temporadas = new Map<number, string>();
  for (const [entidad, imp] of Object.entries(IMPORTERS)) {
    const recs = dump.data[entidad] ?? [];
    let ok = 0;
    for (const r0 of recs) {
      const legacyId = String(r0.id ?? '');
      const r = imp.adaptar ? imp.adaptar(r0, actor.orgId) : r0;
      if (!r) continue;
      const input: Record<string, unknown> = { ...r, id: mapId(actor.orgId, legacyId) };
      for (const k of imp.refs ?? []) if (input[k]) input[k] = mapId(actor.orgId, String(input[k]));
      if (imp.temporada) {
        const anio = Number(r.temporada) || (r.fecha ? anioDeFecha(String(r.fecha)) : NaN);
        if (!Number.isInteger(anio)) {
          report.omitidos.push({ entidad, id: legacyId, motivo: 'Sin temporada ni fecha.' });
          continue;
        }
        input.temporadaId = await temporadaImportada(actor.orgId, anio, temporadas);
        delete input.temporada;
      }
      const parsed = imp.schema.safeParse(input);
      if (!parsed.success) {
        report.omitidos.push({ entidad, id: legacyId, motivo: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
        continue;
      }
      try {
        await withOrg(actor.orgId, async (tx) => {
          const [previo] = (await tx
            .select()
            .from(imp.table)
            .where(eq(imp.table.id, input.id as string))) as Record<string, unknown>[];
          const rec = await upsert(tx, imp.table, actor, imp.meta, parsed.data as Record<string, unknown> & { id: string });
          // Mismos efectos que si llegara por sync (p. ej. aplicación → movimiento de insumo).
          await reaccionar(tx, actor, { entity: imp.entidadV2 ?? entidad, op: 'upsert', previo: previo ?? null, registro: rec });
          if (r._demo)
            await tx
              .update(imp.table)
              .set({ demo: true } as never)
              .where(eq(imp.table.id, rec.id));
        });
        ok++;
      } catch (e) {
        report.omitidos.push({ entidad, id: legacyId, motivo: (e as Error).message });
      }
    }
    if (recs.length) report.importados[entidad] = ok;
  }
  return report;
}

/** Id de la temporada `anio` de la viña; la crea con el rango por defecto si no existe (temporadas de v1). */
async function temporadaImportada(orgId: string, anio: number, cache: Map<number, string>): Promise<string> {
  const hit = cache.get(anio);
  if (hit) return hit;
  const id = await withOrg(orgId, async (tx) => {
    const existente = (await listarTemporadas(tx)).find((t) => t.anio === anio);
    if (existente) return existente.id;
    const r = rangoPorDefecto(anio);
    await asegurarTemporada(tx, orgId, r.inicio);
    const creada = (await listarTemporadas(tx)).find((t) => t.anio === anio);
    if (!creada) throw new Error(`No se pudo crear la temporada ${anio}: sus fechas se cruzan con otra.`);
    return creada.id;
  });
  cache.set(anio, id);
  return id;
}
