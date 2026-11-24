/**
 * F29, pagos de impuesto y obligaciones (F6-2, online). El F29 se calcula desde los DTE del período (libros), las
 * retenciones de honorarios y el impuesto único de las remuneraciones; el remanente se encadena desde el primer mes
 * con DTE. Declarar o pagar congela la foto; volver atrás la recalcula y quita los pagos que creó el pago.
 */
import {
  docsLibro,
  encadenarF29,
  f29EstadoInput,
  F29_CERRADO,
  fechaHoy,
  obligacionInput,
  pagoImpuestoInput,
  periodosEntre,
  type F29EstadoInput,
  type ObligacionInput,
  type PagoImpuestoInput,
  type ResultadoF29
} from '@winzer/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../client';
import { idDerivado } from '../ids';
import { can, ReglaError, softDelete, upsert, type Actor, type EntityMeta } from '../repo';
import { f29, obligacion, pagoImpuesto } from '../schema';
import { configVigente } from './parametros';

export const metaF29: EntityMeta = { entity: 'f29', module: 'tributario', label: 'formularios 29', sensitive: true, display: (r) => `F29 ${r.periodo}` };
export const metaPagoImpuesto: EntityMeta = {
  entity: 'pago_impuesto',
  module: 'tributario',
  label: 'pagos de impuesto',
  sensitive: true,
  display: (r) => `${r.tipo} ${r.periodo}`
};
export const metaObligacion: EntityMeta = { entity: 'obligacion', module: 'tributario', label: 'obligaciones', display: (r) => String(r.clave) };

type F29Row = typeof f29.$inferSelect;
export interface F29Periodo {
  periodo: string;
  calculo: ResultadoF29;
  registro: F29Row | null;
}

const idF29 = (orgId: string, periodo: string) => idDerivado(orgId, `f29:${periodo}`, 'tributario');
const idPago = (orgId: string, periodo: string, tipo: 'F29' | 'PPM') => idDerivado(orgId, `f29:${periodo}:${tipo}`, 'pago_impuesto');
export const idObligacion = (orgId: string, clave: string) => idDerivado(orgId, `obligacion:${clave}`, 'tributario');

/**
 * F29 de los períodos [desde, hasta]. Un período declarado o pagado devuelve su foto (y su remanente encadena); el
 * resto se calcula. `abrir`: período que se recalcula aunque esté cerrado (al revertirlo).
 */
export async function f29Periodos(tx: Tx, desde: string, hasta: string, abrir?: string): Promise<F29Periodo[]> {
  const [p] = await tx.execute<{ primero: string | null }>(sql`select min(left(fecha, 7)) as primero from dte where deleted_at is null`);
  const inicio = p?.primero && p.primero < desde ? p.primero : desde;
  const docs = await tx.execute<{
    direccion: string;
    tipo: number;
    fecha: string;
    estado: string;
    folio: string;
    neto: string;
    exento: string;
    iva: string;
    ila: string;
    total: string;
  }>(sql`
    select direccion, tipo, fecha, estado, folio, neto, exento, iva, ila, total from dte
    where deleted_at is null and left(fecha, 7) between ${inicio} and ${hasta}`);
  const hon = await tx.execute<{ p: string; n: string }>(sql`
    select left(fecha, 7) as p, coalesce(sum(retencion), 0) as n from honorario
    where deleted_at is null and left(fecha, 7) between ${inicio} and ${hasta} group by 1`);
  const rem = await tx.execute<{ p: string; n: string }>(sql`
    select periodo as p, coalesce(sum(impuesto_unico), 0) as n from remuneracion
    where deleted_at is null and periodo between ${inicio} and ${hasta} group by 1`);
  const registros = await tx.select().from(f29).where(isNull(f29.deletedAt));
  const reg = new Map(registros.map((r) => [r.periodo, r]));
  const cerrado = (r?: F29Row) => !!r && F29_CERRADO.includes(r.estado) && r.periodo !== abrir;
  const cerrados = Object.fromEntries(registros.filter((r) => cerrado(r)).map((r) => [r.periodo, Number(r.snapshot.remanenteSiguiente ?? 0)]));
  const { tributario } = await configVigente(tx, `${hasta}-01`);
  const num = (rows: { p: string; n: string }[], per: string) => Number(rows.find((r) => r.p === per)?.n ?? 0);
  const filas = docs.map((d) => ({ ...d, neto: Number(d.neto), exento: Number(d.exento), iva: Number(d.iva), ila: Number(d.ila), total: Number(d.total) }));
  const entradas = periodosEntre(inicio, hasta).map((per) => ({
    periodo: per,
    emitidos: docsLibro(filas, 'emitido', per),
    recibidos: docsLibro(filas, 'recibido', per),
    retencionHonorarios: num(hon, per),
    impuestoUnico: num(rem, per)
  }));
  return encadenarF29(entradas, cerrados, tributario.remanenteInicial, tributario)
    .filter((c) => c.periodo >= desde)
    .map((c) => {
      const r = reg.get(c.periodo) ?? null;
      return { periodo: c.periodo, calculo: cerrado(r ?? undefined) ? (r!.snapshot as unknown as ResultadoF29) : c, registro: r };
    });
}

