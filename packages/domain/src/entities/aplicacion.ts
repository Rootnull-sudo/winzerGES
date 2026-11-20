/**
 * Aplicaciones fitosanitarias y labores de campo — port de js/modules/insumos (pestañas Aplicaciones y Labores).
 * La aplicación descuenta el insumo con una reacción de sync (mov_insumo); su costo y su carencia se guardan como
 * foto del momento (precio y carencia del insumo al registrarla), igual que en v1.
 */
import { z } from 'zod';
import { n } from '../num';

const texto = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);
const numOpt = (msg = 'Debe ser ≥ 0.') => z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().min(0, msg).nullable()).optional();

export const aplicacionInput = z.object({
  id: z.string().min(1).optional(),
  fecha: z.iso.date('Fecha inválida.'),
  temporadaId: z.string().min(1, 'No hay temporada para esa fecha.'),
  cuartelId: z.string().min(1, 'Elige el cuartel.'),
  insumoId: z.string().min(1, 'Elige el insumo.'),
  /** Dosis por hectárea, en la unidad del insumo. */
  dosis: z.coerce.number({ message: 'Ingresa la dosis.' }).min(0, 'La dosis no puede ser negativa.'),
  /** Cantidad aplicada en total, en la unidad del insumo (sugerida: dosis × superficie). */
  cantidad: z.coerce.number({ message: 'Ingresa la cantidad.' }).positive('La cantidad debe ser mayor a 0.'),
  /** Foto de la carencia del insumo (días). */
  carencia: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().min(0).max(365).nullable()).optional(),
  /** Foto del costo: cantidad × precio del insumo al registrar (CLP). */
  costo: z.coerce.number().int().min(0).default(0),
  responsable: texto(120),
  observaciones: texto(1000)
});
export type AplicacionInput = z.input<typeof aplicacionInput>;
export type Aplicacion = z.output<typeof aplicacionInput> & { id: string };

/** Sugerencias de labor (v1: texto libre con datalist). */
export const TIPOS_LABOR = [
  'Poda',
  'Amarra',
  'Desbrote',
  'Deshoje',
  'Raleo',
  'Riego (energía)',
  'Mantención',
  'Control de malezas',
  'Reposición de plantas'
] as const;

export const laborInput = z
  .object({
    id: z.string().min(1).optional(),
    fecha: z.iso.date('Fecha inválida.'),
    temporadaId: z.string().min(1, 'No hay temporada para esa fecha.'),
    cuartelId: z.string().min(1, 'Elige el cuartel.'),
    tipo: z.string().trim().min(1, 'Indica la labor.').max(80),
    jornadas: numOpt(),
    valorJornada: numOpt(),
    otrosCostos: numOpt(),
    costo: z.unknown().optional(),
    responsable: texto(120)
  })
  // Costo = jornadas × valor de la jornada + otros (v1 lo calculaba solo si estaba vacío y quedaba desactualizado).
  .transform((l) => ({ ...l, costo: costoLabor(l) }));
export type LaborInput = z.input<typeof laborInput>;
export type Labor = z.output<typeof laborInput> & { id: string };

/** Cantidad sugerida = dosis/ha × superficie del cuartel. */
export const cantidadSugerida = (dosis: unknown, superficie: unknown) => Math.round(n(dosis) * n(superficie) * 1000) / 1000;

/** Costo de la aplicación = cantidad × precio del insumo (CLP, redondeado como v1). */
export const costoAplicacion = (cantidad: unknown, precio: unknown) => Math.round(n(cantidad) * n(precio));

/** Fecha desde la que se puede cosechar = fecha + días de carencia. */
export function cosecharDesde(fecha: string, carencia: unknown): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + n(carencia) * 86_400_000).toISOString().slice(0, 10);
}

/** Costo de la labor = jornadas × valor de la jornada + otros costos (CLP). */
export const costoLabor = (l: { jornadas?: unknown; valorJornada?: unknown; otrosCostos?: unknown }) =>
  Math.round(n(l.jornadas) * n(l.valorJornada) + n(l.otrosCostos));
