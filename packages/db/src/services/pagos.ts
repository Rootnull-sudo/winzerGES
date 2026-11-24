/**
 * Pagos a proveedores (F3-3, online). Un pago se aplica a uno o varios documentos; el saldo de cada uno se deriva
 * en v_por_pagar (ADR 0010). Editar un pago = eliminarlo y registrarlo de nuevo (así las aplicaciones no quedan a medias).
 */
import { pagoInput, type PagoInput } from '@winzer/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../client';
import { ReglaError, softDelete, upsert, type Actor, type EntityMeta } from '../repo';
import { compra, pago, pagoAplicacion } from '../schema';

export const metaPago: EntityMeta = { entity: 'pago', module: 'proveedores', label: 'pagos', sensitive: true, display: (r) => `$${r.monto}` };
const metaAplicacion: EntityMeta = { entity: 'pago_aplicacion', module: 'proveedores', label: 'aplicaciones de pagos', display: (r) => `$${r.monto}` };
const clp = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

export interface DocumentoPagable {
  proveedorId: string | null;
  saldo: number;
  nombre: string;
}

/** Documento abierto que recibe el pago: lo bloquea y devuelve su proveedor y saldo vigente. */
async function documento(tx: Tx, a: { compraId?: string | null; gastoId?: string | null }): Promise<DocumentoPagable> {
  if (a.compraId) {
    const [c] = await tx.select().from(compra).where(eq(compra.id, a.compraId)).for('update');
    if (!c || c.deletedAt || c.estado === 'anulada') throw new ReglaError('Un documento del pago no existe o está anulado.');
    const [s] = await tx.execute<{ saldo: string }>(sql`select saldo from v_por_pagar where origen = 'compra' and documento_id = ${a.compraId}`);
    if (!s) throw new ReglaError(`El documento folio ${c.folio} no genera deuda.`);
    return { proveedorId: c.proveedorId, saldo: Number(s.saldo), nombre: `folio ${c.folio}` };
  }
  const [s] = await tx.execute<{ saldo: string; proveedor_id: string | null; folio: string | null }>(
    sql`select saldo, proveedor_id, folio from v_por_pagar where origen = 'gasto' and documento_id = ${a.gastoId ?? ''}`
  );
  if (!s) throw new ReglaError('El gasto no existe, ya está pagado al contado o fue eliminado.');
  return { proveedorId: s.proveedor_id, saldo: Number(s.saldo), nombre: s.folio ? `folio ${s.folio}` : 'del gasto' };
}

export async function registrarPago(tx: Tx, actor: Actor, input: PagoInput) {
  const data = pagoInput.parse(input);
  const id = data.id ?? randomUUID();
  const [previo] = await tx.select({ id: pago.id }).from(pago).where(eq(pago.id, id));
  if (previo) throw new ReglaError('Un pago registrado no se edita: elimínalo y regístralo de nuevo.');
  const vistos = new Set<string>();
  for (const a of data.aplicaciones) {
    const clave = a.compraId ?? `g:${a.gastoId}`;
    if (vistos.has(clave)) throw new ReglaError('Un documento aparece dos veces en el pago.');
    vistos.add(clave);
    const d = await documento(tx, a);
    if (data.proveedorId && d.proveedorId && d.proveedorId !== data.proveedorId) throw new ReglaError(`El documento ${d.nombre} es de otro proveedor.`);
    if (a.monto > d.saldo) throw new ReglaError(`Se aplican ${clp(a.monto)} al documento ${d.nombre}, pero su saldo es ${clp(d.saldo)}.`);
  }
  const { aplicaciones, ...cab } = data;
  const rec = await upsert(tx, pago, actor, metaPago, { ...cab, id });
  for (const a of aplicaciones)
    await upsert(tx, pagoAplicacion, actor, metaAplicacion, {
      id: randomUUID(),
      pagoId: id,
      compraId: a.compraId ?? null,
      gastoId: a.gastoId ?? null,
      monto: a.monto
    });
  return rec;
}

export async function eliminarPago(tx: Tx, actor: Actor, id: string) {
  const apls = await tx
    .select({ id: pagoAplicacion.id })
    .from(pagoAplicacion)
    .where(and(eq(pagoAplicacion.pagoId, id), isNull(pagoAplicacion.deletedAt)));
  for (const a of apls) await softDelete(tx, pagoAplicacion, actor, metaAplicacion, a.id);
  return softDelete(tx, pago, actor, metaPago, id);
}
