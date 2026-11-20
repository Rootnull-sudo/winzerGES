/**
 * Insumos y su libro de movimientos — port de js/modules/insumos (maestro) y js/calc/inventory.js (v1).
 * El stock NO se guarda: stock = stockInicial + Σ movimientos (ADR 0010).
 */
import { z } from 'zod';
import { n, sum } from '../num';

/** Categorías (v1: insumos/index.js:9). */
export const CATEGORIAS_INSUMO = [
  ['agricola', 'Agrícola'],
  ['enologico', 'Enológico'],
  ['envasado', 'Envasado'],
  ['etiquetado', 'Etiquetado y marca']
] as const;
export type CategoriaInsumo = (typeof CATEGORIAS_INSUMO)[number][0];

/** Tipos (v1: insumos/index.js:10, mismos textos). */
export const TIPOS_INSUMO = [
  'Fertilizante',
  'Abono',
  'Fungicida',
  'Insecticida',
  'Herbicida',
  'Bioestimulante',
  'Corrector',
  'Sulfitante',
  'Clarificante',
  'Levadura',
  'Nutriente',
  'Enzima',
  'Tanino',
  'Envase vidrio',
  'Envase PET',
  'Bag in box',
  'Cierre',
  'Cápsula',
  'Caja',
  'Etiqueta',
  'Otro'
] as const;

export const UNIDADES_INSUMO = ['kg', 'g', 'L', 'mL', 'un', 'caja', 'rollo'] as const;

export const QUIMICOS_SO2 = [
  ['K2S2O5', 'Metabisulfito de potasio (≈57% SO₂)'],
  ['Na2S2O5', 'Metabisulfito de sodio (≈67% SO₂)']
] as const;

/** Tipos de movimiento del libro `mov_insumo` (v1: movInsumo.tipo). */
export const TIPOS_MOV_INSUMO = ['compra', 'aplicacion', 'aditivo', 'so2', 'consumo_envasado', 'ajuste', 'nota_credito'] as const;
export type TipoMovInsumo = (typeof TIPOS_MOV_INSUMO)[number];

/** Motivos sugeridos de un ajuste manual (v1: inventarios/index.js). */
export const MOTIVOS_AJUSTE = ['Toma de inventario', 'Merma', 'Rotura', 'Vencimiento', 'Error de registro', 'Ingreso sin compra'] as const;

const texto = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);
const numOpt = (min = 0, max = 1e12) =>
  z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().min(min, `Debe ser ≥ ${min}.`).max(max).nullable()).optional();

/** Campos que solo aplican a ciertas categorías o tipos (se limpian si no aplican, como los `showIf` de v1). */
export const aplicaCampo = {
  npk: (c: string) => c === 'agricola',
  carencia: (c: string) => c === 'agricola',
  plazoEntrega: (c: string) => c === 'envasado' || c === 'etiquetado',
  condiciones: (c: string) => c === 'envasado' || c === 'etiquetado',
  so2: (_c: string, tipo?: string | null) => tipo === 'Sulfitante'
};

export const insumoInput = z
  .object({
    id: z.string().min(1).optional(),
    nombre: z.string().trim().min(1, 'Ingresa el nombre del insumo.').max(120),
    categoria: z.enum(CATEGORIAS_INSUMO.map((c) => c[0]) as [CategoriaInsumo, ...CategoriaInsumo[]]),
    tipo: z.enum(TIPOS_INSUMO).optional().nullable(),
    unidad: z.enum(UNIDADES_INSUMO),
    npk: texto(30),
    precio: z.coerce.number().int('El precio es en pesos, sin decimales.').min(0, 'El precio no puede ser negativo.'),
    proveedorId: texto(100),
    stockMinimo: numOpt(),
    stockInicial: numOpt(),
    vencimiento: z.preprocess((v) => v || null, z.iso.date('Fecha inválida.').nullable()).optional(),
    carencia: numOpt(0, 365),
    quimico: z.preprocess((v) => v || null, z.enum(['K2S2O5', 'Na2S2O5']).nullable()).optional(),
    so2Pct: numOpt(0, 100),
    plazoEntrega: numOpt(0, 365),
    condiciones: texto(200)
  })
  .transform((i) => ({
    ...i,
    npk: aplicaCampo.npk(i.categoria) ? (i.npk ?? null) : null,
    carencia: aplicaCampo.carencia(i.categoria) ? (i.carencia ?? null) : null,
    plazoEntrega: aplicaCampo.plazoEntrega(i.categoria) ? (i.plazoEntrega ?? null) : null,
    condiciones: aplicaCampo.condiciones(i.categoria) ? (i.condiciones ?? null) : null,
    quimico: aplicaCampo.so2(i.categoria, i.tipo) ? (i.quimico ?? null) : null,
    so2Pct: aplicaCampo.so2(i.categoria, i.tipo) ? (i.so2Pct ?? null) : null
  }));
export type InsumoInput = z.input<typeof insumoInput>;
export type Insumo = z.output<typeof insumoInput> & { id: string };

/** Movimiento del libro (lo escriben servicios y reacciones; el cliente solo lo lee). */
export const movInsumoInput = z.object({
  id: z.string().min(1).optional(),
  fecha: z.iso.date(),
  insumoId: z.string().min(1),
  cantidad: z.coerce.number(),
  tipo: z.enum(TIPOS_MOV_INSUMO),
  costoUnitario: numOpt(),
  motivo: texto(200),
  origenTipo: texto(40),
  origenId: texto(100)
});
export type MovInsumo = z.output<typeof movInsumoInput> & { id: string };

/** Ajuste manual: se indica la cantidad contada (el sistema calcula la diferencia) o directamente la diferencia. */
export const ajusteStockInput = z
  .object({
    insumoId: z.string().min(1),
    fecha: z.iso.date('Fecha inválida.'),
    modo: z.enum(['conteo', 'diferencia']),
    cantidad: z.coerce.number({ message: 'Ingresa una cantidad.' }),
    motivo: z.string().trim().min(1, 'Indica el motivo del ajuste.').max(200)
  })
  .refine((a) => a.modo === 'diferencia' || a.cantidad >= 0, { message: 'La cantidad contada no puede ser negativa.', path: ['cantidad'] })
  .refine((a) => a.modo === 'conteo' || a.cantidad !== 0, { message: 'La diferencia no puede ser 0.', path: ['cantidad'] });
export type AjusteStockInput = z.input<typeof ajusteStockInput>;

/** Stock = stockInicial + Σ cantidad de sus movimientos (v1: inventory.js stockInsumo). */
export function stockInsumo(
  insumo: { id: string; stockInicial?: unknown } | null | undefined,
  movs: readonly { insumoId: string; cantidad: unknown }[]
): number {
  if (!insumo) return 0;
  return (
    n(insumo.stockInicial) +
    sum(
      movs.filter((m) => m.insumoId === insumo.id),
      (m) => m.cantidad
    )
  );
}

/** Valor del inventario = Σ max(0, stock) × precio (v1: inventory.js valorInventarioInsumos). */
export function valorInventario(
  insumos: readonly { id: string; stockInicial?: unknown; precio?: unknown }[],
  movs: readonly { insumoId: string; cantidad: unknown }[]
): number {
  return sum(insumos, (i) => Math.max(0, stockInsumo(i, movs)) * n(i.precio));
}

/** Días hasta el vencimiento (negativo = vencido); null si no vence. */
export function diasParaVencer(vencimiento: string | null | undefined, hoy: string): number | null {
  if (!vencimiento) return null;
  return Math.round((Date.parse(`${vencimiento}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
}
