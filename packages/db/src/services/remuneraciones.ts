/**
 * Remuneraciones (F4-2, online, sensible). Cada liquidación se calcula con los indicadores vigentes al último día de
 * su periodo (configVigente) y guarda la foto de esos valores y del trabajador. Las pagadas no se recalculan.
 */
import {
  diasEnPeriodo,
  novedadesInput,
  pagoRemuneracionInput,
  periodoInput,
  rangoPeriodo,
  tax,
  vigenteEnPeriodo,
  type Novedades,
  type NovedadesInput,
  type OrgConfig,
  type RemuneracionV1
} from '@winzer/domain';
import { and, eq, isNull } from 'drizzle-orm';
import type { Tx } from '../client';
import { idDerivado } from '../ids';
import { ReglaError, softDelete, upsert, type Actor, type EntityMeta } from '../repo';
import { remuneracion, trabajador } from '../schema';
import { configVigente } from './parametros';

export const metaRemuneracion: EntityMeta = {
  entity: 'remuneracion',
  module: 'administracion',
  label: 'remuneraciones',
  sensitive: true,
  display: (r) => `${(r.trabajadorFoto as { nombre?: string } | null)?.nombre ?? ''} ${r.periodo}`
};

type TrabajadorRow = typeof trabajador.$inferSelect;
type Remu = OrgConfig['remuneraciones'];

/** Foto de los valores usados en el cálculo (se muestran en la liquidación). */
const fotoParametros = (r: Remu, fecha: string) => ({
  fecha,
  uf: r.uf,
  utm: r.utm,
  imm: r.imm,
  topeImponibleUF: r.topeImponibleUF,
  topeAfcUF: r.topeAfcUF,
  afp: r.afp,
  salud: r.salud,
  cesantiaTrabajador: r.cesantiaTrabajador,
  cesantiaEmpleador: r.cesantiaEmpleador,
  cesantiaEmpleadorPlazoFijo: r.cesantiaEmpleadorPlazoFijo,
  sis: r.sis,
  aporteEmpleadorPension: r.aporteEmpleadorPension,
  jornadaSemanal: r.jornadaSemanal
});
const fotoTrabajador = (t: TrabajadorRow) => ({ nombre: t.nombre, rut: t.rut, cargo: t.cargo, area: t.area, contrato: t.contrato, afp: t.afp, salud: t.salud });

/** Id determinista: una remuneración por trabajador y periodo (recalcular la reescribe). */
export const idRemuneracion = (orgId: string, trabajadorId: string, periodo: string) => idDerivado(orgId, `rem:${trabajadorId}:${periodo}`, 'remuneracion');

async function escribir(tx: Tx, actor: Actor, t: TrabajadorRow, periodo: string, nov: Novedades, r: Remu, fecha: string) {
  const liq = tax.liquidacion(t, r, nov);
  return upsert(tx, remuneracion, actor, metaRemuneracion, {
    id: idRemuneracion(actor.orgId, t.id, periodo),
    trabajadorId: t.id,
    periodo,
    estado: 'calculada',
    fechaPago: null,
    diasTrabajados: nov.diasTrabajados,
    horasExtraCantidad: nov.horasExtra,
    ...liq,
    trabajadorFoto: fotoTrabajador(t),
    parametros: fotoParametros(r, fecha)
  });
}

/**
 * Calcula (o recalcula) el mes: un registro por trabajador vigente en el periodo, con los indicadores del último día
 * del mes. Las ya pagadas se saltan; las calculadas conservan sus novedades.
 */
export async function calcularMes(tx: Tx, actor: Actor, periodo: string) {
  periodoInput.parse(periodo);
  const { hasta } = rangoPeriodo(periodo);
  const cfg = await configVigente(tx, hasta);
  const trabajadores = (await tx.select().from(trabajador).where(isNull(trabajador.deletedAt))).filter((t) => vigenteEnPeriodo(t, periodo));
  let calculadas = 0,
    omitidasPagadas = 0;
  for (const t of trabajadores) {
    const [previa] = await tx
      .select()
      .from(remuneracion)
      .where(eq(remuneracion.id, idRemuneracion(actor.orgId, t.id, periodo)));
    if (previa && !previa.deletedAt && previa.estado === 'pagada') {
      omitidasPagadas++;
      continue;
    }
    const vivo = previa && !previa.deletedAt;
    if (previa?.deletedAt) await tx.update(remuneracion).set({ deletedAt: null }).where(eq(remuneracion.id, previa.id));
    const nov: Novedades = vivo
      ? {
          diasTrabajados: previa.diasTrabajados,
          horasExtra: Number(previa.horasExtraCantidad),
          bonos: previa.bonos,
          comisiones: previa.comisiones,
          anticipos: previa.anticipos
        }
      : { diasTrabajados: diasEnPeriodo(t, periodo), horasExtra: 0, bonos: t.bonos, comisiones: t.comisiones, anticipos: 0 };
    await escribir(tx, actor, t, periodo, nov, cfg.remuneraciones, hasta);
    calculadas++;
  }
  return { calculadas, omitidasPagadas, indicadores: fotoParametros(cfg.remuneraciones, hasta) };
}

