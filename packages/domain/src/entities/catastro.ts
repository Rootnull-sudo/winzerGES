import { z } from 'zod';
import { n } from '../num';

/** Acepta números con coma decimal chilena ("2,5"); '' → null. */
const toNum = (v: unknown) => (v === '' || v === null || v === undefined ? null : typeof v === 'string' ? n(v) : v);

/** Listas de js/modules/catastro/schema.js (v1). */
export const VARIEDADES = [
  'Sauvignon Blanc',
  'Chardonnay',
  'Viognier',
  'Riesling',
  'Moscatel de Alejandría',
  'Gewürztraminer',
  'Sémillon',
  'Cabernet Sauvignon',
  'Carménère',
  'Merlot',
  'Syrah',
  'Pinot Noir',
  'Malbec',
  'Cabernet Franc',
  'País',
  'Cinsault',
  'Carignan',
  'Petit Verdot'
];
export const BLANCAS = ['Sauvignon Blanc', 'Chardonnay', 'Viognier', 'Riesling', 'Moscatel de Alejandría', 'Gewürztraminer', 'Sémillon'];
export const VALLES = [
  'Maipo',
  'Colchagua',
  'Cachapoal',
  'Curicó',
  'Casablanca',
  'Leyda',
  'San Antonio',
  'Maule',
  'Itata',
  'Bío Bío',
  'Aconcagua',
  'Limarí',
  'Elqui',
  'Malleco'
];
export const CONDUCCIONES = ['Espaldera VSP', 'Espaldera alta', 'Parrón', 'Cabeza (gobelet)', 'Lira', 'Cordón libre'];
export const PATRONES = ['Franco', '1103 Paulsen', '110 Richter', 'SO4', '101-14', 'Harmony'];
export const ESTADOS_SANITARIOS = ['Bueno', 'Regular', 'Malo', 'En recuperación'];

export const tipoUvaDe = (variedad: string, actual?: string | null) => (BLANCAS.includes(variedad) ? 'blanco' : actual || 'tinto');

const optText = z
  .string()
  .trim()
  .max(300)
  .optional()
  .nullable()
  .transform((v) => v || null);
const optNum = (o: { min?: number; max?: number; int?: boolean } = {}) =>
  z.preprocess(
    toNum,
    (() => {
      let s = z.number();
      if (o.int) s = s.int();
      if (o.min !== undefined) s = s.min(o.min);
      if (o.max !== undefined) s = s.max(o.max);
      return s.nullable();
    })()
  );

/** Cuartel — unidad de manejo del viñedo. Entidad offline. */
export const cuartelInput = z
  .object({
    id: z.string().min(1).optional(),
    codigo: z.string().trim().min(1, 'Ingresa el código del cuartel.').max(30),
    variedad: z.string().trim().min(1, 'Elige la variedad.').max(80),
    tipo: z.enum(['blanco', 'tinto']),
    valle: optText,
    sector: optText,
    superficie: z.preprocess(toNum, z.number({ error: 'Ingresa la superficie.' }).min(0.01, 'La superficie debe ser mayor a 0.').max(500)),
    anioPlantacion: optNum({ min: 1850, max: 2100, int: true }),
    patron: optText,
    conduccion: optText,
    densidad: optNum({ min: 0, int: true }),
    plantas: optNum({ min: 0, int: true }),
    cajonesEstimados: optNum({ min: 0, int: true }),
    estadoSanitario: optText,
    costoPlantacion: optNum({ min: 0, int: true }),
    observaciones: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .nullable()
      .transform((v) => v || null)
  })
  .transform((c) => ({
    ...c,
    // Igual que v1: si hay densidad y superficie pero no plantas, se calcula el total.
    plantas: c.plantas ?? (c.densidad ? Math.round(c.densidad * c.superficie) : null)
  }));
export type CuartelInput = z.input<typeof cuartelInput>;
export type Cuartel = z.output<typeof cuartelInput> & { id: string };

export const variedadInput = z.object({
  id: z.string().min(1).optional(),
  nombre: z.string().trim().min(1).max(80),
  tipo: z.enum(['blanco', 'tinto'])
});
