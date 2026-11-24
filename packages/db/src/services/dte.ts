/**
 * Documentos tributarios electrónicos (F6-1, online). El DTE se deriva del documento de origen en la misma
 * transacción: confirmar una venta lo emite; anularla emite la NC (factura) o lo anula (boleta, guía); registrar o
 * anular una compra o un gasto con factura sincroniza el recibido. v1 lo hacía con listeners sin atomicidad.
 *
 * Folios: secuencia `dte:<tipo>` (nunca se reutiliza) dentro de los rangos CAF; sin CAF solo en ambiente simulado.
 * Las filas que escribe el sistema usan id derivado del origen (reintentos e importación no duplican) y no exigen
 * permiso de DTE a quien vende o compra; las acciones manuales (estado, notas, CAF, emisor) sí lo verifican.
 */
import {
  cafInput,
  emisorInput,
  folioEnCaf,
  montosNota,
  nombreDte,
  notaInput,
  puedeTransitar,
  RUT_BOLETA,
  type CafInput,
  type Emisor,
  type EmisorInput,
  type NotaInput,
  xmlDte,
  xmlLote
} from '@winzer/domain';
import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../client';
import { idDerivado } from '../ids';
import { can, ReglaError, softDelete, upsert, type Actor, type EntityMeta } from '../repo';
import { caf, cliente, compra, dte, dteLinea, emisor, formato, gasto, proveedor, venta, ventaLinea } from '../schema';
import { configVigente } from './parametros';
import { ajustarSecuencia, siguienteNumero } from './secuencias';

export const metaDte: EntityMeta = {
  entity: 'dte',
  module: 'dte',
  label: 'documentos tributarios',
  sensitive: true,
  display: (r) => `${nombreDte(Number(r.tipo))} N° ${r.folio}`
};
export const metaCaf: EntityMeta = {
  entity: 'caf',
  module: 'dte',
  label: 'folios autorizados (CAF)',
  sensitive: true,
  display: (r) => `CAF ${r.tipo} ${r.desde}–${r.hasta}`
};
export const metaEmisor: EntityMeta = { entity: 'emisor', module: 'dte', label: 'datos del emisor', sensitive: true, display: () => 'Datos del emisor' };

const ahora = () => new Date().toISOString();
const DOC_COMPRA: Record<string, number> = { factura: 33, factura_exenta: 34, nota_credito: 61 };
const NOMBRE_COMPRA: Record<string, string> = { factura: 'Factura', factura_exenta: 'Factura exenta', nota_credito: 'Nota de crédito' };
type Fila = Omit<typeof dte.$inferInsert, 'id' | 'orgId' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'version' | 'deletedAt'>;
type Linea = { nombre: string; cantidad: number | string; unidad: string; precio: number | string; monto: number; codImpAdic?: number | null };
type DteRow = typeof dte.$inferSelect;

/** Escribe (o reescribe) un DTE y sus líneas con id dado. Las líneas sobrantes de una versión anterior se borran. */
async function escribir(tx: Tx, actor: Actor, id: string, fila: Fila, lineas: Linea[]) {
  const sello = { deletedAt: null, updatedAt: new Date(), updatedBy: actor.userId };
  await tx
    .insert(dte)
    .values({ ...fila, ...sello, id, orgId: actor.orgId, createdBy: actor.userId })
    .onConflictDoUpdate({ target: dte.id, set: { ...fila, ...sello, version: sql`${dte.version} + 1` } });
  const ids = lineas.map((_, i) => idDerivado(actor.orgId, `${id}:${i}`, 'dte_linea'));
  for (const [i, l] of lineas.entries()) {
    const f = { ...l, cantidad: Number(l.cantidad), precio: Number(l.precio), codImpAdic: l.codImpAdic ?? null, dteId: id, ...sello };
    await tx
      .insert(dteLinea)
      .values({ ...f, id: ids[i]!, orgId: actor.orgId, createdBy: actor.userId })
      .onConflictDoUpdate({ target: dteLinea.id, set: { ...f, version: sql`${dteLinea.version} + 1` } });
  }
  await tx
    .update(dteLinea)
    .set({ deletedAt: new Date(), updatedBy: actor.userId, version: sql`${dteLinea.version} + 1` })
    .where(and(eq(dteLinea.dteId, id), isNull(dteLinea.deletedAt), ids.length ? notInArray(dteLinea.id, ids) : undefined));
}

