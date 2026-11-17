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

export interface SyncEntityDef {
  /** Nombre de la entidad (igual que en v1: js/data/schema.js). */
  entity: string;
  module: string;
  label: string;
  schema: z.ZodType;
  /** Registra cambios en audit_log. */
  sensitive?: boolean;
  /** Campos únicos por viña (validados en servidor; en cliente solo como ayuda). */
  unique?: string[];
}

/** Entidades que funcionan sin conexión. Agregar aquí al migrar un módulo offline (ver docs/v2/migrar-modulo.md). */
export const SYNC_ENTITIES: Record<string, SyncEntityDef> = {
  cuartel: { entity: 'cuartel', module: 'catastro', label: 'cuarteles', schema: cuartelInput, unique: ['codigo'] },
  variedad: { entity: 'variedad', module: 'configuracion', label: 'variedades', schema: variedadInput, unique: ['nombre'] }
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
