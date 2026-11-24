/**
 * Trabajadores — port de js/modules/administracion (v1), pestaña Trabajadores.
 * Diferencias con v1 (bugs corregidos):
 *  - Sueldo base bajo el IMM es un aviso, no un error (v1 bloqueaba los contratos de jornada parcial).
 *  - Al dejar la gratificación fija o el plan Isapre se limpian sus montos (v1 los seguía pagando o descontando).
 *  - Fecha de término: un trabajador que salió deja de calcularse (v1 calculaba a todos, siempre).
 */
import { z } from 'zod';
import { rutFormat, rutValid } from '../num';

export const AREAS_TRABAJADOR = [
  ['produccion', 'Producción'],
  ['admin', 'Administración'],
  ['ventas', 'Ventas']
] as const;
export const CONTRATOS = [
  ['indefinido', 'Indefinido'],
  ['plazo_fijo', 'Plazo fijo'],
  ['obra', 'Obra o faena']
] as const;
export const GRATIFICACIONES = [
  ['art50', 'Art. 50 (25 % con tope 4,75 IMM)'],
  ['fija', 'Monto fijo'],
  ['ninguna', 'Sin gratificación']
] as const;
export const AFPS = ['Capital', 'Cuprum', 'Habitat', 'Modelo', 'PlanVital', 'Provida', 'Uno'] as const;

const ids = <T extends readonly (readonly [string, string])[]>(xs: T) => xs.map((x) => x[0]) as unknown as [T[number][0], ...T[number][0][]];
const monto = z.preprocess((v) => (v === '' || v == null ? 0 : v), z.coerce.number().int('Monto en pesos, sin decimales.').min(0, 'No puede ser negativo.'));
const fechaOpt = z.preprocess((v) => v || null, z.iso.date('Fecha inválida.').nullable()).optional();
const texto = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const trabajadorInput = z
  .object({
    id: z.string().min(1).optional(),
    nombre: z.string().trim().min(1, 'Ingresa el nombre.').max(200),
    rut: z.string().trim().refine(rutValid, 'RUT inválido: revisa el dígito verificador.').transform(rutFormat),
    cargo: z.string().trim().min(1, 'Ingresa el cargo.').max(120),
    area: z.enum(ids(AREAS_TRABAJADOR)).default('produccion'),
    contrato: z.enum(ids(CONTRATOS)).default('indefinido'),
    ingreso: fechaOpt,
    termino: fechaOpt,
    sueldoBase: z.coerce.number({ message: 'Ingresa el sueldo base.' }).int('Monto en pesos, sin decimales.').min(1, 'Debe ser mayor a 0.'),
    gratificacion: z.enum(ids(GRATIFICACIONES)).default('art50'),
    gratificacionMonto: monto.default(0),
    bonos: monto.default(0),
    comisiones: monto.default(0),
    colacion: monto.default(0),
    movilizacion: monto.default(0),
    afp: z.enum(AFPS).default('Modelo'),
    /** Tasa total de la AFP (fracción). Vacía = la de los parámetros. */
    tasaAfp: z
      .preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().min(0.1, 'Entre 10 % y 13 %.').max(0.13, 'Entre 10 % y 13 %.').nullable())
      .optional(),
    salud: z.enum(['Fonasa', 'Isapre']).default('Fonasa'),
    planSalud: monto.default(0),
    vacacionesPendientes: z.preprocess((v) => (v === '' || v == null ? 0 : v), z.coerce.number().min(0)).default(0),
    observaciones: texto(1000)
  })
  .refine((t) => !t.termino || !t.ingreso || t.termino >= t.ingreso, { message: 'Debe ser posterior al ingreso.', path: ['termino'] })
  .transform((t) => ({
    ...t,
    gratificacionMonto: t.gratificacion === 'fija' ? t.gratificacionMonto : 0,
    planSalud: t.salud === 'Isapre' ? t.planSalud : 0
  }));
export type TrabajadorInput = z.input<typeof trabajadorInput>;
export type TrabajadorRow = z.output<typeof trabajadorInput> & { id: string };

/** Primer y último día de un periodo YYYY-MM. */
export function rangoPeriodo(periodo: string): { desde: string; hasta: string; dias: number } {
  const [y, m] = periodo.split('-').map(Number) as [number, number];
  const dias = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde: `${periodo}-01`, hasta: `${periodo}-${String(dias).padStart(2, '0')}`, dias };
}

/** Trabajador con contrato vigente en algún día del periodo. */
export const vigenteEnPeriodo = (t: { ingreso?: string | null; termino?: string | null }, periodo: string) => {
  const { desde, hasta } = rangoPeriodo(periodo);
  return (!t.ingreso || t.ingreso <= hasta) && (!t.termino || t.termino >= desde);
};

/**
 * Días trabajados que se proponen para el periodo (mes comercial de 30 días): 30 si estuvo todo el mes; si entró o
 * salió en el mes, los días calendario trabajados (con tope 30). 0 si no estuvo vigente.
 */
export function diasEnPeriodo(t: { ingreso?: string | null; termino?: string | null }, periodo: string): number {
  if (!vigenteEnPeriodo(t, periodo)) return 0;
  const { desde, hasta, dias } = rangoPeriodo(periodo);
  const ini = t.ingreso && t.ingreso > desde ? Number(t.ingreso.slice(8, 10)) : 1;
  const fin = t.termino && t.termino < hasta ? Number(t.termino.slice(8, 10)) : dias;
  if (ini === 1 && fin === dias) return 30;
  return Math.min(30, fin - ini + 1);
}
