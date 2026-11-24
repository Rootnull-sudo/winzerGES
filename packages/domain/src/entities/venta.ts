/**
 * Ventas con líneas — port de js/modules/ventas (v1, una sola línea por venta).
 * Diferencias con v1 (bugs corregidos):
 *  - Varias líneas por venta, envasadas (de una orden con stock) o a granel (de un estanque y lote).
 *  - Boleta con precio CON IVA: se desglosa (`tax.totales` con ivaIncluido); v1 trataba el precio de boleta como neto.
 *  - ILA por línea: por defecto sí en envasado y no en granel (v1 lo aplicaba a todo).
 *  - Borrador → confirmada → anulada; confirmada no se edita (v1 dejaba cambiar todo salvo cantidad y precio con DTE).
 *  - Código y folio por secuencia (v1: count + 1 y folios reutilizables).
 */
import { z } from 'zod';
import type { OrgConfig } from '../config';
import { n } from '../num';
import { totales } from '../tax';

export const DOCUMENTOS_VENTA = [
  ['factura', 'Factura'],
  ['boleta', 'Boleta'],
  ['guia', 'Guía de despacho']
] as const;
export type DocumentoVenta = (typeof DOCUMENTOS_VENTA)[number][0];
/** Tipo de DTE según el documento (v1: dte.emitirDesdeVenta). */
export const tipoDte = (documento: string): 33 | 39 | 52 => (documento === 'boleta' ? 39 : documento === 'guia' ? 52 : 33);

const idOpt = z.preprocess((v) => v || null, z.string().nullable()).optional();
const texto = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);
const bool = z.preprocess((v) => (v === 'on' || v === 'true' ? true : v === 'false' ? false : v), z.boolean());

export const ventaLineaInput = z
  .object({
    id: z.string().min(1).optional(),
    tipo: z.enum(['envasado', 'granel']).default('envasado'),
    ordenEnvasadoId: idOpt,
    estanqueId: idOpt,
    loteId: idOpt,
    descripcion: texto(200),
    /** Unidades (envasado) o litros (granel). */
    cantidad: z.coerce.number({ message: 'Ingresa la cantidad.' }).positive('Debe ser mayor a 0.'),
    /** Neto por unidad o litro (en boleta, con IVA incluido). */
    precio: z.coerce.number({ message: 'Ingresa el precio.' }).min(0, 'No puede ser negativo.'),
    afectoIla: bool.optional(),
    graduacion: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().min(0).max(25).nullable()).optional()
  })
  .refine((l) => l.tipo !== 'envasado' || !!l.ordenEnvasadoId, { message: 'Elige el producto.', path: ['ordenEnvasadoId'] })
  .refine((l) => l.tipo !== 'granel' || (!!l.estanqueId && !!l.loteId), { message: 'Elige el estanque y el lote.', path: ['loteId'] })
  .refine((l) => l.tipo !== 'envasado' || Number.isInteger(l.cantidad), { message: 'Unidades enteras.', path: ['cantidad'] })
  .transform((l) => ({ ...l, afectoIla: l.afectoIla ?? l.tipo === 'envasado' }));
export type VentaLineaInput = z.input<typeof ventaLineaInput>;

export const ventaInput = z
  .object({
    id: z.string().min(1).optional(),
    fecha: z.iso.date('Fecha inválida.'),
    clienteId: z.string().min(1, 'Elige el cliente.'),
    canal: texto(40),
    documento: z.enum(['factura', 'boleta', 'guia']).default('factura'),
    generarDte: bool.default(true),
    vencimiento: z.preprocess((v) => v || null, z.iso.date('Fecha inválida.').nullable()).optional(),
    observaciones: texto(500),
    lineas: z.array(ventaLineaInput).min(1, 'Agrega al menos una línea.')
  })
  .refine((v) => !v.vencimiento || v.vencimiento >= v.fecha, { message: 'Debe ser igual o posterior a la fecha.', path: ['vencimiento'] });
export type VentaInput = z.input<typeof ventaInput>;

type Trib = OrgConfig['tributario'];

/** Neto de la línea antes de impuestos: cantidad × precio, redondeado (en boleta es el bruto). */
export const montoLinea = (l: { cantidad: unknown; precio: unknown }) => Math.round(n(l.cantidad) * n(l.precio));

/**
 * Totales de la venta, por línea con `tax.totales` (v1: un solo `totales` por venta de una línea):
 *  factura y guía: neto = cantidad × precio; IVA = neto × tasa; ILA = neto × tasaILA si la línea está afecta.
 *  boleta: cantidad × precio es el total con impuestos y se desglosa (ivaIncluido).
 */
export function totalesVenta(lineas: readonly { cantidad: unknown; precio: unknown; afectoIla?: boolean | null }[], documento: string, t: Trib) {
  const r = { neto: 0, exento: 0, iva: 0, ila: 0, total: 0, lineas: [] as { neto: number; iva: number; ila: number; total: number }[] };
  for (const l of lineas) {
    const x = totales(montoLinea(l), t, { ila: !!l.afectoIla, ivaIncluido: documento === 'boleta' });
    r.neto += x.neto;
    r.iva += x.iva;
    r.ila += x.ila;
    r.total += x.total;
    r.lineas.push({ neto: x.neto, iva: x.iva, ila: x.ila, total: x.total });
  }
  return r;
}

/** Margen bruto: neto − Σ cantidad × costo unitario congelado (solo para roles que ven costos). */
export function margenVenta(neto: number, lineas: readonly { cantidad: unknown; costoUnitario?: unknown }[]) {
  const costo = lineas.reduce((s, l) => s + n(l.cantidad) * n(l.costoUnitario), 0);
  return { costo, margen: neto - costo, pct: neto ? (neto - costo) / neto : null };
}
