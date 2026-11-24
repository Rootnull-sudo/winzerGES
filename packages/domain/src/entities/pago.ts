/**
 * Pagos a proveedores con aplicaciones a documentos (F3-3).
 * Corrige v1: cualquier monto dejaba la compra "pagada" y la entidad `pago` no la leía nadie (cuentas por pagar,
 * flujo y conciliación usaban el total). En v2 el saldo = total − NC − Σ aplicaciones, y el pago parcial existe.
 */
import { z } from 'zod';
import { diffDays, n } from '../num';

export const MEDIOS_PAGO = [
  ['transferencia', 'Transferencia'],
  ['cheque', 'Cheque'],
  ['efectivo', 'Efectivo'],
  ['tarjeta', 'Tarjeta']
] as const;
const MEDIOS = MEDIOS_PAGO.map((m) => m[0]) as [string, ...string[]];

const idOpt = z.preprocess((v) => v || null, z.string().nullable()).optional();
const entero = (msg: string) => z.coerce.number({ message: msg }).int('El monto es en pesos, sin decimales.').positive('Debe ser mayor a 0.');

export const aplicacionPagoInput = z
  .object({
    compraId: idOpt,
    gastoId: idOpt,
    monto: entero('Ingresa el monto a aplicar.')
  })
  .refine((a) => !!a.compraId !== !!a.gastoId, { message: 'Cada aplicación va a una compra o a un gasto.' });

export const pagoInput = z
  .object({
    id: z.string().min(1).optional(),
    fecha: z.iso.date('Fecha inválida.'),
    proveedorId: idOpt,
    monto: entero('Ingresa el monto.'),
    medio: z.enum(MEDIOS).default('transferencia'),
    referencia: z
      .string()
      .trim()
      .max(80)
      .optional()
      .nullable()
      .transform((v) => v || null),
    observaciones: z
      .string()
      .trim()
      .max(500)
      .optional()
      .nullable()
      .transform((v) => v || null),
    aplicaciones: z.array(aplicacionPagoInput).min(1, 'Aplica el pago al menos a un documento.')
  })
  .refine((p) => p.aplicaciones.reduce((s, a) => s + a.monto, 0) === p.monto, {
    message: 'La suma aplicada a los documentos debe ser igual al monto del pago.',
    path: ['aplicaciones']
  });
export type PagoInput = z.input<typeof pagoInput>;

export interface DocAbierto {
  id: string;
  saldo: number;
  vencimiento?: string | null;
  fecha: string;
}

/** Reparte un monto entre documentos abiertos: primero los que vencen antes (sin vencimiento, por fecha). */
export function aplicarEnOrden(docs: readonly DocAbierto[], monto: number): { id: string; monto: number }[] {
  let resto = Math.max(0, Math.round(n(monto)));
  const out: { id: string; monto: number }[] = [];
  const orden = [...docs].sort((a, b) => (a.vencimiento ?? a.fecha).localeCompare(b.vencimiento ?? b.fecha) || a.fecha.localeCompare(b.fecha));
  for (const d of orden) {
    if (resto <= 0) break;
    const x = Math.min(resto, Math.max(0, Math.round(d.saldo)));
    if (x > 0) out.push({ id: d.id, monto: x });
    resto -= x;
  }
  return out;
}

/** Días al vencimiento (negativo = vencido hace N días; v1: diffDays(hoy, vencimiento || hoy)). */
export const diasAlVencimiento = (vencimiento: string | null | undefined, hoy: string) => (vencimiento ? (diffDays(hoy, vencimiento) ?? 0) : 0);
/** Horizonte del aviso "por vencer" (v1: 7 días). */
export const DIAS_AVISO_POR_PAGAR = 7;

/** Resumen de cuentas por pagar (v1: KPIs de CxP): total, vencido y lo que vence en los próximos 7 días. */
export function resumenPorPagar(docs: readonly { saldo: number; vencimiento?: string | null }[], hoy: string) {
  let total = 0,
    vencido = 0,
    proximo = 0;
  for (const d of docs) {
    if (d.saldo <= 0) continue;
    total += d.saldo;
    const dias = diasAlVencimiento(d.vencimiento, hoy);
    if (d.vencimiento && dias < 0) vencido += d.saldo;
    else if (d.vencimiento && dias <= DIAS_AVISO_POR_PAGAR) proximo += d.saldo;
  }
  return { total, vencido, proximo };
}
