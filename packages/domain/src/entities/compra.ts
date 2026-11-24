/**
 * Compras a proveedores — port de js/modules/proveedores (v1), con líneas.
 * Diferencias con v1 (bugs corregidos):
 *  - Varias líneas por documento (v1: una sola).
 *  - Montos SIEMPRE positivos; el signo lo da el documento. v1 guardaba la nota de crédito en negativo y el libro le
 *    volvía a aplicar el signo (doble negativo): la NC subía el crédito de IVA y el stock.
 *  - La guía de despacho mueve stock pero no genera deuda ni IVA; la factura que referencia una guía no vuelve a
 *    sumar stock (v1 contaba la guía como deuda junto a su factura).
 */
import { z } from 'zod';
import { n } from '../num';

export const DOCUMENTOS_COMPRA = [
  ['factura', 'Factura'],
  ['factura_exenta', 'Factura exenta'],
  ['boleta', 'Boleta'],
  ['guia', 'Guía de despacho'],
  ['nota_credito', 'Nota de crédito']
] as const;
export type DocumentoCompra = (typeof DOCUMENTOS_COMPRA)[number][0];
const DOCS = DOCUMENTOS_COMPRA.map((d) => d[0]) as [DocumentoCompra, ...DocumentoCompra[]];

/** Documentos que generan deuda con el proveedor (la NC la reduce en su documento de referencia). */
export const docGeneraDeuda = (d: string) => d === 'factura' || d === 'factura_exenta' || d === 'boleta';

/** Signo del stock de las líneas: +1 entra, −1 sale (NC), 0 no mueve (factura de una guía ya recibida). */
export function signoStock(documento: string, referenciaEsGuia = false): -1 | 0 | 1 {
  if (documento === 'nota_credito') return -1;
  if (documento === 'factura' && referenciaEsGuia) return 0;
  return 1;
}

const texto = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);
const idOpt = z.preprocess((v) => v || null, z.string().nullable()).optional();

export const compraLineaInput = z.object({
  id: z.string().min(1).optional(),
  insumoId: idOpt,
  descripcion: z.string().trim().min(1, 'Describe la línea.').max(200),
  cantidad: z.coerce.number({ message: 'Ingresa la cantidad.' }).positive('La cantidad debe ser mayor a 0.'),
  /** Precio unitario neto (en boleta, el pagado). */
  precioUnitario: z.coerce.number({ message: 'Ingresa el precio.' }).min(0, 'No puede ser negativo.'),
  exenta: z.coerce.boolean().default(false)
});
export type CompraLineaInput = z.input<typeof compraLineaInput>;
export type CompraLinea = z.output<typeof compraLineaInput> & { id: string; neto: number };

export const compraInput = z
  .object({
    id: z.string().min(1).optional(),
    fecha: z.iso.date('Fecha inválida.'),
    proveedorId: z.string().min(1, 'Elige el proveedor.'),
    documento: z.enum(DOCS),
    folio: z.string().trim().min(1, 'Ingresa el folio.').max(30),
    referenciaCompraId: idOpt,
    vencimiento: z.preprocess((v) => v || null, z.iso.date('Fecha inválida.').nullable()).optional(),
    observaciones: texto(500),
    lineas: z.array(compraLineaInput).min(1, 'Agrega al menos una línea.')
  })
  .refine((c) => c.documento !== 'nota_credito' || !!c.referenciaCompraId, {
    message: 'La nota de crédito debe indicar la compra que corrige.',
    path: ['referenciaCompraId']
  })
  .refine((c) => !c.vencimiento || c.vencimiento >= c.fecha, { message: 'Debe ser igual o posterior a la fecha.', path: ['vencimiento'] })
  // La factura exenta no tiene líneas afectas; la guía y la NC no vencen.
  .transform((c) => ({
    ...c,
    lineas: c.documento === 'factura_exenta' ? c.lineas.map((l) => ({ ...l, exenta: true })) : c.lineas,
    vencimiento: docGeneraDeuda(c.documento) ? (c.vencimiento ?? null) : null
  }));
export type CompraInput = z.input<typeof compraInput>;
export type Compra = z.output<typeof compraInput> & { id: string; neto: number; exento: number; iva: number; total: number; estado: string };

/** Neto de una línea: cantidad × precio, redondeado al peso (v1: Math.round en beforeSave). */
export const netoLinea = (l: { cantidad: unknown; precioUnitario: unknown }) => Math.round(n(l.cantidad) * n(l.precioUnitario));

/**
 * Totales del documento (siempre positivos):
 *  neto = Σ líneas afectas, exento = Σ líneas exentas, IVA = neto × tasa solo en factura y nota de crédito
 *  (la boleta no da crédito; la guía no es tributaria), total = neto + exento + IVA.
 */
export function totalesCompra(lineas: readonly { cantidad: unknown; precioUnitario: unknown; exenta?: unknown }[], documento: string, tasaIVA: number) {
  let neto = 0;
  let exento = 0;
  for (const l of lineas) {
    const x = netoLinea(l);
    if (documento === 'factura_exenta' || l.exenta) exento += x;
    else neto += x;
  }
  const iva = documento === 'factura' || documento === 'nota_credito' ? Math.round(neto * tasaIVA) : 0;
  return { neto, exento, iva, total: neto + exento + iva };
}

/** Variación del precio contra el anterior: (nuevo − anterior) / anterior; null sin anterior. */
export const variacionPrecio = (nuevo: unknown, anterior: unknown) => (n(anterior) ? (n(nuevo) - n(anterior)) / n(anterior) : null);
/** Alza de precio que se destaca al registrar (v1: 5 %). */
export const ALZA_PRECIO_DESTACADA = 0.05;

export type EstadoPagoDoc = 'anulada' | 'sin_deuda' | 'pagada' | 'parcial' | 'vencida' | 'pendiente';
export const ESTADO_PAGO_LABEL: Record<EstadoPagoDoc, string> = {
  anulada: 'Anulada',
  sin_deuda: 'Sin deuda',
  pagada: 'Pagada',
  parcial: 'Pago parcial',
  vencida: 'Vencida',
  pendiente: 'Pendiente'
};

/**
 * Estado de pago derivado del saldo (no se guarda; v1 guardaba `estadoPago` y cualquier pago la dejaba "pagada").
 * Sin vencimiento no está vencida (v1 mostraba "Vencida" con la fecha vacía).
 */
export function estadoPagoDoc(
  d: { documento: string; estado?: string | null; total: unknown; saldo: unknown; vencimiento?: string | null },
  hoy: string
): EstadoPagoDoc {
  if (d.estado === 'anulada') return 'anulada';
  if (!docGeneraDeuda(d.documento)) return 'sin_deuda';
  const saldo = n(d.saldo);
  if (saldo <= 0) return 'pagada';
  if (d.vencimiento && d.vencimiento < hoy) return 'vencida';
  return saldo < n(d.total) ? 'parcial' : 'pendiente';
}
