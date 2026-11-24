/**
 * Cálculos tributarios chilenos — port de js/calc/tax.js (v1).
 *
 * ⚠ Herramienta de apoyo: tasas, tramos y plazos cambian en el tiempo. Los resultados
 *   son BORRADORES que deben validarse con un contador antes de declarar ante el SII.
 *
 * Diferencia con v1: funciones puras. La configuración y los documentos del período
 * se pasan como argumentos (en v1 se leían de VG.store / VG.db). El cálculo recursivo
 * del remanente queda en la capa de servicio, que conoce la base de datos.
 */
import type { OrgConfig } from './config';
import { groupBy, n, sum } from './num';

type Trib = OrgConfig['tributario'];
type Remu = OrgConfig['remuneraciones'];

/** Tramos IUSC mensual en UTM: [desde, hasta, factor, rebaja]. */
export const TRAMOS_IUSC: readonly (readonly [number, number, number, number])[] = [
  [0, 13.5, 0, 0],
  [13.5, 30, 0.04, 0.54],
  [30, 50, 0.08, 1.74],
  [50, 70, 0.135, 4.49],
  [70, 90, 0.23, 11.14],
  [90, 120, 0.304, 17.8],
  [120, 310, 0.35, 23.32],
  [310, Infinity, 0.4, 38.82]
];

export const DTE_TIPOS: Record<number, { nombre: string; signo: number; afecta: boolean; ivaIncluido?: boolean }> = {
  33: { nombre: 'Factura electrónica', signo: 1, afecta: true },
  34: { nombre: 'Factura exenta electrónica', signo: 1, afecta: false },
  39: { nombre: 'Boleta electrónica', signo: 1, afecta: true, ivaIncluido: true },
  52: { nombre: 'Guía de despacho electrónica', signo: 0, afecta: true },
  56: { nombre: 'Nota de débito electrónica', signo: 1, afecta: true },
  61: { nombre: 'Nota de crédito electrónica', signo: -1, afecta: true }
};

export const iva = (neto: unknown, t: Trib) => Math.round(n(neto) * t.tasaIVA);
export const ila = (neto: unknown, t: Trib, aplica = true) => (aplica && t.ilaActivo ? Math.round(n(neto) * t.tasaILA) : 0);

export interface Totales {
  neto: number;
  exento: number;
  iva: number;
  ila: number;
  total: number;
}

/** Totales de un documento. ivaIncluido: para boletas, `neto` trae impuestos y se desglosa. */
export function totales(neto: unknown, t: Trib, o: { exento?: unknown; ila?: boolean; ivaIncluido?: boolean } = {}): Totales {
  let x = n(neto);
  const aplicaIla = o.ila !== false && t.ilaActivo;
  if (o.ivaIncluido) x = Math.round(x / (1 + t.tasaIVA + (aplicaIla ? t.tasaILA : 0)));
  const i = iva(x, t);
  const l = ila(x, t, aplicaIla);
  const exento = n(o.exento);
  return { neto: x, exento, iva: i, ila: l, total: x + i + l + exento };
}

/** Impuesto único de segunda categoría sobre la base tributable mensual. */
export function impuestoUnico(base: unknown, utm: number): number {
  const u = n(utm);
  const enUtm = n(base) / u;
  const t = TRAMOS_IUSC.find(([d, h]) => enUtm > d && enUtm <= h) ?? TRAMOS_IUSC[0]!;
  return Math.max(0, Math.round((enUtm * t[2] - t[3]) * u));
}

export interface Trabajador {
  sueldoBase?: unknown;
  /** art50 | fija | ninguna (v1: cualquier otro valor pagaba `gratificacionMonto`). */
  gratificacion?: 'art50' | 'fija' | 'ninguna' | string | null;
  gratificacionMonto?: unknown;
  bonos?: unknown;
  comisiones?: unknown;
  colacion?: unknown;
  movilizacion?: unknown;
  tasaAfp?: unknown;
  /** Fonasa | Isapre. Con Fonasa el plan no cuenta (v1 lo seguía sumando si quedaba guardado). */
  salud?: string | null;
  planSalud?: unknown;
  /** indefinido | plazo_fijo | obra (obra cotiza cesantía como plazo fijo; v1 la trataba como indefinido). */
  contrato?: 'indefinido' | 'plazo_fijo' | 'obra' | string | null;
}

