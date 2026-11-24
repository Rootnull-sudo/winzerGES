/**
 * Activos fijos y depreciación lineal — port de js/modules/costos (pestaña Activos) y financial.depreciacion (v1).
 * Diferencias con v1 (bugs corregidos):
 *  - La depreciación TERMINA al cumplir la vida útil (o en la fecha de baja); v1 seguía depreciando para siempre.
 *  - Se prorratea por día desde la fecha de compra; v1 contaba el período completo aunque el activo se comprara a
 *    mitad de él, y la pantalla (días/365) y el estado de resultados (meses de 30,4 días) daban cifras distintas.
 */
import { z } from 'zod';
import { diffDays, n } from '../num';

const fechaOpt = z.preprocess((v) => v || null, z.iso.date('Fecha inválida.').nullable()).optional();

export const activoInput = z
  .object({
    id: z.string().min(1).optional(),
    nombre: z.string().trim().min(1, 'Ingresa el nombre del activo.').max(200),
    /** Valor de compra neto (CLP). */
    valor: z.coerce.number({ message: 'Ingresa el valor.' }).int('El valor es en pesos, sin decimales.').min(0, 'No puede ser negativo.'),
    vidaUtilAnios: z.coerce
      .number({ message: 'Ingresa la vida útil.' })
      .int('Debe ser un número entero de años.')
      .min(1, 'Mínimo 1 año.')
      .max(80, 'Máximo 80 años.'),
    fechaCompra: z.iso.date('Fecha inválida.'),
    fechaBaja: fechaOpt,
    compraId: z.preprocess((v) => v || null, z.string().nullable()).optional(),
    observaciones: z
      .string()
      .trim()
      .max(500)
      .optional()
      .nullable()
      .transform((v) => v || null)
  })
  .refine((a) => !a.fechaBaja || a.fechaBaja >= a.fechaCompra, { message: 'Debe ser posterior a la fecha de compra.', path: ['fechaBaja'] });
export type ActivoInput = z.input<typeof activoInput>;
export type Activo = z.output<typeof activoInput> & { id: string };

type ActivoCalc = { valor: unknown; vidaUtilAnios: unknown; fechaCompra: string; fechaBaja?: string | null };

/** Depreciación anual lineal = valor ÷ vida útil (v1: valor / vidaUtil). */
export const depreciacionAnual = (a: Pick<ActivoCalc, 'valor' | 'vidaUtilAnios'>) => n(a.valor) / (n(a.vidaUtilAnios) || 1);

/** Último día de la vida útil: fecha de compra + vida útil en años − 1 día. */
export function finVidaUtil(a: Pick<ActivoCalc, 'fechaCompra' | 'vidaUtilAnios'>): string {
  const d = new Date(`${a.fechaCompra}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + (n(a.vidaUtilAnios) || 1));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Depreciación acumulada al cierre de `fecha` = anual ÷ 365 × días desde la compra (inclusive), hasta la fecha de baja,
 * con tope en el valor (termina al cumplir la vida útil). Antes de la compra, 0.
 */
export function depreciacionAcumulada(a: ActivoCalc, fecha: string): number {
  const corte = a.fechaBaja && a.fechaBaja < fecha ? a.fechaBaja : fecha;
  if (corte < a.fechaCompra) return 0;
  const dias = (diffDays(a.fechaCompra, corte) ?? 0) + 1;
  return Math.min(n(a.valor), (depreciacionAnual(a) / 365) * dias);
}

/** Depreciación del período [desde, hasta] (ambos inclusive): acumulada(hasta) − acumulada(día anterior a desde). */
export function depreciacionEntre(a: ActivoCalc, desde: string, hasta: string): number {
  const antes = new Date(`${desde}T12:00:00Z`);
  antes.setUTCDate(antes.getUTCDate() - 1);
  return depreciacionAcumulada(a, hasta) - depreciacionAcumulada(a, antes.toISOString().slice(0, 10));
}

/** Valor libro a una fecha: valor − depreciación acumulada. */
export const valorLibro = (a: ActivoCalc, fecha: string) => Math.max(0, n(a.valor) - depreciacionAcumulada(a, fecha));

export type EstadoActivo = 'en_uso' | 'depreciado' | 'de_baja';
export function estadoActivo(a: ActivoCalc, fecha: string): EstadoActivo {
  if (a.fechaBaja && a.fechaBaja <= fecha) return 'de_baja';
  return finVidaUtil({ fechaCompra: a.fechaCompra, vidaUtilAnios: a.vidaUtilAnios }) < fecha ? 'depreciado' : 'en_uso';
}
