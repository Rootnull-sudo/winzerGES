/**
 * Cobros a clientes aplicados a ventas (F5-4, online). El saldo de cada venta se deriva en v_por_cobrar
 * (total − Σ aplicaciones). Lo no aplicado queda como anticipo del cliente. Editar un cobro = eliminarlo y registrarlo.
 */
import { cobroInput, type CobroInput } from '@winzer/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../client';
import { ReglaError, softDelete, upsert, type Actor, type EntityMeta } from '../repo';
import { cobro, cobroAplicacion, venta } from '../schema';

export const metaCobro: EntityMeta = { entity: 'cobro', module: 'clientes', label: 'cobros', sensitive: true, display: (r) => `$${r.monto}` };
const metaAplicacion: EntityMeta = { entity: 'cobro_aplicacion', module: 'clientes', label: 'aplicaciones de cobros', display: (r) => `$${r.monto}` };
const clp = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

/** Valida (venta confirmada, mismo cliente, ≤ saldo, sin repetir) y escribe aplicaciones de un cobro existente. */
export async function aplicarCobro(tx: Tx, actor: Actor, cobroId: string, clienteId: string, aplicaciones: { ventaId: string; monto: number }[]) {
  const vistas = new Set<string>();
  for (const a of aplicaciones) {
    if (vistas.has(a.ventaId)) throw new ReglaError('Una venta aparece dos veces en el cobro.');
    vistas.add(a.ventaId);
    const [v] = await tx.select().from(venta).where(eq(venta.id, a.ventaId)).for('update');
    if (!v || v.deletedAt || v.estado !== 'confirmada') throw new ReglaError('Una venta del cobro no existe o no está confirmada.');
    if (v.clienteId !== clienteId) throw new ReglaError(`La venta ${v.codigo} es de otro cliente.`);
    const [s] = await tx.execute<{ saldo: string }>(sql`select saldo from v_por_cobrar where venta_id = ${a.ventaId}`);
    const saldo = Number(s?.saldo ?? 0);
    if (a.monto > saldo) throw new ReglaError(`Se aplican ${clp(a.monto)} a la venta ${v.codigo}, pero su saldo es ${clp(saldo)}.`);
  }
  for (const a of aplicaciones) await upsert(tx, cobroAplicacion, actor, metaAplicacion, { id: randomUUID(), cobroId, ventaId: a.ventaId, monto: a.monto });
}

export async function registrarCobro(tx: Tx, actor: Actor, input: CobroInput) {
  const data = cobroInput.parse(input);
  const id = data.id ?? randomUUID();
  const [previo] = await tx.select({ id: cobro.id }).from(cobro).where(eq(cobro.id, id));
  if (previo) throw new ReglaError('Un cobro registrado no se edita: elimínalo y regístralo de nuevo.');
  const { aplicaciones, ...cab } = data;
  const rec = await upsert(tx, cobro, actor, metaCobro, { ...cab, id });
  await aplicarCobro(tx, actor, id, data.clienteId, aplicaciones);
  return rec;
}

export async function eliminarCobro(tx: Tx, actor: Actor, id: string) {
  const apls = await tx
    .select({ id: cobroAplicacion.id })
    .from(cobroAplicacion)
    .where(and(eq(cobroAplicacion.cobroId, id), isNull(cobroAplicacion.deletedAt)));
  for (const a of apls) await softDelete(tx, cobroAplicacion, actor, metaAplicacion, a.id);
  return softDelete(tx, cobro, actor, metaCobro, id);
}
