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

/* ---------- Ratios (v1: financial.ratios) ---------- */

export type Semaforo = 'ok' | 'warn' | 'bad';
export interface Ratio {
  key: string;
  label: string;
  value: number;
  fmt: 'pct' | 'x' | 'dias' | 'clp';
  estado: Semaforo;
  ayuda: string;
}

/**
 * 14 ratios con semáforo. Rotación = costo de ventas anualizado / inventario valorizado; días = 365 / rotación.
 * ROC = EBIT × (1 − tasa) anualizado / capital invertido; ROI y ROE = utilidad neta anualizada / capital o patrimonio.
 */
export function ratios(
  er: EstadoResultados,
  d: Pick<DatosFinancieros, 'lineas'>,
  inventario: number,
  cfg: { finanzas: OrgConfig['finanzas']; tributario: Pick<OrgConfig['tributario'], 'tasaIDPC'> }
) {
  const p = er.periodo;
  const dias = Math.max(1, Math.round((Date.parse(p.hasta) - Date.parse(p.desde)) / 86_400_000) + 1);
  const anual = 365 / dias;
  const div = (a: number, b: number) => (b ? a / b : 0);
  const sem = (v: number, ok: number, warn: number): Semaforo => (v >= ok ? 'ok' : v >= warn ? 'warn' : 'bad');
  const rot = div(er.cogs * anual, inventario);
  const mm = cfg.finanzas.margenMinimo;
  const t = cfg.tributario.tasaIDPC;
  const cogsEnv = sum(
    d.lineas.filter((l) => l.tipo !== 'granel'),
    (l) => l.cantidad * l.costoUnitario
  );
  const r = (key: string, label: string, value: number, fmt: Ratio['fmt'], estado: Semaforo, ayuda: string): Ratio => ({
    key,
    label,
    value,
    fmt,
    estado,
    ayuda
  });
  const roc = div(er.ebit * (1 - t) * anual, cfg.finanzas.capitalInvertido);
  const diasInv = rot ? 365 / rot : 0;
  const list: Ratio[] = [
    r(
      'mb',
      'Margen bruto',
      div(er.mb, er.ingresos),
      'pct',
      sem(div(er.mb, er.ingresos), mm + 0.15, mm),
      'Margen bruto / Ingresos. Cuánto queda de cada peso vendido después del costo directo.'
    ),
    r(
      'mo',
      'Margen operacional',
      div(er.ebit, er.ingresos),
      'pct',
      sem(div(er.ebit, er.ingresos), 0.15, 0.05),
      'EBIT / Ingresos. Rentabilidad de la operación antes de intereses e impuestos.'
    ),
    r('mn', 'Margen neto', div(er.un, er.ingresos), 'pct', sem(div(er.un, er.ingresos), 0.1, 0.02), 'Utilidad neta / Ingresos.'),
    r('ros', 'ROS', div(er.un, er.ingresos), 'pct', sem(div(er.un, er.ingresos), 0.1, 0.02), 'Return on Sales = Utilidad neta / Ventas.'),
    r('roc', 'ROC', roc, 'pct', sem(roc, 0.12, 0.05), 'Return on Capital = EBIT × (1 − tasa) / Capital invertido (anualizado).'),
    r(
      'roi',
      'ROI',
      div(er.un * anual, cfg.finanzas.capitalInvertido),
      'pct',
      sem(div(er.un * anual, cfg.finanzas.capitalInvertido), 0.1, 0.03),
      'Utilidad neta anualizada / Capital invertido.'
    ),
    r(
      'roe',
      'ROE',
      div(er.un * anual, cfg.finanzas.patrimonio),
      'pct',
      sem(div(er.un * anual, cfg.finanzas.patrimonio), 0.12, 0.04),
      'Utilidad neta anualizada / Patrimonio.'
    ),
    r('rot', 'Rotación de inventario', rot, 'x', sem(rot, 2, 1), 'COGS anualizado / Inventario valorizado. Veces que rota el inventario al año.'),
    r(
      'dias',
      'Días de inventario',
      diasInv,
      'dias',
      rot ? (diasInv <= 180 ? 'ok' : diasInv <= 365 ? 'warn' : 'bad') : 'warn',
      '365 / rotación. Días promedio que el producto permanece en inventario (el vino con guarda naturalmente es alto).'
    ),
    r('cl', 'Costo por litro vendido', div(er.cogs, er.litros), 'clp', 'ok', 'COGS / litros vendidos.'),
    r('il', 'Ingreso por litro', div(er.ingresos, er.litros), 'clp', 'ok', 'Ingresos netos / litros vendidos.'),
    r('cb', 'Costo por botella (envasado)', div(cogsEnv, er.unidades), 'clp', 'ok', 'COGS de producto envasado / unidades vendidas.'),
    r('ib', 'Ingreso por botella', div(er.ingEnv, er.unidades), 'clp', 'ok', 'Ingresos de envasado / unidades vendidas.'),
    r('tk', 'Ticket promedio', div(er.ingresos, er.ventasN), 'clp', 'ok', 'Ingresos netos / número de ventas.')
  ];
  return { inventario, list, map: Object.fromEntries(list.map((x) => [x.key, x])) as Record<string, Ratio> };
}

