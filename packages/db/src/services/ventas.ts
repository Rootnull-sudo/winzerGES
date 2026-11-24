/**
 * Ventas (F5-3, online). `confirmarVenta` escribe en UNA transacción: valida el stock de cada línea, congela costos,
 * descuenta botellas (mov_producto) o litros a granel (mov_bodega venta_granel), asigna código V-NNNN y, si genera
 * DTE, el folio de la secuencia `dte:<tipo>`. `anularVenta` revierte y asigna la nota de crédito a las facturas.
 * v1: listener sin atomicidad, códigos count + 1, edición con DTE emitido y anulación que dejaba cobros huérfanos.
 */
import { tipoDte, totalesVenta, ventaInput, type VentaInput } from '@winzer/domain';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../client';
import { idDerivado } from '../ids';
import { ReglaError, softDelete, upsert, type Actor, type EntityMeta } from '../repo';
import { cliente, cobroAplicacion, formato, movBodega, movProducto, ordenEnvasado, venta, ventaLinea } from '../schema';
import { costoLitroLoteDb } from './envasado';
import { configVigente } from './parametros';
import { siguienteCodigo, siguienteNumero } from './secuencias';

export const metaVenta: EntityMeta = {
  entity: 'venta',
  module: 'ventas',
  label: 'ventas',
  sensitive: true,
  display: (r) => String(r.codigo ?? 'Venta en borrador')
};
const metaLinea: EntityMeta = { entity: 'venta_linea', module: 'ventas', label: 'líneas de venta', display: (r) => String(r.descripcion ?? r.tipo) };
const vivo = <T extends { deletedAt: unknown }>(t: T) => isNull(t.deletedAt as never);
const idMov = (orgId: string, lineaId: string) => idDerivado(orgId, `venta:${lineaId}`, 'servicio');

export async function guardarVenta(tx: Tx, actor: Actor, input: VentaInput, baseVersion?: number) {
  const data = ventaInput.parse(input);
  const id = data.id ?? randomUUID();
  const [previa] = await tx.select({ estado: venta.estado }).from(venta).where(eq(venta.id, id));
  if (previa && previa.estado !== 'borrador') throw new ReglaError('La venta ya está confirmada o anulada: no se puede editar.');
  const [cli] = await tx
    .select({ id: cliente.id })
    .from(cliente)
    .where(and(eq(cliente.id, data.clienteId), vivo(cliente)));
  if (!cli) throw new ReglaError('Elige un cliente válido.');
  const { tributario } = await configVigente(tx, data.fecha);
  const tot = totalesVenta(data.lineas, data.documento, tributario);
  const { lineas, ...cab } = data;
  const rec = await upsert(
    tx,
    venta,
    actor,
    metaVenta,
    { ...cab, id, estado: 'borrador', neto: tot.neto, exento: 0, iva: tot.iva, ila: tot.ila, total: tot.total },
    { baseVersion, checkVersion: baseVersion != null }
  );
  const antes = await tx
    .select({ id: ventaLinea.id })
    .from(ventaLinea)
    .where(and(eq(ventaLinea.ventaId, id), vivo(ventaLinea)));
  const nuevas = lineas.map((l) => ({ ...l, id: l.id && antes.some((a) => a.id === l.id) ? l.id : randomUUID() }));
  for (const a of antes.filter((a) => !nuevas.some((l) => l.id === a.id))) await softDelete(tx, ventaLinea, actor, metaLinea, a.id);
  for (const [i, l] of nuevas.entries())
    await upsert(tx, ventaLinea, actor, metaLinea, {
      id: l.id,
      ventaId: id,
      tipo: l.tipo,
      ordenEnvasadoId: l.tipo === 'envasado' ? l.ordenEnvasadoId : null,
      estanqueId: l.tipo === 'granel' ? l.estanqueId : null,
      loteId: l.tipo === 'granel' ? l.loteId : null,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precio: l.precio,
      afectoIla: l.afectoIla,
      graduacion: l.graduacion ?? null,
      neto: tot.lineas[i]!.neto
    });
  return rec;
}

export async function eliminarVenta(tx: Tx, actor: Actor, id: string) {
  const [v] = await tx.select({ estado: venta.estado }).from(venta).where(eq(venta.id, id));
  if (v && v.estado !== 'borrador') throw new ReglaError('Solo se eliminan ventas en borrador; una confirmada se anula.');
  return softDelete(tx, venta, actor, metaVenta, id);
}