export interface ExtraLiquidacion {
  bonos?: unknown;
  comisiones?: unknown;
  /** Horas extra del mes: valor hora = base × 7 ÷ (30 × jornada semanal), con recargo de 50 %. */
  horasExtra?: unknown;
  anticipos?: unknown;
  /** Días trabajados (1–30): prorratea sueldo base y gratificación. Por defecto, 30. */
  diasTrabajados?: unknown;
}

/** Monto de horas extra (Código del Trabajo art. 32: recargo 50 % sobre el valor hora ordinario). */
export function montoHorasExtra(sueldoBase: unknown, horas: unknown, jornadaSemanal: number): number {
  if (!n(horas)) return 0;
  const valorHora = (n(sueldoBase) * 7) / (30 * (jornadaSemanal || 45));
  return Math.round(valorHora * 1.5 * n(horas));
}

/**
 * Liquidación de sueldo — fórmulas de v1 (tax.js:75-96), con los valores del mes en `r`:
 *  gratificación art. 50 = mín(25 % × base, 4,75 × IMM ÷ 12); imponible = base + gratificación + bonos + comisiones +
 *  horas extra; AFP y salud sobre el imponible con tope (`topeImponibleUF` × UF, antes 87,8 fijo); seguro de cesantía
 *  con su propio tope (`topeAfcUF`, faltaba en v1), 0 para el trabajador a plazo fijo u obra; impuesto único por
 *  tramos en UTM sobre imponible − AFP − 7 % salud − cesantía; líquido = imponible + no imponible − descuentos;
 *  costo empresa = imponible + no imponible + cesantía empleador + SIS + aporte. Con los valores por defecto y sin
 *  extras da exactamente lo de v1 (test de paridad).
 */
export function liquidacion(t: Trabajador, r: Remu, extra: ExtraLiquidacion = {}) {
  const dias = extra.diasTrabajados == null || extra.diasTrabajados === '' ? 30 : Math.min(30, Math.max(0, n(extra.diasTrabajados)));
  const prorrata = (x: number) => (dias >= 30 ? x : Math.round((x * dias) / 30));
  const base = prorrata(n(t.sueldoBase));
  const grat =
    t.gratificacion === 'art50'
      ? prorrata(Math.min(Math.round(n(t.sueldoBase) * 0.25), Math.round((4.75 * r.imm) / 12)))
      : t.gratificacion === 'ninguna'
        ? 0
        : prorrata(n(t.gratificacionMonto));
  const bonos = n(extra.bonos ?? t.bonos);
  const com = n(extra.comisiones ?? t.comisiones);
  const hhee = montoHorasExtra(t.sueldoBase, extra.horasExtra, r.jornadaSemanal);
  const noImp = n(t.colacion) + n(t.movilizacion);
  const imponible = base + grat + bonos + com + hhee;
  const impTope = Math.min(imponible, r.topeImponibleUF * r.uf);
  const afcTope = Math.min(imponible, r.topeAfcUF * r.uf);
  const plazo = t.contrato === 'plazo_fijo' || t.contrato === 'obra';
  const afp = Math.round(impTope * (n(t.tasaAfp) || r.afp));
  const plan = t.salud === 'Fonasa' ? 0 : n(t.planSalud);
  const salud = Math.round(Math.max(impTope * r.salud, plan));
  const ces = plazo ? 0 : Math.round(afcTope * r.cesantiaTrabajador);
  const tributable = imponible - afp - Math.round(impTope * r.salud) - ces;
  const iu = impuestoUnico(tributable, r.utm);
  const anticipos = n(extra.anticipos);
  const descuentos = afp + salud + ces + iu + anticipos;
  const liquido = imponible + noImp - descuentos;
  const cesEmp = Math.round(afcTope * (plazo ? r.cesantiaEmpleadorPlazoFijo : r.cesantiaEmpleador));
  const sis = Math.round(impTope * r.sis);
  const aporte = Math.round(impTope * r.aporteEmpleadorPension);
  return {
    base,
    gratificacion: grat,
    bonos,
    comisiones: com,
    horasExtra: hhee,
    noImponible: noImp,
    imponible,
    afp,
    salud,
    cesantia: ces,
    tributable,
    impuestoUnico: iu,
    anticipos,
    descuentos,
    liquido,
    cesantiaEmpleador: cesEmp,
    sis,
    aporteEmpleador: aporte,
    costoEmpresa: imponible + noImp + cesEmp + sis + aporte
  };
}
export type Liquidacion = ReturnType<typeof liquidacion>;

