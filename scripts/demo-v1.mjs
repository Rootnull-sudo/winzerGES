#!/usr/bin/env node
/**
 * Genera el respaldo demo COMPLETO de v1 (F7-4): ejecuta js/data/seed.js en una VM de Node con una base en memoria
 * equivalente a js/data/db.js (sin IndexedDB) y escribe el respaldo en el formato de exportación de v1
 * (`{ app: 'vina-gestion', data: { entidad: [...] } }`). Los ids y fechas de sistema son deterministas para que el
 * archivo no cambie entre ejecuciones. Datos ficticios del demo de v1 (RUT, nombres y montos inventados).
 *
 *   node scripts/demo-v1.mjs [salida]   (por defecto packages/db/test/fixtures/demo-v1.json)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const salida = resolve(process.argv[2] ?? join(ROOT, 'packages/db/test/fixtures/demo-v1.json'));

const VG = {};
// Reloj fijo: `new Date()` y `Date.now()` sin argumentos devuelven siempre el mismo instante (p. ej. la hora de firma
// del XML), para que el respaldo sea idéntico entre ejecuciones.
const FIJO = Date.parse('2026-11-15T12:00:00.000Z');
class DateFija extends Date {
  constructor(...a) {
    super(...(a.length ? a : [FIJO]));
  }
  static now() {
    return FIJO;
  }
}
const ctx = vm.createContext({
  window: { VG, crypto: globalThis.crypto },
  location: { search: '', protocol: 'http:', hash: '' },
  navigator: { userAgent: 'node' },
  console,
  Intl,
  URLSearchParams,
  Date: DateFija,
  Math,
  setTimeout,
  structuredClone
});
const cargar = (f) => vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f });

// Base en memoria con la misma interfaz que usa seed.js.
const tablas = new Map();
const meta = new Map();
const bucket = (e) => (tablas.has(e) ? tablas.get(e) : tablas.set(e, new Map()).get(e));
let n = 0;
const AHORA = '2026-11-15T12:00:00.000Z';
VG.db = {
  version: 0,
  get: (e, id) => bucket(e).get(id) ?? null,
  list: (e, fn) => [...bucket(e).values()].filter(fn ?? (() => true)),
  find: (e, fn) => [...bucket(e).values()].find(fn) ?? null,
  count: (e, fn) => [...bucket(e).values()].filter(fn ?? (() => true)).length,
  getMeta: (k) => meta.get(k) ?? null,
  setMeta: async (k, v) => void meta.set(k, v),
  async save(e, d) {
    const prev = d.id ? bucket(e).get(d.id) : null;
    const r = {
      ...(prev ?? {}),
      ...d,
      id: d.id || `${e.slice(0, 3)}_${(++n).toString(36)}`,
      _e: e,
      updatedAt: AHORA,
      createdAt: prev?.createdAt ?? d.createdAt ?? AHORA
    };
    bucket(e).set(r.id, r);
    VG.db.version++;
    return r;
  },
  async saveMany(e, list) {
    const out = [];
    for (const d of list) out.push(await VG.db.save(e, d));
    return out;
  }
};
VG.events = { emit: () => {}, on: () => () => {} };
VG.auth = { current: () => null, hashPin: async () => 'pin-demo', can: () => true };

cargar('js/core/utils.js');
// Ids deterministas (seed.js usa U.uid en algunos registros).
VG.utils.uid = (prefix = '') => `${prefix}${(++n).toString(36)}`;
VG.utils.today = () => '2026-11-15';
VG.utils.memo = (_k, fn) => fn();
for (const f of [
  'js/core/store.js',
  'js/data/schema.js',
  'js/calc/oenology.js',
  'js/calc/tax.js',
  'js/calc/inventory.js',
  'js/calc/financial.js',
  'js/integrations/dte.js',
  'js/integrations/recon.js',
  'js/data/seed.js'
])
  cargar(f);
VG.store.state.season = 2026;
VG.VERSION = 'demo';

await VG.seed.load();

const data = Object.fromEntries([...tablas.entries()].filter(([, m]) => m.size).map(([e, m]) => [e, [...m.values()]]));
mkdirSync(dirname(salida), { recursive: true });
writeFileSync(salida, JSON.stringify({ app: 'vina-gestion', version: 'demo', exportedAt: AHORA, data }, null, 1) + '\n');
console.log(`✓ Respaldo demo de v1: ${Object.values(data).reduce((s, l) => s + l.length, 0)} registros en ${Object.keys(data).length} entidades → ${salida}`);