export interface FotoVenta {
  codigo?: string | null;
  dteFolio?: number | null;
  /** Costo unitario de v1 (una línea). */
  costoUnitario?: number | null;
  /** Totales de v1, para conservar la historia tal cual. */
  totales?: { neto: number; iva: number; ila: number; total: number };
}

/** Confirma una venta en borrador. `importando`: sin validar stock y con la foto de v1. */
export async function confirmarVenta(tx: Tx, actor: Actor, id: string, importando?: FotoVenta) {
  const [v] = await tx.select().from(venta).where(eq(venta.id, id)).for('update');
  if (!v || v.deletedAt) throw new ReglaError('La venta no existe.');
  if (v.estado !== 'borrador') throw new ReglaError('La venta ya está confirmada o anulada.');
  const lineas = await tx
    .select()
    .from(ventaLinea)
    .where(and(eq(ventaLinea.ventaId, id), vivo(ventaLinea)));
  if (!lineas.length) throw new ReglaError('La venta no tiene líneas.');

  // Stock por orden (sumando líneas de la misma orden) y por lote en estanque.
  const porOrden = new Map<string, number>();
  const porLote = new Map<string, number>();
  for (const l of lineas) {
    if (l.tipo === 'envasado') porOrden.set(l.ordenEnvasadoId!, (porOrden.get(l.ordenEnvasadoId!) ?? 0) + Number(l.cantidad));
    else porLote.set(`${l.estanqueId}|${l.loteId}`, (porLote.get(`${l.estanqueId}|${l.loteId}`) ?? 0) + Number(l.cantidad));
  }
  const ordenes = porOrden.size
    ? await tx
        .select()
        .from(ordenEnvasado)
        .where(inArray(ordenEnvasado.id, [...porOrden.keys()]))
    : [];
  const formatos = new Map((await tx.select().from(formato)).map((f) => [f.id, f]));
  if (!importando) {
    for (const [oid, cant] of porOrden) {
      const o = ordenes.find((x) => x.id === oid);
      if (!o || o.estado !== 'confirmada') throw new ReglaError('Una línea apunta a una orden de envasado no confirmada.');
      const [s] = await tx.execute<{ stock: string }>(sql`select stock from v_stock_producto where orden_envasado_id = ${oid}`);
      const stock = Number(s?.stock ?? 0);
      if (cant > stock)
        throw new ReglaError(`No hay stock suficiente de ${o.codigo}: se venden ${cant.toLocaleString('es-CL')} y hay ${stock.toLocaleString('es-CL')}.`);
    }
    for (const [clave, litros] of porLote) {
      const [est, lot] = clave.split('|');
      const [s] = await tx.execute<{ litros: string }>(
        sql`select coalesce(sum(litros), 0) as litros from mov_bodega where estanque_id = ${est} and lote_id = ${lot} and deleted_at is null`
      );
      const hay = Number(s?.litros ?? 0);
      if (litros > hay + 0.01)
        throw new ReglaError(`No hay vino suficiente a granel: se venden ${litros.toLocaleString('es-CL')} L y hay ${hay.toLocaleString('es-CL')} L.`);
    }
  }

  const sello = { deletedAt: null, updatedAt: new Date(), updatedBy: actor.userId };
  const costoLote = new Map<string, number>();
  for (const l of lineas) {
    let costo: number;
    let litros: number;
    let formatoId: string | null = null;
    if (l.tipo === 'envasado') {
      const o = ordenes.find((x) => x.id === l.ordenEnvasadoId)!;
      formatoId = o?.formatoId ?? null;
      costo = importando?.costoUnitario ?? Number(o?.costoUnitario ?? 0);
      litros = Number(l.cantidad) * Number(formatos.get(formatoId ?? '')?.litros ?? 0);
      const fila = {
        fecha: v.fecha,
        ordenEnvasadoId: l.ordenEnvasadoId!,
        formatoId: formatoId!,
        loteId: o?.loteId ?? null,
        unidades: -Number(l.cantidad),
        tipo: 'venta',
        costoUnitario: costo,
        ventaLineaId: l.id,
        motivo: `Venta ${v.codigo ?? ''}`.trim(),
        ...sello
      };
      await tx
        .insert(movProducto)
        .values({ ...fila, id: idMov(actor.orgId, l.id), orgId: actor.orgId, createdBy: actor.userId })
        .onConflictDoUpdate({ target: movProducto.id, set: { ...fila, version: sql`${movProducto.version} + 1` } });
    } else {
      if (!costoLote.has(l.loteId!)) costoLote.set(l.loteId!, importando?.costoUnitario ?? (await costoLitroLoteDb(tx, l.loteId!)).costoLitro);
      costo = costoLote.get(l.loteId!)!;
      litros = Number(l.cantidad);
      const fila = {
        fecha: v.fecha,
        estanqueId: l.estanqueId!,
        loteId: l.loteId!,
        litros: -litros,
        tipo: 'venta_granel',
        motivo: 'Venta a granel',
        origenTipo: 'venta',
        origenId: v.id,
        ...sello
      };
      await tx
        .insert(movBodega)
        .values({ ...fila, id: idMov(actor.orgId, l.id), orgId: actor.orgId, createdBy: actor.userId })
        .onConflictDoUpdate({ target: movBodega.id, set: { ...fila, version: sql`${movBodega.version} + 1` } });
    }
    await upsert(tx, ventaLinea, actor, metaLinea, { id: l.id, costoUnitario: costo, litros, formatoId });
  }

  const codigo = v.codigo ?? importando?.codigo ?? (await siguienteCodigo(tx, 'venta', 'V-'));
  const dte = v.generarDte ? tipoDte(v.documento) : null;
  const folio = dte ? (importando?.dteFolio ?? (await siguienteNumero(tx, `dte:${dte}`))) : null;
  const { tributario } = await configVigente(tx, v.fecha);
  const tot =
    importando?.totales ??
    totalesVenta(
      lineas.map((l) => ({ cantidad: l.cantidad, precio: l.precio, afectoIla: l.afectoIla })),
      v.documento,
      tributario
    );
  // El código va también en el motivo del libro de botellas.
  await tx
    .update(movProducto)
    .set({ motivo: `Venta ${codigo}` })
    .where(
      inArray(
        movProducto.ventaLineaId,
        lineas.map((l) => l.id)
      )
    );
  return upsert(tx, venta, actor, metaVenta, {
    id,
    codigo,
    estado: 'confirmada',
    dteTipo: dte,
    dteFolio: folio,
    neto: tot.neto,
    iva: tot.iva,
    ila: tot.ila,
    total: tot.total
  });
}

