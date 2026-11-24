/**
 * Finanzas (F7) — port de js/calc/financial.js (v1). Funciones puras sobre los datos de un período; el servicio
 * `services/financiero.ts` los reúne desde la base. Montos netos en CLP (sin IVA ni ILA).
 *
 * Diferencias con v1 (bugs corregidos, docs/v2/dominio.md):
 *  - Ventas con varias líneas: `porFormato` y el costo de ventas se calculan por línea con su costo congelado.
 *  - Depreciación (`depreciacionEntre`) y amortización de marca (`amortizacionMarca`) diarias y con fin de vida útil:
 *    llegan ya calculadas (v1: meses × valor/vida útil para siempre y marca ÷ 120 sin fechas, bug 4).
 *  - El período por defecto es la temporada (inicio–fin), no el año calendario.
 */
import type { OrgConfig } from './config';

export interface Periodo {
  desde: string;
  hasta: string;
}

export interface LineaFin {
  fecha: string;
  tipo: 'envasado' | 'granel';
  canal: string | null;
  formatoId: string | null;
  cantidad: number;
  litros: number;
  neto: number;
  costoUnitario: number;
}
export interface GastoFin {
  fecha: string;
  categoria: string;
  area: string;
  monto: number;
  tipoCosto: string;
  noDeducible?: boolean;
}
export interface DatosFinancieros {
  lineas: LineaFin[];
  /** Ventas confirmadas del período (para el ticket promedio). */
  ventasN: number;
  gastos: GastoFin[];
  remuneraciones: { area: string; costoEmpresa: number }[];
  honorarios: { bruto: number }[];
  depreciacion: number;
  amortizacion: number;
}

const sum = <T>(xs: readonly T[], f: (x: T) => number) => xs.reduce((s, x) => s + (Number(f(x)) || 0), 0);

/** Año calendario y mes (v1: periodoAnio, periodoMes). */
export const periodoAnio = (y: number): Periodo => ({ desde: `${y}-01-01`, hasta: `${y}-12-31` });
export function periodoMes(ym: string): Periodo {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return { desde: `${ym}-01`, hasta: `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` };
}

export interface FilaFormato {
  id: string;
  unidades: number;
  litros: number;
  ingresos: number;
  costo: number;
  precioProm: number;
  costoProm: number;
  contribucion: number;
  contribucionUnit: number;
  margen: number;
}

/**
 * Por formato y granel (v1: porFormato): unidades, litros, ingresos (Σ neto) y costo (Σ cantidad × costo
 * congelado); precio y costo promedio por unidad, contribución = ingresos − costo, margen = contribución / ingresos.
 */
export function porFormato(lineas: readonly LineaFin[], formatoIds: readonly string[]): Record<string, FilaFormato> {
  const out: Record<string, FilaFormato> = {};
  const nueva = (id: string): FilaFormato => ({
    id,
    unidades: 0,
    litros: 0,
    ingresos: 0,
    costo: 0,
    precioProm: 0,
    costoProm: 0,
    contribucion: 0,
    contribucionUnit: 0,
    margen: 0
  });
  for (const id of formatoIds) out[id] = nueva(id);
  out.granel = nueva('granel');
  for (const l of lineas) {
    const k = l.tipo === 'granel' ? 'granel' : (l.formatoId ?? '');
    const x = out[k];
    if (!x) continue;
    x.unidades += l.cantidad;
    x.litros += l.litros;
    x.ingresos += l.neto;
    x.costo += l.cantidad * l.costoUnitario;
  }
  for (const x of Object.values(out)) {
    x.precioProm = x.unidades ? x.ingresos / x.unidades : 0;
    x.costoProm = x.unidades ? x.costo / x.unidades : 0;
    x.contribucion = x.ingresos - x.costo;
    x.contribucionUnit = x.precioProm - x.costoProm;
    x.margen = x.ingresos ? x.contribucion / x.ingresos : 0;
  }
  return out;
}

/** Costo empresa de remuneraciones por área + honorarios brutos (v1: remuneraciones). */
export function remuneracionesPorArea(rs: DatosFinancieros['remuneraciones'], hon: DatosFinancieros['honorarios']) {
  const de = (a: string) =>
    sum(
      rs.filter((r) => r.area === a),
      (r) => r.costoEmpresa
    );
  return {
    produccion: de('produccion'),
    admin: de('admin'),
    ventas: de('ventas'),
    honorarios: sum(hon, (h) => h.bruto),
    total: sum(rs, (r) => r.costoEmpresa) + sum(hon, (h) => h.bruto)
  };
}

/**
 * Estado de resultados (v1: estadoResultados).
 *   Ingresos − Costo de ventas = Margen bruto
 *   − Gastos de administración y ventas − Indirectos de producción = EBITDA
 *   − Depreciación − Amortización = EBIT
 *   − Gastos financieros = Utilidad antes de impuestos (UAI)
 *   − Impuesto (UAI × tasa IDPC, provisión) = Utilidad neta
 * Estructura de costos: fijos = gastos no variables + remuneraciones + dep. + amort.; variables = costo de ventas +
 * gastos variables.
 */
