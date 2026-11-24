/**
 * Compras a proveedores (F3-2, online). `registrarCompra` escribe en UNA transacción (withOrg):
 *   compra + líneas → movimiento de insumo por línea (+ entra, − NC) → precio en el historial → precio vigente del insumo.
 * Corrige v1: la NC bajaba el crédito al revés y subía el stock; editar una compra antigua retrocedía el precio; anular
 * o borrar no revertía el precio. Los derivados usan ids deterministas (reintentar o editar no duplica).
 */
import { compraInput, docGeneraDeuda, netoLinea, signoStock, totalesCompra, type CompraInput, type DocumentoCompra } from '@winzer/domain';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../client';
import { idDerivado } from '../ids';
import { ReglaError, softDelete, upsert, type Actor, type EntityMeta } from '../repo';
import { compra, compraLinea, insumo, insumoPrecio, movInsumo, proveedor } from '../schema';
import { configVigente } from './parametros';

const NOMBRE_DOC: Record<DocumentoCompra, string> = {
  factura: 'Factura',
  factura_exenta: 'Factura exenta',
  boleta: 'Boleta',
  guia: 'Guía',
  nota_credito: 'NC'
};
export const metaCompra: EntityMeta = {
  entity: 'compra',
  module: 'proveedores',
  label: 'compras',
  sensitive: true,
  display: (r) => `${NOMBRE_DOC[r.documento as DocumentoCompra] ?? r.documento} ${r.folio}`
};
const metaLinea: EntityMeta = { entity: 'compra_linea', module: 'proveedores', label: 'líneas de compra', display: (r) => String(r.descripcion) };

const idMov = (orgId: string, lineaId: string) => idDerivado(orgId, `compra:${lineaId}`, 'reaccion');
const idPrecio = (orgId: string, lineaId: string) => idDerivado(orgId, `precio-compra:${lineaId}`, 'reaccion');

async function borrarDerivados(tx: Tx, actor: Actor, lineaIds: string[]) {
  if (!lineaIds.length) return;
  const marca = { deletedAt: new Date(), updatedAt: new Date(), updatedBy: actor.userId };
  await tx
    .update(movInsumo)
    .set({ ...marca, version: sql`${movInsumo.version} + 1` })
    .where(
      and(
        inArray(
          movInsumo.id,
          lineaIds.map((l) => idMov(actor.orgId, l))
        ),
        isNull(movInsumo.deletedAt)
      )
    );
  await tx
    .update(insumoPrecio)
    .set({ ...marca, version: sql`${insumoPrecio.version} + 1` })
    .where(
      and(
        inArray(
          insumoPrecio.id,
          lineaIds.map((l) => idPrecio(actor.orgId, l))
        ),
        isNull(insumoPrecio.deletedAt)
      )
    );
}

/**
 * Precio vigente del insumo = el del historial con la fecha más reciente (compras y cambios manuales). Así, editar o
 * anular una compra antigua no pisa el precio de una más nueva (v1 lo hacía).
 */
export async function recalcularPrecioInsumo(tx: Tx, actor: Actor, insumoId: string) {
  const [ultimo] = await tx
    .select({ precio: insumoPrecio.precio })
    .from(insumoPrecio)
    .where(and(eq(insumoPrecio.insumoId, insumoId), isNull(insumoPrecio.deletedAt)))
    .orderBy(desc(insumoPrecio.fecha), desc(insumoPrecio.createdAt))
    .limit(1);
  if (!ultimo) return;
  await tx
    .update(insumo)
    .set({ precio: ultimo.precio, version: sql`${insumo.version} + 1`, updatedAt: new Date(), updatedBy: actor.userId })
    .where(and(eq(insumo.id, insumoId), ne(insumo.precio, ultimo.precio)));
}

/** Saldo de un documento con deuda: total − NC registradas que lo referencian − pagos aplicados (v_por_pagar). */
export async function saldoCompra(tx: Tx, compraId: string, excluirNC?: string): Promise<{ total: number; saldo: number }> {
  const [r] = await tx.execute<{ total: string; saldo: string }>(sql`select total, saldo from v_por_pagar where documento_id = ${compraId}`);
  if (!r) return { total: 0, saldo: 0 };
  let saldo = Number(r.saldo);
  if (excluirNC) {
    const [nc] = await tx
      .select({ total: compra.total })
      .from(compra)
      .where(and(eq(compra.id, excluirNC), isNull(compra.deletedAt), eq(compra.estado, 'registrada')));
    if (nc) saldo += Number(nc.total);
  }
  return { total: Number(r.total), saldo };
}