/* ---------- Punto de equilibrio y simulador (v1: puntoEquilibrio, escenarios) ---------- */

export interface AjustesSimulador {
  precio?: number;
  volumen?: number;
  costoEnvase?: number;
  sueldos?: number;
  tipoCambio?: number;
  /** 0..1 */
  exportShare?: number;
}
export interface FormatoPe {
  id: string;
  nombre: string;
  litros: number;
}

/**
 * Punto de equilibrio multiproducto con la mezcla del período.
 *   Contribución por litro = Σ contribución / Σ litros; PE litros = fijos / contribución por litro
 *   PE pesos = fijos / razón de contribución; margen de seguridad = (ventas − PE pesos) / ventas
 * `ajustes` (en %) simula precio, volumen, costo del envase (según su participación en el costo), sueldos y tipo de
 * cambio sobre la parte exportada.
 */
export function puntoEquilibrio(
  er: EstadoResultados,
  pf: Record<string, FilaFormato>,
  formatos: readonly FormatoPe[],
  participacionEnvase: Readonly<Record<string, number>>,
  tasaIDPC: number,
  aj: AjustesSimulador = {}
) {
  const kP = 1 + (aj.precio ?? 0) / 100;
  const kV = 1 + (aj.volumen ?? 0) / 100;
  const kE = (aj.costoEnvase ?? 0) / 100;
  const kS = 1 + (aj.sueldos ?? 0) / 100;
  const kT = (aj.tipoCambio ?? 0) / 100;
  const exp = aj.exportShare ?? 0;
  const info = (id: string): FormatoPe =>
    id === 'granel' ? { id, nombre: 'Granel', litros: 1 } : (formatos.find((f) => f.id === id) ?? { id, nombre: id, litros: 1 });
  let ing = 0;
  let cv = 0;
  let litros = 0;
  const rows = Object.values(pf)
    .filter((x) => x.unidades > 0)
    .map((x) => {
      const f = info(x.id);
      const envPart = x.id === 'granel' ? 0 : (participacionEnvase[x.id] ?? 0.3);
      const precio = x.precioProm * kP * (1 + exp * kT);
      const costo = x.costoProm * (1 + envPart * kE);
      const unidades = x.unidades * kV;
      const fila = {
        id: x.id,
        nombre: f.nombre,
        litrosUnidad: f.litros || 1,
        unidades,
        precio,
        costo,
        contribucionUnit: precio - costo,
        ingresos: precio * unidades,
        cv: costo * unidades,
        litros: x.litros * kV,
        share: 0,
        peUnidades: 0
      };
      ing += fila.ingresos;
      cv += fila.cv;
      litros += fila.litros;
      return fila;
    });
  const fijos = er.costosFijos + er.remuneraciones.total * (kS - 1);
  const contrib = ing - cv;
  const razon = ing ? contrib / ing : 0;
  const contribLitro = litros ? contrib / litros : 0;
  const peLitros = contribLitro > 0 ? fijos / contribLitro : Infinity;
  const pePesos = razon > 0 ? fijos / razon : Infinity;
  for (const r of rows) {
    r.share = litros ? r.litros / litros : 0;
    r.peUnidades = Number.isFinite(peLitros) ? (peLitros * r.share) / r.litrosUnidad : Infinity;
  }
  const ebit = contrib - fijos;
  return {
    fijos,
    ingresos: ing,
    costosVariables: cv,
    contribucion: contrib,
    razon,
    contribLitro,
    litros,
    peLitros,
    pePesos,
    margenSeguridad: ing && Number.isFinite(pePesos) ? (ing - pePesos) / ing : -1,
    rows,
    utilidadOperacional: ebit,
    utilidadNeta: ebit - Math.max(0, ebit) * tasaIDPC,
    alcanzado: ing >= pePesos
  };
}
export type PuntoEquilibrio = ReturnType<typeof puntoEquilibrio>;