async function vigente(tx: Tx, id: string) {
  const [r] = await tx.select().from(remuneracion).where(eq(remuneracion.id, id));
  if (!r || r.deletedAt) throw new ReglaError('La remuneración no existe.');
  return r;
}

/** Novedades del mes de una remuneración calculada: la recalcula con los indicadores de su periodo. */
export async function guardarNovedades(tx: Tx, actor: Actor, id: string, input: NovedadesInput) {
  const nov = novedadesInput.parse(input);
  const r = await vigente(tx, id);
  if (r.estado === 'pagada') throw new ReglaError('La remuneración está pagada: revierte el pago para modificarla.');
  const [t] = await tx.select().from(trabajador).where(eq(trabajador.id, r.trabajadorId));
  if (!t) throw new ReglaError('El trabajador no existe.');
  const { hasta } = rangoPeriodo(r.periodo);
  const cfg = await configVigente(tx, hasta);
  return escribir(tx, actor, t, r.periodo, nov, cfg.remuneraciones, hasta);
}

export async function marcarRemuneracionPagada(tx: Tx, actor: Actor, id: string, fechaPago: string) {
  const { fechaPago: f } = pagoRemuneracionInput.parse({ fechaPago });
  await vigente(tx, id);
  return upsert(tx, remuneracion, actor, metaRemuneracion, { id, estado: 'pagada', fechaPago: f });
}

/** Vuelve a "calculada" (p. ej. un pago marcado por error). La conciliación bancaria (F6) lo impedirá si ya está conciliada. */
export async function revertirPagoRemuneracion(tx: Tx, actor: Actor, id: string) {
  await vigente(tx, id);
  return upsert(tx, remuneracion, actor, metaRemuneracion, { id, estado: 'calculada', fechaPago: null });
}

export async function eliminarRemuneracion(tx: Tx, actor: Actor, id: string) {
  const r = await vigente(tx, id);
  if (r.estado === 'pagada') throw new ReglaError('No se puede eliminar una remuneración pagada.');
  return softDelete(tx, remuneracion, actor, metaRemuneracion, id);
}

/** ¿El trabajador tiene remuneraciones? (impide eliminarlo; se registra su término). */
export async function tieneRemuneraciones(tx: Tx, trabajadorId: string) {
  const [x] = await tx
    .select({ id: remuneracion.id })
    .from(remuneracion)
    .where(and(eq(remuneracion.trabajadorId, trabajadorId), isNull(remuneracion.deletedAt)))
    .limit(1);
  return !!x;
}

/**
 * Importa una remuneración de v1: con montos, se guardan tal cual con `parametros` vacío (v1 no registraba qué
 * indicadores usó); sin montos (datos de demo), se calcula con los indicadores de su mes.
 */
export async function importarRemuneracion(tx: Tx, actor: Actor, r: RemuneracionV1) {
  const [t] = await tx.select().from(trabajador).where(eq(trabajador.id, r.trabajadorId));
  if (!t) throw new ReglaError('El trabajador de la remuneración no existe.');
  const { hasta } = rangoPeriodo(r.periodo);
  const fechaPago = r.fechaPago ? (r.fechaPago > hasta || !/^\d{4}-\d{2}-\d{2}$/.test(r.fechaPago) ? hasta : r.fechaPago) : null;
  const pagada = r.estado === 'pagada' ? { estado: 'pagada', fechaPago: fechaPago ?? hasta } : {};
  if (r.liquido == null) {
    const cfg = await configVigente(tx, hasta);
    const nov = { diasTrabajados: diasEnPeriodo(t, r.periodo), horasExtra: 0, bonos: t.bonos, comisiones: t.comisiones, anticipos: 0 };
    const rec = await escribir(tx, actor, t, r.periodo, nov, cfg.remuneraciones, hasta);
    return r.estado === 'pagada' ? upsert(tx, remuneracion, actor, metaRemuneracion, { id: String(rec.id), ...pagada }) : rec;
  }
  const m = (x: number | undefined) => Math.round(x ?? 0);
  return upsert(tx, remuneracion, actor, metaRemuneracion, {
    id: r.id,
    trabajadorId: t.id,
    periodo: r.periodo,
    estado: 'calculada',
    fechaPago: null,
    diasTrabajados: 30,
    horasExtraCantidad: 0,
    base: m(r.base),
    gratificacion: m(r.gratificacion),
    bonos: m(r.bonos),
    comisiones: m(r.comisiones),
    horasExtra: m(r.horasExtra),
    noImponible: m(r.noImponible),
    imponible: m(r.imponible),
    afp: m(r.afp),
    salud: m(r.salud),
    cesantia: m(r.cesantia),
    tributable: m(r.tributable),
    impuestoUnico: m(r.impuestoUnico),
    anticipos: 0,
    descuentos: m(r.descuentos),
    liquido: m(r.liquido),
    cesantiaEmpleador: m(r.cesantiaEmpleador),
    sis: m(r.sis),
    aporteEmpleador: m(r.aporteEmpleador),
    costoEmpresa: m(r.costoEmpresa),
    trabajadorFoto: fotoTrabajador(t),
    parametros: {},
    ...pagada
  });
}
