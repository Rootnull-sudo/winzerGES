/**
 * Honorarios (boletas de honorarios recibidas) — port de js/modules/administracion (v1), pestaña Honorarios.
 * Diferencias con v1 (bugs corregidos):
 *  - La retención usa la tasa vigente en la FECHA de la boleta (indicador `retencion_honorarios`, cambia cada año) y
 *    se guarda como foto; v1 usaba la tasa de hoy al guardar (y el seed la fijaba en 15,25 % para todos los años).
 *  - N° de boleta único por RUT del prestador; fecha de pago y pago reversible (v1 solo tenía el estado).
 */
import { z } from 'zod';
import { n, rutFormat, rutValid } from '../num';

const texto = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const honorarioInput = z.object({
  id: z.string().min(1).optional(),
  fecha: z.iso.date('Fecha inválida.'),
  nombre: z.string().trim().min(1, 'Ingresa el nombre del prestador.').max(200),
  rut: z.string().trim().refine(rutValid, 'RUT inválido: revisa el dígito verificador.').transform(rutFormat),
  numero: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int('Número entero.').positive().nullable()).optional(),
  descripcion: texto(300),
  bruto: z.coerce.number({ message: 'Ingresa el monto bruto.' }).int('Monto en pesos, sin decimales.').min(1, 'Debe ser mayor a 0.')
});
export type HonorarioInput = z.input<typeof honorarioInput>;

/** Retención = round(bruto × tasa) y líquido = bruto − retención (v1: tax.retencionHonorarios). */
export function calcularHonorario(bruto: unknown, tasa: number) {
  const b = Math.round(n(bruto));
  const retencion = Math.round(b * tasa);
  return { bruto: b, tasaRetencion: tasa, retencion, liquido: b - retencion };
}

/** Boleta de un respaldo v1: además trae la retención ya calculada y el estado de pago. */
export const honorarioV1Input = honorarioInput.extend({
  retencion: z.coerce.number().optional(),
  estado: z.string().optional(),
  fechaPago: z.string().nullable().optional()
});
