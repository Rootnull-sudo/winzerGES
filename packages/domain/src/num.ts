/**
 * Utilidades numéricas y de RUT, portadas de js/core/utils.js (v1) sin dependencias del DOM.
 */

/** Número seguro: acepta strings con coma decimal ("1.234,5"); devuelve 0 si no es número. */
export function n(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v);
  const x = parseFloat(s.replace(/\./g, (m) => (s.includes(',') ? '' : m)).replace(',', '.'));
  return Number.isFinite(x) ? x : 0;
}

export function sum<T>(arr: readonly T[], fn?: (x: T) => unknown): number {
  return arr.reduce((a, x) => a + n(fn ? fn(x) : x), 0);
}

export function groupBy<T>(arr: readonly T[], fn: (x: T) => string | number): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const x of arr) (out[String(fn(x))] ??= []).push(x);
  return out;
}

/** Fechas ISO YYYY-MM-DD: diferencia en días (b − a). */
export function diffDays(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const x = Date.parse(a.slice(0, 10) + 'T00:00:00Z');
  const y = Date.parse(b.slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return Math.round((y - x) / 86_400_000);
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------- RUT chileno ---------- */

export function rutClean(r: unknown): string {
  return String(r ?? '')
    .replace(/[^0-9kK]/g, '')
    .toUpperCase();
}

/** Dígito verificador (módulo 11). */
export function rutDV(body: string | number): string {
  const b = String(body);
  let s = 0;
  let m = 2;
  for (let i = b.length - 1; i >= 0; i--) {
    s += Number(b[i]) * m;
    m = m === 7 ? 2 : m + 1;
  }
  const r = 11 - (s % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}

export function rutValid(r: unknown): boolean {
  const c = rutClean(r);
  if (c.length < 2) return false;
  const body = c.slice(0, -1);
  if (!/^\d+$/.test(body)) return false;
  return rutDV(body) === c.slice(-1);
}

/** 12345678-5 → 12.345.678-5 */
export function rutFormat(r: string): string {
  const c = rutClean(r);
  if (c.length < 2) return r || '';
  return c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + c.slice(-1);
}

const nfCLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const nf0 = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const clp = (v: unknown) => nfCLP.format(Math.round(n(v)));
export const int = (v: unknown) => nf0.format(n(v));
export const dec2 = (v: unknown) => nf2.format(n(v));
