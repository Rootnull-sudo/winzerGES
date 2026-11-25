import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import {
  costoPorFormato,
  costosIndirectos,
  escenarios,
  estadoResultados,
  flujoCaja,
  porFormato,
  puntoEquilibrio,
  ratios,
  renta,
  type DatosFinancieros
} from '../src/financiero';
import { loadLegacy } from './legacy';

const p = { desde: '2026-01-01', hasta: '2026-12-31' };
const formato = [
  { id: 'f75', nombre: 'Botella 0,75 L', litros: 0.75 },
  { id: 'f15', nombre: 'Magnum', litros: 1.5 }
];
// v1: una línea por venta.
const venta = [
  {
    id: 'v1',
    fecha: '2026-03-10',
    estado: 'confirmada',
    tipo: 'envasado',
    canal: 'distribuidor',
    formatoId: 'f75',
    cantidad: 120,
    litros: 90,
    neto: 600_000,
    costoUnitario: 2_100
  },
  {
    id: 'v2',
    fecha: '2026-04-02',
    estado: 'confirmada',
    tipo: 'envasado',
    canal: null,
    formatoId: 'f15',
    cantidad: 12,
    litros: 18,
    neto: 180_000,
    costoUnitario: 4_500
  },
  {
    id: 'v3',
    fecha: '2026-05-20',
    estado: 'confirmada',
    tipo: 'granel',
    canal: 'granel',
    formatoId: null,
    cantidad: 1000,
    litros: 1000,
    neto: 1_200_000,
    costoUnitario: 650
  },
  {
    id: 'v4',
    fecha: '2026-06-01',
    estado: 'anulada',
    tipo: 'envasado',
    canal: 'directa',
    formatoId: 'f75',
    cantidad: 5,
    litros: 3.75,
    neto: 25_000,
    costoUnitario: 2_100
  },
  {
    id: 'v5',
    fecha: '2025-12-30',
    estado: 'confirmada',
    tipo: 'envasado',
    canal: 'directa',
    formatoId: 'f75',
    cantidad: 5,
    litros: 3.75,
    neto: 25_000,
    costoUnitario: 2_100
  }
];
const gasto = [
  { fecha: '2026-02-01', categoria: 'servicios', area: 'admin', monto: 300_000, tipoCosto: 'fijo' },
  { fecha: '2026-02-05', categoria: 'mantencion', area: 'produccion', monto: 150_000, tipoCosto: 'variable' },
  { fecha: '2026-03-31', categoria: 'financiero', area: 'admin', monto: 8_900, tipoCosto: 'fijo' },
  { fecha: '2025-01-01', categoria: 'servicios', area: 'admin', monto: 999_999, tipoCosto: 'fijo' }
];
const trabajador = [
  { id: 't1', area: 'produccion' },
  { id: 't2', area: 'ventas' }
];
const remuneracion = [
  { trabajadorId: 't1', periodo: '2026-03', costoEmpresa: 900_000 },
  { trabajadorId: 't2', periodo: '2026-03', costoEmpresa: 700_000 },
  { trabajadorId: 't2', periodo: '2025-12', costoEmpresa: 700_000 }
];
const honorario = [{ fecha: '2026-04-15', bruto: 400_000 }];

const enP = (f: string) => f >= p.desde && f <= p.hasta;
const datos: DatosFinancieros = {
  lineas: venta.filter((v) => v.estado !== 'anulada' && enP(v.fecha)).map((v) => ({ ...v, tipo: v.tipo as 'envasado' | 'granel', formatoId: v.formatoId })),
  ventasN: venta.filter((v) => v.estado !== 'anulada' && enP(v.fecha)).length,
  gastos: gasto.filter((g) => enP(g.fecha)),
  remuneraciones: remuneracion
    .filter((r) => enP(r.periodo + '-15'))
    .map((r) => ({ area: trabajador.find((t) => t.id === r.trabajadorId)!.area, costoEmpresa: r.costoEmpresa })),
  honorarios: honorario.filter((h) => enP(h.fecha)),
  depreciacion: 0,
  amortizacion: 0
};

describe('estado de resultados: paridad v1 (financial.js)', () => {
  const VG = loadLegacy(['js/calc/inventory.js', 'js/calc/financial.js'], DEFAULT_CONFIG, {
    venta,
    gasto,
    trabajador,
    remuneracion,
    honorario,
    formato,
    activo: [],
    marca: []
  });
  VG.utils.memo = (_k: string, fn: () => unknown) => fn();
  const F = VG.calc.financial;

  it('mismas líneas (sin activos ni marcas: depreciación y amortización 0 en ambos)', () => {
    const a = estadoResultados(datos, p, DEFAULT_CONFIG.tributario);
    const b = F.estadoResultados(p);
    expect(a).toEqual({ ...b, periodo: p });
    expect(a.ingresos).toBe(1_980_000);
  });

  it('porFormato', () => {
    const a = porFormato(datos.lineas, ['f75', 'f15']);
    const b = F.porFormato(p);
    for (const k of ['f75', 'f15', 'granel']) {
      const { formato: _f, ...rest } = b[k];
      expect(a[k]).toEqual({ id: k, ...rest });
    }
  });

  it('costo por formato: partes congeladas ponderadas por unidades + indirecto por litro', () => {
    const er = estadoResultados(datos, p, DEFAULT_CONFIG.tributario);
    const ind = costosIndirectos(er) / er.litros;
    const c = costoPorFormato(
      { id: 'f75', litros: 0.75 },
      [
        { formatoId: 'f75', unidades: 100, costoPartes: { vino: 1000, envase: 400 } },
        { formatoId: 'f75', unidades: 300, costoPartes: { vino: 1200, envase: 400, etiqueta: 100 } }
      ],
      ind,
      5_000
    );
    expect(c.partes.vino).toBe(1150);
    expect(c.partes.etiqueta).toBe(75);
    expect(c.directo).toBe(1625);
    expect(c.indirecto).toBeCloseTo(ind * 0.75, 6);
    expect(c.margen).toBeCloseTo((5000 - c.total) / 5000, 9);
  });
});

