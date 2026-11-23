/**
 * Servidor de sincronización offline (ver protocolo en @winzer/domain/src/sync.ts).
 *
 * Cursor sin saltos: cada fila sincronizable guarda `xid` (transacción que la escribió) y `seq`.
 * El pull solo entrega filas con xid < xmin del snapshot actual, es decir, de transacciones que ya
 * terminaron; ninguna transacción futura puede tener un xid menor. Se ordena por (xid, seq) y el
 * cursor es "xid:seq" de la última fila entregada. Así una transacción lenta no se "salta".
 */
import { can, claveUnica, SYNC_ENTITIES, type Mutation, type PullResponse, type PushResult, type SyncRecord } from '@winzer/domain';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Tx } from './client';
import { reaccionar } from './reacciones';
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
      if (!def.readAll && !can(actor.role, def.module, 'v', actor.customRoles, actor.acceso)) continue;
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

class Rechazo extends Error {
  readonly status = 422;
}

/** Aplica una mutación dentro de una transacción ya abierta. Lanza si se rechaza. */
async function aplicar(tx: Tx, actor: Actor, m: Mutation): Promise<Record<string, unknown> | null> {
  const def = SYNC_ENTITIES[m.entity];
  const t = tableOf(m.entity);
  if (!def || !t) throw new Rechazo(`Entidad no sincronizable: ${m.entity}`);
  if (def.soloLectura) throw new Rechazo(`Las ${def.label} se editan con conexión.`);
  const meta = { entity: def.entity, module: def.module, label: def.label, sensitive: def.sensitive };
  if (m.op === 'delete') {
    const [previo] = (await tx.select().from(t).where(eq(t.id, m.id))) as Record<string, unknown>[];
    const r = await softDelete(tx, t, actor, meta, m.id);
    // Solo reacciona si este push hizo el borrado (un reintento de un borrado ya aplicado no repite efectos).
    if (r) await reaccionar(tx, actor, { entity: m.entity, op: 'delete', previo: previo ?? null, registro: r });
    return r ?? previo ?? null;
  }
  const parsed = def.schema.safeParse({ ...(m.data ?? {}), id: m.id });
  if (!parsed.success) throw new Rechazo(parsed.error.issues.map((i) => i.message).join(' '));
  const data = parsed.data as Record<string, unknown> & { id: string };
  for (const u of def.unique ?? []) {
    const { campos, mensaje } = claveUnica(u, data);
    const iguales = campos.map((k) => sql`lower(coalesce(${(t as any)[k]}::text, '')) = lower(${String(data[k] ?? '')})`);
    const dup = await tx
      .select({ id: t.id })
      .from(t)
      .where(and(...iguales, sql`${t.id} <> ${m.id}`, sql`${t.deletedAt} is null`))
      .limit(1);
    if (dup.length) throw new Rechazo(mensaje);
  }
  // Reintento de una mutación ya aplicada (se perdió la respuesta): mismo contenido, versión +1.
  if (m.baseVersion != null) {
    const [cur] = (await tx.select().from(t).where(eq(t.id, m.id))) as Record<string, unknown>[];
    if (cur && Number(cur.version) === m.baseVersion + 1 && cur.updatedBy === actor.userId && sameData(cur, data)) return cur;
  }
  const [previo] = (await tx.select().from(t).where(eq(t.id, m.id))) as Record<string, unknown>[];
  const registro = await upsert(tx, t, actor, meta, data, { baseVersion: m.baseVersion, checkVersion: true });
  // Efectos en otros módulos, en la misma transacción (ADR 0010).
  await reaccionar(tx, actor, { entity: m.entity, op: 'upsert', previo: previo ?? null, registro });
  return registro;
}

function resultadoError(m: Mutation, e: unknown): PushResult {
  const t = tableOf(m.entity);
  if (e instanceof ConflictError) {
    return { mutationId: m.mutationId, status: 'conflict', message: e.message, record: e.current && t ? toSyncRecord(m.entity, e.current, t) : null };
  }
  const err = e as Error & { status?: number };
  if (!err.status) console.error('[sync.push]', e);
  return { mutationId: m.mutationId, status: 'rejected', message: err.status ? err.message : 'Error interno al guardar.' };
}

/**
 * Aplica mutaciones en orden. Cada una en su propia transacción: una rechazada no bloquea a las demás.
 * Excepción: las mutaciones consecutivas con el mismo `grupo` (p. ej. salida + entrada + merma de un trasiego) se
 * aplican juntas en UNA transacción: o entran todas o ninguna, así un rechazo nunca deja la operación a medias.
 * Idempotencia: el id del registro lo genera el cliente; reenviar un upsert ya aplicado con la misma
 * baseVersion se detecta como "ya aplicado" comparando contra la versión actual.
 */
export async function push(actor: Actor, mutations: Mutation[]): Promise<PushResult[]> {
  const out: PushResult[] = [];
  for (let i = 0; i < mutations.length;) {
    const m = mutations[i]!;
    let j = i + 1;
    if (m.grupo) while (j < mutations.length && mutations[j]!.grupo === m.grupo) j++;
    const lote = mutations.slice(i, j);
    i = j;
    let fallo: { m: Mutation; e: unknown } | null = null;
    try {
      const recs = await withOrg(actor.orgId, async (tx: Tx) => {
        const rs: (Record<string, unknown> | null)[] = [];
        for (const x of lote) {
          try {
            rs.push(await aplicar(tx, actor, x));
          } catch (e) {
            fallo = { m: x, e };
            throw e;
          }
        }
        return rs;
      });
      lote.forEach((x, k) => {
        const rec = recs[k];
        const t = tableOf(x.entity)!;
        out.push(
          rec
            ? { mutationId: x.mutationId, status: 'ok', record: toSyncRecord(x.entity, rec, t) }
            : { mutationId: x.mutationId, status: 'rejected', message: 'Registro no encontrado.' }
        );
      });
    } catch (e) {
      const f = (fallo as { m: Mutation; e: unknown } | null) ?? { m: lote[0]!, e };
      const r = resultadoError(f.m, f.e);
      for (const x of lote) {
        if (x === f.m) out.push(r);
        // El resto del grupo se revierte con el mismo motivo.
        else out.push({ mutationId: x.mutationId, status: 'rejected', message: r.status === 'ok' ? '' : `No se aplicó la operación completa: ${r.message}` });
      }
    }
  }
  return out;
}

function sameData(cur: Record<string, unknown>, data: Record<string, unknown>) {
  return Object.entries(data).every(([k, v]) => k === 'id' || JSON.stringify(cur[k] ?? null) === JSON.stringify(v ?? null));
}
