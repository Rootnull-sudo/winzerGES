/**
 * Escrituras de negocio: el equivalente en servidor de VG.db.save/remove de v1 (js/data/db.js).
 *  - verifica permisos del rol en el módulo dueño (no solo en la UI),
 *  - controla concurrencia con `version` (optimista),
 *  - registra auditoría en la MISMA transacción si la entidad es sensible,
 *  - borra lógicamente (deleted_at) para que el borrado se sincronice offline.
 * Siempre se ejecuta dentro de withOrg(): RLS ya restringe todo a la viña activa.
 */
import { assertCan, type AccesoPlan, type Action, type RoleDef } from '@winzer/domain';
import { and, eq, getTableColumns, inArray, isNull, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { Tx } from './client';
import { auditLog, temporada } from './schema';

export interface Actor {
  orgId: string;
  userId: string;
  userName: string;
  role: string;
  customRoles?: RoleDef[];
  /** Acceso por plan de la viña (F0-7). Sin él solo se evalúan los permisos del rol (tests, seed, importador). */
  acceso?: AccesoPlan;
}

export interface EntityMeta {
  entity: string;
  module: string;
  /** Plural en minúscula para mensajes ("cuarteles"). */
  label: string;
  sensitive?: boolean;
  display?: (r: Record<string, unknown>) => string;
}

export class ConflictError extends Error {
  readonly status = 409;
  constructor(
    message: string,
    readonly current: Record<string, unknown> | null
  ) {
    super(message);
    this.name = 'ConflictError';
  }
}
export class NotFoundError extends Error {
  readonly status = 404;
}
/** Regla de negocio incumplida (422): el mensaje se muestra tal cual al usuario. */
export class ReglaError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = 'ReglaError';
  }
}

/**
 * Guarda de temporada (ADR 0011) para tablas con `temporadaId`:
 *  - la temporada del registro (antes y después) debe existir y estar abierta: una cerrada es de solo lectura;
 *  - si el registro tiene `fecha`, debe caer dentro del rango de su temporada.
 */
async function guardaTemporada(tx: Tx, table: PgTable, before: Record<string, unknown> | null | undefined, nuevo: Record<string, unknown> | null) {
  if (!('temporadaId' in getTableColumns(table))) return;
  const ids = [...new Set([before?.temporadaId, nuevo?.temporadaId].filter(Boolean).map(String))];
  if (nuevo && !nuevo.temporadaId) throw new ReglaError('Falta la temporada del registro.');
  const filas = ids.length
    ? await tx
        .select({ id: temporada.id, anio: temporada.anio, inicio: temporada.inicio, fin: temporada.fin, estado: temporada.estado })
        .from(temporada)
        .where(and(inArray(temporada.id, ids), isNull(temporada.deletedAt)))
    : [];
  for (const id of ids) {
    const t = filas.find((f) => f.id === id);
    if (!t) throw new ReglaError('La temporada del registro no existe. Revisa las temporadas en Configuración.');
    if (t.estado === 'cerrada') throw new ReglaError(`La temporada ${t.anio} está cerrada: sus registros son de solo lectura.`);
  }
  const fecha = nuevo?.fecha ? String(nuevo.fecha) : null;
  const t = nuevo ? filas.find((f) => f.id === String(nuevo.temporadaId)) : undefined;
  if (fecha && t && (fecha < t.inicio || fecha > t.fin)) {
    throw new ReglaError(`La fecha ${fecha.split('-').reverse().join('-')} no corresponde a la temporada ${t.anio} (${t.inicio} a ${t.fin}).`);
  }
}

/** Columnas que el cliente nunca puede fijar. */
const SYSTEM_KEYS = new Set(['orgId', 'version', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'deletedAt', 'seq', 'xid', 'demo']);

export function stripSystem(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([k]) => !SYSTEM_KEYS.has(k)));
}

type AnyTable = PgTable & { id: any; orgId: any; version: any; deletedAt: any };

export function can(actor: Actor, meta: EntityMeta, action: Action) {
  assertCan(actor.role, meta.module, action, meta.label, actor.customRoles, actor.acceso);
}

