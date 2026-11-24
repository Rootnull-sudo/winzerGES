/**
 * Conciliación bancaria (F6-3) — port de js/integrations/recon.js y js/modules/conciliacion (v1).
 *
 *   Saldo según libros = saldo según extracto − pendientes del banco − diferencias + partidas en libros no en banco
 *
 * Diferencias con v1 (bugs corregidos):
 *  - Candidatos: cobros y pagos reales (parciales incluidos), no ventas o compras marcadas "pagado" (bug 3).
 *  - Un candidato se usa una sola vez (match estructurado, no un texto `matchRef`).
 *  - Una diferencia con match resta solo la diferencia, no el movimiento completo; la que genera un gasto financiero
 *    queda conciliada con ese gasto (v1 lo volvía a contar como "en libros no en banco").
 *  - Lo pagado en efectivo no es candidato (no pasa por el banco).
 *  - Montos de cartola con punto de miles ("1.395.000") se leen bien (v1 los leía como 1,395).
 */
import { z } from 'zod';
import { n } from '../num';

export const TIPOS_CUENTA = ['Cuenta corriente', 'Cuenta vista', 'Cuenta de ahorro', 'Línea de crédito'] as const;
export const ESTADOS_MOV_BANCO = [
  ['pendiente', 'Pendiente'],
  ['conciliado', 'Conciliado'],
  ['diferencia', 'Diferencia']
] as const;
export const MOTIVOS_DIFERENCIA = ['Comisión bancaria', 'Intereses a favor', 'Impuesto timbres', 'Error del banco', 'Error de registro'] as const;
export const ORIGENES_CONCILIACION: Record<string, string> = {
  cobro: 'Cobro',
  pago: 'Pago a proveedor',
  gasto: 'Gasto',
  remuneracion: 'Remuneración',
  honorario: 'Honorarios',
  pago_impuesto: 'Impuesto'
};

const fecha = z.iso.date('Fecha inválida.');
const texto = (max = 120) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const cuentaBancoInput = z.object({
  id: z.string().min(1).optional(),
  banco: z.string().trim().min(1, 'Indica el banco.').max(60),
  tipo: z.enum(TIPOS_CUENTA).default('Cuenta corriente'),
  numero: z.string().trim().min(1, 'Indica el número.').max(30),
  moneda: z.enum(['CLP', 'USD', 'EUR']).default('CLP'),
  fechaInicio: fecha,
  saldoInicial: z.coerce.number({ message: 'Ingresa el saldo.' }).int('Monto entero.')
});
export type CuentaBancoInput = z.input<typeof cuentaBancoInput>;

export const movManualInput = z.object({
  cuentaId: z.string().min(1),
  fecha,
  glosa: z.string().trim().min(1, 'Indica la glosa.').max(160),
  sentido: z.enum(['cargo', 'abono']),
  monto: z.coerce.number({ message: 'Ingresa el monto.' }).int('Monto entero.').positive('Debe ser mayor a 0.')
});
export type MovManualInput = z.input<typeof movManualInput>;

/** Columnas de la cartola, base 0 (la pantalla las muestra base 1 como v1). `monto` = columna única con signo. */
export const mapeoCartola = z.object({
  fecha: z.number().int().min(0),
  glosa: z.number().int().min(0),
  cargo: z.number().int().min(0).nullable().optional(),
  abono: z.number().int().min(0).nullable().optional(),
  monto: z.number().int().min(0).nullable().optional(),
  saltar: z.number().int().min(0).default(1)
});
export type MapeoCartola = z.input<typeof mapeoCartola>;

export const filaCartola = z.object({ fecha, glosa: z.string().max(160), monto: z.number().int() });
export const importarCartolaInput = z.object({
  cuentaId: z.string().min(1),
  archivo: texto(120),
  mapeo: mapeoCartola,
  filas: z.array(filaCartola).min(1, 'La cartola no tiene movimientos.').max(5000, 'Máximo 5.000 movimientos por cartola.')
});
export type ImportarCartolaInput = z.input<typeof importarCartolaInput>;

export const diferenciaInput = z.object({
  movId: z.string().min(1),
  motivo: z.string().trim().min(1, 'Indica el motivo.').max(80),
  crearGasto: z.preprocess((v) => v === true || v === 'true' || v === 'on', z.boolean()).default(false)
});
export type DiferenciaInput = z.input<typeof diferenciaInput>;

/* ---------- Cartola ---------- */

