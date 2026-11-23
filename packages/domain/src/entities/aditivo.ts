/**
 * Aditivos de vinificación — port de js/modules/vinificacion (v1).
 * Diferencias con v1 (bugs corregidos):
 *  - El SO₂ se registra solo como adición en la ficha de fermentación (v1 tenía dos caminos con límites distintos).
 *  - Conversión de unidades explícita: dosis en g/hL para productos de masa (kg, g) y en mL/hL para líquidos (L, mL);
 *    v1 trataba todo lo que no era "g" como kg.
 */
import { z } from 'zod';
import { n } from '../num';

export const TIPOS_ADITIVO = [
  ['bentonita', 'Bentonita'],
  ['tartarico', 'Ácido tartárico'],
  ['tanino', 'Taninos'],
  ['enzima', 'Enzimas'],
  ['levadura', 'Levaduras'],
  ['nutriente', 'Nutrientes'],
  ['clarificante', 'Clarificante'],
  ['otro', 'Otro']
] as const;
export const OBJETIVOS_ADITIVO = [
  'Estabilidad proteica',
  'Corrección de acidez',
  'Inoculación',
  'Nutrición',
  'Clarificación',
  'Estabilizar color',
  'Desfangado'
] as const;

/** Unidad de la dosis según la unidad del insumo: masa → g/hL, volumen → mL/hL; otra → null (no dosificable). */
export function unidadDosis(unidadInsumo: string | null | undefined): 'g/hL' | 'mL/hL' | null {
  if (unidadInsumo === 'kg' || unidadInsumo === 'g') return 'g/hL';
  if (unidadInsumo === 'L' || unidadInsumo === 'mL') return 'mL/hL';
  return null;
}

/**
 * Cantidad de producto en la unidad del insumo: dosis × volumen / 100 (g o mL), convertida a kg/g/L/mL.
 * null si el insumo no se dosifica por volumen (un, caja, rollo).
 */
export function cantidadAditivo(dosis: unknown, volumenL: unknown, unidadInsumo: string | null | undefined): number | null {
  const base = (n(dosis) * n(volumenL)) / 100; // g o mL
  switch (unidadInsumo) {
    case 'kg':
    case 'L':
      return base / 1000;
    case 'g':
    case 'mL':
      return base;
    default:
      return null;
  }
}

const texto = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const aditivoInput = z.object({
  id: z.string().min(1).optional(),
  fecha: z.iso.date('Fecha inválida.'),
  loteId: z.string().min(1, 'Elige el lote.'),
  estanqueId: z.preprocess((v) => v || null, z.string().nullable()).optional(),
  tipo: z.enum(TIPOS_ADITIVO.map((t) => t[0]) as [string, ...string[]]),
  insumoId: z.string().min(1, 'Elige el producto.'),
  /** Volumen tratado (L). */
  volumen: z.coerce.number({ message: 'Ingresa el volumen.' }).min(1, 'Debe ser mayor o igual a 1.'),
  /** En g/hL o mL/hL según el producto. */
  dosis: z.coerce.number({ message: 'Ingresa la dosis.' }).positive('La dosis debe ser mayor a 0.'),
  unidadDosis: z.enum(['g/hL', 'mL/hL']),
  /** Foto: cantidad en la unidad del insumo y su costo al registrar. */
  cantidad: z.coerce.number().min(0),
  costo: z.coerce.number().int().min(0).default(0),
  objetivo: texto(120),
  responsable: texto(120),
  observaciones: texto(1000)
});
export type AditivoInput = z.input<typeof aditivoInput>;
export type Aditivo = z.output<typeof aditivoInput> & { id: string };