/** Borra (lógico) un DTE derivado y sus líneas. */
async function quitar(tx: Tx, actor: Actor, id: string) {
  const marca = { deletedAt: new Date(), updatedAt: new Date(), updatedBy: actor.userId };
  await tx
    .update(dteLinea)
    .set({ ...marca, version: sql`${dteLinea.version} + 1` })
    .where(and(eq(dteLinea.dteId, id), isNull(dteLinea.deletedAt)));
  await tx
    .update(dte)
    .set({ ...marca, version: sql`${dte.version} + 1` })
    .where(and(eq(dte.id, id), isNull(dte.deletedAt)));
}

/** Cambio de estado sin verificar permiso (lo usan los servicios de origen). */
async function marcarEstado(tx: Tx, actor: Actor, d: DteRow, estado: string) {
  await tx
    .update(dte)
    .set({ estado, fechasEstado: { ...d.fechasEstado, [estado]: ahora() }, updatedAt: new Date(), updatedBy: actor.userId, version: sql`${dte.version} + 1` })
    .where(eq(dte.id, d.id));
}

/* ---------- Emisor y folios ---------- */

/** Datos del emisor: RUT y razón social de la viña + la fila `emisor`. */
export async function emisorDe(tx: Tx): Promise<Emisor & { id: string | null }> {
  const [o] = await tx.execute<{ rut: string | null; razon_social: string | null; nombre: string }>(
    sql`select rut, razon_social, nombre from organization where id = current_setting('app.org_id')`
  );
  const [e] = await tx.select().from(emisor).where(isNull(emisor.deletedAt));
  return {
    id: e?.id ?? null,
    rut: o?.rut ?? null,
    razonSocial: o?.razon_social ?? o?.nombre ?? null,
    giro: e?.giro ?? null,
    acteco: e?.acteco ?? null,
    direccion: e?.direccion ?? null,
    comuna: e?.comuna ?? null,
    resolucionNumero: e?.resolucionNumero ?? null,
    resolucionFecha: e?.resolucionFecha ?? null,
    ambiente: (e?.ambiente as Emisor['ambiente']) ?? 'simulado',
    certificadoVence: e?.certificadoVence ?? null
  };
}

export async function guardarEmisor(tx: Tx, actor: Actor, input: EmisorInput) {
  const data = emisorInput.parse(input);
  const [e] = await tx.select({ id: emisor.id }).from(emisor).where(isNull(emisor.deletedAt));
  return upsert(tx, emisor, actor, metaEmisor, { ...data, id: e?.id ?? randomUUID() });
}

/**
 * Siguiente folio de un tipo: el número de la secuencia si cae en un CAF; si cae en un hueco, salta al inicio del
 * rango siguiente. Sin folios autorizados: error, salvo en ambiente simulado sin CAF cargados (demo y v1).
 */
export async function siguienteFolio(tx: Tx, tipo: number): Promise<number> {
  const clave = `dte:${tipo}`;
  const cafs = await tx
    .select({ desde: caf.desde, hasta: caf.hasta })
    .from(caf)
    .where(and(eq(caf.tipo, tipo), isNull(caf.deletedAt)));
  const candidato = await siguienteNumero(tx, clave);
  if (!cafs.length) {
    const [e] = await tx.select({ ambiente: emisor.ambiente }).from(emisor).where(isNull(emisor.deletedAt));
    if (e && e.ambiente !== 'simulado') throw new ReglaError(`No hay folios autorizados para ${nombreDte(tipo)}. Carga un CAF en DTE › Folios.`);
    return candidato;
  }
  const f = folioEnCaf(cafs, candidato);
  if (f == null) throw new ReglaError(`Se agotaron los folios autorizados de ${nombreDte(tipo)}. Carga un nuevo CAF en DTE › Folios.`);
  if (f > candidato) await ajustarSecuencia(tx, clave, f + 1);
  return f;
}