describe('ratios, punto de equilibrio, escenarios y renta: paridad v1', () => {
  const VG = loadLegacy(['js/calc/inventory.js', 'js/calc/financial.js', 'js/calc/tax.js'], DEFAULT_CONFIG, {
    venta,
    gasto: [...gasto, { fecha: '2026-06-10', categoria: 'otros', area: 'admin', monto: 50_000, tipoCosto: 'fijo', noDeducible: true }],
    trabajador,
    remuneracion,
    honorario,
    formato,
    activo: [],
    marca: [],
    ordenEnvasado: []
  });
  VG.utils.memo = (_k: string, fn: () => unknown) => fn();
  const F = VG.calc.financial;
  const INV = 5_000_000;
  VG.calc.inventory.valorProductoTerminado = () => 2_000_000;
  VG.calc.inventory.valorGranel = () => 2_500_000;
  VG.calc.inventory.valorInventarioInsumos = () => 500_000;
  const PART: Record<string, number> = { f75: 0.4, f15: 0.35 };
  F.participacionEnvase = (id: string) => PART[id] ?? 0.3;
  const d2 = {
    ...datos,
    gastos: [...datos.gastos, { fecha: '2026-06-10', categoria: 'otros', area: 'admin', monto: 50_000, tipoCosto: 'fijo', noDeducible: true }]
  };
  const er = estadoResultados(d2, p, DEFAULT_CONFIG.tributario);
  const pf = porFormato(d2.lineas, ['f75', 'f15']);
  const fmts = formato.map((f) => ({ id: f.id, nombre: f.nombre, litros: f.litros }));
  const pe = (aj = {}) => puntoEquilibrio(er, pf, fmts, PART, DEFAULT_CONFIG.tributario.tasaIDPC, aj);

  it('ratios', () => {
    const a = ratios(er, d2, INV, DEFAULT_CONFIG);
    const b = F.ratios(p);
    expect(a.list.map((x) => [x.key, x.estado])).toEqual(b.list.map((x: { key: string; estado: string }) => [x.key, x.estado]));
    for (const x of a.list) expect(x.value).toBeCloseTo(b.map[x.key].value, 6);
  });

  it.each([{}, { precio: 10, volumen: -20, costoEnvase: 15, sueldos: 5, tipoCambio: 10, exportShare: 0.3 }])('punto de equilibrio %j', (aj) => {
    const a = pe(aj);
    const b = F.puntoEquilibrio(p, aj);
    for (const k of ['fijos', 'ingresos', 'costosVariables', 'contribucion', 'razon', 'peLitros', 'pePesos', 'margenSeguridad', 'utilidadNeta'] as const)
      expect(a[k]).toBeCloseTo(b[k], 6);
    expect(a.alcanzado).toBe(b.alcanzado);
    expect(a.rows.map((r) => r.peUnidades)).toEqual(b.rows.map((r: { peUnidades: number }) => r.peUnidades));
  });

  it('escenarios', () => {
    const a = escenarios(pe);
    const b = F.escenarios(p);
    expect(a.map((x) => x.nombre)).toEqual(b.map((x: { nombre: string }) => x.nombre));
    a.forEach((x, i) => expect(x.utilidadNeta).toBeCloseTo(b[i].utilidadNeta, 6));
  });

  it('renta', () => {
    VG.calc.tax.ppmAnual = () => ({ meses: [], porMes: [], total: 40_000, pagados: 35_000 });
    const b = VG.calc.tax.renta(2026);
    const a = renta(2026, er, 50_000, { pagados: 35_000, total: 40_000 }, DEFAULT_CONFIG.tributario);
    expect(a).toEqual(b);
  });
});

describe('flujo de caja corregido', () => {
  it('cobros parciales reales, sueldos líquidos y F29 una sola vez; proyección después del mes actual', () => {
    const r = flujoCaja(
      2026,
      [
        { fecha: '2026-03-05', concepto: 'cobros', monto: 500_000 },
        { fecha: '2026-03-28', concepto: 'sueldos', monto: 600_000 },
        { fecha: '2026-04-20', concepto: 'impuestos', monto: 150_000 },
        { fecha: '2026-11-30', concepto: 'cobros', monto: 1_000_000 }
      ],
      100_000,
      '2026-10'
    );
    expect(r.rows[2]).toMatchObject({ entradas: 500_000, salidas: 600_000, neto: -100_000, saldo: 0, alerta: false });
    expect(r.rows[3]).toMatchObject({ impuestos: 150_000, saldo: -150_000, alerta: true });
    expect(r.rows[10]).toMatchObject({ proyectado: true, cobros: 1_000_000 });
    expect(r.negativo?.mes).toBe('2026-04');
    expect(r.saldoFinal).toBe(850_000);
  });
});
