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

/** Cobro: pago recibido de un cliente (se concilia con la cartola bancaria). */
export const cobroInput = z.object({
  id: z.string().min(1).optional(),
  fecha: z.iso.date('Fecha inválida.'),
  clienteId: z.string().min(1, 'Elige un cliente.'),
  ventaId: z.string().optional().nullable(),
  monto: z.coerce.number().int('El monto es en pesos, sin decimales.').positive('El monto debe ser mayor a 0.'),
  medio: z.enum(MEDIOS_COBRO).default('transferencia'),
  glosa: z.string().trim().max(300).optional().nullable()
});
export type CobroInput = z.input<typeof cobroInput>;