export async function guardarCaf(tx: Tx, actor: Actor, input: CafInput) {
  const c = cafInput.parse(input);
  const id = c.id ?? randomUUID();
  const [cruce] = await tx
    .select({ desde: caf.desde, hasta: caf.hasta })
    .from(caf)
    .where(and(eq(caf.tipo, c.tipo), isNull(caf.deletedAt), sql`${caf.id} <> ${id}`, sql`${caf.desde} <= ${c.hasta}`, sql`${caf.hasta} >= ${c.desde}`))
    .limit(1);
  if (cruce) throw new ReglaError(`El rango se cruza con el CAF ${cruce.desde}–${cruce.hasta} del mismo tipo.`);
  if (c.id) await validarCafSinUso(tx, c.id, c);
  return upsert(tx, caf, actor, metaCaf, { ...c, id });
}

/** Un CAF con folios ya emitidos no se borra ni se achica por debajo de ellos. */
async function validarCafSinUso(tx: Tx, id: string, nuevo?: { desde: number; hasta: number }) {
  const [c] = await tx.select().from(caf).where(eq(caf.id, id));
  if (!c) return;
  const [u] = await tx.execute<{ n: string }>(sql`
    select count(*) as n from dte
    where deleted_at is null and direccion = 'emitido' and tipo = ${c.tipo} and folio ~ '^[0-9]+$'
      and folio::bigint between ${c.desde} and ${c.hasta}
      ${nuevo ? sql`and (folio::bigint < ${nuevo.desde} or folio::bigint > ${nuevo.hasta})` : sql``}`);
  if (Number(u?.n ?? 0) > 0) throw new ReglaError(`El CAF ${c.desde}–${c.hasta} tiene folios emitidos: no se puede ${nuevo ? 'reducir' : 'eliminar'}.`);
}

export async function eliminarCaf(tx: Tx, actor: Actor, id: string) {
  await validarCafSinUso(tx, id);
  return softDelete(tx, caf, actor, metaCaf, id);
}

/* ---------- Emitidos desde ventas ---------- */

/** id del DTE emitido por una venta (determinista: confirmar dos veces o reimportar no duplica). */
export const idDteVenta = (orgId: string, ventaId: string) => idDerivado(orgId, `venta:${ventaId}`, 'dte');

/** Crea o actualiza el DTE de una venta confirmada con tipo y folio (lo llama `confirmarVenta`). */
export async function registrarDteVenta(tx: Tx, actor: Actor, ventaId: string, estado?: { estado: string; fechasEstado?: Record<string, string> }) {
  const [v] = await tx.select().from(venta).where(eq(venta.id, ventaId));
  if (!v || v.dteTipo == null || v.dteFolio == null) return null;
  const [c] = await tx.select().from(cliente).where(eq(cliente.id, v.clienteId));
  const ls = await tx
    .select({ l: ventaLinea, formato: formato.nombre })
    .from(ventaLinea)
    .leftJoin(formato, eq(formato.id, ventaLinea.formatoId))
    .where(and(eq(ventaLinea.ventaId, ventaId), isNull(ventaLinea.deletedAt)));
  const id = idDteVenta(actor.orgId, ventaId);
  const [prev] = await tx.select().from(dte).where(eq(dte.id, id));
  const boleta = v.dteTipo === 39;
  const st =
    estado ??
    (prev && !prev.deletedAt ? { estado: prev.estado, fechasEstado: prev.fechasEstado } : { estado: 'generado', fechasEstado: { generado: ahora() } });
  await escribir(
    tx,
    actor,
    id,
    {
      direccion: 'emitido',
      tipo: v.dteTipo,
      folio: String(v.dteFolio),
      fecha: v.fecha,
      estado: st.estado,
      fechasEstado: st.fechasEstado ?? {},
      contraparteRut: c?.rut || (boleta ? RUT_BOLETA : null),
      contraparte: c?.nombre ?? 'Cliente boleta',
      giro: c?.giro ?? null,
      direccionContraparte: c?.direccion ?? null,
      comuna: c?.comuna ?? null,
      neto: v.neto,
      exento: v.exento,
      iva: v.iva,
      ila: v.ila,
      total: v.total,
      formaPago: v.vencimiento && v.vencimiento > v.fecha ? 2 : 1,
      vencimiento: v.vencimiento,
      referencia: null,
      dteRefId: null,
      ventaId,
      compraId: null,
      gastoId: null
    },
    ls.map(({ l, formato: f }) => ({
      nombre: l.descripcion || (l.tipo === 'granel' ? 'Vino a granel' : `Vino ${f ?? ''}`.trim()),
      cantidad: l.cantidad,
      unidad: l.tipo === 'granel' ? 'L' : 'UN',
      precio: l.precio,
      monto: l.neto,
      codImpAdic: v.ila > 0 && l.afectoIla ? 25 : null
    }))
  );
  return id;
}