export const ESCENARIOS: readonly [string, AjustesSimulador][] = [
  ['Pesimista', { precio: -8, volumen: -15, costoEnvase: 10 }],
  ['Base', {}],
  ['Optimista', { precio: 5, volumen: 12, costoEnvase: -3 }]
];
export function escenarios(pe: (aj: AjustesSimulador) => PuntoEquilibrio) {
  return ESCENARIOS.map(([nombre, aj]) => {
    const r = pe(aj);
    return { nombre, ingresos: r.ingresos, utilidad: r.utilidadOperacional, utilidadNeta: r.utilidadNeta, pe: r.pePesos };
  });
}

/* ---------- Flujo de caja (corregido) ---------- */

export type ConceptoCaja = 'cobros' | 'pagosProv' | 'sueldos' | 'gastos' | 'impuestos';
export interface MovCaja {
  fecha: string;
  concepto: ConceptoCaja;
  /** Siempre positivo; el concepto dice si entra o sale. */
  monto: number;
}

/**
 * Flujo de caja mensual del año (v1: flujoCaja), real hasta el mes en curso y proyectado después.
 * Corrige v1 (bugs 2 y 3): entra lo cobrado de verdad (cobros, también parciales) y el saldo por cobrar a su
 * vencimiento; sale lo pagado (pagos, también parciales) y el saldo por pagar a su vencimiento; sueldos y honorarios
 * por su líquido; impuestos por el total del F29 (que ya incluye retenciones, impuesto único y PPM): sin doble conteo.
 */
