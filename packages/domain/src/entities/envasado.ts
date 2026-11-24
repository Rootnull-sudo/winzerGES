/**
 * Órdenes de envasado y libro de producto terminado — port de js/modules/envasado (v1).
 * Diferencias con v1 (bugs corregidos):
 *  - El stock de botellas es un libro (`mov_producto`: + envasar, − vender, ± ajustes); v1 lo derivaba de "unidades de
 *    la orden − ventas" y no admitía quiebres ni muestras.
 *  - Confirmar valida el stock de TODOS los materiales (v1 no validaba y dejaba stock negativo) y escribe bodega,
 *    insumos y producto en una sola transacción (v1: listener sin atomicidad).
 *  - Los litros que se descuentan son los mismos que se guardan en la orden (v1 guardaba redondeado y descontaba sin
 *    redondear).
 *  - El código sale de una secuencia (v1: count + 1, podía repetirse).
 */
import { z } from 'zod';

const idOpt = z.preprocess((v) => v || null, z.string().nullable()).optional();
const monto = z.preprocess((v) => (v === '' || v == null ? 0 : v), z.coerce.number().min(0, 'No puede ser negativo.'));
const texto = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const ordenEnvasadoInput = z.object({
  id: z.string().min(1).optional(),
  fecha: z.iso.date('Fecha inválida.'),
  estanqueId: z.string().min(1, 'Elige el estanque.'),
  loteId: z.string().min(1, 'Elige el lote.'),
  formatoId: z.string().min(1, 'Elige el formato.'),
  unidades: z.coerce.number({ message: 'Ingresa las unidades.' }).int('Unidades enteras.').min(1, 'Mínimo 1.'),
  mermaPct: z.preprocess((v) => (v === '' || v == null ? 1.5 : v), z.coerce.number().min(0).max(20, 'Máximo 20 %.')),
  responsable: texto(120),
  envaseId: z.string().min(1, 'Elige el envase.'),
  cierreId: idOpt,
  capsulaId: idOpt,
  cajaId: idOpt,
  etiquetaId: idOpt,
  etiquetaInsumoId: idOpt,
  manoObra: monto.default(0),
  energiaAgua: monto.default(0),
  graduacion: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().min(0).max(25).nullable()).optional(),
  declaraDO: z.preprocess((v) => v === true || v === 'true' || v === 'on', z.boolean()).default(false),
  pctUvaZona: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().min(0).max(100).nullable()).optional(),
  certificadoDO: texto(60),
  observaciones: texto(500)
});
export type OrdenEnvasadoInput = z.input<typeof ordenEnvasadoInput>;

export const TIPOS_MOV_PRODUCTO = [
  ['envasado', 'Envasado'],
  ['venta', 'Venta'],
  ['anulacion', 'Anulación'],
  ['ajuste', 'Ajuste por conteo'],
  ['muestra', 'Muestra'],
  ['quiebre', 'Quiebre']
] as const;

/** Ajuste manual de producto terminado (quiebre, muestra o conteo físico). */
export const ajusteProductoInput = z
  .object({
    ordenEnvasadoId: z.string().min(1, 'Elige el producto.'),
    fecha: z.iso.date('Fecha inválida.'),
    tipo: z.enum(['quiebre', 'muestra', 'ajuste']),
    /** quiebre y muestra: unidades que salen; ajuste: unidades contadas. */
    cantidad: z.coerce.number({ message: 'Ingresa la cantidad.' }).int('Unidades enteras.').min(0, 'No puede ser negativa.'),
    motivo: texto(200)
  })
  .refine((a) => a.tipo === 'ajuste' || a.cantidad > 0, { message: 'Debe ser mayor a 0.', path: ['cantidad'] });
export type AjusteProductoInput = z.input<typeof ajusteProductoInput>;

/** Lote bajo este volumen tras envasar pasa a "Envasado" (v1: < 1 L). */
export const LITROS_LOTE_ENVASADO = 1;