/**
 * Al anular una venta: factura (33/34) → NC 61 total con los montos originales; boleta, guía, borrador o rechazado →
 * el DTE queda anulado sin nota. Devuelve el folio de la NC, si la hubo.
 */
export async function anularDteDeVenta(tx: Tx, actor: Actor, ventaId: string, fecha: string, razon: string): Promise<number | null> {
  const [d] = await tx
    .select()
    .from(dte)
    .where(and(eq(dte.ventaId, ventaId), eq(dte.direccion, 'emitido'), inArray(dte.tipo, [33, 34, 39, 52]), isNull(dte.deletedAt)));
  if (!d || d.estado === 'anulado') return null;
  if (d.tipo === 39 || d.tipo === 52 || d.estado === 'borrador' || d.estado === 'rechazado') {
    await marcarEstado(tx, actor, d, 'anulado');
    return null;
  }
  const nc = await crearNota(tx, actor, d, { tipo: 61, fecha, razon, neto: null });
  return Number(nc.folio);
}

/* ---------- Notas de crédito y débito ---------- */

async function crearNota(tx: Tx, actor: Actor, orig: DteRow, o: { tipo: 56 | 61; fecha: string; razon: string; neto: number | null }) {
  const m = montosNota({ neto: orig.neto, exento: orig.exento, iva: orig.iva, ila: orig.ila, total: orig.total }, o.neto);
  if (o.tipo === 61) {
    const [prev] = await tx.execute<{ t: string }>(sql`
      select coalesce(sum(total), 0) as t from dte
      where dte_ref_id = ${orig.id} and tipo = 61 and deleted_at is null and estado not in ('anulado', 'rechazado')`);
    const acumulado = Number(prev?.t ?? 0);
    if (acumulado + m.total > orig.total)
      throw new ReglaError(
        `Las notas de crédito sumarían $${(acumulado + m.total).toLocaleString('es-CL')}, más que el documento ($${orig.total.toLocaleString('es-CL')}).`
      );
  }
  const folio = await siguienteFolio(tx, o.tipo);
  const id = randomUUID();
  await escribir(
    tx,
    actor,
    id,
    {
      direccion: 'emitido',
      tipo: o.tipo,
      folio: String(folio),
      fecha: o.fecha,
      estado: 'generado',
      fechasEstado: { generado: ahora() },
      contraparteRut: orig.contraparteRut,
      contraparte: orig.contraparte,
      giro: orig.giro,
      direccionContraparte: orig.direccionContraparte,
      comuna: orig.comuna,
      ...m,
      formaPago: orig.formaPago,
      vencimiento: null,
      referencia: { tipo: orig.tipo, folio: orig.folio, fecha: orig.fecha, codigo: o.neto == null ? 1 : 3, razon: o.razon },
      dteRefId: orig.id,
      ventaId: orig.ventaId,
      compraId: null,
      gastoId: null
    },
    [{ nombre: o.razon, cantidad: 1, unidad: 'UN', precio: m.neto || m.exento, monto: m.neto || m.exento, codImpAdic: m.ila ? 25 : null }]
  );
  const [nota] = await tx.select().from(dte).where(eq(dte.id, id));
  return nota!;
}