export function flujoCaja(anio: number, movs: readonly MovCaja[], saldoInicial: number, hoyMes: string) {
  const meses = Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, '0')}`);
  const m = Object.fromEntries(
    meses.map((x) => [
      x,
      {
        mes: x,
        entradas: 0,
        salidas: 0,
        cobros: 0,
        pagosProv: 0,
        sueldos: 0,
        gastos: 0,
        impuestos: 0,
        proyectado: x > hoyMes,
        neto: 0,
        saldo: 0,
        alerta: false
      }
    ])
  );
  for (const x of movs) {
    const fila = m[x.fecha.slice(0, 7)];
    if (!fila) continue;
    fila[x.concepto] += x.monto;
    if (x.concepto === 'cobros') fila.entradas += x.monto;
    else fila.salidas += x.monto;
  }
  let saldo = saldoInicial;
  const rows = meses.map((x) => {
    const r = m[x]!;
    r.neto = r.entradas - r.salidas;
    saldo += r.neto;
    r.saldo = saldo;
    r.alerta = saldo < 0;
    return r;
  });
  return { rows, saldoFinal: saldo, negativo: rows.find((r) => r.alerta) ?? null };
}

/* ---------- Rankings ---------- */

/**
 * Rentabilidad por cuartel (v1: rentabilidadCuarteles): costo de campo (cosecha + aplicaciones + labores de la
 * temporada) frente a los ingresos de los lotes a los que aportó, en proporción a sus kg en cada lote.
 */
export function rentabilidadCuarteles(
  cuarteles: readonly { id: string; nombre: string; superficie: number }[],
  cosechas: readonly { cuartelId: string; loteId: string | null; kg: number; costo: number }[],
  costosCampo: Readonly<Record<string, number>>,
  ingresosLote: Readonly<Record<string, number>>,
  kgLote: Readonly<Record<string, number>>
) {
  return cuarteles.map((c) => {
    const cs = cosechas.filter((x) => x.cuartelId === c.id);
    const kg = sum(cs, (x) => x.kg);
    const costo = sum(cs, (x) => x.costo) + (costosCampo[c.id] ?? 0);
    let ingresos = 0;
    for (const loteId of new Set(cs.map((x) => x.loteId).filter((x): x is string => !!x))) {
      const aporte = sum(
        cs.filter((x) => x.loteId === loteId),
        (x) => x.kg
      );
      ingresos += ((ingresosLote[loteId] ?? 0) * aporte) / (kgLote[loteId] || 1);
    }
    return { id: c.id, nombre: c.nombre, kg, costo, ingresos, margen: ingresos - costo, kgHa: c.superficie ? kg / c.superficie : 0 };
  });
}

export type CuadranteBcg = 'star' | 'q' | 'cow' | 'dog';
export const CUADRANTES_BCG: Record<CuadranteBcg, [string, string]> = {
  q: ['Interrogantes', 'Crecen pero con baja participación: evaluar'],
  star: ['Estrellas', 'Alta participación y crecimiento: invertir'],
  dog: ['Perros', 'Baja participación y crecimiento: revisar'],
  cow: ['Vacas lecheras', 'Alta participación, bajo crecimiento: rentabilizar']
};
/** Matriz BCG simplificada (v1: financiero/rankings): participación ≥ 1/n y crecimiento ≥ 10 % vs período anterior. */
export function bcg(actual: readonly { id: string; nombre: string; ingresos: number }[], anterior: Readonly<Record<string, number>>) {
  const tot = sum(actual, (x) => x.ingresos) || 1;
  return actual.map((x) => {
    const prev = anterior[x.id] ?? 0;
    const g = prev ? (x.ingresos - prev) / prev : 1;
    const s = x.ingresos / tot;
    const q: CuadranteBcg = s >= 1 / actual.length ? (g >= 0.1 ? 'star' : 'cow') : g >= 0.1 ? 'q' : 'dog';
    return { id: x.id, nombre: x.nombre, participacion: s, crecimiento: g, cuadrante: q };
  });
}

/* ---------- Resumen ejecutivo (v1: recomendaciones) ---------- */

const clp0 = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;
const pct0 = (v: number) => `${(v * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })} %`;

export function recomendaciones(
  er: EstadoResultados,
  r: ReturnType<typeof ratios>,
  pe: PuntoEquilibrio,
  fc: ReturnType<typeof flujoCaja>,
  margenMinimo: number,
  cxc: number
): string[] {
  if (er.ingresos === 0) return ['Aún no hay ventas en el período: registra ventas para obtener indicadores.'];
  const out: string[] = [];
  const mb = r.map.mb!.value;
  if (mb < margenMinimo)
    out.push(
      `El margen bruto (${pct0(mb)}) está bajo el mínimo configurado. Revisa precios o el costo del envase y etiqueta, que suelen ser el mayor componente del costo por botella.`
    );
  if (!pe.alcanzado)
    out.push(
      `Aún no se alcanza el punto de equilibrio: faltan ${clp0(pe.pePesos - pe.ingresos)} en ventas netas (≈ ${Math.round(Math.max(0, pe.peLitros - pe.litros)).toLocaleString('es-CL')} L).`
    );
  else out.push(`Se superó el punto de equilibrio con un margen de seguridad de ${pct0(pe.margenSeguridad)}.`);
  const best = [...pe.rows].sort((a, b) => b.contribucionUnit / b.litrosUnidad - a.contribucionUnit / a.litrosUnidad)[0];
  if (best)
    out.push(
      `El formato con mayor contribución por litro es ${best.nombre} (${clp0(best.contribucionUnit / best.litrosUnidad)}/L). Prioriza su venta y disponibilidad.`
    );
  const granel = pe.rows.find((x) => x.id === 'granel');
  if (granel && best && best.id !== 'granel')
    out.push(
      `El granel aporta ${clp0(granel.contribucionUnit)}/L, versus ${clp0(best.contribucionUnit / best.litrosUnidad)}/L envasado en ${best.nombre}: evalúa envasar parte del granel si hay demanda.`
    );
  if (fc.negativo)
    out.push(
      `Alerta de caja: el saldo proyectado queda negativo en ${fc.negativo.mes}. Considera adelantar cobranza (${clp0(cxc)} por cobrar) o renegociar plazos con proveedores.`
    );
  if (r.map.dias!.value > 365) out.push('Los días de inventario superan un año: revisa la rotación de stock y la planificación de envasado.');
  return out;
}

/* ---------- Renta (v1: tax.renta) ---------- */

/**
 * Borrador de Renta (año comercial `anio`, tributario `anio + 1`).
 *   RLI = max(0, UAI + gastos rechazados − deducciones); IDPC = RLI × tasa
 *   Resultado = IDPC − PPM del año (los pagados; si no hay, los calculados) → a pagar (+) o devolución (−)
 */
export function renta(
  anio: number,
  er: Pick<EstadoResultados, 'uai'>,
  agregados: number,
  ppm: { pagados: number; total: number },
  t: Pick<OrgConfig['tributario'], 'tasaIDPC' | 'regimen'>
) {
  const rli = Math.max(0, er.uai + agregados);
  const idpc = Math.round(rli * t.tasaIDPC);
  const ppmCredito = ppm.pagados || ppm.total;
  const resultado = idpc - ppmCredito;
  return {
    anioComercial: anio,
    anioTributario: anio + 1,
    regimen: t.regimen,
    resultadoFinanciero: er.uai,
    agregados,
    deducciones: 0,
    rli,
    tasa: t.tasaIDPC,
    idpc,
    ppm: ppmCredito,
    resultado,
    aPagar: Math.max(0, resultado),
    devolucion: Math.max(0, -resultado),
    conciliacion: { utilidadFinanciera: er.uai, masGastosRechazados: agregados, rentaLiquidaImponible: rli }
  };
}
export type Renta = ReturnType<typeof renta>;
