/**
 * Gastos y presupuesto (F3-4, online). Un gasto al contado queda pagado; uno a crédito ("pendiente") aparece en
 * v_por_pagar y se paga con pagos aplicados, igual que una compra. IVA y total se calculan aquí con la tasa vigente
 * en la fecha del gasto. El DTE recibido de las facturas lo arma F6.
 */
import { gastoInput, presupuestoInput, totalesGasto, type GastoInput, type PresupuestoInput } from '@winzer/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { sincronizarRecibidoGasto } from './dte';
import type { Tx } from '../client';
import { idDerivado } from '../ids';
import { ReglaError, softDelete, upsert, type Actor, type EntityMeta } from '../repo';
import { gasto, pagoAplicacion, presupuesto } from '../schema';
import { configVigente } from './parametros';

export const metaGasto: EntityMeta = { entity: 'gasto', module: 'administracion', label: 'gastos', sensitive: true, display: (r) => String(r.descripcion) };
export const metaPresupuesto: EntityMeta = {
  entity: 'presupuesto',
  module: 'administracion',
  label: 'presupuesto',
  display: (r) => `${r.categoria} ${r.anio}`
};
const clp = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

async function aplicado(tx: Tx, gastoId: string) {
  const [r] = await tx
    .select({ total: sql<string>`coalesce(sum(${pagoAplicacion.monto}), 0)` })
    .from(pagoAplicacion)
    .where(and(eq(pagoAplicacion.gastoId, gastoId), isNull(pagoAplicacion.deletedAt)));
  return Number(r?.total ?? 0);
}

export async function guardarGasto(tx: Tx, actor: Actor, input: GastoInput, baseVersion?: number) {
  const data = gastoInput.parse(input);
  const id = data.id ?? randomUUID();
  const { tributario } = await configVigente(tx, data.fecha);
  const tot = totalesGasto(data, tributario.tasaIVA);
  const pagado = await aplicado(tx, id);
  if (pagado > 0 && data.estado === 'pagado') throw new ReglaError('El gasto tiene pagos aplicados: elimínalos antes de marcarlo al contado.');
  if (pagado > tot.total) throw new ReglaError(`El total no puede quedar bajo lo ya pagado (${clp(pagado)}).`);
  const rec = await upsert(tx, gasto, actor, metaGasto, { ...data, id, ...tot }, { baseVersion, checkVersion: baseVersion != null });
  await sincronizarRecibidoGasto(tx, actor, id);
  return rec;
}

export async function eliminarGasto(tx: Tx, actor: Actor, id: string) {
  if ((await aplicado(tx, id)) > 0) throw new ReglaError('No se puede eliminar: el gasto tiene pagos aplicados. Elimina los pagos primero.');
  const rec = await softDelete(tx, gasto, actor, metaGasto, id);
  await sincronizarRecibidoGasto(tx, actor, id);
  return rec;
}

/** Presupuesto anual de una categoría: una fila por (año, categoría), con id determinista. */
export async function guardarPresupuesto(tx: Tx, actor: Actor, input: PresupuestoInput) {
  const data = presupuestoInput.parse(input);
  const id = idDerivado(actor.orgId, `presupuesto:${data.anio}:${data.categoria}`, 'presupuesto');
  const [previo] = await tx.select({ deletedAt: presupuesto.deletedAt }).from(presupuesto).where(eq(presupuesto.id, id));
  if (previo?.deletedAt) await tx.update(presupuesto).set({ deletedAt: null }).where(eq(presupuesto.id, id));
  return upsert(tx, presupuesto, actor, metaPresupuesto, { ...data, id });
}