/** NC parcial o total, o ND, sobre una factura emitida (pantalla DTE). */
export async function emitirNota(tx: Tx, actor: Actor, input: NotaInput) {
  can(actor, metaDte, 'c');
  const x = notaInput.parse(input);
  const [orig] = await tx.select().from(dte).where(eq(dte.id, x.dteId)).for('update');
  if (!orig || orig.deletedAt || orig.direccion !== 'emitido') throw new ReglaError('El documento no existe.');
  if (![33, 34, 56].includes(orig.tipo)) throw new ReglaError('Las notas se emiten sobre facturas o notas de débito.');
  if (['borrador', 'anulado', 'rechazado'].includes(orig.estado)) throw new ReglaError(`El documento está ${orig.estado}: no admite notas.`);
  return crearNota(tx, actor, orig, { tipo: x.tipo as 56 | 61, fecha: x.fecha, razon: x.razon, neto: x.neto });
}

/** Cambio de estado manual, con las transiciones permitidas. */
export async function cambiarEstadoDte(tx: Tx, actor: Actor, id: string, estado: string) {
  const [d] = await tx.select().from(dte).where(eq(dte.id, id));
  if (!d || d.deletedAt) throw new ReglaError('El documento no existe.');
  if (!puedeTransitar(d.direccion, d.estado, estado)) throw new ReglaError(`No se puede pasar de ${d.estado} a ${estado}.`);
  if (estado === 'anulado' && d.ventaId && [33, 34].includes(d.tipo)) {
    const [v] = await tx.select({ estado: venta.estado }).from(venta).where(eq(venta.id, d.ventaId));
    if (v?.estado === 'confirmada') throw new ReglaError('La factura es de una venta vigente: anula la venta y se emitirá su nota de crédito.');
  }
  return upsert(tx, dte, actor, metaDte, { id, estado, fechasEstado: { ...d.fechasEstado, [estado]: ahora() } });
}

/* ---------- Recibidos desde compras y gastos ---------- */

export const idDteCompra = (orgId: string, compraId: string) => idDerivado(orgId, `compra:${compraId}`, 'dte');
export const idDteGasto = (orgId: string, gastoId: string) => idDerivado(orgId, `gasto:${gastoId}`, 'dte');

/**
 * Sincroniza el DTE recibido de una compra (factura, factura exenta o NC). Si la compra se anula o deja de ser uno
 * de esos documentos, el DTE se quita (v1 lo dejaba). La NC va con montos positivos: el libro la resta por su tipo.
 */
export async function sincronizarRecibidoCompra(tx: Tx, actor: Actor, compraId: string) {
  const id = idDteCompra(actor.orgId, compraId);
  const [c] = await tx.select().from(compra).where(eq(compra.id, compraId));
  const tipo = c ? DOC_COMPRA[c.documento] : undefined;
  if (!c || c.deletedAt || c.estado === 'anulada' || !tipo) return quitar(tx, actor, id);
  const [p] = c.proveedorId ? await tx.select().from(proveedor).where(eq(proveedor.id, c.proveedorId)) : [];
  const [ref] = c.referenciaCompraId ? await tx.select().from(compra).where(eq(compra.id, c.referenciaCompraId)) : [];
  const [prev] = await tx.select().from(dte).where(eq(dte.id, id));
  const vivo = prev && !prev.deletedAt;
  const exenta = tipo === 34;
  await escribir(
    tx,
    actor,
    id,
    {
      direccion: 'recibido',
      tipo,
      folio: c.folio,
      fecha: c.fecha,
      estado: vivo ? prev.estado : 'aceptado',
      fechasEstado: vivo ? prev.fechasEstado : { aceptado: ahora() },
      contraparteRut: p?.rut ?? null,
      contraparte: p?.nombre ?? null,
      giro: null,
      direccionContraparte: null,
      comuna: null,
      neto: exenta ? 0 : c.neto,
      exento: exenta ? c.neto + c.exento : c.exento,
      iva: c.iva,
      ila: 0,
      total: c.total,
      formaPago: c.vencimiento && c.vencimiento > c.fecha ? 2 : 1,
      vencimiento: c.vencimiento,
      referencia:
        ref && DOC_COMPRA[ref.documento] ? { tipo: DOC_COMPRA[ref.documento]!, folio: ref.folio, fecha: ref.fecha, codigo: 1, razon: 'Referencia' } : null,
      dteRefId: null,
      ventaId: null,
      compraId,
      gastoId: null
    },
    [{ nombre: `${NOMBRE_COMPRA[c.documento]} ${c.folio}`, cantidad: 1, unidad: 'UN', precio: c.neto || c.exento, monto: c.neto || c.exento }]
  );
}

