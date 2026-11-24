/**
 * Remuneraciones del mes — port de js/modules/administracion (v1), pestaña Remuneraciones.
 * Diferencias con v1 (bugs corregidos):
 *  - Cada mes usa SUS indicadores (UF, UTM, IMM, topes y tasas vigentes al último día del periodo) y guarda la foto en
 *    `parametros`; v1 recalculaba cualquier mes con los valores de hoy, incluso los ya pagados.
 *  - Guarda la foto del trabajador (nombre, RUT, cargo, área, AFP, salud): la liquidación de un mes pasado no cambia
 *    si después se edita la ficha (v1 imprimía los datos actuales).
 *  - Novedades del mes (días trabajados, horas extra, bonos, comisiones, anticipos) que v1 no permitía ingresar.
 *  - "Calcular mes" no toca las pagadas; el pago se registra con su fecha y se puede revertir.
 */
import { z } from 'zod';

export const ESTADOS_REMUNERACION = [
  ['calculada', 'Calculada'],
  ['pagada', 'Pagada']
] as const;

export const periodoInput = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periodo inválido (AAAA-MM).');

const monto = z.preprocess((v) => (v === '' || v == null ? 0 : v), z.coerce.number().int('Monto en pesos, sin decimales.').min(0, 'No puede ser negativo.'));

export const novedadesInput = z.object({
  diasTrabajados: z.coerce.number({ message: 'Ingresa los días.' }).int('Días enteros.').min(0, 'Entre 0 y 30.').max(30, 'Entre 0 y 30.'),
  horasExtra: z.preprocess((v) => (v === '' || v == null ? 0 : v), z.coerce.number().min(0, 'No puede ser negativo.').max(200)),
  bonos: monto,
  comisiones: monto,
  anticipos: monto
});
export type NovedadesInput = z.input<typeof novedadesInput>;
export type Novedades = z.output<typeof novedadesInput>;

export const pagoRemuneracionInput = z.object({ fechaPago: z.iso.date('Fecha inválida.') });

/** Nombre legible del periodo: "noviembre de 2026". */
export function nombrePeriodo(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Periodo anterior/siguiente (YYYY-MM). */
export function moverPeriodo(periodo: string, delta: number): string {
  const [y, m] = periodo.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const montoOpt = z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().optional());
/** Remuneración de un respaldo v1 (montos ya calculados por v1, o ninguno: se calcula con el mes). */
export const remuneracionV1Input = z.object({
  id: z.string().min(1),
  trabajadorId: z.string().min(1),
  periodo: periodoInput,
  estado: z.preprocess((v) => (v === 'pagada' ? 'pagada' : 'calculada'), z.enum(['calculada', 'pagada'])),
  /** v1 generaba fechas inválidas (`periodo + '-30'` en febrero): se acota al último día del mes. */
  fechaPago: z.preprocess((v) => v || null, z.string().nullable()).optional(),
  base: montoOpt,
  gratificacion: montoOpt,
  bonos: montoOpt,
  comisiones: montoOpt,
  horasExtra: montoOpt,
  noImponible: montoOpt,
  imponible: montoOpt,
  afp: montoOpt,
  salud: montoOpt,
  cesantia: montoOpt,
  tributable: montoOpt,
  impuestoUnico: montoOpt,
  descuentos: montoOpt,
  liquido: montoOpt,
  cesantiaEmpleador: montoOpt,
  sis: montoOpt,
  aporteEmpleador: montoOpt,
  costoEmpresa: montoOpt
});
export type RemuneracionV1 = z.output<typeof remuneracionV1Input>;
