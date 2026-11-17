/**
 * Importador de respaldos de v1 (archivo JSON de "Configuración › Datos y respaldos › Exportar",
 * generado por VG.db.dump() en js/data/db.js) hacia una viña de v2.
 *
 * - Solo importa entidades ya migradas a v2 (IMPORTERS); el resto se informa como pendiente.
 * - Los ids de v1 (p. ej. "cli_dist") solo son únicos dentro de un navegador, así que se
 *   transforman en un UUID determinista por viña: reimportar el mismo archivo actualiza en vez de duplicar.
 * - Cada registro se valida con el mismo esquema Zod que usa la app; los inválidos se reportan y se omiten.
 */
import { clienteInput, cobroInput, cuartelInput, variedadInput } from '@winzer/domain';
import { eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { upsert, type Actor, type EntityMeta } from './repo';
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
  for (const [entidad, imp] of Object.entries(IMPORTERS)) {
    const recs = dump.data[entidad] ?? [];
    let ok = 0;
    for (const r of recs) {
      const legacyId = String(r.id ?? '');
      const input: Record<string, unknown> = { ...r, id: mapId(actor.orgId, legacyId) };
      for (const k of imp.refs ?? []) if (input[k]) input[k] = mapId(actor.orgId, String(input[k]));
      const parsed = imp.schema.safeParse(input);
      if (!parsed.success) {
        report.omitidos.push({ entidad, id: legacyId, motivo: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
        continue;
      }
      try {
        await withOrg(actor.orgId, async (tx) => {
          const rec = await upsert(tx, imp.table, actor, imp.meta, parsed.data as Record<string, unknown> & { id: string });
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
