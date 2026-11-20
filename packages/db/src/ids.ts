import { createHash } from 'node:crypto';

/**
 * UUID determinista (formato v8) a partir de la viña y una clave. Mismo origen → mismo id: el importador lo usa
 * para que reimportar actualice en vez de duplicar, y las reacciones para que un reintento no duplique movimientos.
 */
export function idDerivado(orgId: string, clave: string, espacio = 'winzer-v1'): string {
  const h = createHash('sha256').update(`${espacio}|${orgId}|${clave}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