export async function registrarCompra(tx: Tx, actor: Actor, input: CompraInput, baseVersion?: number) {
  const data = compraInput.parse(input);
  const id = data.id ?? randomUUID();
  const [prov] = await tx
    .select({ id: proveedor.id })
    .from(proveedor)
    .where(and(eq(proveedor.id, data.proveedorId), isNull(proveedor.deletedAt)));
  if (!prov) throw new ReglaError('Elige un proveedor válido.');
  const [previa] = await tx.select().from(compra).where(eq(compra.id, id));
  if (previa?.estado === 'anulada') throw new ReglaError('La compra está anulada: no se puede editar.');

  const [dup] = await tx
    .select({ id: compra.id })
    .from(compra)
    .where(
      and(
        eq(compra.proveedorId, data.proveedorId),
        eq(compra.documento, data.documento),
        eq(compra.folio, data.folio),
        ne(compra.id, id),
        ne(compra.estado, 'anulada'),
        isNull(compra.deletedAt)
      )
    )
    .limit(1);
  if (dup) throw new ReglaError(`Ya existe ${NOMBRE_DOC[data.documento].toLowerCase()} folio ${data.folio} de este proveedor.`);

  // Referencia: la NC corrige una compra con deuda del mismo proveedor; la factura puede facturar una guía.
  let referenciaEsGuia = false;
  if (data.referenciaCompraId) {
    const [ref] = await tx.select().from(compra).where(eq(compra.id, data.referenciaCompraId));
    if (!ref || ref.deletedAt || ref.estado === 'anulada' || ref.proveedorId !== data.proveedorId)
      throw new ReglaError('El documento de referencia debe ser una compra vigente del mismo proveedor.');
    if (data.documento === 'nota_credito' && !docGeneraDeuda(ref.documento)) throw new ReglaError('La nota de crédito debe referenciar una factura o boleta.');
    if (data.documento === 'factura' && ref.documento !== 'guia') throw new ReglaError('Una factura solo puede referenciar una guía de despacho.');
    if (data.documento !== 'nota_credito' && data.documento !== 'factura') throw new ReglaError('Este documento no lleva referencia.');
    referenciaEsGuia = ref.documento === 'guia';
  }

  const { tributario } = await configVigente(tx, data.fecha);
  const tot = totalesCompra(data.lineas, data.documento, tributario.tasaIVA);
  if (data.documento === 'nota_credito') {
    const { saldo } = await saldoCompra(tx, data.referenciaCompraId!, previa ? id : undefined);
    if (tot.total > saldo)
      throw new ReglaError(`La nota de crédito ($${tot.total.toLocaleString('es-CL')}) supera el saldo del documento ($${saldo.toLocaleString('es-CL')}).`);
  }
  if (previa && docGeneraDeuda(previa.documento)) {
    const { total, saldo } = await saldoCompra(tx, id);
    const comprometido = total - saldo;
    if (tot.total < comprometido) throw new ReglaError(`El total no puede quedar bajo lo ya pagado o acreditado ($${comprometido.toLocaleString('es-CL')}).`);
  }

  const { lineas, ...cab } = data;
  const rec = await upsert(tx, compra, actor, metaCompra, { ...cab, id, ...tot, estado: 'registrada' }, { baseVersion, checkVersion: baseVersion != null });

  // Líneas: las quitadas se borran con sus derivados.
  const antes = await tx
    .select({ id: compraLinea.id, insumoId: compraLinea.insumoId })
    .from(compraLinea)
    .where(and(eq(compraLinea.compraId, id), isNull(compraLinea.deletedAt)));
  // Una línea nueva puede traer su id (el importador lo hace determinista); nunca uno de otra compra.
  const ajenos = new Set(
    (
      await tx
        .select({ id: compraLinea.id })
        .from(compraLinea)
        .where(
          and(
            inArray(
              compraLinea.id,
              lineas
                .map((l) => l.id ?? '')
                .filter(Boolean)
                .concat('')
            ),
            ne(compraLinea.compraId, id)
          )
        )
    ).map((x) => x.id)
  );
  const nuevas = lineas.map((l) => ({ ...l, id: l.id && !ajenos.has(l.id) ? l.id : randomUUID() }));
  const quitadas = antes.filter((a) => !nuevas.some((l) => l.id === a.id));
  for (const q of quitadas) await softDelete(tx, compraLinea, actor, metaLinea, q.id);
  await borrarDerivados(
    tx,
    actor,
    quitadas.map((q) => q.id)
  );

  const signo = signoStock(data.documento, referenciaEsGuia);
  const tocados = new Set<string>([...antes.map((a) => a.insumoId), ...quitadas.map((q) => q.insumoId)].filter((x): x is string => !!x));
  const motivo = `${NOMBRE_DOC[data.documento]} ${data.folio}`;
  for (const l of nuevas) {
    await upsert(tx, compraLinea, actor, metaLinea, {
      id: l.id,
      compraId: id,
      insumoId: l.insumoId ?? null,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
      exenta: l.exenta,
      neto: netoLinea(l)
    });
    await borrarDerivados(tx, actor, [l.id]);
    if (!l.insumoId) continue;
    tocados.add(l.insumoId);
    const sello = { deletedAt: null, updatedAt: new Date(), updatedBy: actor.userId };
    if (signo !== 0) {
      const fila = {
        fecha: data.fecha,
        insumoId: l.insumoId,
        cantidad: l.cantidad * signo,
        tipo: data.documento === 'nota_credito' ? 'nota_credito' : 'compra',
        costoUnitario: l.precioUnitario,
        motivo,
        origenTipo: 'compra',
        origenId: id,
        ...sello
      };
      const idM = idMov(actor.orgId, l.id);
      await tx
        .insert(movInsumo)
        .values({ ...fila, id: idM, orgId: actor.orgId, createdBy: actor.userId })
        .onConflictDoUpdate({ target: movInsumo.id, set: { ...fila, version: sql`${movInsumo.version} + 1` } });
    }
    // La NC no fija precio; el resto sí (en boleta, el precio pagado es el costo: su IVA no se recupera).
    if (data.documento !== 'nota_credito') {
      const fila = {
        insumoId: l.insumoId,
        fecha: data.fecha,
        precio: Math.round(l.precioUnitario),
        proveedorId: data.proveedorId,
        origen: 'compra',
        compraId: id,
        ...sello
      };
      await tx
        .insert(insumoPrecio)
        .values({ ...fila, id: idPrecio(actor.orgId, l.id), orgId: actor.orgId, createdBy: actor.userId })
        .onConflictDoUpdate({ target: insumoPrecio.id, set: { ...fila, version: sql`${insumoPrecio.version} + 1` } });
    }
  }
  for (const ins of tocados) await recalcularPrecioInsumo(tx, actor, ins);
  return rec;
}