/** Gasto con factura afecta → DTE 33 recibido (v1: administracion/index.js:127). Si deja de serlo, se quita. */
export async function sincronizarRecibidoGasto(tx: Tx, actor: Actor, gastoId: string) {
  const id = idDteGasto(actor.orgId, gastoId);
  const [g] = await tx.select().from(gasto).where(eq(gasto.id, gastoId));
  if (!g || g.deletedAt || g.documento !== 'factura' || !g.afectoIVA) return quitar(tx, actor, id);
  const [p] = g.proveedorId ? await tx.select().from(proveedor).where(eq(proveedor.id, g.proveedorId)) : [];
  const [prev] = await tx.select().from(dte).where(eq(dte.id, id));
  const vivo = prev && !prev.deletedAt;
  await escribir(
    tx,
    actor,
    id,
    {
      direccion: 'recibido',
      tipo: 33,
      folio: g.folio || `S/F ${gastoId.slice(0, 8)}`,
      fecha: g.fecha,
      estado: vivo ? prev.estado : 'aceptado',
      fechasEstado: vivo ? prev.fechasEstado : { aceptado: ahora() },
      contraparteRut: p?.rut ?? null,
      contraparte: p?.nombre ?? null,
      giro: null,
      direccionContraparte: null,
      comuna: null,
      neto: g.monto,
      exento: 0,
      iva: g.iva,
      ila: 0,
      total: g.total,
      formaPago: 1,
      vencimiento: null,
      referencia: null,
      dteRefId: null,
      ventaId: null,
      compraId: null,
      gastoId
    },
    [{ nombre: g.descripcion, cantidad: 1, unidad: 'UN', precio: g.monto, monto: g.monto }]
  );
}

/** Importador v1: escribe un DTE tal como venía (sin folio nuevo ni efectos). */
export const importarDte = escribir;
export type FilaDte = Fila;

/**
 * XML de uno o varios DTE (simulado: se genera al descargar desde las filas, con las tasas vigentes en la fecha de
 * cada documento). Uno → su archivo; varios → un SetDTE.
 */
export async function xmlDeDtes(tx: Tx, filtro: { ids?: string[]; periodo?: string; direccion?: string }): Promise<{ nombre: string; xml: string } | null> {
  const conds = [isNull(dte.deletedAt)];
  if (filtro.ids?.length) conds.push(inArray(dte.id, filtro.ids));
  if (filtro.periodo) conds.push(sql`left(${dte.fecha}, 7) = ${filtro.periodo}`);
  if (filtro.direccion) conds.push(eq(dte.direccion, filtro.direccion));
  const docs = await tx
    .select()
    .from(dte)
    .where(and(...conds))
    .orderBy(dte.fecha, dte.tipo, dte.folio);
  if (!docs.length) return null;
  const lineas = await tx
    .select()
    .from(dteLinea)
    .where(
      and(
        inArray(
          dteLinea.dteId,
          docs.map((d) => d.id)
        ),
        isNull(dteLinea.deletedAt)
      )
    )
    .orderBy(dteLinea.id);
  const e = await emisorDe(tx);
  const tasas = new Map<string, { tasaIVA: number; tasaILA: number }>();
  const xmls: string[] = [];
  for (const d of docs) {
    if (!tasas.has(d.fecha)) tasas.set(d.fecha, (await configVigente(tx, d.fecha)).tributario);
    const ls = lineas.filter((l) => l.dteId === d.id);
    xmls.push(xmlDte({ ...d, referencia: d.referencia ?? null }, ls, e, tasas.get(d.fecha)!));
  }
  if (docs.length === 1) return { nombre: `DTE_T${docs[0]!.tipo}_F${docs[0]!.folio}.xml`, xml: xmls[0]! };
  return { nombre: `DTE_lote${filtro.periodo ? `_${filtro.periodo}` : ''}.xml`, xml: xmlLote(xmls) };
}
