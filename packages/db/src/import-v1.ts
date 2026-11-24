/**
 * Importador de respaldos de v1 (archivo JSON de "Configuración › Datos y respaldos › Exportar",
 * generado por VG.db.dump() en js/data/db.js) hacia una viña de v2.
 *
 * - Solo importa entidades ya migradas a v2 (IMPORTERS); el resto se informa como pendiente.
 * - Los ids de v1 (p. ej. "cli_dist") solo son únicos dentro de un navegador, así que se
 *   transforman en un UUID determinista por viña: reimportar el mismo archivo actualiza en vez de duplicar.
 * - Cada registro se valida con el mismo esquema Zod que usa la app; los inválidos se reportan y se omiten.
 */
import {
  adicionSO2Input,
  aditivoInput,
  analisisInput,
  anioDeFecha,
  aplicacionInput,
  clienteInput,
  climaInput,
  cobroInput,
  cosechaInput,
  cuartelInput,
  estanqueInput,
  fenologiaInput,
  fermentacionInput,
  insumoInput,
  jornalInput,
  laborInput,
  loteInput,
  movBodegaInput,
  movInsumoInput,
  proveedorInput,
  rangoPorDefecto,
  seguimientoInput,
  variedadInput,
  ventanaInput
} from '@winzer/domain';
import { eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { idDerivado } from './ids';
import type { z } from 'zod';
import { reaccionar } from './reacciones';
import { upsert, type Actor, type EntityMeta } from './repo';
import { asegurarTemporada, listarTemporadas } from './services/temporadas';
import type { Tx } from './client';
import {
  aplicacion,
  cliente,
  clima,
  cobro,
  cosecha,
  cuartel,
  adicionSO2,
  aditivo,
  analisis,
  estanque,
  fenologia,
  fermentacion,
  insumo,
  insumoPrecio,
  jornal,
  labor,
  lote,
  movBodega,
  movInsumo,
  proveedor,
  seguimiento,
  variedad,
  ventana
} from './schema';
import { metaInsumo, metaMovInsumo } from './services/insumos';
import { metaProveedor } from './services/proveedores';
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
export const mapId = (orgId: string, legacyId: string): string => idDerivado(orgId, legacyId);

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
  /** Referencias opcionales con FK: si el registro apuntado no existe en v2, quedan en null (v1 no tenía FK). */
  refsOpcionales?: Record<string, PgTable & { id: any }>;
  /** Escrituras extra después de importar el registro (p. ej. historial de precios). */
  despues?: (tx: Tx, actor: Actor, r: Record<string, unknown>, id: string) => Promise<void>;
}

/** `ref` de v1 ("aplicacion:apl_1") → origen de v2 con el id remapeado. */
function origenDeRef(ref: unknown, orgId: string) {
  const [tipo, id] = String(ref ?? '').split(':');
  return tipo && id ? { origenTipo: tipo, origenId: mapId(orgId, id) } : { origenTipo: null, origenId: null };
}

