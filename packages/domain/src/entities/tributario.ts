/**
 * F29, PPM, pagos de impuesto y calendario (F6-2) — port de js/calc/tax.js (remanente, ppmAnual, calendario) y
 * js/modules/tributario (v1). La renta (IDPC) va en F7-2, con el estado de resultados.
 *
 * Diferencias con v1 (bugs corregidos):
 *  - Un F29 declarado o pagado queda congelado: su foto no se recalcula (v1 la sobrescribía en cada cambio de estado
 *    y el remanente de los meses siguientes cambiaba solo).
 *  - Volver de "pagado" quita los pagos de impuesto creados y reabre la obligación (v1 los dejaba).
 *  - El remanente se encadena mes a mes sin recursión (v1 recursivo, memorizado por versión de la base).
 */
import { z } from 'zod';
import type { OrgConfig } from '../config';
import { n } from '../num';
import { f29, type F29Input } from '../tax';

type Trib = OrgConfig['tributario'];
export type ResultadoF29 = ReturnType<typeof f29>;

export const ESTADOS_F29 = [
  ['borrador', 'Borrador'],
  ['revisado', 'Revisado por contador'],
  ['declarado', 'Declarado'],
  ['pagado', 'Pagado']
] as const;
export type EstadoF29 = (typeof ESTADOS_F29)[number][0];
/** Estados en que la foto del F29 queda congelada. */
export const F29_CERRADO: readonly string[] = ['declarado', 'pagado'];

const periodo = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Período inválido (AAAA-MM).');
const fecha = z.iso.date('Fecha inválida.');
const texto = (max = 40) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const f29EstadoInput = z
  .object({
    periodo,
    estado: z.enum(['borrador', 'revisado', 'declarado', 'pagado']),
    folioSii: texto(20),
    fechaPago: fecha
      .optional()
      .nullable()
      .or(z.literal('').transform(() => null))
  })
  .refine((x) => x.estado !== 'pagado' || !!x.fechaPago, { message: 'Indica la fecha de pago.', path: ['fechaPago'] });
export type F29EstadoInput = z.input<typeof f29EstadoInput>;

export const TIPOS_PAGO_IMPUESTO = [
  ['F29', 'F29'],
  ['PPM', 'PPM'],
  ['patente', 'Patente'],
  ['contribuciones', 'Contribuciones'],
  ['renta', 'Renta'],
  ['otro', 'Otro']
] as const;
export const pagoImpuestoInput = z.object({
  id: z.string().min(1).optional(),
  tipo: z.enum(['F29', 'PPM', 'patente', 'contribuciones', 'renta', 'otro']),
  periodo,
  fecha,
  monto: z.coerce.number({ message: 'Ingresa el monto.' }).int('Monto entero.').positive('Debe ser mayor a 0.'),
  folioSii: texto(20),
  incluidoEnF29: z.preprocess((v) => v === true || v === 'true' || v === 'on', z.boolean()).default(false)
});
export type PagoImpuestoInput = z.input<typeof pagoImpuestoInput>;

export const obligacionInput = z.object({
  clave: z.string().min(1).max(60),
  estado: z.enum(['pendiente', 'cumplida']),
  fecha: fecha.optional().nullable(),
  folio: texto(20)
});
export type ObligacionInput = z.input<typeof obligacionInput>;

/** Períodos AAAA-MM entre `desde` y `hasta`, ambos incluidos. */
export function periodosEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let [y, m] = desde.split('-').map(Number) as [number, number];
  const [yh, mh] = hasta.split('-').map(Number) as [number, number];
  while (y < yh || (y === yh && m <= mh)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m === 12 ? ((y += 1), (m = 1)) : (m += 1);
  }
  return out;
}

/**
 * F29 encadenados (v1: tax.remanente + tax.f29). `entradas` van en orden y sin huecos desde el primer período con
 * DTE; antes de ese período el remanente es `remanenteInicial`. Un período declarado o pagado aporta el remanente de
 * su foto (`cerrados`), no el recalculado.
 *   remanente anterior(p) = cerrado(p−1) ?? F29(p−1).remanenteSiguiente
 */
export function encadenarF29(
  entradas: readonly Omit<F29Input, 'remanenteAnterior'>[],
  cerrados: Readonly<Record<string, number>>,
  remanenteInicial: number,
  t: Trib
): ResultadoF29[] {
  const out: ResultadoF29[] = [];
  let rem = n(remanenteInicial);
  for (const e of entradas) {
    const r = f29({ ...e, remanenteAnterior: rem }, t);
    out.push(r);
    rem = e.periodo in cerrados ? n(cerrados[e.periodo]) : r.remanenteSiguiente;
  }
  return out;
}

/** PPM del año (v1: tax.ppmAnual): calculado por mes, total y lo pagado (pagos de impuesto tipo PPM del año). */
export function resumenPpm(porMes: readonly { periodo: string; ppm: number }[], pagados: number) {
  const total = porMes.reduce((s, m) => s + m.ppm, 0);
  const conDatos = porMes.filter((m) => m.ppm).length;
  return { total, pagados, proyeccion: conDatos ? Math.round((total / conDatos) * 12) : 0 };
}

