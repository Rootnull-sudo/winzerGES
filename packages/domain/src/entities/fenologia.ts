/**
 * Desborre, fenología y clima — port de js/modules/fenologia (v1).
 * Diferencia con v1 (bug corregido): los grados día se acumulan solo del 1 de septiembre al 30 de abril, como dice
 * la propia pantalla de v1; v1 sumaba todos los registros de la temporada.
 */
import { z } from 'zod';
import { n } from '../num';
import { gradosDia } from '../oenology';

/** Estados fenológicos BBCH (v1: fenologia/index.js:9, mismos textos). */
export const BBCH = [
  'BBCH 00 — Yema dormida',
  'BBCH 05 — Yema algodonosa',
  'BBCH 07 — Inicio desborre',
  'BBCH 09 — Desborre (punta verde)',
  'BBCH 15 — 5 hojas',
  'BBCH 53 — Racimos visibles',
  'BBCH 61 — Inicio floración',
  'BBCH 65 — Plena floración',
  'BBCH 71 — Cuaja',
  'BBCH 77 — Cierre de racimo',
  'BBCH 81 — Inicio envero',
  'BBCH 85 — Ablandamiento',
  'BBCH 89 — Cosecha'
] as const;

/** Normaliza un BBCH de v1 (el seed escribía "BBCH 89 — cosecha" en minúscula). */
export function normalizarBBCH(v: unknown): string | null {
  if (!v) return null;
  return BBCH.find((b) => b.toLowerCase() === String(v).trim().toLowerCase()) ?? null;
}

const fechaOpt = z.preprocess((v) => v || null, z.iso.date('Fecha inválida.').nullable()).optional();
const textoOpt = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .nullable()
  .transform((v) => v || null);

export const fenologiaInput = z
  .object({
    id: z.string().min(1).optional(),
    cuartelId: z.string().min(1, 'Elige el cuartel.'),
    temporadaId: z.string().min(1, 'Elige la temporada.'),
    desborreInicio: z.iso.date('Ingresa el inicio del desborre.'),
    desborre50: fechaOpt,
    desborreFin: fechaOpt,
    bbch: z.preprocess((v) => normalizarBBCH(v), z.enum(BBCH).nullable()).optional(),
    floracion: fechaOpt,
    envero: fechaOpt,
    observaciones: textoOpt
  })
  .refine((f) => !f.desborre50 || f.desborre50 >= f.desborreInicio, { message: 'El 50% no puede ser anterior al inicio.', path: ['desborre50'] })
  .refine((f) => !f.desborreFin || f.desborreFin >= (f.desborre50 ?? f.desborreInicio), {
    message: 'El fin no puede ser anterior al 50% ni al inicio.',
    path: ['desborreFin']
  });
export type FenologiaInput = z.input<typeof fenologiaInput>;
export type Fenologia = z.output<typeof fenologiaInput> & { id: string };

export const climaInput = z
  .object({
    id: z.string().min(1).optional(),
    fecha: z.iso.date('Fecha inválida.'),
    temporadaId: z.string().min(1, 'No hay temporada para esa fecha.'),
    tmax: z.coerce.number({ message: 'Ingresa la máxima.' }).min(-10, 'Máxima fuera de rango (−10 a 50 °C).').max(50, 'Máxima fuera de rango (−10 a 50 °C).'),
    tmin: z.coerce.number({ message: 'Ingresa la mínima.' }).min(-15, 'Mínima fuera de rango (−15 a 40 °C).').max(40, 'Mínima fuera de rango (−15 a 40 °C).'),
    estacion: z
      .string()
      .trim()
      .max(80)
      .optional()
      .nullable()
      .transform((v) => v || null)
  })
  .refine((c) => c.tmin <= c.tmax, { message: 'La mínima no puede superar la máxima.', path: ['tmin'] });
export type ClimaInput = z.input<typeof climaInput>;
export type Clima = z.output<typeof climaInput> & { id: string };

/** Días desde el 1 de julio anterior (v1: `doy`), para comparar fechas de distintas temporadas. */
export function doyTemporada(fecha: string | null | undefined): number | null {
  if (!fecha) return null;
  const [y, m] = fecha.split('-').map(Number);
  const inicio = Date.UTC(m! >= 7 ? y! : y! - 1, 6, 1);
  return Math.round((Date.parse(`${fecha}T00:00:00Z`) - inicio) / 86_400_000);
}

/** Duración del desborre en días (inicio → fin). */
export const duracionDesborre = (f: { desborreInicio?: string | null; desborreFin?: string | null }) =>
  f.desborreInicio && f.desborreFin ? Math.round((Date.parse(f.desborreFin) - Date.parse(f.desborreInicio)) / 86_400_000) : null;

/** GD de un día: max(0, (Tmáx + Tmín)/2 − Tbase). */
export const gdDia = (tmax: unknown, tmin: unknown, base: number) => Math.max(0, (n(tmax) + n(tmin)) / 2 - base);

/** Meses del período de grados día (septiembre a abril), en orden. */
export const MESES_GD = [
  ['09', 'Sep'],
  ['10', 'Oct'],
  ['11', 'Nov'],
  ['12', 'Dic'],
  ['01', 'Ene'],
  ['02', 'Feb'],
  ['03', 'Mar'],
  ['04', 'Abr']
] as const;
const EN_PERIODO = new Set<string>(MESES_GD.map((m) => m[0]));

/** Registros dentro del período de grados día (1 sep – 30 abr). */
export const enPeriodoGD = <T extends { fecha: string }>(rs: readonly T[]) => rs.filter((r) => EN_PERIODO.has(r.fecha.slice(5, 7)));

/**
 * Grados día de una temporada: total del período y acumulado al último registro de cada mes (null si el mes no
 * tiene registros, igual que el gráfico de v1).
 */
export function gdTemporada(registros: readonly { fecha: string; tmax: unknown; tmin: unknown }[], base: number) {
  const rs = enPeriodoGD(registros).sort((a, b) => a.fecha.localeCompare(b.fecha));
  let acc = 0;
  const porMes: Record<string, number> = {};
  for (const r of rs) {
    acc += gdDia(r.tmax, r.tmin, base);
    porMes[r.fecha.slice(5, 7)] = acc;
  }
  return { total: gradosDia(rs, base), porMes: MESES_GD.map(([m]) => porMes[m] ?? null) };
}

/** Región de Winkler según los grados día (cortes de v1). */
export function regionWinkler(gd: number): string {
  return gd < 1390 ? 'Región I (fría)' : gd < 1670 ? 'Región II' : gd < 1940 ? 'Región III' : gd < 2220 ? 'Región IV' : 'Región V (cálida)';
}