/** Orden importa: primero los maestros, después lo que los referencia. */
const IMPORTERS: Record<string, Importer> = {
  variedad: { table: variedad, schema: variedadInput, meta: { entity: 'variedad', module: 'configuracion', label: 'variedades' } },
  cuartel: { table: cuartel, schema: cuartelInput, meta: { entity: 'cuartel', module: 'catastro', label: 'cuarteles' } },
  cliente: { table: cliente, schema: clienteInput, meta: { entity: 'cliente', module: 'clientes', label: 'clientes' } },
  cobro: { table: cobro, schema: cobroInput, meta: { entity: 'cobro', module: 'clientes', label: 'cobros' }, refs: ['clienteId', 'ventaId'] },
  proveedor: { table: proveedor, schema: proveedorInput, meta: metaProveedor },
  insumo: {
    table: insumo,
    schema: insumoInput,
    meta: metaInsumo,
    refs: ['proveedorId'],
    refsOpcionales: { proveedorId: proveedor },
    adaptar: ({ historialPrecios: _h, ...r }) => r,
    // historialPrecios (JSON en v1) → filas de insumo_precio. v1 no guardaba el precio inicial: se agrega el actual.
    despues: async (tx, actor, r, id) => {
      await tx.delete(insumoPrecio).where(eq(insumoPrecio.insumoId, id));
      const hist = (Array.isArray(r.historialPrecios) ? r.historialPrecios : []) as { fecha?: string; precio?: number; proveedorId?: string }[];
      const filas = hist.filter((h) => h.fecha && h.precio != null);
      const proveedores = new Set((await tx.select({ id: proveedor.id }).from(proveedor)).map((x) => x.id));
      if (!filas.length) filas.push({ fecha: String(r.updatedAt ?? r.createdAt ?? new Date().toISOString()).slice(0, 10), precio: Number(r.precio) || 0 });
      await tx.insert(insumoPrecio).values(
        filas.map((h) => ({
          id: mapId(actor.orgId, `precio|${r.id}|${h.fecha}|${h.precio}`),
          orgId: actor.orgId,
          insumoId: id,
          fecha: String(h.fecha).slice(0, 10),
          precio: Math.round(Number(h.precio)),
          proveedorId: h.proveedorId && proveedores.has(mapId(actor.orgId, h.proveedorId)) ? mapId(actor.orgId, h.proveedorId) : null,
          origen: 'compra',
          createdBy: actor.userId,
          updatedBy: actor.userId
        }))
      );
    }
  },
  fenologia: {
    table: fenologia,
    schema: fenologiaInput,
    meta: { entity: 'fenologia', module: 'fenologia', label: 'registros de fenología' },
    refs: ['cuartelId'],
    temporada: true
  },
  clima: { table: clima, schema: climaInput, meta: { entity: 'clima', module: 'fenologia', label: 'registros de temperatura' }, temporada: true },
  aplicacion: {
    table: aplicacion,
    schema: aplicacionInput,
    meta: { entity: 'aplicacion', module: 'insumos', label: 'aplicaciones' },
    refs: ['cuartelId', 'insumoId'],
    temporada: true,
    // `unidadDosis` del seed de v1 no existe en el formulario; el costo se redondea a pesos.
    adaptar: ({ unidadDosis: _u, ...r }) => ({ ...r, costo: Math.round(Number(r.costo) || 0) })
  },
  labor: { table: labor, schema: laborInput, meta: { entity: 'labor', module: 'insumos', label: 'labores' }, refs: ['cuartelId'], temporada: true },
  ventana: { table: ventana, schema: ventanaInput, meta: { entity: 'ventana', module: 'calendario', label: 'ventanas de vendimia' } },
  lote: {
    table: lote,
    schema: loteInput,
    meta: { entity: 'lote', module: 'calendario', label: 'lotes' },
    temporada: true,
    // cuartelIds es una lista: se remapea cada id.
    adaptar: (r, orgId) => ({ ...r, cuartelIds: Array.isArray(r.cuartelIds) ? r.cuartelIds.map((c) => mapId(orgId, String(c))) : [] })
  },
  cosecha: {
    table: cosecha,
    schema: cosechaInput,
    meta: { entity: 'cosecha', module: 'cosecha', label: 'cosechas' },
    refs: ['cuartelId', 'loteId'],
    temporada: true
  },
  // `fecha` del jornal es la de su cosecha y `pago` se recalcula: no se importan.
  jornal: {
    table: jornal,
    schema: jornalInput,
    meta: { entity: 'jornal', module: 'cosecha', label: 'jornales' },
    refs: ['cosechaId'],
    adaptar: ({ fecha: _f, pago: _p, ...r }) => r
  },
  estanque: { table: estanque, schema: estanqueInput, meta: { entity: 'estanque', module: 'bodega', label: 'estanques' } },
  // Envasado y ventas a granel llegan con sus documentos (F5): por ahora se omiten.
  movBodega: {
    table: movBodega,
    schema: movBodegaInput,
    meta: { entity: 'mov_bodega', module: 'bodega', label: 'movimientos de bodega' },
    entidadV2: 'mov_bodega',
    refs: ['estanqueId', 'loteId'],
    adaptar: (r, orgId) =>
      r.tipo === 'envasado' || r.tipo === 'venta_granel'
        ? null
        : { ...r, ...origenDeRef(r.ref, orgId), ref: undefined, grupo: r.grupo ? String(r.grupo) : null }
  },
  // levaduraId de v1 apuntaba a un insumo que el formulario no mostraba: se deja el texto de `levadura`.
  fermentacion: {
    table: fermentacion,
    schema: fermentacionInput,
    meta: { entity: 'fermentacion', module: 'fermentacion', label: 'fichas de fermentación' },
    refs: ['loteId', 'estanqueId'],
    adaptar: ({ levaduraId: _l, ...r }) => r
  },
  // La medición posterior a una adición de SO₂ la vuelve a crear la reacción de la adición.
  seguimiento: {
    table: seguimiento,
    schema: seguimientoInput,
    meta: { entity: 'seguimiento', module: 'fermentacion', label: 'registros de seguimiento' },
    refs: ['fermentacionId'],
    adaptar: (r) => (r.observaciones === 'Medición post adición de SO₂' ? null : r)
  },
  adicionSO2: {
    table: adicionSO2,
    schema: adicionSO2Input,
    meta: { entity: 'adicion_so2', module: 'fermentacion', label: 'adiciones de SO₂' },
    entidadV2: 'adicion_so2',
    refs: ['fermentacionId', 'insumoId'],
    adaptar: (r) => ({ ...r, costo: Math.round(Number(r.costo) || 0) })
  },
  // El SO₂ de v1 registrado como aditivo no tiene ficha: se omite (en v2 el SO₂ va en la ficha de fermentación).
  aditivo: {
    table: aditivo,
    schema: aditivoInput,
    meta: { entity: 'aditivo', module: 'vinificacion', label: 'aditivos' },
    refs: ['loteId', 'estanqueId', 'insumoId'],
    adaptar: (r) =>
      r.tipo === 'so2'
        ? null
        : { ...r, unidadDosis: 'g/hL', cantidad: Number(r.cantidad) || 0, costo: Math.round(Number(r.costo) || 0), objetivo: r.objetivo ?? null }
  },
  analisis: {
    table: analisis,
    schema: analisisInput,
    meta: { entity: 'analisis', module: 'laboratorio', label: 'análisis' },
    refs: ['loteId'],
    adaptar: (r) => ({ ...r, autorizadoSAG: !!r.autorizadoSAG, certificadoDO: !!r.certificadoDO })
  },
  movInsumo: {
    table: movInsumo,
    schema: movInsumoInput,
    meta: metaMovInsumo,
    entidadV2: 'mov_insumo',
    refs: ['insumoId'],
    // Los consumos de aplicaciones, SO₂ y aditivos los vuelven a generar sus reacciones (no se duplican).
    adaptar: (r, orgId) =>
      r.tipo === 'aplicacion' || r.tipo === 'so2' || r.tipo === 'aditivo'
        ? null
        : { ...r, ...origenDeRef(r.ref, orgId), ref: undefined, fecha: String(r.fecha ?? r.createdAt ?? '').slice(0, 10) }
  }
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
          const data = parsed.data as Record<string, unknown> & { id: string };
          for (const [campo, tabla] of Object.entries(imp.refsOpcionales ?? {})) {
            if (!data[campo]) continue;
            const [existe] = await tx
              .select({ id: tabla.id })
              .from(tabla)
              .where(eq(tabla.id, data[campo] as string));
            if (!existe) data[campo] = null;
          }
          const rec = await upsert(tx, imp.table, actor, imp.meta, data);
          // Mismos efectos que si llegara por sync (p. ej. aplicación → movimiento de insumo).
          await reaccionar(tx, actor, { entity: imp.entidadV2 ?? entidad, op: 'upsert', previo: previo ?? null, registro: rec, importando: true });
          if (imp.despues) await imp.despues(tx, actor, r0, String(rec.id));
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
