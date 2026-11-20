'use client';
/**
 * Motor de sincronización (cliente). Protocolo en @winzer/domain/src/sync.ts.
 *
 * Escritura: write() valida con el mismo Zod que el servidor, aplica el cambio en IndexedDB
 * al instante (la UI no espera a la red) y lo encola. flush() envía la cola cuando hay red.
 * Lectura: pull() trae los cambios desde el cursor. Se sincroniza al abrir, al recuperar la
 * conexión, al volver a la pestaña y cada 30 s.
 */
import { claveUnica, mismaClave, SYNC_ENTITIES, type Mutation, type PullResponse, type PushResponse, type SyncRecord } from '@winzer/domain';
import { orgStore, type LocalRecord, type OrgStore } from './store';

/** `ready`: ya terminó una sincronización completa en esta sesión (antes de eso no se puede decir "al día"). */
export type SyncState = { online: boolean; syncing: boolean; ready: boolean; pending: number; lastSync: string | null; error: string | null };

const uuid = () => crypto.randomUUID();

export class SyncEngine {
  readonly db: OrgStore;
  private listeners = new Set<(s: SyncState) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  state: SyncState = {
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    syncing: false,
    ready: false,
    pending: 0,
    lastSync: null,
    error: null
  };

  constructor(
    readonly slug: string,
    orgId: string,
    userId: string
  ) {
    this.db = orgStore(orgId, userId);
  }