/** Monto cobrado de la venta (Σ aplicaciones de cobros vigentes). */
export async function cobradoDeVenta(tx: Tx, ventaId: string): Promise<number> {
  const [r] = await tx
    .select({ n: sql<string>`coalesce(sum(${cobroAplicacion.monto}), 0)` })
    .from(cobroAplicacion)
    .where(and(eq(cobroAplicacion.ventaId, ventaId), vivo(cobroAplicacion)));
  return Number(r?.n ?? 0);
}

/** Anula una venta confirmada: revierte botellas y litros; si era factura con folio, asigna el folio de la NC (61). */
export async function anularVenta(tx: Tx, actor: Actor, id: string) {
  const [v] = await tx.select().from(venta).where(eq(venta.id, id)).for('update');
  if (!v || v.deletedAt) throw new ReglaError('La venta no existe.');
  if (v.estado !== 'confirmada') throw new ReglaError('Solo se anulan ventas confirmadas.');
  if ((await cobradoDeVenta(tx, id)) > 0) throw new ReglaError('No se puede anular: la venta tiene cobros aplicados. Elimina o reasigna los cobros primero.');
  const lineas = await tx
    .select({ id: ventaLinea.id })
    .from(ventaLinea)
    .where(and(eq(ventaLinea.ventaId, id), vivo(ventaLinea)));
  const ids = lineas.map((l) => idMov(actor.orgId, l.id));
  const marca = { deletedAt: new Date(), updatedAt: new Date(), updatedBy: actor.userId };
  if (ids.length) {
    await tx
      .update(movProducto)
      .set({ ...marca, version: sql`${movProducto.version} + 1` })
      .where(and(inArray(movProducto.id, ids), vivo(movProducto)));
    await tx
      .update(movBodega)
      .set({ ...marca, version: sql`${movBodega.version} + 1` })
      .where(and(inArray(movBodega.id, ids), vivo(movBodega)));
  }
  const nc = v.dteTipo === 33 && v.dteFolio ? await siguienteNumero(tx, 'dte:61') : null;
  return upsert(tx, venta, actor, metaVenta, { id, estado: 'anulada', anuladaEn: new Date(), ncFolio: nc });
}

/** ¿El cliente tiene ventas? (impide eliminarlo). */
export async function clienteTieneVentas(tx: Tx, clienteId: string) {
  const [x] = await tx
    .select({ id: venta.id })
    .from(venta)
    .where(and(eq(venta.clienteId, clienteId), vivo(venta), ne(venta.estado, 'anulada')))
    .limit(1);
  return !!x;
}
