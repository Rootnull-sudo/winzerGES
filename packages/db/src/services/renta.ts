/**
 * Declaración de renta anual (F7-2; v1: tax.renta + tributario/renta). Año comercial = año calendario. El borrador
 * se calcula desde el estado de resultados del año, los gastos no deducibles y el PPM; declarar o pagar congela la
 * foto (como el F29). Pagado registra el pago de impuesto tipo renta y cumple la obligación del calendario.
 */
import { estadoResultados, fechaHoy, periodoAnio, renta as calcular, rentaEstadoInput, type Renta, type RentaEstadoInput } from '@winzer/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../client';
import { idDerivado } from '../ids';
import { can, upsert, type Actor, type EntityMeta } from '../repo';
import { obligacion, pagoImpuesto, renta } from '../schema';
import { datosPeriodo } from './financiero';
import { configVigente } from './parametros';
import { f29Periodos, idObligacion, metaPagoImpuesto } from './tributario';

export const metaRenta: EntityMeta = {
  entity: 'renta',
  module: 'tributario',
  label: 'declaraciones de renta',
  sensitive: true,
  display: (r) => `Renta AT${r.anioTributario}`
};
const CERRADO = ['declarado', 'pagado'];

/** Borrador calculado del año comercial. */
export async function calcularRenta(tx: Tx, anio: number): Promise<Renta> {
  const p = periodoAnio(anio);
  const d = await datosPeriodo(tx, p);
  const { tributario } = await configVigente(tx, p.hasta);
  const er = estadoResultados(d, p, tributario);
  const agregados = d.gastos.filter((g) => g.noDeducible).reduce((s, g) => s + g.monto, 0);
  const f29 = await f29Periodos(tx, `${anio}-01`, `${anio}-12`);
  const [pag] = await tx.execute<{ v: string }>(
    sql`select coalesce(sum(monto), 0) as v from pago_impuesto where deleted_at is null and tipo = 'PPM' and periodo like ${`${anio}-%`}`
  );
  return calcular(anio, er, agregados, { pagados: Number(pag?.v ?? 0), total: f29.reduce((s, f) => s + f.calculo.ppm, 0) }, tributario);
}

/** Renta del año: la foto congelada si está declarada o pagada; si no, el cálculo. */
export async function rentaDelAnio(tx: Tx, anio: number) {
  const [r] = await tx
    .select()
    .from(renta)
    .where(and(eq(renta.anioComercial, anio), isNull(renta.deletedAt)));
  const calculo = r && CERRADO.includes(r.estado) ? (r.snapshot as unknown as Renta) : await calcularRenta(tx, anio);
  return { registro: r ?? null, calculo };
}

async function derivar(tx: Tx, actor: Actor, tabla: typeof pagoImpuesto | typeof obligacion, id: string, fila: Record<string, unknown>) {
  const t = tabla as typeof pagoImpuesto;
  const sello = { deletedAt: null, updatedAt: new Date(), updatedBy: actor.userId };
  await tx
    .insert(t)
    .values({ ...fila, ...sello, id, orgId: actor.orgId, createdBy: actor.userId } as never)
    .onConflictDoUpdate({ target: t.id, set: { ...fila, ...sello, version: sql`${t.version} + 1` } as never });
}

export async function guardarRenta(tx: Tx, actor: Actor, input: RentaEstadoInput) {
  const x = rentaEstadoInput.parse(input);
  const [rec] = await tx
    .select()
    .from(renta)
    .where(and(eq(renta.anioComercial, x.anio), isNull(renta.deletedAt)))
    .for('update');
  const estabaCerrado = !!rec && CERRADO.includes(rec.estado);
  const cierra = CERRADO.includes(x.estado);
  const snapshot = (estabaCerrado && cierra ? rec.snapshot : await calcularRenta(tx, x.anio)) as Record<string, unknown>;
  const id = rec?.id ?? idDerivado(actor.orgId, `renta:${x.anio}`, 'tributario');
  const guardado = await upsert(tx, renta, actor, metaRenta, {
    id,
    anioComercial: x.anio,
    anioTributario: x.anio + 1,
    estado: x.estado,
    folioSii: x.folioSii,
    fechaPago: x.estado === 'pagado' ? x.fechaPago : null,
    snapshot
  });
  const pid = idDerivado(actor.orgId, `renta:${x.anio}`, 'pago_impuesto');
  const aPagar = Number(snapshot.aPagar ?? 0);
  if (x.estado === 'pagado' && aPagar > 0) {
    can(actor, metaPagoImpuesto, 'c');
    await derivar(tx, actor, pagoImpuesto, pid, {
      tipo: 'renta',
      periodo: `${x.anio + 1}-04`,
      fecha: x.fechaPago!,
      monto: aPagar,
      folioSii: x.folioSii,
      incluidoEnF29: false,
      f29Id: null
    });
  } else {
    await tx
      .update(pagoImpuesto)
      .set({ deletedAt: new Date(), updatedBy: actor.userId, version: sql`${pagoImpuesto.version} + 1` })
      .where(and(eq(pagoImpuesto.id, pid), isNull(pagoImpuesto.deletedAt)));
  }
  const clave = `RENTA-${x.anio + 1}`;
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
