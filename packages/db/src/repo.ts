/**
 * Escrituras de negocio: el equivalente en servidor de VG.db.save/remove de v1 (js/data/db.js).
 *  - verifica permisos del rol en el módulo dueño (no solo en la UI),
 *  - controla concurrencia con `version` (optimista),
 *  - registra auditoría en la MISMA transacción si la entidad es sensible,
 *  - borra lógicamente (deleted_at) para que el borrado se sincronice offline.
 * Siempre se ejecuta dentro de withOrg(): RLS ya restringe todo a la viña activa.
 */
import { assertCan, type Action, type RoleDef } from '@winzer/domain';
import { and, eq, getTableColumns, isNull, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { Tx } from './client';
import { auditLog } from './schema';

export interface Actor {
  orgId: string;
  userId: string;
  userName: string;
  role: string;
  customRoles?: RoleDef[];
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

/** Columnas que el cliente nunca puede fijar. */
const SYSTEM_KEYS = new Set(['orgId', 'version', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'deletedAt', 'seq', 'xid', 'demo']);

export function stripSystem(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([k]) => !SYSTEM_KEYS.has(k)));
}

type AnyTable = PgTable & { id: any; orgId: any; version: any; deletedAt: any };

export function can(actor: Actor, meta: EntityMeta, action: Action) {
  assertCan(actor.role, meta.module, action, meta.label, actor.customRoles);
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
