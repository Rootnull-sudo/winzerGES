/**
 * Gastos y presupuesto — port de js/modules/administracion (v1), pestañas Gastos y Presupuesto.
 * Diferencias con v1 (bugs corregidos):
 *  - `afectoIVA` solo vale en facturas: v1 lo dejaba en true (oculto) en boletas y "otro", y el flujo de caja y la
 *    conciliación les sumaban un 19 % que nunca se pagó.
 *  - IVA y total se guardan al registrar (foto con la tasa de la fecha), en vez de recalcularse con la tasa de hoy.
 *  - Presupuesto: todas las categorías se pueden presupuestar (v1 ocultaba las que no tenían gastos ni presupuesto) y
 *    los meses transcurridos salen de la fecha de evaluación, no del reloj del navegador.
 */
import { z } from 'zod';
import { n } from '../num';

export const CATEGORIAS_GASTO = [
  ['servicios', 'Servicios básicos'],
  ['arriendo', 'Arriendo'],
  ['patentes', 'Patentes (municipal, alcoholes)'],
  ['contribuciones', 'Contribuciones'],
  ['seguros', 'Seguros'],
  ['mantencion', 'Mantención'],
  ['combustible', 'Combustible'],
  ['marketing', 'Marketing y branding'],
  ['profesionales', 'Servicios profesionales'],
  ['certificaciones', 'Certificaciones'],
  ['financiero', 'Gastos financieros'],
  ['otros', 'Otros / imprevistos']
] as const;
export const DOCUMENTOS_GASTO = [
  ['factura', 'Factura'],
  ['boleta', 'Boleta'],
  ['otro', 'Otro (sin IVA)']
] as const;
export const MEDIOS_PAGO_GASTO = [
  ['transferencia', 'Transferencia'],
  ['cargo_automatico', 'Cargo automático'],
  ['tarjeta', 'Tarjeta'],
  ['efectivo', 'Efectivo'],
  ['cheque', 'Cheque']
] as const;
export const AREAS_GASTO = [
  ['admin', 'Administración'],
  ['ventas', 'Ventas'],
  ['produccion', 'Producción (indirecto)']
] as const;

const ids = <T extends readonly (readonly [string, string])[]>(xs: T) => xs.map((x) => x[0]) as unknown as [T[number][0], ...T[number][0][]];
const texto = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);
const bool = z.preprocess((v) => v === true || v === 'true' || v === 'on' || v === '1', z.boolean());

export const gastoInput = z
  .object({
    id: z.string().min(1).optional(),
    fecha: z.iso.date('Fecha inválida.'),
    categoria: z.enum(ids(CATEGORIAS_GASTO)),
    descripcion: z.string().trim().min(1, 'Describe el gasto.').max(200),
    proveedorId: z.preprocess((v) => v || null, z.string().nullable()).optional(),
    /** Neto (sin IVA). */
    monto: z.coerce.number({ message: 'Ingresa el monto.' }).int('El monto es en pesos, sin decimales.').min(1, 'Debe ser mayor a 0.'),
    documento: z.enum(ids(DOCUMENTOS_GASTO)).default('factura'),
    folio: texto(30),
    afectoIVA: bool.default(true),
    medioPago: z.enum(ids(MEDIOS_PAGO_GASTO)).default('transferencia'),
    /** pagado = al contado; pendiente = a crédito (se paga con pagos aplicados, como una compra). */
    estado: z.enum(['pagado', 'pendiente']).default('pagado'),
    tipoCosto: z.enum(['fijo', 'variable']).default('fijo'),
    area: z.enum(ids(AREAS_GASTO)).default('admin'),
    /** Agregado en la renta (gasto rechazado). */
    noDeducible: bool.default(false),
    observaciones: texto(500)
  })
  .transform((g) => ({
    ...g,
    afectoIVA: g.documento === 'factura' && g.afectoIVA,
    folio: g.documento === 'otro' ? null : g.folio
  }));
export type GastoInput = z.input<typeof gastoInput>;
export type Gasto = z.output<typeof gastoInput> & { id: string; iva: number; total: number };

/** IVA y total de un gasto (v1: administracion/index.js:126): IVA = monto × tasa solo en factura afecta. */
export function totalesGasto(g: { monto: unknown; documento: string; afectoIVA?: unknown }, tasaIVA: number) {
  const monto = Math.round(n(g.monto));
  const iva = g.documento === 'factura' && g.afectoIVA ? Math.round(monto * tasaIVA) : 0;
  return { iva, total: monto + iva };
}

/** Clasificación contable de v1: producción = costo indirecto; el resto, gasto de administración y ventas. */
export const clasificacionGasto = (area: string) => (area === 'produccion' ? 'Costo indirecto de producción' : 'Gasto de administración y ventas');

export const presupuestoInput = z.object({
  id: z.string().min(1).optional(),
  anio: z.coerce.number().int().min(2000).max(2100),
  categoria: z.enum(ids(CATEGORIAS_GASTO)),
  monto: z.coerce.number({ message: 'Ingresa el monto.' }).int('El monto es en pesos, sin decimales.').min(0, 'No puede ser negativo.')
});
export type PresupuestoInput = z.input<typeof presupuestoInput>;

export interface FilaPresupuesto {
  categoria: string;
  etiqueta: string;
  presupuesto: number;
  real: number;
  /** real ÷ presupuesto (null sin presupuesto). */
  avance: number | null;
  proyeccion: number;
  /** (proyección − presupuesto) ÷ presupuesto (null sin presupuesto). */
  desviacion: number | null;
}

/** Meses transcurridos del año `anio` a la fecha `hoy` (v1: mes actual si es el año en curso; si no, 12). */
export function mesesTranscurridos(anio: number, hoy: string): number {
  const y = Number(hoy.slice(0, 4));
  if (anio < y) return 12;
  if (anio > y) return 1;
  return Math.max(1, Number(hoy.slice(5, 7)));
}

/**
 * Presupuesto vs real por categoría (v1: administracion/index.js:145-146):
 *  real = Σ monto neto de los gastos del año calendario; proyección = real ÷ meses transcurridos × 12;
 *  desviación = (proyección − presupuesto) ÷ presupuesto. Todas las categorías, con o sin datos.
 */
export function presupuestoVsReal(
  gastos: readonly { fecha: string; categoria: string; monto: unknown }[],
  presupuestos: readonly { anio: unknown; categoria: string; monto: unknown }[],
  anio: number,
  hoy: string
): FilaPresupuesto[] {
  const meses = mesesTranscurridos(anio, hoy);
  return CATEGORIAS_GASTO.map(([k, etiqueta]) => {
    const real = gastos.filter((g) => g.categoria === k && Number(g.fecha.slice(0, 4)) === anio).reduce((s, g) => s + n(g.monto), 0);
    const presupuesto = n(presupuestos.find((p) => Number(p.anio) === anio && p.categoria === k)?.monto);
    const proyeccion = (real / meses) * 12;
    return {
      categoria: k,
      etiqueta,
      presupuesto,
      real,
      avance: presupuesto ? real / presupuesto : null,
      proyeccion,
      desviacion: presupuesto ? (proyeccion - presupuesto) / presupuesto : null
    };
  });
}