  subscribe(fn: (s: SyncState) => void) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }
  private set(p: Partial<SyncState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((f) => f(this.state));
  }

  start() {
    const on = () => {
      this.set({ online: true });
      void this.sync();
    };
    const off = () => this.set({ online: false });
    const vis = () => {
      if (document.visibilityState === 'visible') void this.sync();
    };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    document.addEventListener('visibilitychange', vis);
    this.timer = setInterval(() => void this.sync(), 30_000);
    void this.db.meta.get('lastSync').then((m) => this.set({ lastSync: m?.value ?? null }));
    void this.refreshPending().then(() => this.sync());
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      document.removeEventListener('visibilitychange', vis);
      if (this.timer) clearInterval(this.timer);
    };
  }

  private async refreshPending() {
    this.set({ pending: await this.db.outbox.count() });
  }

  /** Crea/edita/borra localmente y encola. Lanza Error con mensaje si los datos no son válidos. */
  async write(entity: string, op: 'upsert' | 'delete', id: string | null, data?: Record<string, unknown>) {
    const def = SYNC_ENTITIES[entity];
    if (!def) throw new Error(`Entidad no disponible offline: ${entity}`);
    if (def.soloLectura) throw new Error(`Las ${def.label} se editan con conexión. Sin señal solo se pueden consultar.`);
    const recId = id ?? uuid();
    let clean: Record<string, unknown> | undefined;
    if (op === 'upsert') {
      const r = def.schema.safeParse({ ...data, id: recId });
      if (!r.success) throw Object.assign(new Error(r.error.issues[0]?.message ?? 'Datos inválidos.'), { issues: r.error.issues });
      clean = r.data as Record<string, unknown>;
      // Ayuda local de unicidad (el servidor es quien decide)
      const others = def.unique?.length
        ? await this.db.records
            .where('entity')
            .equals(entity)
            .filter((x) => !x.deleted && x.id !== recId)
            .toArray()
        : [];
      for (const u of def.unique ?? []) {
        const { campos, mensaje } = claveUnica(u, clean);
        if (others.some((x) => mismaClave(campos, x.data, clean!))) throw Object.assign(new Error(mensaje), { field: campos[campos.length - 1] });
      }
    }
    await this.db.transaction('rw', this.db.records, this.db.outbox, async () => {
      const key = `${entity}:${recId}`;
      const cur = await this.db.records.get(key);
      const m: Mutation = {
        mutationId: uuid(),
        entity,
        op,
        id: recId,
        baseVersion: cur?.server?.version ?? null,
        data: clean,
        createdAt: new Date().toISOString()
      };
      // Si ya hay una mutación pendiente para el mismo registro, la nueva la reemplaza (misma baseVersion).
      const prev = await this.db.outbox
        .where('id')
        .equals(recId)
        .filter((x) => x.entity === entity)
        .first();
      if (prev) {
        if (prev.op === 'upsert' && prev.baseVersion === null && op === 'delete') {
          // Creado y borrado sin conexión: nunca existió para el servidor.
          await this.db.outbox.delete(prev.seq!);
          await this.db.records.delete(key);
          return;
        }
        await this.db.outbox.update(prev.seq!, { op, data: clean, baseVersion: prev.baseVersion, createdAt: m.createdAt });
      } else await this.db.outbox.add(m);
      await this.db.records.put({
        key,
        entity,
        id: recId,
        version: cur?.version ?? 0,
        deleted: op === 'delete',
        data: { ...(cur?.data ?? {}), ...(clean ?? {}), id: recId },
        pending: true,
        server: cur?.server ?? null
      });
    });
    await this.refreshPending();
    void this.sync();
    return recId;
  }

  /** Sincroniza (push y luego pull). Llamadas concurrentes se unen a la que está en curso. */
  sync(): Promise<void> {
    if (!this.state.online && typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve();
    this.running ??= (async () => {
      this.set({ syncing: true, error: null });
      try {
        await this.flush();
        await this.pull();
        const now = new Date().toISOString();
        await this.db.meta.put({ key: 'lastSync', value: now });
        this.set({ lastSync: now, online: true, ready: true });
      } catch (e) {
        const err = e as Error & { status?: number };
        this.set({
          error: err.status === 401 ? 'Tu sesión expiró. Vuelve a iniciar sesión para sincronizar.' : null,
          online: err.status ? true : navigator.onLine
        });
      } finally {
        this.set({ syncing: false });
        await this.refreshPending();
        this.running = null;
      }
    })();
    return this.running;
  }

  private async api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`/api/${this.slug}/sync/${path}`, { ...init, headers: { 'content-type': 'application/json' }, cache: 'no-store' });
    if (!res.ok) throw Object.assign(new Error((await res.json().catch(() => ({}))).error ?? res.statusText), { status: res.status });
    return res.json() as Promise<T>;
  }

  private async flush() {
    for (;;) {
      const batch = await this.db.outbox.orderBy('seq').limit(50).toArray();
      if (!batch.length) return;
      const { results } = await this.api<PushResponse>('push', { method: 'POST', body: JSON.stringify({ mutations: batch }) });
      await this.db.transaction('rw', this.db.records, this.db.outbox, this.db.issues, async () => {
        for (const r of results) {
          const m = batch.find((x) => x.mutationId === r.mutationId);
          if (!m) continue;
          await this.db.outbox.delete(m.seq!);
          const key = `${m.entity}:${m.id}`;
          const stillPending = (await this.db.outbox.where('id').equals(m.id).count()) > 0;
          if (r.status === 'ok') await this.applyServer(r.record, stillPending);
          else {
            const cur = await this.db.records.get(key);
            const label = String(cur?.data.codigo ?? cur?.data.nombre ?? m.id.slice(0, 8));
            await this.db.issues.add({ entity: m.entity, recordId: m.id, kind: r.status, message: r.message, at: new Date().toISOString(), label });
            // Gana el servidor: se vuelve a su versión (o se quita si nunca existió).
            const srv = r.status === 'conflict' ? r.record : (cur?.server ?? null);
            if (srv) await this.applyServer(srv, false);
            else await this.db.records.delete(key);
          }
        }
      });
      if (batch.length < 50) return;
    }
  }

  private async applyServer(rec: SyncRecord, keepLocal: boolean) {
    const key = `${rec.entity}:${rec.id}`;
    if (keepLocal) {
      const cur = await this.db.records.get(key);
      if (cur) return this.db.records.put({ ...cur, server: rec, version: rec.version });
    }
    await this.db.records.put({ key, entity: rec.entity, id: rec.id, version: rec.version, deleted: rec.deleted, data: rec.data, pending: false, server: rec });
  }

  private async pull() {
    for (;;) {
      const cursor = (await this.db.meta.get('cursor'))?.value ?? '';
      const res = await this.api<PullResponse>(`pull?since=${encodeURIComponent(cursor)}`);
      await this.db.transaction('rw', this.db.records, this.db.outbox, this.db.meta, async () => {
        for (const rec of res.records) {
          const pend = (await this.db.outbox.where('id').equals(rec.id).count()) > 0;
          await this.applyServer(rec, pend);
        }
        await this.db.meta.put({ key: 'cursor', value: res.cursor });
      });
      if (!res.hasMore) return;
    }
  }

  async dismissIssue(id: number) {
    await this.db.issues.delete(id);
  }
}

export type { LocalRecord };
