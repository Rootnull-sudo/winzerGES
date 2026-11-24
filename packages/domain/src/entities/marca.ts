/**
 * Formatos de envase, marcas (INAPI) y versiones de etiqueta — port de js/modules/envasado (formatos) y
 * js/modules/marca (v1).
 * Diferencias con v1 (bugs corregidos):
 *  - La amortización de la marca se prorratea por día entre su registro y su vencimiento; v1 cobraba costo ÷ 120 cada
 *    mes de cualquier periodo, para siempre.
 *  - Una etiqueta usada por órdenes de envasado no se puede borrar (v1 no lo impedía).
 */
import { z } from 'zod';
import { diffDays, n } from '../num';

export const ENVASES = [
  ['vidrio', 'Vidrio'],
  ['PET', 'PET'],
  ['BIB', 'Bag in box'],
  ['lata', 'Lata']
] as const;

const texto = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);
const monto = z.preprocess((v) => (v === '' || v == null ? 0 : v), z.coerce.number().min(0, 'No puede ser negativo.'));
const entero = z.preprocess((v) => (v === '' || v == null ? 0 : v), z.coerce.number().int('Número entero.').min(0, 'No puede ser negativo.'));
const fechaOpt = z.preprocess((v) => v || null, z.iso.date('Fecha inválida.').nullable()).optional();

export const formatoInput = z.object({
  id: z.string().min(1).optional(),
  nombre: z.string().trim().min(1, 'Ingresa el nombre.').max(80),
  litros: z.coerce.number({ message: 'Ingresa los litros.' }).min(0.05, 'Mínimo 0,05 L.').max(1000, 'Máximo 1.000 L.'),
  envase: z.enum(ENVASES.map((e) => e[0]) as [string, ...string[]]).default('vidrio'),
  unidadesCaja: z.coerce.number().int('Número entero.').min(1, 'Mínimo 1.').default(12),
  stockMinimo: entero.default(0)
});
export type FormatoInput = z.input<typeof formatoInput>;

/** Vencimiento del registro INAPI: 10 años desde el registro (v1: onChangeSet). */
export function vencimientoMarca(fechaRegistro: string): string {
  return `${Number(fechaRegistro.slice(0, 4)) + 10}${fechaRegistro.slice(4)}`;
}

export const marcaInput = z
  .object({
    id: z.string().min(1).optional(),
    nombre: z.string().trim().min(1, 'Ingresa el nombre de la marca.').max(120),
    titular: texto(200),
    numeroINAPI: texto(40),
    clases: texto(40),
    fechaRegistro: z.iso.date('Fecha inválida.'),
    vencimiento: fechaOpt,
    costo: z.preprocess((v) => (v === '' || v == null ? 0 : v), z.coerce.number().int('Monto en pesos.').min(0)).default(0)
  })
  .transform((m) => ({ ...m, vencimiento: m.vencimiento ?? vencimientoMarca(m.fechaRegistro) }))
  .refine((m) => m.vencimiento > m.fechaRegistro, { message: 'Debe ser posterior al registro.', path: ['vencimiento'] });
export type MarcaInput = z.input<typeof marcaInput>;

export type EstadoMarca = 'vigente' | 'renovar' | 'vencida';
/** Días de anticipación para renovar (v1: 180). */
export const DIAS_RENOVAR_MARCA = 180;
export function estadoMarca(vencimiento: string, hoy: string): { estado: EstadoMarca; dias: number } {
  const dias = diffDays(hoy, vencimiento) ?? 0;
  return { estado: dias < 0 ? 'vencida' : dias <= DIAS_RENOVAR_MARCA ? 'renovar' : 'vigente', dias };
}

/**
 * Amortización de la marca en [desde, hasta]: costo ÷ días de vigencia × días del periodo dentro de la vigencia.
 * v1: costo ÷ 120 por cada mes del periodo, sin fechas.
 */
export function amortizacionMarca(m: { costo: unknown; fechaRegistro: string; vencimiento: string }, desde: string, hasta: string): number {
  const total = (diffDays(m.fechaRegistro, m.vencimiento) ?? 0) || 1;
  const ini = desde > m.fechaRegistro ? desde : m.fechaRegistro;
  const fin = hasta < m.vencimiento ? hasta : m.vencimiento;
  if (fin < ini) return 0;
  return (n(m.costo) / total) * ((diffDays(ini, fin) ?? 0) + 1);
}

export const etiquetaInput = z.object({
  id: z.string().min(1).optional(),
  nombre: z.string().trim().min(1, 'Ingresa el nombre del diseño.').max(160),
  versionDiseno: z.coerce.number().int('Número entero.').min(1, 'Mínimo 1.').default(1),
  marcaId: z.preprocess((v) => v || null, z.string().nullable()).optional(),
  fecha: fechaOpt,
  disenador: texto(120),
  /** Rotulación aprobada (Ley 18.455 / Decreto 78). */
  aprobacionLegal: z.preprocess((v) => v === true || v === 'true' || v === 'on', z.boolean()).default(false),
  costoDiseno: monto.default(0),
  costoFotografia: monto.default(0),
  costoIlustracion: monto.default(0),
  /** Botellas estimadas con esta versión: base del prorrateo mientras no haya producción suficiente. */
  tirajeEstimado: entero.default(10000),
  tirajeMinimo: entero.default(0),
  /** Costo de impresión por etiqueta. */
  costoImpresion: monto.default(0),
  proveedorId: z.preprocess((v) => v || null, z.string().nullable()).optional(),
  varietal: texto(80),
  graduacion: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().min(0).max(25).nullable()).optional(),
  do: texto(120),
  denominacion: texto(120),
  contenido: texto(40)
});
export type EtiquetaInput = z.input<typeof etiquetaInput>;

/** Costos únicos del diseño (se prorratean entre las botellas). */
export const costosUnicosEtiqueta = (e: { costoDiseno?: unknown; costoFotografia?: unknown; costoIlustracion?: unknown }) =>
  n(e.costoDiseno) + n(e.costoFotografia) + n(e.costoIlustracion);

/**
 * Prorrateo del diseño por botella (v1: financial.prorrateoEtiqueta):
 *  costos únicos ÷ máx(botellas producidas con órdenes confirmadas, tiraje estimado) (o ÷ 1 si ambos son 0).
 */
export function prorrateoEtiqueta(
  e: { costoDiseno?: unknown; costoFotografia?: unknown; costoIlustracion?: unknown; tirajeEstimado?: unknown },
  producidas: number
): number {
  const base = Math.max(n(producidas), n(e.tirajeEstimado) || 0) || 1;
  return costosUnicosEtiqueta(e) / base;
}