async function audit(tx: Tx, actor: Actor, meta: EntityMeta, accion: string, rec: Record<string, unknown>, before?: Record<string, unknown> | null) {
  if (!meta.sensitive) return;
  const campos = before
    ? Object.keys(rec)
        .filter((k) => !SYSTEM_KEYS.has(k) && JSON.stringify(rec[k]) !== JSON.stringify(before[k]))
        .join(', ')
    : '';
  await tx.insert(auditLog).values({
    orgId: actor.orgId,
    userId: actor.userId,
    userName: actor.userName,
    accion,
    entidad: meta.entity,
    registroId: String(rec.id),
    descripcion: meta.display ? meta.display(rec) : String(rec.nombre ?? rec.codigo ?? rec.id),
    campos
  });
}

/**
 * Crea o actualiza. `baseVersion`: versión que el usuario editó (null/undefined = no verificar, p. ej. formularios online
 * que ya cargan la última versión; el sync offline SIEMPRE la envía).
 */
export async function upsert<T extends AnyTable>(
  tx: Tx,
  table: T,
  actor: Actor,
  meta: EntityMeta,
  data: Record<string, unknown> & { id: string },
  opts: { baseVersion?: number | null; checkVersion?: boolean } = {}
): Promise<Record<string, unknown>> {
  const t = table as AnyTable;
  const [before] = (await tx.select().from(t).where(eq(t.id, data.id)).for('update')) as Record<string, unknown>[];
  const clean = stripSystem(data);
  if (before && before.deletedAt) throw new ConflictError(`El registro fue eliminado por otro usuario.`, before);
  can(actor, meta, before ? 'e' : 'c');
  await guardaTemporada(tx, t, before, { ...before, ...clean });

  if (before) {
    if (opts.checkVersion && opts.baseVersion != null && Number(before.version) !== opts.baseVersion) {
      throw new ConflictError(
        'Otro usuario modificó este registro mientras lo editabas. Se conservó su versión; revisa y vuelve a aplicar tus cambios.',
        before
      );
    }
    const [rec] = (await tx
      .update(t)
      .set({ ...clean, version: sql`${t.version} + 1`, updatedAt: new Date(), updatedBy: actor.userId } as never)
      .where(eq(t.id, data.id))
      .returning()) as Record<string, unknown>[];
    await audit(tx, actor, meta, 'editar', rec!, before);
    return rec!;
  }
  const [rec] = (await tx
    .insert(t)
    .values({ ...clean, id: data.id, orgId: actor.orgId, createdBy: actor.userId, updatedBy: actor.userId } as never)
    .returning()) as Record<string, unknown>[];
  await audit(tx, actor, meta, 'crear', rec!);
  return rec!;
}

/** Borrado lógico. Idempotente: borrar algo ya borrado no falla. */
export async function softDelete<T extends AnyTable>(tx: Tx, table: T, actor: Actor, meta: EntityMeta, id: string): Promise<Record<string, unknown> | null> {
  const t = table as AnyTable;
  can(actor, meta, 'd');
  if ('temporadaId' in getTableColumns(t)) {
    const [before] = (await tx.select().from(t).where(eq(t.id, id))) as Record<string, unknown>[];
    await guardaTemporada(tx, t, before, null);
  }
  const [rec] = (await tx
    .update(t)
    .set({ deletedAt: new Date(), version: sql`${t.version} + 1`, updatedAt: new Date(), updatedBy: actor.userId } as never)
    .where(and(eq(t.id, id), isNull(t.deletedAt)))
    .returning()) as Record<string, unknown>[];
  if (rec) await audit(tx, actor, meta, 'eliminar', rec);
  return rec ?? null;
}

/** Datos de dominio de una fila (sin columnas de sistema), para enviar al cliente. */
export function toData(row: Record<string, unknown>, table: PgTable): Record<string, unknown> {
  const cols = Object.keys(getTableColumns(table));
  return Object.fromEntries(cols.filter((k) => !['orgId', 'seq', 'xid', 'deletedAt'].includes(k)).map((k) => [k, row[k]]));
}