export interface ItemCalendario {
  clave: string;
  tipo: 'F29' | 'Renta' | 'Patente' | 'Contribuciones' | 'SAG';
  nombre: string;
  fecha: string;
  modulo: 'tributario' | 'cumplimiento';
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
export const nombrePeriodoCorto = (p: string) => {
  const [y, m] = p.split('-').map(Number) as [number, number];
  return `${MES_CORTO[m - 1]} ${String(y).slice(2)}`;
};

/** Calendario tributario y normativo del año (v1: tax.calendario), ordenado por fecha. */
export function calendarioTributario(anio: number, t: Pick<Trib, 'diaF29' | 'mesRenta' | 'diaRenta'>): ItemCalendario[] {
  const pad = (x: number) => String(x).padStart(2, '0');
  const items: ItemCalendario[] = [];
  for (let m = 1; m <= 12; m++) {
    const per = `${m === 1 ? anio - 1 : anio}-${pad(m === 1 ? 12 : m - 1)}`;
    items.push({
      clave: `F29-${per}`,
      tipo: 'F29',
      nombre: `F29 y PPM período ${nombrePeriodoCorto(per)}`,
      fecha: `${anio}-${pad(m)}-${pad(t.diaF29)}`,
      modulo: 'tributario'
    });
  }
  items.push({
    clave: `RENTA-${anio}`,
    tipo: 'Renta',
    nombre: `Declaración de Renta AT${anio} (F22)`,
    fecha: `${anio}-${pad(t.mesRenta)}-${pad(t.diaRenta)}`,
    modulo: 'tributario'
  });
  for (const [d, c] of [
    ['01-31', '1ª cuota'],
    ['07-31', '2ª cuota']
  ] as const) {
    items.push({ clave: `PATMUN-${anio}-${c}`, tipo: 'Patente', nombre: `Patente municipal ${c}`, fecha: `${anio}-${d}`, modulo: 'cumplimiento' });
    items.push({
      clave: `PATALC-${anio}-${c}`,
      tipo: 'Patente',
      nombre: `Patente de alcoholes ${c} (Ley 19.925)`,
      fecha: `${anio}-${d}`,
      modulo: 'cumplimiento'
    });
  }
  for (const [d, c] of [
    ['04-30', '1ª'],
    ['06-30', '2ª'],
    ['09-30', '3ª'],
    ['11-30', '4ª']
  ] as const)
    items.push({ clave: `CONTRIB-${anio}-${c}`, tipo: 'Contribuciones', nombre: `Contribuciones ${c} cuota`, fecha: `${anio}-${d}`, modulo: 'tributario' });
  items.push({
    clave: `SAG-EXIST-${anio}`,
    tipo: 'SAG',
    nombre: 'Declaración de existencias SAG (1–19 enero)',
    fecha: `${anio}-01-19`,
    modulo: 'cumplimiento'
  });
  items.push({ clave: `SAG-COSECHA-${anio}`, tipo: 'SAG', nombre: 'Declaración de cosecha SAG (1–30 junio)', fecha: `${anio}-06-30`, modulo: 'cumplimiento' });
  items.push({
    clave: `SAG-COSECHA-CORR-${anio}`,
    tipo: 'SAG',
    nombre: 'Correcciones declaración de cosecha (hasta 15 julio)',
    fecha: `${anio}-07-15`,
    modulo: 'cumplimiento'
  });
  return items.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);

/** Estado de una obligación: la registrada, o vencida/pendiente según la fecha (v1: calendario). */
export function estadoObligacion(fechaItem: string, registro: { estado: string } | null | undefined, hoy: string) {
  const dias = diasEntre(hoy, fechaItem);
  return { estado: registro?.estado ?? (dias < 0 ? 'vencida' : 'pendiente'), dias };
}

/** F29 de un respaldo v1 (importador): período y estado; la foto pasa tal cual. */
export const f29V1Input = z
  .object({
    id: z.string().min(1),
    periodo,
    estado: z.enum(['borrador', 'revisado', 'declarado', 'pagado']).default('borrador')
  })
  .passthrough();

/** Estado de la declaración de renta (mismas reglas que el F29: declarado o pagado congelan la foto). */
export const rentaEstadoInput = z
  .object({
    anio: z.coerce.number().int().min(2000).max(2100),
    estado: z.enum(['borrador', 'revisado', 'declarado', 'pagado']),
    folioSii: texto(20),
    fechaPago: fecha
      .optional()
      .nullable()
      .or(z.literal('').transform(() => null))
  })
  .refine((x) => x.estado !== 'pagado' || !!x.fechaPago, { message: 'Indica la fecha de pago.', path: ['fechaPago'] });
export type RentaEstadoInput = z.input<typeof rentaEstadoInput>;

/** Renta de un respaldo v1 (importador). */
export const rentaV1Input = z
  .object({
    id: z.string().min(1),
    anioComercial: z.coerce.number().int(),
    estado: z.enum(['borrador', 'revisado', 'declarado', 'pagado']).catch('borrador')
  })
  .passthrough();