export const retencionHonorarios = (bruto: unknown, t: Trib) => Math.round(n(bruto) * t.retencionHonorarios);

export interface DocLibro {
  tipo: number;
  neto?: unknown;
  exento?: unknown;
  iva?: unknown;
  ila?: unknown;
  total?: unknown;
}

/** Resumen de libro de ventas o compras con signo por tipo de documento. */
export function resumenLibro(docs: readonly DocLibro[]) {
  const s = (d: DocLibro) => (DTE_TIPOS[d.tipo] ?? { signo: 1 }).signo;
  return {
    documentos: docs.length,
    neto: sum(docs, (d) => s(d) * n(d.neto)),
    exento: sum(docs, (d) => s(d) * n(d.exento)),
    iva: sum(docs, (d) => s(d) * n(d.iva)),
    ila: sum(docs, (d) => s(d) * n(d.ila)),
    total: sum(docs, (d) => s(d) * n(d.total)),
    porTipo: Object.entries(groupBy(docs, (d) => d.tipo)).map(([tipo, ds]) => ({
      tipo: Number(tipo),
      cantidad: ds.length,
      neto: sum(ds, (d) => n(d.neto)),
      iva: sum(ds, (d) => n(d.iva)),
      total: sum(ds, (d) => n(d.total))
    }))
  };
}

export function periodoAnterior(p: string): string {
  const [y, m] = p.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export interface F29Input {
  periodo: string;
  /** DTE emitidos válidos del período (sin guías 52, sin borradores/rechazados/anulados). */
  emitidos: readonly DocLibro[];
  recibidos: readonly DocLibro[];
  remanenteAnterior: number;
  retencionHonorarios: number;
  impuestoUnico: number;
}

/**
 * Borrador F29.
 *  IVA determinado = débito − crédito − remanente anterior (negativo → remanente siguiente)
 *  PPM = (neto + exento de ventas) × tasa PPM
 *  Total = IVA a pagar + ILA débito + PPM + retención honorarios + impuesto único
 */
export function f29(inp: F29Input, t: Trib) {
  const v = resumenLibro(inp.emitidos);
  const c = resumenLibro(inp.recibidos);
  const remAnt = n(inp.remanenteAnterior);
  const ivaDet = v.iva - c.iva - remAnt;
  const ivaPagar = Math.max(0, ivaDet);
  const remSig = Math.max(0, -ivaDet);
  const ingresosPPM = v.neto + v.exento;
  const ppm = Math.max(0, Math.round(ingresosPPM * t.tasaPPM));
  const ilaDebito = Math.max(0, v.ila - c.ila);
  const total = ivaPagar + ilaDebito + ppm + n(inp.retencionHonorarios) + n(inp.impuestoUnico);
  return {
    periodo: inp.periodo,
    ventas: v,
    compras: c,
    ivaDebito: v.iva,
    ivaCredito: c.iva,
    remanenteAnterior: remAnt,
    ivaDeterminado: ivaDet,
    ivaPagar,
    remanenteSiguiente: remSig,
    ilaDebito,
    baseIngresosPPM: ingresosPPM,
    tasaPPM: t.tasaPPM,
    ppm,
    retencionHonorarios: n(inp.retencionHonorarios),
    impuestoUnico: n(inp.impuestoUnico),
    total
  };
}
