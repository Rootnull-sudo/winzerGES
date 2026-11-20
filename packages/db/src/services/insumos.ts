/**
 * Maestro de insumos (F1-1). Se escribe solo en línea (SYNC_ENTITIES.insumo.soloLectura); offline se lee.
 * Siempre dentro de withOrg() con la conexión de la app.
 */
import { ajusteStockInput, fechaHoy, insumoInput, type AjusteStockInput, type InsumoInput } from '@winzer/domain';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../client';
import { ReglaError, softDelete, upsert, type Actor, type EntityMeta } from '../repo';
import { insumo, insumoPrecio, movInsumo } from '../schema';

export const metaInsumo: EntityMeta = { entity: 'insumo', module: 'insumos', label: 'insumos', sensitive: true, display: (r) => String(r.nombre) };
export const metaMovInsumo: EntityMeta = {
  entity: 'mov_insumo',
  module: 'insumos',
  label: 'movimientos de insumos',
  sensitive: true,
  display: (r) => `${r.tipo} ${r.cantidad}`
};

/**
 * Crea o edita un insumo. Si es nuevo o cambia el precio, agrega una entrada al historial de precios (v1 no
 * guardaba el precio inicial ni los cambios manuales).
 */
export async function guardarInsumo(tx: Tx, actor: Actor, input: InsumoInput, baseVersion?: number, hoy = fechaHoy()) {
  const data = insumoInput.parse(input);
  const id = data.id ?? randomUUID();
  const [dup] = await tx
    .select({ id: insumo.id })
    .from(insumo)
    .where(and(sql`lower(${insumo.nombre}) = lower(${data.nombre})`, sql`${insumo.id} <> ${id}`, isNull(insumo.deletedAt)))
    .limit(1);
  if (dup) throw new ReglaError(`Ya existe un insumo llamado "${data.nombre}".`);
  const [antes] = await tx.select({ precio: insumo.precio }).from(insumo).where(eq(insumo.id, id));
  const rec = await upsert(tx, insumo, actor, metaInsumo, { ...data, id }, { baseVersion, checkVersion: baseVersion != null });
  if (!antes || Number(antes.precio) !== data.precio) {
    await tx.insert(insumoPrecio).values({
      id: randomUUID(),
      orgId: actor.orgId,
      insumoId: id,
      fecha: hoy,
      precio: data.precio,
      proveedorId: data.proveedorId,
      origen: 'manual',
      createdBy: actor.userId,
      updatedBy: actor.userId
    });
  }
  return rec;
}

/** Elimina un insumo sin movimientos (v1: "el insumo tiene movimientos (compras o consumos)"). */
export async function eliminarInsumo(tx: Tx, actor: Actor, id: string) {
  const [mov] = await tx
    .select({ id: movInsumo.id })
    .from(movInsumo)
    .where(and(eq(movInsumo.insumoId, id), isNull(movInsumo.deletedAt)))
    .limit(1);
  if (mov) throw new ReglaError('No se puede eliminar: el insumo tiene movimientos (compras, aplicaciones o ajustes).');
  return softDelete(tx, insumo, actor, metaInsumo, id);
}

/** Stock actual de un insumo según v_stock_insumo. */
export async function stockActual(tx: Tx, insumoId: string): Promise<number> {
  const [r] = await tx.execute<{ stock: string }>(sql`select stock from v_stock_insumo where insumo_id = ${insumoId}`);
  if (!r) throw new ReglaError('El insumo no existe.');
  return Number(r.stock);
}

/**
 * Ajuste manual de stock: por conteo físico (se registra la diferencia contra el stock actual) o por una
 * diferencia directa. Queda como movimiento `ajuste` con su motivo.
 */
export async function ajustarStock(tx: Tx, actor: Actor, input: AjusteStockInput) {
  const a = ajusteStockInput.parse(input);
  const actual = await stockActual(tx, a.insumoId);
  const delta = a.modo === 'conteo' ? Math.round((a.cantidad - actual) * 1e6) / 1e6 : a.cantidad;
  if (delta === 0) throw new ReglaError(`El conteo coincide con el stock (${actual}): no hay nada que ajustar.`);
  return upsert(tx, movInsumo, actor, metaMovInsumo, {
    id: randomUUID(),
    fecha: a.fecha,
    insumoId: a.insumoId,
    cantidad: delta,
    tipo: 'ajuste',
    motivo: a.motivo
  });
}

export interface PrecioRow {
  id: string;
  fecha: string;
  precio: number;
  origen: string;
}

/** Historial de precios de un insumo, del más reciente al más antiguo. */
export async function historialPrecios(tx: Tx, insumoId: string): Promise<PrecioRow[]> {
  return tx
    .select({ id: insumoPrecio.id, fecha: insumoPrecio.fecha, precio: insumoPrecio.precio, origen: insumoPrecio.origen })
    .from(insumoPrecio)
    .where(and(eq(insumoPrecio.insumoId, insumoId), isNull(insumoPrecio.deletedAt)))
    .orderBy(desc(insumoPrecio.fecha), desc(insumoPrecio.createdAt));
}
