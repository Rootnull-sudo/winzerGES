/**
 * Análisis de laboratorio — port de js/modules/laboratorio (v1).
 * Diferencias con v1 (bugs corregidos):
 *  - Los rangos objetivo dejan de estar fijos en el código: son parámetros de la viña (`enologia.labBlanco` y
 *    `enologia.labTinto`); el SO₂ libre usa el mismo rango que la fermentación (`enologia.so2Blanco/so2Tinto`), que
 *    en v1 estaba duplicado.
 *  - El gráfico de evolución ya no mezcla SO₂ (mg/L) y acidez × 5 en un mismo eje: cada uno con su escala y rango.
 */
import { z } from 'zod';
import type { OrgConfig } from '../config';
import { n } from '../num';

/** Parámetros medidos: clave, etiqueta, unidad, decimales al mostrar. */
export const PARAMS_ANALISIS = [
  ['ph', 'pH', '', 2],
  ['acidezTotal', 'Acidez total', 'g/L ác. tartárico', 1],
  ['acidezVolatil', 'Acidez volátil', 'g/L ác. acético', 2],
  ['so2Libre', 'SO₂ libre', 'mg/L', 0],
  ['so2Total', 'SO₂ total', 'mg/L', 0],
  ['alcohol', 'Alcohol', '% vol', 1],
  ['azucarResidual', 'Azúcar residual', 'g/L', 1],
  ['turbidez', 'Turbidez', 'NTU', 1],
  ['densidad', 'Densidad', 'g/L', 1]
] as const;
export type ParamAnalisis = (typeof PARAMS_ANALISIS)[number][0];

/** Parámetros con rango objetivo propio del laboratorio (el SO₂ libre sale del rango de fermentación). */
export const PARAMS_CON_RANGO = ['ph', 'acidezTotal', 'acidezVolatil', 'so2Total', 'alcohol', 'azucarResidual'] as const;
export type ParamConRango = (typeof PARAMS_CON_RANGO)[number];
export interface Rango {
  min: number;
  max: number;
}
export type RangosLab = Record<ParamConRango, Rango>;

const numOpt = (min: number, max: number) =>
  z
    .preprocess(
      (v) => (v === '' || v == null ? null : v),
      z.coerce.number().min(min, `Debe ser mayor o igual a ${min}.`).max(max, `Debe ser menor o igual a ${max}.`).nullable()
    )
    .optional();
const texto = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const analisisInput = z
  .object({
    id: z.string().min(1).optional(),
    fecha: z.iso.date('Fecha inválida.'),
    loteId: z.string().min(1, 'Elige el lote.'),
    laboratorio: z.string().trim().min(1, 'Ingresa el laboratorio.').max(120),
    /** Para el certificado D.O. y exportaciones el análisis debe venir de un laboratorio autorizado por el SAG. */
    autorizadoSAG: z.coerce.boolean().default(false),
    ph: numOpt(2.5, 4.5),
    acidezTotal: numOpt(0, 20),
    /** Límite legal referencial en Chile: 1,5 g/L (ác. acético); sobre 0,7 g/L suele ser perceptible. */
    acidezVolatil: numOpt(0, 3),
    so2Libre: numOpt(0, 200),
    so2Total: numOpt(0, 400),
    alcohol: numOpt(0, 20),
    azucarResidual: numOpt(0, 400),
    turbidez: numOpt(0, 1000),
    densidad: numOpt(900, 1200),
    color: texto(120),
    certificadoDO: z.coerce.boolean().default(false),
    observaciones: texto(1000)
  })
  .refine((a) => a.so2Total == null || a.so2Libre == null || a.so2Total >= a.so2Libre, {
    message: 'El SO₂ total no puede ser menor que el libre.',
    path: ['so2Total']
  });
export type AnalisisInput = z.input<typeof analisisInput>;
export type Analisis = z.output<typeof analisisInput> & { id: string };

/** Rangos objetivo de un lote según su tipo (blanco/tinto) y la configuración vigente. */
export function rangosAnalisis(tipo: string | null | undefined, enologia: OrgConfig['enologia']): Record<ParamConRango | 'so2Libre', Rango> {
  const blanco = tipo === 'blanco';
  const so2 = blanco ? enologia.so2Blanco : enologia.so2Tinto;
  return { ...(blanco ? enologia.labBlanco : enologia.labTinto), so2Libre: { min: so2.min, max: so2.max } };
}

export interface FueraDeRango {
  clave: ParamAnalisis;
  etiqueta: string;
  valor: number;
  min: number;
  max: number;
}

/** Parámetros medidos fuera de su rango objetivo (v1: `fuera`). Un valor vacío no cuenta; un 0 sí. */
export function fueraDeRango(a: Partial<Record<ParamAnalisis, unknown>>, rangos: Partial<Record<ParamAnalisis, Rango>>): FueraDeRango[] {
  const out: FueraDeRango[] = [];
  for (const [clave, etiqueta] of PARAMS_ANALISIS) {
    const r = rangos[clave];
    const v = a[clave];
    if (!r || v === '' || v == null) continue;
    const x = n(v);
    if (x < r.min || x > r.max) out.push({ clave, etiqueta, valor: x, min: r.min, max: r.max });
  }
  return out;
}
