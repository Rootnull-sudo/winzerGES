/**
 * Carga los scripts de v1 (js/core/utils.js, js/calc/*.js) en una VM de Node con un `window`
 * mínimo, para comparar resultados v1 vs v2 con los mismos datos (tests de paridad).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { DEFAULT_CONFIG } from '../src/config';

const ROOT = resolve(__dirname, '../../..');

export function loadLegacy(files: string[], config = DEFAULT_CONFIG, data: Record<string, unknown[]> = {}) {
  const VG: Record<string, any> = {};
  const ctx = vm.createContext({
    window: { VG, crypto: globalThis.crypto },
    location: { search: '', protocol: 'http:' },
    navigator: { userAgent: 'node' },
    console,
    Intl,
    URLSearchParams,
    Date,
    Math
  });
  for (const f of ['js/core/utils.js', ...files]) vm.runInContext(readFileSync(resolve(ROOT, f), 'utf8'), ctx, { filename: f });
  VG.store = { config: () => config, state: { season: 2026 } };
  VG.db = {
    list: (e: string, fn?: (r: any) => boolean) => (data[e] ?? []).filter(fn ?? (() => true)),
    find: (e: string, fn: (r: any) => boolean) => (data[e] ?? []).find(fn) ?? null,
    get: (e: string, id: string) => (data[e] ?? []).find((r: any) => r.id === id) ?? null
  };
  return VG;
}