export function estadoResultados(d: DatosFinancieros, p: Periodo, t: Pick<OrgConfig['tributario'], 'tasaIDPC'>) {
  const granel = d.lineas.filter((l) => l.tipo === 'granel');
  const env = d.lineas.filter((l) => l.tipo !== 'granel');
  const ingGranel = sum(granel, (l) => l.neto);
  const ingEnv = sum(env, (l) => l.neto);
  const ingresos = ingGranel + ingEnv;
  const porCanal: Record<string, number> = {};
  for (const l of d.lineas) {
    const k = l.tipo === 'granel' ? 'granel' : l.canal || 'directa';
    porCanal[k] = (porCanal[k] ?? 0) + l.neto;
  }
  const cogs = sum(d.lineas, (l) => l.cantidad * l.costoUnitario);
  const mb = ingresos - cogs;
  const gFin = sum(
    d.gastos.filter((g) => g.categoria === 'financiero'),
    (g) => g.monto
  );
  const gProd = sum(
    d.gastos.filter((g) => g.area === 'produccion' && g.categoria !== 'financiero'),
    (g) => g.monto
  );
  const gAdm = sum(
    d.gastos.filter((g) => g.area !== 'produccion' && g.categoria !== 'financiero'),
    (g) => g.monto
  );
  const rem = remuneracionesPorArea(d.remuneraciones, d.honorarios);
  const gav = gAdm + rem.admin + rem.ventas + rem.honorarios;
  const indirectos = gProd + rem.produccion;
  const ebitda = mb - gav - indirectos;
  const dep = d.depreciacion;
  const amort = d.amortizacion;
  const ebit = ebitda - dep - amort;
  const uai = ebit - gFin;
  const impuesto = Math.max(0, Math.round(uai * t.tasaIDPC));
  const un = uai - impuesto;
  const fijos =
    sum(
      d.gastos.filter((g) => g.tipoCosto !== 'variable'),
      (g) => g.monto
    ) +
    rem.total +
    dep +
    amort;
  const variablesGasto = sum(
    d.gastos.filter((g) => g.tipoCosto === 'variable'),
    (g) => g.monto
  );
  return {
    periodo: p,
    ingresos,
    ingGranel,
    ingEnv,
    porCanal,
    cogs,
    mb,
    gav,
    gastosAdmin: gAdm,
    remuneraciones: rem,
    indirectos,
    gastosProduccion: gProd,
    ebitda,
    dep,
    amort,
    ebit,
    gFin,
    uai,
    impuesto,
    un,
    litros: sum(d.lineas, (l) => l.litros),
    unidades: sum(env, (l) => l.cantidad),
    ventasN: d.ventasN,
    costosFijos: fijos,
    costosVariables: cogs + variablesGasto
  };
}
export type EstadoResultados = ReturnType<typeof estadoResultados>;

/** Partes del costo de envasado (v1: costos/index.js). */
export const PARTES_COSTO = [
  ['vino', 'Vino'],
  ['envase', 'Envase'],
  ['etiqueta', 'Etiqueta'],
  ['capsula', 'Cápsula'],
  ['cierre', 'Cierre'],
  ['caja', 'Caja'],
  ['manoObra', 'Mano de obra'],
  ['energia', 'Energía/agua']
] as const;
export type ParteCosto = (typeof PARTES_COSTO)[number][0];

/** Costos indirectos del período (v1: costos): GAV + indirectos de producción + dep. + amort. + financieros. */
export const costosIndirectos = (er: EstadoResultados) => er.gav + er.indirectos + er.dep + er.amort + er.gFin;

/**
 * Costo por formato (v1: costos/index.js:20-27): directo = promedio de las partes congeladas de sus órdenes
 * confirmadas ponderado por unidades; indirecto = indirectos / litros vendidos × litros del formato.
 */
export function costoPorFormato(
  formato: { id: string; litros: number },
  ordenes: readonly { formatoId: string; unidades: number; costoPartes: Partial<Record<string, number>> | null }[],
  indirectoPorLitro: number,
  precioProm = 0
) {
  const os = ordenes.filter((o) => o.formatoId === formato.id);
  const u = sum(os, (o) => o.unidades);
  const partes = Object.fromEntries(PARTES_COSTO.map(([k]) => [k, u ? sum(os, (o) => (Number(o.costoPartes?.[k]) || 0) * o.unidades) / u : 0])) as Record<
    ParteCosto,
    number
  >;
  const directo = Object.values(partes).reduce((s, v) => s + v, 0);
  const indirecto = indirectoPorLitro * formato.litros;
  const total = directo + indirecto;
  return { unidades: u, partes, directo, indirecto, total, precio: precioProm, margen: precioProm ? (precioProm - total) / precioProm : null };
}
