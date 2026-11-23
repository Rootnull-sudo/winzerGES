/**
 * Protocolo de sincronización offline (compartido cliente/servidor).
 *
 * - El cliente genera el `id` (UUID) de cada registro → las escrituras son idempotentes.
 * - Las mutaciones se encolan en una outbox local (IndexedDB) y se envían con POST /api/sync/push.
 * - El cliente pide cambios con GET /api/sync/pull?since=<cursor>; el cursor es `server_seq`,
 *   una secuencia global que el servidor asigna en cada escritura (incluye borrados lógicos).
 * - Concurrencia: cada registro tiene `version`. Una edición enviada con `baseVersion` distinta
 *   a la del servidor se rechaza como conflicto: gana el servidor y el cliente avisa al usuario.
 */
import type { z } from 'zod';
import { cuartelInput, variedadInput } from './entities/catastro';
import { aplicacionInput, laborInput } from './entities/aplicacion';
import { cosechaInput, jornalInput } from './entities/cosecha';
import { climaInput, fenologiaInput } from './entities/fenologia';
import { loteInput, ventanaInput } from './entities/lote';
import { estanqueInput, movBodegaInput } from './entities/bodega';
import { adicionSO2Input, fermentacionInput, seguimientoInput } from './entities/fermentacion';
import { aditivoInput } from './entities/aditivo';
import { analisisInput } from './entities/analisis';
import { insumoInput, movInsumoInput } from './entities/insumo';
import { temporadaInput } from './entities/temporada';

export interface ClaveUnica {
  campos: readonly string[];
  mensaje: string;
}

/** Normaliza una regla de unicidad a { campos, mensaje }. */
export function claveUnica(u: string | ClaveUnica, data: Record<string, unknown>): ClaveUnica {
  return typeof u === 'string' ? { campos: [u], mensaje: `Ya existe un registro con ${u} "${String(data[u] ?? '')}".` } : u;
}

/** ¿`a` y `b` coinciden en todos los campos de la clave? (texto, sin mayúsculas; vacío = ''). */
export function mismaClave(campos: readonly string[], a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return campos.every((k) => String(a[k] ?? '').toLowerCase() === String(b[k] ?? '').toLowerCase());
}

export interface SyncEntityDef {
  /** Nombre de la entidad (igual que en v1: js/data/schema.js). */
  entity: string;
  module: string;
  label: string;
  schema: z.ZodType;
  /** Registra cambios en audit_log. */
  sensitive?: boolean;
  /**
   * Unicidad por viña (validada en servidor; en cliente solo como ayuda). Un campo, o una combinación con su
   * mensaje: `{ campos: ['cuartelId', 'temporadaId'], mensaje: 'Ya hay un registro de ese cuartel en la temporada.' }`.
   * Compara como texto sin distinguir mayúsculas; un campo vacío cuenta como ''.
   */
  unique?: (string | ClaveUnica)[];
  /**
   * Se sincroniza para LEER sin conexión, pero se escribe solo en línea (Server Actions y servicios): p. ej. el
   * maestro de insumos y su libro de movimientos. El motor offline y el push rechazan escribirla.
   */
  soloLectura?: boolean;
  /**
   * Maestro transversal: lo reciben offline todos los miembros aunque no puedan ver su módulo
   * (p. ej. las temporadas, que usan viñedo y bodega). Escribirlo sigue exigiendo permiso en `module`.
   */
  readAll?: boolean;
}

