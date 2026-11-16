/**
 * data/db.js — Capa de datos. IndexedDB (preferido) con respaldo en localStorage.
 *
 * Diseño:
 *  - Todos los registros viven en un único object store `records` (keyPath `id`),
 *    con un índice por entidad (`_e`). Esto permite agregar entidades nuevas
 *    sin subir la versión de la base IndexedDB.
 *  - Al iniciar se carga todo a una caché en memoria; las lecturas son
 *    síncronas (rápidas para cálculos) y las escrituras se persisten en segundo plano.
 *  - Cada escritura valida permisos (no solo en la UI), registra auditoría si la
 *    entidad es sensible y emite eventos `data.saved` / `<entidad>.saved`.
 *  - Migraciones: cada registro guarda `_v` (versión de esquema). Si
 *    schema.js declara una versión mayor, se aplican las migraciones en orden.
 */
(function (VG) {
  'use strict';
  const U = VG.utils;
  const DB_NAME = 'vina-gestion';
  const DB_VERSION = 1;

  let idb = null;                // conexión IndexedDB
  let backend = 'indexeddb';     // o 'localstorage'
  const cache = new Map();       // entidad -> Map(id -> registro)
  const meta = {};

  class PermissionError extends Error { constructor(m) { super(m); this.name = 'PermissionError'; } }
  class ValidationError extends Error { constructor(m, field) { super(m); this.name = 'ValidationError'; this.field = field; } }

  function bucket(entity) {
    if (!cache.has(entity)) cache.set(entity, new Map());
    return cache.get(entity);
  }

  function openIDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('Sin IndexedDB'));
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { return reject(e); }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('records')) {
          const s = db.createObjectStore('records', { keyPath: 'id' });
          s.createIndex('entity', '_e', { unique: false });
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB bloqueada'));
    });
  }

  function idbAll(store) {
    return new Promise((res, rej) => {
      const tx = idb.transaction(store, 'readonly');
      const s = tx.objectStore(store);
      if (store === 'meta') {
        const out = {}; const rq = s.openCursor();
        rq.onsuccess = () => { const c = rq.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
        rq.onerror = () => rej(rq.error);
      } else {
        const rq = s.getAll(); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
      }
    });
  }

  function idbWrite(store, ops) {
    return new Promise((res, rej) => {
      const tx = idb.transaction(store, 'readwrite');
      const s = tx.objectStore(store);
      ops.forEach(op => op.del ? s.delete(op.key) : (store === 'meta' ? s.put(op.value, op.key) : s.put(op.value)));
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  }

  // ---- respaldo localStorage ----
  const LS = {
    load() {
      const recs = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith('vg:e:')) { try { recs.push(...JSON.parse(localStorage.getItem(k))); } catch (e) { } }
      }
      let m = {}; try { m = JSON.parse(localStorage.getItem('vg:meta') || '{}'); } catch (e) { }
      return { recs, m };
    },
    saveEntity(entity) {
      try { localStorage.setItem('vg:e:' + entity, JSON.stringify(Array.from(bucket(entity).values()))); }
      catch (e) { VG.ui && VG.ui.toast('El almacenamiento local está lleno. Exporta un respaldo y limpia datos antiguos.', 'error'); }
    },
    saveMeta() { localStorage.setItem('vg:meta', JSON.stringify(meta)); }
  };

  async function persist(entity, recs, deletes = []) {
    if (backend === 'indexeddb') {
      const ops = recs.map(r => ({ value: r })).concat(deletes.map(id => ({ del: true, key: id })));
      try { await idbWrite('records', ops); }
      catch (e) { console.error(e); VG.ui && VG.ui.toast('No se pudo guardar en el navegador. Revisa el espacio disponible.', 'error'); }
    } else LS.saveEntity(entity);
  }

  /** Aplica migraciones pendientes a todos los registros. */
  async function migrate() {
    const changed = [];
    for (const [entity, map] of cache) {
      const def = VG.schema.get(entity);
      if (!def) continue;
      for (const r of map.values()) {
        let v = r._v || 1;
        if (v >= def.version) continue;
        let rec = r;
        while (v < def.version) {
          v++;
          const fn = def.migrations[v];
          if (fn) rec = fn(Object.assign({}, rec));
        }
        rec._v = def.version;
        map.set(rec.id, rec);
        changed.push(rec);
      }
    }
    if (changed.length) {
      U.log('Migraciones aplicadas a', changed.length, 'registros');
      if (backend === 'indexeddb') await idbWrite('records', changed.map(r => ({ value: r })));
      else new Set(changed.map(r => r._e)).forEach(e => LS.saveEntity(e));
      VG.events.emit('db.migrated', { count: changed.length });
    }
    await DB.setMeta('schemaVersions', VG.schema.versions());
    return changed.length;
  }

  function checkPermission(entity, action, opts) {
    if (opts && opts.system) return;
    if (!VG.auth || !VG.auth.current()) return;
    const def = VG.schema.get(entity);
    if (!def) return;
    if (!VG.auth.can(def.module, action)) {
      const verbos = { c: 'crear', e: 'editar', d: 'eliminar' };
      throw new PermissionError(`Tu rol no tiene permiso para ${verbos[action] || action} registros de "${def.label}". Pide acceso a un administrador.`);
    }
  }

  function audit(entity, action, rec, before) {
    const def = VG.schema.get(entity);
    if (!def || !def.sensitive || entity === 'auditoria') return;
    const user = VG.auth && VG.auth.current();
    const changes = [];
    if (before && rec) Object.keys(rec).forEach(k => { if (!k.startsWith('_') && k !== 'updatedAt' && JSON.stringify(rec[k]) !== JSON.stringify(before[k])) changes.push(k); });
    const a = {
      id: U.uid('au_'), _e: 'auditoria', _v: 1,
      fecha: new Date().toISOString(), usuarioId: user ? user.id : 'sistema', usuario: user ? user.nombre : 'Sistema',
      accion: action, entidad: entity, entidadLabel: def.label, registroId: rec ? rec.id : null,
      descripcion: rec ? String(def.display(rec) ?? '') : '', campos: changes.join(', ')
    };
    bucket('auditoria').set(a.id, a);
    persist('auditoria', [a]);
  }

  const DB = {
    PermissionError, ValidationError,
    /** Contador que sube con cada escritura (usado para memoización). */
    version: 0,
    get backend() { return backend; },

    async init() {
      try {
        idb = await openIDB();
        backend = 'indexeddb';
        const [recs, m] = await Promise.all([idbAll('records'), idbAll('meta')]);
        recs.forEach(r => bucket(r._e).set(r.id, r));
        Object.assign(meta, m);
      } catch (e) {
        console.warn('IndexedDB no disponible, usando localStorage', e);
        backend = 'localstorage';
        const { recs, m } = LS.load();
        recs.forEach(r => bucket(r._e).set(r.id, r));
        Object.assign(meta, m);
      }
      await migrate();
      DB.version++;
      // Pide al navegador que no borre estos datos aunque falte espacio en disco
      try { if (navigator.storage && navigator.storage.persist) DB.persisted = await navigator.storage.persist(); } catch (e) { DB.persisted = false; }
      U.log('DB lista', backend, 'registros:', DB.count(), 'persistente:', DB.persisted);
    },

    /** Lista registros de una entidad (opcionalmente filtrados). No mutar el resultado directamente. */
    list(entity, filter) {
      const arr = Array.from(bucket(entity).values());
      return filter ? arr.filter(filter) : arr;
    },
    get(entity, id) { return id ? bucket(entity).get(id) || null : null; },
    /** Primer registro de una entidad (para singletons como config). */
    one(entity) { return bucket(entity).values().next().value || null; },
    count(entity) {
      if (entity) return bucket(entity).size;
      let n = 0; cache.forEach(m => n += m.size); return n;
    },
    find(entity, pred) { for (const r of bucket(entity).values()) if (pred(r)) return r; return null; },

    /**
     * Crea o actualiza un registro.
     * @param {string} entity
     * @param {object} data — si trae `id` existente, se actualiza
     * @param {{system?:boolean, silent?:boolean}} [opts] system: omite permisos (seed, migraciones)
     * @returns {Promise<object>} registro guardado
     */
    async save(entity, data, opts = {}) {
      const map = bucket(entity);
      const before = data.id ? map.get(data.id) : null;
      checkPermission(entity, before ? 'e' : 'c', opts);
      const user = VG.auth && VG.auth.current();
      const now = new Date().toISOString();
      const def = VG.schema.get(entity);
      const rec = Object.assign({}, before || {}, data, {
        id: data.id || U.uid(entity.slice(0, 3) + '_'),
        _e: entity, _v: def ? def.version : 1,
        updatedAt: now,
        createdAt: (before && before.createdAt) || data.createdAt || now,
        createdBy: (before && before.createdBy) || data.createdBy || (user ? user.id : 'sistema')
      });
      if (user) rec.updatedBy = user.id;
      map.set(rec.id, rec);
      DB.version++;
      await persist(entity, [rec]);
      if (!opts.system) audit(entity, before ? 'editar' : 'crear', rec, before);
      if (!opts.silent) {
        VG.events.emit('data.saved', { entity, record: rec, isNew: !before });
        VG.events.emit(entity + '.saved', { record: rec, isNew: !before, before });
      }
      return rec;
    },

    /** Guarda muchos registros en una sola transacción (sin eventos por registro). */
    async saveMany(entity, list, opts = {}) {
      const map = bucket(entity);
      const def = VG.schema.get(entity);
      const now = new Date().toISOString();
      const out = list.map(d => {
        const r = Object.assign({}, map.get(d.id) || {}, d, { id: d.id || U.uid(entity.slice(0, 3) + '_'), _e: entity, _v: def ? def.version : 1, updatedAt: now, createdAt: d.createdAt || now });
        map.set(r.id, r); return r;
      });
      DB.version++;
      await persist(entity, out);
      if (!opts.silent) VG.events.emit('data.saved', { entity, many: true });
      return out;
    },

    async remove(entity, id, opts = {}) {
      checkPermission(entity, 'd', opts);
      const map = bucket(entity);
      const rec = map.get(id);
      if (!rec) return;
      map.delete(id);
      DB.version++;
      await persist(entity, [], [id]);
      if (!opts.system) audit(entity, 'eliminar', rec);
      VG.events.emit('data.removed', { entity, id, record: rec });
      VG.events.emit(entity + '.removed', { id, record: rec });
    },

    /* ---- meta (clave/valor) ---- */
    getMeta(k, def) { return k in meta ? meta[k] : def; },
    async setMeta(k, v) {
      meta[k] = v;
      if (backend === 'indexeddb') await idbWrite('meta', [{ key: k, value: v }]);
      else LS.saveMeta();
    },

    /* ---- respaldo ---- */
    dump() {
      const data = {};
      cache.forEach((m, e) => { data[e] = Array.from(m.values()); });
      return { app: 'vina-gestion', version: VG.VERSION, exportedAt: new Date().toISOString(), schema: VG.schema.versions(), meta: Object.assign({}, meta), data };
    },
    /** Reemplaza todo el contenido con un respaldo (dump). */
    async load(dump) {
      if (!dump || dump.app !== 'vina-gestion' || !dump.data) throw new ValidationError('El archivo no es un respaldo válido de este sistema.');
      await DB.clearAll(true);
      for (const [entity, recs] of Object.entries(dump.data)) {
        recs.forEach(r => { r._e = entity; bucket(entity).set(r.id, r); });
        if (backend === 'indexeddb' && recs.length) await idbWrite('records', recs.map(r => ({ value: r })));
        else LS.saveEntity(entity);
      }
      for (const [k, v] of Object.entries(dump.meta || {})) await DB.setMeta(k, v);
      await migrate();
      DB.version++;
      VG.events.emit('db.restored', {});
    },
    /** Borra todo (keepMeta=false borra también preferencias). */
    async clearAll(keepMeta = false) {
      cache.clear();
      DB.version++;
      if (backend === 'indexeddb') {
        await new Promise((res, rej) => { const tx = idb.transaction(['records', 'meta'], 'readwrite'); tx.objectStore('records').clear(); if (!keepMeta) tx.objectStore('meta').clear(); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
      } else {
        Object.keys(localStorage).filter(k => k.startsWith('vg:e:') || (!keepMeta && k === 'vg:meta')).forEach(k => localStorage.removeItem(k));
      }
      if (!keepMeta) Object.keys(meta).forEach(k => delete meta[k]);
    },
    /** Elimina solo los registros marcados como demo (`_demo: true`). */
    async clearDemo() {
      let n = 0;
      for (const [entity, map] of cache) {
        if (entity === 'config') continue; // la configuración de la empresa nunca se borra
        const ids = Array.from(map.values()).filter(r => r._demo).map(r => r.id);
        ids.forEach(id => map.delete(id));
        n += ids.length;
        if (ids.length) await persist(entity, [], ids);
      }
      // Si la empresa ficticia reemplazó a la del usuario, se restaura la que tenía antes
      const cfg = DB.get('config', 'main');
      if (cfg && (DB.getMeta('configDemo') || cfg._demo)) {
        const prev = DB.getMeta('empresaPrevia', null);
        const rec = Object.assign({}, cfg, { _demo: false });
        if (prev) rec.empresa = prev; else delete rec.empresa;
        bucket('config').set(rec.id, rec);
        await persist('config', [rec]);
        await DB.setMeta('configDemo', false);
        await DB.setMeta('empresaPrevia', null);
      }
      DB.version++;
      VG.events.emit('data.saved', { entity: '*', many: true });
      return n;
    },
    hasDemo() { for (const m of cache.values()) for (const r of m.values()) if (r._demo) return true; return false; },
    entities() { return Array.from(cache.keys()); }
  };

  VG.db = DB;
})(window.VG);