/** Anula una compra: revierte stock y precios. Bloqueado si tiene pagos aplicados o notas de crédito vigentes. */
export async function anularCompra(tx: Tx, actor: Actor, id: string) {
  const [c] = await tx.select().from(compra).where(eq(compra.id, id));
  if (!c || c.deletedAt) throw new ReglaError('La compra no existe.');
  if (c.estado === 'anulada') return c;
  const [nc] = await tx
    .select({ folio: compra.folio })
    .from(compra)
    .where(and(eq(compra.referenciaCompraId, id), eq(compra.estado, 'registrada'), isNull(compra.deletedAt)))
    .limit(1);
  if (nc) throw new ReglaError(`No se puede anular: tiene el documento ${nc.folio} que la referencia. Anúlalo primero.`);
  if (docGeneraDeuda(c.documento)) {
    const { total, saldo } = await saldoCompra(tx, id);
    if (total - saldo > 0) throw new ReglaError('No se puede anular: tiene pagos aplicados. Elimina los pagos primero.');
  }
  const rec = await upsert(tx, compra, actor, metaCompra, { id, estado: 'anulada' });
  const lineas = await tx
    .select({ id: compraLinea.id, insumoId: compraLinea.insumoId })
    .from(compraLinea)
    .where(and(eq(compraLinea.compraId, id), isNull(compraLinea.deletedAt)));
  await borrarDerivados(
    tx,
    actor,
    lineas.map((l) => l.id)
  );
  for (const ins of new Set(lineas.map((l) => l.insumoId).filter((x): x is string => !!x))) await recalcularPrecioInsumo(tx, actor, ins);
  return rec;
}
