/**
 * Inventario de producto terminado (F5-5, online). El stock de botellas se deriva del libro mov_producto
 * (v_stock_producto); un ajuste es un movimiento más: quiebre, muestra o diferencia contra un conteo físico.
 * v1 solo permitía ajustar insumos; las botellas rotas o regaladas quedaban en el stock.
 */
import { ajusteProductoInput, deltaAjusteProducto, type AjusteProductoInput } from '@winzer/domain';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../client';
import { ReglaError, upsert, type Actor, type EntityMeta } from '../repo';
import { movProducto, ordenEnvasado } from '../schema';

export const metaAjusteProducto: EntityMeta = {
  entity: 'mov_producto',
  module: 'inventarios',
  label: 'ajustes de producto terminado',
  display: (r) => `${r.tipo} ${r.unidades}`
};
const nf = (v: number) => v.toLocaleString('es-CL');

export async function ajustarProducto(tx: Tx, actor: Actor, input: AjusteProductoInput) {
  const a = ajusteProductoInput.parse(input);
  const [o] = await tx.select().from(ordenEnvasado).where(eq(ordenEnvasado.id, a.ordenEnvasadoId)).for('update');
  if (!o || o.deletedAt || o.estado !== 'confirmada') throw new ReglaError('El producto no existe o su orden no está confirmada.');
  const [s] = await tx.execute<{ stock: string }>(sql`select stock from v_stock_producto where orden_envasado_id = ${o.id}`);
  const stock = Number(s?.stock ?? 0);
  const delta = deltaAjusteProducto(a.tipo, a.cantidad, stock);
  if (delta === 0) throw new ReglaError(`El conteo coincide con el stock (${nf(stock)} unidades): no hay nada que ajustar.`);
  if (stock + delta < 0) throw new ReglaError(`Salen ${nf(-delta)} unidades, pero el stock de ${o.codigo ?? 'la orden'} es ${nf(stock)}.`);
  return upsert(tx, movProducto, actor, metaAjusteProducto, {
    id: randomUUID(),
    fecha: a.fecha,
    ordenEnvasadoId: o.id,
    formatoId: o.formatoId,
    loteId: o.loteId,
    unidades: delta,
    tipo: a.tipo,
    costoUnitario: o.costoUnitario,
    motivo: a.motivo
  });
}
