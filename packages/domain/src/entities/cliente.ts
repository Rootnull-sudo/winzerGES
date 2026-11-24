import { z } from 'zod';
import { rutFormat, rutValid } from '../num';

export const CANALES = [
  ['distribuidor', 'Distribuidor'],
  ['restaurante', 'Restaurante / HORECA'],
  ['directa', 'Venta directa'],
  ['ecommerce', 'E-commerce'],
  ['granel', 'Granel']
] as const;
export const CANAL_IDS = CANALES.map((c) => c[0]) as unknown as readonly ['distribuidor', ...string[]];

const opt = z
  .string()
  .trim()
  .max(200)
  .optional()
  .nullable()
  .transform((v) => v || null);

/** Cliente — campos de js/modules/clientes/index.js (v1). */
export const clienteInput = z.object({
  id: z.string().min(1).optional(),
  nombre: z.string().trim().min(1, 'Ingresa el nombre o razón social.').max(200),
  rut: z.string().trim().refine(rutValid, 'RUT inválido: revisa el dígito verificador.').transform(rutFormat),
  tipo: z.enum(['Empresa', 'Persona']),
  giro: opt,
  canal: z
    .enum(CANALES.map((c) => c[0]) as [string, ...string[]])
    .optional()
    .nullable(),
  contacto: opt,
  email: z
    .union([z.literal(''), z.email('Correo inválido.')])
    .optional()
    .nullable()
    .transform((v) => v || null),
  telefono: opt,
  direccion: opt,
  comuna: opt,
  condiciones: opt,
  plazo: z.coerce.number().int().min(0).max(365).default(30)
});
export type ClienteInput = z.input<typeof clienteInput>;
export type Cliente = z.output<typeof clienteInput> & { id: string };

export const MEDIOS_COBRO = ['transferencia', 'efectivo', 'tarjeta', 'cheque'] as const;

/**
 * Cobro: pago recibido de un cliente, aplicado a una o varias ventas (F5-4). Lo no aplicado queda como anticipo.
 * Corrige v1: "marcar pagada" ignoraba cobros anteriores y no había cobros parciales ni saldo real.
 */
export const cobroInput = z
  .object({
    id: z.string().min(1).optional(),
    fecha: z.iso.date('Fecha inválida.'),
    clienteId: z.string().min(1, 'Elige un cliente.'),
    monto: z.coerce.number().int('El monto es en pesos, sin decimales.').positive('El monto debe ser mayor a 0.'),
    medio: z.enum(MEDIOS_COBRO).default('transferencia'),
    glosa: z.string().trim().max(300).optional().nullable(),
    aplicaciones: z.array(z.object({ ventaId: z.string().min(1), monto: z.coerce.number().int().positive('Debe ser mayor a 0.') })).default([])
  })
  .refine((c) => c.aplicaciones.reduce((s, a) => s + a.monto, 0) <= c.monto, {
    message: 'Lo aplicado a las ventas no puede superar el monto del cobro.',
    path: ['aplicaciones']
  });
export type CobroInput = z.input<typeof cobroInput>;

export const ANTIGUEDAD = [
  ['por_vencer', 'Por vencer'],
  ['d1_30', '1–30 días'],
  ['d31_60', '31–60 días'],
  ['d60', 'Más de 60 días']
] as const;
export type Antiguedad = (typeof ANTIGUEDAD)[number][0];

/** Tramo de antigüedad de una deuda según los días vencidos (v1: clientes, cobranza). Sin vencimiento: por vencer. */
export function antiguedad(diasVencido: number): Antiguedad {
  if (diasVencido <= 0) return 'por_vencer';
  if (diasVencido <= 30) return 'd1_30';
  if (diasVencido <= 60) return 'd31_60';
  return 'd60';
}