/** Escribe una fila con id derivado (los pagos y obligaciones que crea el F29 se reactivan al volver a pagar). */
async function derivar<T extends typeof pagoImpuesto | typeof obligacion>(tx: Tx, actor: Actor, tabla: T, id: string, fila: Record<string, unknown>) {
  const t = tabla as typeof pagoImpuesto;
  const sello = { deletedAt: null, updatedAt: new Date(), updatedBy: actor.userId };
  await tx
    .insert(t)
    .values({ ...fila, ...sello, id, orgId: actor.orgId, createdBy: actor.userId } as never)
    .onConflictDoUpdate({ target: t.id, set: { ...fila, ...sello, version: sql`${t.version} + 1` } as never });
}

/**
 * Cambia el estado del F29 de un período. borrador/revisado: foto recalculada. declarado/pagado: foto congelada
 * (si ya estaba cerrado, se conserva). pagado: pagos de impuesto F29 y PPM (este último incluido en el F29) y la
 * obligación cumplida. Volver a borrador/revisado quita esos pagos y reabre la obligación.
 */
export async function guardarF29(tx: Tx, actor: Actor, input: F29EstadoInput) {
  const x = f29EstadoInput.parse(input);
  const [rec] = await tx
    .select()
    .from(f29)
    .where(and(eq(f29.periodo, x.periodo), isNull(f29.deletedAt)))
    .for('update');
  const estabaCerrado = !!rec && F29_CERRADO.includes(rec.estado);
  const cierra = F29_CERRADO.includes(x.estado);
  const [calc] = await f29Periodos(tx, x.periodo, x.periodo, estabaCerrado && !cierra ? x.periodo : undefined);
  const snapshot = (estabaCerrado && cierra ? rec.snapshot : calc!.calculo) as Record<string, unknown>;
  const id = rec?.id ?? idF29(actor.orgId, x.periodo);
  const guardado = await upsert(tx, f29, actor, metaF29, {
    id,
    periodo: x.periodo,
    estado: x.estado,
    folioSii: x.folioSii,
    fechaPago: x.estado === 'pagado' ? x.fechaPago : null,
    snapshot
  });

  const pagos = [
    { tipo: 'F29' as const, monto: Number(snapshot.total ?? 0), incluidoEnF29: false },
    { tipo: 'PPM' as const, monto: Number(snapshot.ppm ?? 0), incluidoEnF29: true }
  ];
  for (const p of pagos) {
    const pid = idPago(actor.orgId, x.periodo, p.tipo);
    if (x.estado === 'pagado' && p.monto > 0) {
      can(actor, metaPagoImpuesto, 'c');
      await derivar(tx, actor, pagoImpuesto, pid, {
        tipo: p.tipo,
        periodo: x.periodo,
        fecha: x.fechaPago!,
        monto: p.monto,
        folioSii: x.folioSii,
        incluidoEnF29: p.incluidoEnF29,
        f29Id: id
      });
    } else {
      await tx
        .update(pagoImpuesto)
        .set({ deletedAt: new Date(), updatedBy: actor.userId, version: sql`${pagoImpuesto.version} + 1` })
        .where(and(eq(pagoImpuesto.id, pid), isNull(pagoImpuesto.deletedAt)));
    }
  }
  const clave = `F29-${x.periodo}`;
  const [ob] = await tx
    .select()
    .from(obligacion)
    .where(and(eq(obligacion.clave, clave), isNull(obligacion.deletedAt)));
  if (cierra)
    await derivar(tx, actor, obligacion, ob?.id ?? idObligacion(actor.orgId, clave), {
      clave,
      estado: 'cumplida',
      fecha: x.fechaPago ?? fechaHoy(),
      folio: x.folioSii
    });
  else if (ob?.estado === 'cumplida') await derivar(tx, actor, obligacion, ob.id, { clave, estado: 'pendiente', fecha: null, folio: null });
  return guardado;
}

/** Pago de impuesto manual (patente, contribuciones…). Los del F29 se crean y quitan desde el F29. */
export async function registrarPagoImpuesto(tx: Tx, actor: Actor, input: PagoImpuestoInput) {
  const x = pagoImpuestoInput.parse(input);
  if (x.id) {
    const [p] = await tx.select({ f29Id: pagoImpuesto.f29Id }).from(pagoImpuesto).where(eq(pagoImpuesto.id, x.id));
    if (p?.f29Id) throw new ReglaError('Este pago lo creó el F29: cámbialo desde el formulario.');
  }
  return upsert(tx, pagoImpuesto, actor, metaPagoImpuesto, { ...x, id: x.id ?? randomUUID() });
}

export async function eliminarPagoImpuesto(tx: Tx, actor: Actor, id: string) {
  const [p] = await tx.select({ f29Id: pagoImpuesto.f29Id }).from(pagoImpuesto).where(eq(pagoImpuesto.id, id));
  if (p?.f29Id) throw new ReglaError('Este pago lo creó el F29: para quitarlo, vuelve el F29 a revisado.');
  return softDelete(tx, pagoImpuesto, actor, metaPagoImpuesto, id);
}

/** Marca una obligación del calendario como cumplida o pendiente (una fila por clave). */
export async function marcarObligacion(tx: Tx, actor: Actor, input: ObligacionInput) {
  const x = obligacionInput.parse(input);
  can(actor, metaObligacion, 'e');
  const [ob] = await tx
    .select()
    .from(obligacion)
    .where(and(eq(obligacion.clave, x.clave), isNull(obligacion.deletedAt)));
  await derivar(tx, actor, obligacion, ob?.id ?? idObligacion(actor.orgId, x.clave), {
    clave: x.clave,
    estado: x.estado,
    fecha: x.estado === 'cumplida' ? (x.fecha ?? fechaHoy()) : null,
    folio: x.folio
  });
}
