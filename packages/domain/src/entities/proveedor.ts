/**
 * Proveedores — port de js/modules/proveedores (v1), maestro.
 * Diferencia con v1: plazo 0 es contado (vence el mismo día); v1 lo convertía en 30 días (`plazo || 30`).
 */
import { z } from 'zod';
import { rutFormat, rutValid } from '../num';

export const CATEGORIAS_PROVEEDOR = [
  'Envases vidrio',
  'Envases PET',
  'Corchos y cápsulas',
  'Etiquetas',
  'Insumos agrícolas',
  'Insumos enológicos',
  'Servicios básicos',
  'Transporte',
  'Servicios profesionales'
] as const;
export const CONDICIONES_PROVEEDOR = ['Contado', '30 días', '45 días', '60 días'] as const;

const opt = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const proveedorInput = z.object({
  id: z.string().min(1).optional(),
  nombre: z.string().trim().min(1, 'Ingresa la razón social.').max(200),
  rut: z.string().trim().refine(rutValid, 'RUT inválido: revisa el dígito verificador.').transform(rutFormat),
  categoria: opt(80),
  contacto: opt(),
  email: z
    .union([z.literal(''), z.email('Correo inválido.')])
    .optional()
    .nullable()
    .transform((v) => v || null),
  telefono: opt(40),
  condiciones: opt(80),
  /** Días de crédito: 0 = contado. */
  plazo: z.coerce.number().int('Debe ser un número entero.').min(0, 'No puede ser negativo.').max(365).default(30)
});
export type ProveedorInput = z.input<typeof proveedorInput>;
export type Proveedor = z.output<typeof proveedorInput> & { id: string };

/** Vencimiento propuesto de un documento: fecha + plazo del proveedor (0 = contado, mismo día). */
export function vencimientoSugerido(fecha: string, plazo: number | null | undefined): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.trunc(Number(plazo ?? 30) || 0)));
  return d.toISOString().slice(0, 10);
}
