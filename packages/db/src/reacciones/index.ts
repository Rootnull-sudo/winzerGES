/**
 * Reacciones de sync (ADR 0010): efectos sobre tablas de otro módulo cuando llega una mutación offline.
 * `sync.push` las ejecuta en la MISMA transacción que la escritura: si una reacción falla, la mutación se rechaza
 * completa y nada queda a medias.
 *
 * Reglas para escribir una reacción:
 *  - Idempotente: aplicarla dos veces deja lo mismo (upsert por id derivado, o borrar y reescribir por origen_id).
 *  - Escribe como sistema: el permiso ya se verificó sobre la entidad que la disparó. Usa `tx` directo y deja
 *    `createdBy`/`updatedBy` con el usuario para la trazabilidad.
 *  - Un archivo por módulo (`reacciones/<modulo>.ts`) y una línea en REACCIONES: así dos ramas no chocan.
 * Las acciones online no pasan por aquí: sus efectos van en el servicio (packages/db/src/services/).
 */
import type { Tx } from '../client';
import type { Actor } from '../repo';
import { variedadDesdeCuartel } from './catastro';
import { loteEnMolienda, validarMovimientoBodega } from './bodega';
import { jornalesDeCosechaBorrada, loteEnVendimia } from './cosecha';
import { efectosDeSO2, fichaBorrada, fichaDesdeEntrada, loteSegunFicha } from './fermentacion';
import { consumoDeAditivo, consumoDeAplicacion } from './insumos';

export interface ContextoReaccion {
  entity: string;
  op: 'upsert' | 'delete';
  /** Fila antes de la mutación (null si es nueva). */
  previo: Record<string, unknown> | null;
  /** Fila después de la mutación (con `deletedAt` si se borró). */
  registro: Record<string, unknown>;
  /** La escritura viene del importador de v1 (datos históricos): no se crean tareas ni avisos. */
  importando?: boolean;
}

export type Reaccion = (tx: Tx, actor: Actor, c: ContextoReaccion) => Promise<void>;

export const REACCIONES: Record<string, readonly Reaccion[]> = {
  cuartel: [variedadDesdeCuartel],
  aplicacion: [consumoDeAplicacion],
  cosecha: [jornalesDeCosechaBorrada, loteEnVendimia],
  mov_bodega: [validarMovimientoBodega, loteEnMolienda, fichaDesdeEntrada],
  fermentacion: [loteSegunFicha, fichaBorrada],
  adicion_so2: [efectosDeSO2],
  aditivo: [consumoDeAditivo]
};

/** Ejecuta las reacciones registradas para la entidad, en orden. */
export async function reaccionar(tx: Tx, actor: Actor, c: ContextoReaccion): Promise<void> {
  for (const r of REACCIONES[c.entity] ?? []) await r(tx, actor, c);
}
