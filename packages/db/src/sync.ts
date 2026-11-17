/**
 * Servidor de sincronización offline (ver protocolo en @winzer/domain/src/sync.ts).
 *
 * Cursor sin saltos: cada fila sincronizable guarda `xid` (transacción que la escribió) y `seq`.
 * El pull solo entrega filas con xid < xmin del snapshot actual, es decir, de transacciones que ya
 * terminaron; ninguna transacción futura puede tener un xid menor. Se ordena por (xid, seq) y el
 * cursor es "xid:seq" de la última fila entregada. Así una transacción lenta no se "salta".
 */
import { can, SYNC_ENTITIES, type Mutation, type PullResponse, type PushResult, type SyncRecord } from '@winzer/domain';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Tx } from './client';
import { ConflictError, softDelete, toData, upsert, type Actor } from './repo';
import { syncTables } from './tables';
import { withOrg } from './tenancy';

const ZERO = '0:0';
export const parseCursor = (c: string | null | undefined): [string, number] => {
  const [x, s] = (c || ZERO).split(':');
  return [/^\d+$/.test(x ?? '') ? x! : '0', Number(s) || 0];
};

type SyncTable = (typeof syncTables)[string];
const tableOf = (entity: string): SyncTable | null => syncTables[entity] ?? null;

function toSyncRecord(entity: string, row: Record<string, unknown>, table: SyncTable): SyncRecord {
  return {
    entity,
    id: String(row.id),
    version: Number(row.version),
    seq: Number(row.seq),
    deleted: !!row.deletedAt,
    data: toData(row, table),
    updatedAt: new Date(row.updatedAt as Date).toISOString()
  };
}

/** Cambios desde `cursor` de todas las entidades offline que el actor puede ver. */
export async function pull(actor: Actor, cursor: string | null, limit = 500): Promise<PullResponse> {
  const [cx, cs] = parseCursor(cursor);
  return withOrg(actor.orgId, async (tx) => {
    const rows: { entity: string; row: Record<string, unknown> }[] = [];
    for (const [entity, def] of Object.entries(SYNC_ENTITIES)) {
      const t = tableOf(entity);
      if (!t) continue;
      if (!can(actor.role, def.module, 'v', actor.customRoles)) continue;
      const rs = (await tx
        .select()
        .from(t)
        .where(and(sql`${t.xid} < pg_snapshot_xmin(pg_current_snapshot())`, sql`(${t.xid}, ${t.seq}) > (${cx}::xid8, ${cs}::bigint)`))
        .orderBy(asc(t.xid), asc(t.seq))
        .limit(limit + 1)) as Record<string, unknown>[];
      rs.forEach((row) => rows.push({ entity, row }));
    }
    rows.sort((a, b) => {
      const ax = BigInt(String(a.row.xid)),
        bx = BigInt(String(b.row.xid));
      return ax === bx ? Number(a.row.seq) - Number(b.row.seq) : ax < bx ? -1 : 1;
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      records: page.map(({ entity, row }) => toSyncRecord(entity, row, tableOf(entity)!)),
      cursor: last ? `${last.row.xid}:${last.row.seq}` : `${cx}:${cs}`,
      hasMore: rows.length > limit
    };
  });
}

/**
 * Aplica mutaciones en orden. Cada una en su propia transacción: una rechazada no bloquea a las demás.
 * Idempotencia: el id del registro lo genera el cliente; reenviar un upsert ya aplicado con la misma
 * baseVersion se detecta como "ya aplicado" comparando contra la versión actual.
 */
export async function push(actor: Actor, mutations: Mutation[]): Promise<PushResult[]> {
  const out: PushResult[] = [];
  for (const m of mutations) {
    const def = SYNC_ENTITIES[m.entity];
    const t = tableOf(m.entity);
    if (!def || !t) {
      out.push({ mutationId: m.mutationId, status: 'rejected', message: `Entidad no sincronizable: ${m.entity}` });
      continue;
    }
    const meta = { entity: def.entity, module: def.module, label: def.label, sensitive: def.sensitive };
    try {
      const rec = await withOrg(actor.orgId, async (tx: Tx) => {
        if (m.op === 'delete') {
          const r = await softDelete(tx, t, actor, meta, m.id);
          const [cur] = (await tx.select().from(t).where(eq(t.id, m.id))) as Record<string, unknown>[];
          return r ?? cur ?? null;
        }
        const parsed = def.schema.safeParse({ ...(m.data ?? {}), id: m.id });
        if (!parsed.success) throw Object.assign(new Error(parsed.error.issues.map((i) => i.message).join(' ')), { status: 422 });
        const data = parsed.data as Record<string, unknown> & { id: string };
        if (def.unique) {
          for (const k of def.unique) {
            const dup = await tx
              .select({ id: t.id })
              .from(t)
              .where(and(sql`lower(${(t as any)[k]}) = lower(${String(data[k])})`, sql`${t.id} <> ${m.id}`, sql`${t.deletedAt} is null`))
              .limit(1);
            if (dup.length) throw Object.assign(new Error(`Ya existe un registro con ${k} "${data[k]}".`), { status: 422 });
          }
        }
        // Reintento de una mutación ya aplicada (se perdió la respuesta): mismo contenido, versión +1.
        if (m.baseVersion != null) {
          const [cur] = (await tx.select().from(t).where(eq(t.id, m.id))) as Record<string, unknown>[];
          if (cur && Number(cur.version) === m.baseVersion + 1 && cur.updatedBy === actor.userId && sameData(cur, data)) return cur;
        }
        return upsert(tx, t, actor, meta, data, { baseVersion: m.baseVersion, checkVersion: true });
      });
      if (!rec) out.push({ mutationId: m.mutationId, status: 'rejected', message: 'Registro no encontrado.' });
      else out.push({ mutationId: m.mutationId, status: 'ok', record: toSyncRecord(m.entity, rec, t) });
    } catch (e) {
      if (e instanceof ConflictError) {
        out.push({ mutationId: m.mutationId, status: 'conflict', message: e.message, record: e.current ? toSyncRecord(m.entity, e.current, t) : null });
      } else {
        const err = e as Error & { status?: number };
        if (!err.status) console.error('[sync.push]', e);
        out.push({ mutationId: m.mutationId, status: 'rejected', message: err.status ? err.message : 'Error interno al guardar.' });
      }
    }
  }
  return out;
}

function sameData(cur: Record<string, unknown>, data: Record<string, unknown>) {
  return Object.entries(data).every(([k, v]) => k === 'id' || JSON.stringify(cur[k] ?? null) === JSON.stringify(v ?? null));
}
