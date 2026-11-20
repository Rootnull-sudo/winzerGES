/**
 * Cosecha y jornales — port de js/modules/cosecha y js/calc/financial.js (costoCosecha, pagoJornal) de v1.
 * El costo de la cosecha no se guarda: se calcula con sus jornales y otros costos.
 */
import { z } from 'zod';
import { n, rutFormat, rutValid, sum } from '../num';

/** Destino de la uva (v1 guardaba el texto; v2 guarda el id). */
export const DESTINOS_COSECHA = [
  ['propia', 'Vinificación propia'],
  ['venta', 'Venta de uva'],
  ['descarte', 'Descarte']
] as const;
export type DestinoCosecha = (typeof DESTINOS_COSECHA)[number][0];
/** Texto de v1 → id de v2 (acepta también el id). */
export const destinoDeV1 = (v: unknown): DestinoCosecha =>
  (DESTINOS_COSECHA.find(
    ([id, l]) =>
      id === v ||
      l.toLowerCase() ===
        String(v ?? '')
          .trim()
          .toLowerCase()
  )?.[0] ?? 'propia') as DestinoCosecha;

export const TARIFAS_JORNAL = [
  ['kg', 'Por kg'],
  ['cajon', 'Por cajón'],
  ['dia', 'Por día']
] as const;
export type TarifaJornal = (typeof TARIFAS_JORNAL)[number][0];

const montoOpt = z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int('Monto en pesos, sin decimales.').min(0).nullable()).optional();
const numOpt = z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().min(0, 'Debe ser ≥ 0.').nullable()).optional();

export const cosechaInput = z.object({
  id: z.string().min(1).optional(),
  fecha: z.iso.date('Fecha inválida.'),
  temporadaId: z.string().min(1, 'No hay temporada para esa fecha.'),
  cuartelId: z.string().min(1, 'Elige el cuartel.'),
  /** Lote de bodega (F2-1). */
  loteId: z.preprocess((v) => v || null, z.string().nullable()).optional(),
  cajones: z.coerce.number({ message: 'Ingresa los cajones.' }).int('Los cajones son un número entero.').min(1, 'Al menos 1 cajón.'),
  kg: z.coerce.number({ message: 'Ingresa los kg.' }).positive('Los kg deben ser mayores a 0.'),
  destino: z.preprocess((v) => (v ? destinoDeV1(v) : 'propia'), z.enum(['propia', 'venta', 'descarte'])),
  costoBins: montoOpt,
  costoTransporte: montoOpt,
  costoAlimentacion: montoOpt,
  otrosCostos: montoOpt,
  observaciones: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .transform((v) => v || null)
});
export type CosechaInput = z.input<typeof cosechaInput>;
export type Cosecha = z.output<typeof cosechaInput> & { id: string };

export const jornalInput = z
  .object({
    id: z.string().min(1).optional(),
    cosechaId: z.string().min(1, 'Falta la cosecha.'),
    nombre: z.string().trim().min(1, 'Ingresa el nombre del trabajador o de la cuadrilla.').max(120),
    rut: z.preprocess(
      (v) => (v ? String(v).trim() : null),
      z.string().refine(rutValid, 'RUT inválido: revisa el dígito verificador.').transform(rutFormat).nullable()
    ),
    cuadrilla: z
      .string()
      .trim()
      .max(80)
      .optional()
      .nullable()
      .transform((v) => v || null),
    trabajadores: z.preprocess((v) => (v === '' || v == null ? 1 : v), z.coerce.number().int().min(1, 'Al menos 1 trabajador.')),
    horas: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().min(0).max(14, 'Máximo 14 horas.').nullable()).optional(),
    tarifaTipo: z.enum(['kg', 'cajon', 'dia']),
    tarifa: z.coerce.number({ message: 'Ingresa la tarifa.' }).int('Tarifa en pesos, sin decimales.').min(0),
    kg: numOpt,
    cajones: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().min(0).nullable()).optional(),
    jornadas: numOpt,
    pago: z.unknown().optional()
  })
  // v1 pagaba 1 día si "jornadas" quedaba vacío con tarifa por día: ahora es obligatorio.
  .refine((j) => j.tarifaTipo !== 'dia' || n(j.jornadas) > 0, { message: 'Indica las jornadas (días × trabajadores).', path: ['jornadas'] })
  .transform((j) => {
    // Solo queda la cantidad que corresponde a la tarifa (como los campos ocultos de v1).
    const limpio = {
      ...j,
      kg: j.tarifaTipo === 'kg' ? (j.kg ?? null) : null,
      cajones: j.tarifaTipo === 'cajon' ? (j.cajones ?? null) : null,
      jornadas: j.tarifaTipo === 'dia' ? (j.jornadas ?? null) : null
    };
    return { ...limpio, pago: Math.round(pagoJornal(limpio)) };
  });
export type JornalInput = z.input<typeof jornalInput>;
export type Jornal = z.output<typeof jornalInput> & { id: string };

/** Pago de un jornal según tarifa: por kg, por cajón o por día (v1: financial.pagoJornal). */
export function pagoJornal(j: { tarifa?: unknown; tarifaTipo?: string | null; kg?: unknown; cajones?: unknown; jornadas?: unknown }): number {
  const t = n(j.tarifa);
  if (j.tarifaTipo === 'kg') return t * n(j.kg);
  if (j.tarifaTipo === 'cajon') return t * n(j.cajones);
  return t * (n(j.jornadas) || 1);
}

/** Costo de un registro de cosecha: jornales + bins + transporte + alimentación + otros (v1: financial.costoCosecha). */
export function costoCosecha(
  c: { id: string; kg?: unknown; costoBins?: unknown; costoTransporte?: unknown; costoAlimentacion?: unknown; otrosCostos?: unknown },
  jornales: readonly { cosechaId: string; tarifa?: unknown; tarifaTipo?: string | null; kg?: unknown; cajones?: unknown; jornadas?: unknown }[]
) {
  const jor = sum(
    jornales.filter((j) => j.cosechaId === c.id),
    (j) => pagoJornal(j)
  );
  const otros = n(c.costoBins) + n(c.costoTransporte) + n(c.costoAlimentacion) + n(c.otrosCostos);
  const total = jor + otros;
  return { jornales: jor, otros, total, porKg: n(c.kg) ? total / n(c.kg) : 0 };
}

/** Rendimiento kg/ha y kg por planta (null si falta el dato del cuartel). */
export const rendimientoKgHa = (kg: unknown, superficie: unknown) => (n(superficie) ? n(kg) / n(superficie) : null);
export const kgPorPlanta = (kg: unknown, plantas: unknown) => (n(plantas) ? n(kg) / n(plantas) : null);
export const kgPorCajon = (kg: unknown, cajones: unknown) => (n(cajones) ? n(kg) / n(cajones) : null);
