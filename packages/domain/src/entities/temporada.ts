/**
 * Temporada vitivinícola (ADR 0011). Se nombra por el año de la vendimia: la temporada 2026 va del
 * 1 de julio de 2025 al 30 de junio de 2026 (poda, brotación y crecimiento en 2025, cosecha en marzo–abril de 2026).
 *
 * La temporada "actual" no se guarda: se deriva de la fecha de hoy (`temporadaActual`). Así no hay que
 * mantener una marca única por viña ni reaccionar al cambiar de temporada.
 */
import { z } from 'zod';

export const ESTADOS_TEMPORADA = ['abierta', 'cerrada'] as const;
export type EstadoTemporada = (typeof ESTADOS_TEMPORADA)[number];

export interface TemporadaRango {
  anio: number;
  /** ISO yyyy-mm-dd, inclusive. */
  inicio: string;
  /** ISO yyyy-mm-dd, inclusive. */
  fin: string;
  estado?: EstadoTemporada;
}

/** Mes (1–12) en que empieza la temporada por defecto. */
const MES_INICIO = 7;

/** Fecha de hoy (yyyy-mm-dd) en Chile continental, para que el cambio de temporada no dependa del huso del servidor. */
export function fechaHoy(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(now);
}

/** Rango por defecto de la temporada `anio`: (anio − 1)-07-01 a anio-06-30. */
export function rangoPorDefecto(anio: number): TemporadaRango {
  return { anio, inicio: `${anio - 1}-07-01`, fin: `${anio}-06-30` };
}

/** Año de la temporada por defecto que contiene `fecha` (julio en adelante → año siguiente). */
export function anioDeFecha(fecha: string): number {
  const [y, m] = fecha.split('-').map(Number);
  return m! >= MES_INICIO ? y! + 1 : y!;
}

/** Temporada registrada que contiene `fecha` (las fechas ISO se comparan como texto). */
export function temporadaDeFecha<T extends TemporadaRango>(temporadas: readonly T[], fecha: string): T | undefined {
  return temporadas.find((t) => t.inicio <= fecha && fecha <= t.fin);
}

/**
 * Temporada actual: la que contiene `hoy`; si ninguna, la más reciente que ya empezó; si ninguna empezó,
 * la más antigua. `undefined` si la viña no tiene temporadas.
 */
export function temporadaActual<T extends TemporadaRango>(temporadas: readonly T[], hoy: string): T | undefined {
  const dentro = temporadaDeFecha(temporadas, hoy);
  if (dentro) return dentro;
  const orden = [...temporadas].sort((a, b) => a.anio - b.anio);
  return orden.filter((t) => t.inicio <= hoy).at(-1) ?? orden[0];
}

/**
 * Temporada elegida para una vista: el parámetro `?t=` si es una temporada de la viña; si no, la actual.
 * Sin temporadas registradas devuelve el rango por defecto del año de `hoy`, para que los filtros siempre funcionen.
 */
export function elegirTemporada<T extends TemporadaRango>(temporadas: readonly T[], param: string | null | undefined, hoy: string): T | TemporadaRango {
  const anio = Number(param);
  const pedida = Number.isInteger(anio) ? temporadas.find((t) => t.anio === anio) : undefined;
  return pedida ?? temporadaActual(temporadas, hoy) ?? rangoPorDefecto(anioDeFecha(hoy));
}

/** Dos temporadas se solapan si alguna fecha está en ambas. */
export function seSolapan(a: TemporadaRango, b: TemporadaRango): boolean {
  return a.inicio <= b.fin && b.inicio <= a.fin;
}

export const temporadaInput = z
  .object({
    id: z.string().min(1).optional(),
    anio: z.coerce.number().int('El año es un número entero.').min(1990, 'Año fuera de rango.').max(2100, 'Año fuera de rango.'),
    inicio: z.iso.date('Fecha de inicio inválida.'),
    fin: z.iso.date('Fecha de término inválida.'),
    estado: z.enum(ESTADOS_TEMPORADA).default('abierta')
  })
  .refine((t) => t.inicio < t.fin, { message: 'El término debe ser posterior al inicio.', path: ['fin'] })
  .refine((t) => t.inicio.slice(0, 4) <= String(t.anio) && String(t.anio) <= t.fin.slice(0, 4), {
    message: 'El año de la temporada debe estar dentro de sus fechas.',
    path: ['anio']
  });
export type TemporadaInput = z.input<typeof temporadaInput>;
export type Temporada = z.output<typeof temporadaInput> & { id: string };