/** Parser CSV tolerante (v1: utils.parseCSV): detecta `;` o `,`, comillas y BOM. */
export function parseCsv(text: string): string[][] {
  const t = String(text).replace(/^﻿/, '');
  const first = t.split(/\r?\n/)[0] ?? '';
  const sep = (first.match(/;/g) ?? []).length >= (first.match(/,/g) ?? []).length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (inQ) {
      if (c === '"' && t[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cur);
      cur = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

/** dd/mm/aaaa, dd-mm-aa, dd.mm.aaaa o aaaa-mm-dd → aaaa-mm-dd (v1: recon.normFecha). '' si no se reconoce. */
export function normFecha(s: unknown): string {
  const x = String(s ?? '').trim();
  let m = x.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = x.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return `${y}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  }
  return '';
}

/**
 * Monto de una cartola chilena: "1.395.000", "$ 1.395.000", "-8.900", "1.234,50" o "1395000". v1 leía "1.395.000"
 * como 1,395 (el punto de miles se tomaba como decimal si no había coma).
 */
export function montoCartola(v: unknown): number {
  const s = String(v ?? '')
    .replace(/[$\s]/g, '')
    .trim();
  if (!s) return 0;
  if (s.includes(',')) return n(s);
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
  return n(s);
}

/** Filas de la cartola (v1: recon.parseCartola): monto = columna única, o abono − cargo. Sin fecha o en 0: fuera. */
export function parseCartola(text: string, map: MapeoCartola) {
  const m = mapeoCartola.parse(map);
  return parseCsv(text)
    .slice(m.saltar)
    .map((r) => {
      const monto =
        m.monto != null ? montoCartola(r[m.monto]) : montoCartola(m.abono != null ? r[m.abono] : 0) - montoCartola(m.cargo != null ? r[m.cargo] : 0);
      return { fecha: normFecha(r[m.fecha]), glosa: (r[m.glosa] ?? '').trim(), monto: Math.round(monto) };
    })
    .filter((r) => r.fecha && r.monto);
}

/** Huella de un movimiento: misma cuenta + fecha + monto + glosa = duplicado (v1 comparaba lo mismo al importar). */
export const huellaMov = (fecha: string, monto: number, glosa: string) => `${fecha}|${Math.round(monto)}|${glosa.trim().toLowerCase()}`;

/* ---------- Matching ---------- */

export interface Candidato {
  origenTipo: string;
  origenId: string;
  fecha: string;
  /** Con signo: + entra al banco, − sale. */
  monto: number;
  descripcion: string;
}
export interface MovBanco {
  id: string;
  fecha: string;
  monto: number;
  estado: string;
}

const dias = (a: string, b: string) => Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000));

/** Sugerencias (v1: recon.sugerencias): monto ±1 peso y fecha ±7 días; puntaje 1 − días/8, la más cercana primero. */
export function sugerencias<C extends Candidato>(mov: Pick<MovBanco, 'fecha' | 'monto'>, cands: readonly C[]): (C & { score: number; dias: number })[] {
  return cands
    .filter((c) => Math.abs(Math.round(c.monto) - Math.round(mov.monto)) <= 1)
    .map((c) => ({ c, d: dias(c.fecha, mov.fecha) }))
    .filter((x) => x.d <= 7)
    .sort((a, b) => a.d - b.d)
    .map((x) => ({ ...x.c, score: 1 - x.d / 8, dias: x.d }));
}

/**
 * Conciliación automática (v1: recon.autoConciliar): a cada movimiento pendiente, la mejor sugerencia si es única o
 * claramente mejor que la segunda. Cada candidato se usa una vez.
 */
export function autoConciliar<C extends Candidato>(movs: readonly MovBanco[], cands: readonly C[]): { mov: MovBanco; cand: C }[] {
  let libres = [...cands];
  const out: { mov: MovBanco; cand: C }[] = [];
  for (const m of movs) {
    if (m.estado !== 'pendiente') continue;
    const s = sugerencias(m, libres);
    if (s.length && (s.length === 1 || s[0]!.score > s[1]!.score)) {
      const elegido = libres.find((c) => c.origenTipo === s[0]!.origenTipo && c.origenId === s[0]!.origenId)!;
      out.push({ mov: m, cand: elegido });
      libres = libres.filter((c) => c !== elegido);
    }
  }
  return out;
}

/**
 * Resumen de una cuenta. `enTransito`: partidas en libros sin match desde el inicio de la cuenta (se suman solo
 * cuando la viña tiene una sola cuenta: un cobro o pago no dice por qué cuenta pasó).
 *   extracto = saldo inicial + Σ movimientos
 *   ajustes  = Σ diferencia de los movimientos en diferencia (sin match: el movimiento completo)
 *   libros   = extracto − pendientes − ajustes + girados + depósitos en tránsito
 */
export function resumenCuenta(
  saldoInicial: number,
  movs: readonly (MovBanco & { diferencia?: number | null })[],
  enTransito: readonly Pick<Candidato, 'monto'>[] = []
) {
  const extracto = saldoInicial + movs.reduce((s, m) => s + m.monto, 0);
  const pend = movs.filter((m) => m.estado === 'pendiente');
  const difs = movs.filter((m) => m.estado === 'diferencia');
  const pendientes = pend.reduce((s, m) => s + m.monto, 0);
  const ajustes = difs.reduce((s, m) => s + (m.diferencia ?? m.monto), 0);
  const girados = enTransito.filter((c) => c.monto < 0).reduce((s, c) => s + c.monto, 0);
  const depositos = enTransito.filter((c) => c.monto > 0).reduce((s, c) => s + c.monto, 0);
  return {
    extracto,
    pendientes,
    ajustes,
    girados,
    depositos,
    libros: extracto - pendientes - ajustes + girados + depositos,
    conciliados: movs.filter((m) => m.estado === 'conciliado').length,
    nPendientes: pend.length,
    nDiferencias: difs.length,
    total: movs.length
  };
}

/** Movimiento bancario de un respaldo v1 (importador). */
export const movBancoV1Input = z
  .object({
    id: z.string().min(1),
    cuentaId: z.string().min(1),
    fecha: z.preprocess((v) => normFecha(v), fecha),
    glosa: z.preprocess((v) => String(v ?? '').trim() || 'Sin glosa', z.string().max(160)),
    monto: z.preprocess((v) => Math.round(n(v)), z.number().int()),
    estado: z.enum(['pendiente', 'conciliado', 'diferencia']).catch('pendiente')
  })
  .passthrough();