/** Entidades que funcionan sin conexión. Agregar aquí al migrar un módulo offline (ver docs/v2/migrar-modulo.md). */
export const SYNC_ENTITIES: Record<string, SyncEntityDef> = {
  cuartel: { entity: 'cuartel', module: 'catastro', label: 'cuarteles', schema: cuartelInput, unique: ['codigo'] },
  variedad: { entity: 'variedad', module: 'configuracion', label: 'variedades', schema: variedadInput, unique: ['nombre'] },
  temporada: { entity: 'temporada', module: 'configuracion', label: 'temporadas', schema: temporadaInput, unique: ['anio'], readAll: true, sensitive: true },
  insumo: { entity: 'insumo', module: 'insumos', label: 'insumos', schema: insumoInput, unique: ['nombre'], soloLectura: true, sensitive: true },
  mov_insumo: { entity: 'mov_insumo', module: 'insumos', label: 'movimientos de insumos', schema: movInsumoInput, soloLectura: true },
  fenologia: {
    entity: 'fenologia',
    module: 'fenologia',
    label: 'registros de fenología',
    schema: fenologiaInput,
    unique: [{ campos: ['cuartelId', 'temporadaId'], mensaje: 'Ese cuartel ya tiene un registro de fenología en la temporada: edítalo.' }]
  },
  aplicacion: { entity: 'aplicacion', module: 'insumos', label: 'aplicaciones', schema: aplicacionInput },
  labor: { entity: 'labor', module: 'insumos', label: 'labores', schema: laborInput },
  lote: {
    entity: 'lote',
    module: 'calendario',
    label: 'lotes',
    schema: loteInput,
    unique: [{ campos: ['codigo'], mensaje: 'Ya existe un lote con ese código.' }]
  },
  ventana: {
    entity: 'ventana',
    module: 'calendario',
    label: 'ventanas de vendimia',
    schema: ventanaInput,
    unique: [{ campos: ['variedad', 'valle'], mensaje: 'Ya hay una ventana para esa variedad y valle.' }]
  },
  estanque: {
    entity: 'estanque',
    module: 'bodega',
    label: 'estanques',
    schema: estanqueInput,
    unique: [{ campos: ['codigo'], mensaje: 'Ya existe un estanque con ese código.' }]
  },
  mov_bodega: { entity: 'mov_bodega', module: 'bodega', label: 'movimientos de bodega', schema: movBodegaInput, sensitive: true },
  fermentacion: {
    entity: 'fermentacion',
    module: 'fermentacion',
    label: 'fichas de fermentación',
    schema: fermentacionInput,
    unique: [{ campos: ['codigo'], mensaje: 'Ya existe una ficha con ese código.' }]
  },
  seguimiento: { entity: 'seguimiento', module: 'fermentacion', label: 'registros de seguimiento', schema: seguimientoInput },
  adicion_so2: { entity: 'adicion_so2', module: 'fermentacion', label: 'adiciones de SO₂', schema: adicionSO2Input, sensitive: true },
  aditivo: { entity: 'aditivo', module: 'vinificacion', label: 'aditivos', schema: aditivoInput },
  analisis: { entity: 'analisis', module: 'laboratorio', label: 'análisis', schema: analisisInput },
  cosecha: { entity: 'cosecha', module: 'cosecha', label: 'cosechas', schema: cosechaInput },
  jornal: { entity: 'jornal', module: 'cosecha', label: 'jornales', schema: jornalInput, sensitive: true },
  clima: {
    entity: 'clima',
    module: 'fenologia',
    label: 'registros de temperatura',
    schema: climaInput,
    unique: [{ campos: ['fecha', 'estacion'], mensaje: 'Ya hay un registro de temperatura de esa fecha en esa estación.' }]
  }
};

export type MutationOp = 'upsert' | 'delete';

export interface Mutation {
  /** Id único de la mutación (idempotencia del push). */
  mutationId: string;
  entity: string;
  op: MutationOp;
  id: string;
  /** Versión del registro que el cliente tenía al editar (null = registro nuevo). */
  baseVersion: number | null;
  data?: Record<string, unknown>;
  createdAt: string;
  /** Grupo atómico: las mutaciones consecutivas con el mismo grupo se aplican todas o ninguna (p. ej. un trasiego). */
  grupo?: string;
}

export interface SyncRecord {
  entity: string;
  id: string;
  version: number;
  seq: number;
  deleted: boolean;
  data: Record<string, unknown>;
  updatedAt: string;
}

export interface PullResponse {
  records: SyncRecord[];
  /** Opaco para el cliente: "xid:seq". */ cursor: string;
  hasMore: boolean;
}

export type PushResult =
  | { mutationId: string; status: 'ok'; record: SyncRecord }
  | { mutationId: string; status: 'conflict'; record: SyncRecord | null; message: string }
  | { mutationId: string; status: 'rejected'; message: string };

export interface PushResponse {
  results: PushResult[];
}
