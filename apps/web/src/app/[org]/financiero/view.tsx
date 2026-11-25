'use client';
/**
 * Financiero (F7-2; v1: modules/financiero). Resultados con comparación al período anterior, ratios con semáforo,
 * punto de equilibrio, simulador (recalcula en el navegador con `puntoEquilibrio`), flujo de caja corregido,
 * rankings con matriz BCG y resumen ejecutivo.
 */
import {
  clp,
  CUADRANTES_BCG,
  nombrePeriodoCorto,
  puntoEquilibrio,
  type AjustesSimulador,
  type CuadranteBcg,
  type EstadoResultados,
  type FilaFormato,
  type FormatoPe,
  type Ratio
} from '@winzer/domain';
import { Download, Printer } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useCan } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BarrasAgrupadas, BarrasH, ChartCard, Lineas } from '@/components/ui/chart';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input } from '@/components/ui/field';
import { Stat, StatGrid } from '@/components/ui/page';
import { Tabs, useTab } from '@/components/ui/tabs';
import { cn } from '@/lib/cn';

export interface DatosFinanciero {
  etiqueta: string;
  etiquetaAnterior: string;
  mes: string | null;
  er: EstadoResultados;
  erAnterior: EstadoResultados;
  mensual: { mes: string; ingresos: number; costos: number; uai: number }[];
  ratios: Ratio[];
  inventario: number;
  pf: Record<string, FilaFormato & { nombre: string }>;
  formatos: FormatoPe[];
  participacion: Record<string, number>;
  tasaIDPC: number;
  escenarios: { nombre: string; ingresos: number; utilidad: number; utilidadNeta: number; pe: number }[];
  flujo: {
    anio: number;
    rows: {
      mes: string;
      cobros: number;
      pagosProv: number;
      sueldos: number;
      gastos: number;
      impuestos: number;
      neto: number;
      saldo: number;
      proyectado: boolean;
      alerta: boolean;
    }[];
    saldoFinal: number;
    negativo: { mes: string; saldo: number } | null;
    cxc: number;
    cxp: number;
    saldoInicial: number;
  };
  canales: { id: string; ingresos: number; contribucion: number }[];
  cuarteles: { id: string; nombre: string; kg: number; costo: number; ingresos: number; margen: number; kgHa: number }[];
  bcg: { id: string; nombre: string; participacion: number; crecimiento: number; cuadrante: CuadranteBcg }[];
  recomendaciones: string[];
  margenMinimo: number;
}

const TABS = [
  { id: 'resultados', label: 'Resultados' },
  { id: 'ratios', label: 'Ratios' },
  { id: 'equilibrio', label: 'Punto de equilibrio' },
  { id: 'simulador', label: 'Simulador' },
  { id: 'flujo', label: 'Flujo de caja' },
  { id: 'rankings', label: 'Rankings' },
  { id: 'resumen', label: 'Resumen' }
] as const;
const CANAL: Record<string, string> = {
  granel: 'Granel',
  distribuidor: 'Distribuidor',
  restaurante: 'Restaurante',
  directa: 'Directa',
  ecommerce: 'E-commerce'
};
/** Redondea sin dejar "-0". */
const r0 = (v: number) => Math.round(v) || 0;
const pct = (v: number, d = 1) => {
  if (!Number.isFinite(v)) return '—';
  const x = Math.round(v * 100 * 10 ** d) / 10 ** d || 0;
  return `${x.toLocaleString('es-CL', { maximumFractionDigits: d })} %`;
};
const nf = (v: number) => (Number.isFinite(v) ? r0(v).toLocaleString('es-CL') : '∞');
const pesos = (v: number) => (Number.isFinite(v) ? clp(r0(v)) : '∞');
/** Montos de los gráficos: en millones desde $1 M, para que el eje no se corte. */
const compacto = (v: number) => (Math.abs(v) >= 1e6 ? '$' + (v / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' M' : clp(r0(v)));
const TONO = { ok: 'ok', warn: 'warn', bad: 'bad' } as const;
const fmtRatio = (r: Ratio) =>
  r.fmt === 'pct'
    ? pct(r.value)
    : r.fmt === 'x'
      ? `${r.value.toLocaleString('es-CL', { maximumFractionDigits: 2 })}×`
      : r.fmt === 'dias'
        ? `${nf(r.value)} días`
        : pesos(r.value);

function Delta({ a, b, invertir = false }: { a: number; b: number; invertir?: boolean }) {
  if (!b) return <span className="text-ink-4">sin comparación</span>;
  const d = (a - b) / Math.abs(b);
  const bueno = invertir ? d < 0 : d > 0;
  return (
    <span className={cn('font-semibold', bueno ? 'text-ok' : d === 0 ? 'text-ink-3' : 'text-bad')}>
      {d > 0 ? '↑' : d < 0 ? '↓' : '='} {pct(Math.abs(d), 0)}
    </span>
  );
}

export function FinancieroView({ datos }: { datos: DatosFinanciero }) {
  const [tab, setTab] = useTab(TABS);
  const router = useRouter();
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
        <Field label="Mes (opcional)">
          {(id) => (
            <Input
              id={id}
              type="month"
              value={datos.mes ?? ''}
              onChange={(e) => router.push(e.target.value ? `?mes=${e.target.value}` : '?')}
              className="w-44"
            />
          )}
        </Field>
        <p className="pb-2 text-[13px] text-ink-3">
          {datos.etiqueta} · comparado con {datos.etiquetaAnterior}
          {datos.mes && (
            <button type="button" className="ml-2 font-semibold text-ink underline" onClick={() => router.push('?')}>
              Ver la temporada
            </button>
          )}
        </p>
        <Button className="ml-auto" onClick={() => window.print()}>
          <Printer size={15} /> Imprimir
        </Button>
      </div>
      <Tabs tabs={TABS} actual={tab} onChange={setTab} />
      {tab === 'resultados' && <Resultados datos={datos} />}
      {tab === 'ratios' && <Ratios datos={datos} />}
      {tab === 'equilibrio' && <Equilibrio datos={datos} />}
      {tab === 'simulador' && <Simulador datos={datos} />}
      {tab === 'flujo' && <Flujo datos={datos} />}
      {tab === 'rankings' && <Rankings datos={datos} />}
      {tab === 'resumen' && <Resumen datos={datos} />}
    </>
  );
}

function Resultados({ datos }: { datos: DatosFinanciero }) {
  const can = useCan();
  const { er, erAnterior: ea } = datos;
  const filas: [string, number, number, 'sub' | 'total' | 'indent' | undefined][] = [
    ['Ingresos por ventas', er.ingresos, ea.ingresos, 'sub'],
    ['Envasado', er.ingEnv, ea.ingEnv, 'indent'],
    ['Granel', er.ingGranel, ea.ingGranel, 'indent'],
    ['(−) Costo de ventas', -er.cogs, -ea.cogs, undefined],
    ['Margen bruto', er.mb, ea.mb, 'sub'],
    ['(−) Gastos generales de administración y ventas', -er.gastosAdmin, -ea.gastosAdmin, 'indent'],
    [
      '(−) Remuneraciones administración y ventas',
      -(er.remuneraciones.admin + er.remuneraciones.ventas),
      -(ea.remuneraciones.admin + ea.remuneraciones.ventas),
      'indent'
    ],
    ['(−) Honorarios', -er.remuneraciones.honorarios, -ea.remuneraciones.honorarios, 'indent'],
    ['(−) Indirectos de producción', -er.indirectos, -ea.indirectos, undefined],
    ['EBITDA', er.ebitda, ea.ebitda, 'sub'],
    ['(−) Depreciación y amortización', -(er.dep + er.amort), -(ea.dep + ea.amort), undefined],
    ['EBIT', er.ebit, ea.ebit, 'sub'],
    ['(−) Gastos financieros', -er.gFin, -ea.gFin, undefined],
    ['Utilidad antes de impuestos', er.uai, ea.uai, 'sub'],
    [`(−) Impuesto a la renta (provisión ${pct(datos.tasaIDPC, 0)})`, -er.impuesto, -ea.impuesto, undefined],
    ['Utilidad neta', er.un, ea.un, 'total']
  ];
  function exportar() {
    const csv =
      '﻿' +
      [
        ['Concepto', datos.etiqueta, '%', datos.etiquetaAnterior],
        ...filas.map(([l, a, b]) => [l, Math.round(a), er.ingresos ? (a / er.ingresos).toFixed(4) : '', Math.round(b)])
      ]
        .map((r) => r.join(';'))
        .join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'estado-de-resultados.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <>
      <StatGrid>
        <Stat label="Ingresos netos" value={clp(er.ingresos)} sub={<Delta a={er.ingresos} b={ea.ingresos} />} />
        <Stat label="Margen bruto" value={pct(er.ingresos ? er.mb / er.ingresos : 0)} sub={clp(er.mb)} />
        <Stat label="EBITDA" value={clp(er.ebitda)} sub={<Delta a={er.ebitda} b={ea.ebitda} />} />
        <Stat label="Utilidad neta" value={<span className={cn(er.un < 0 && 'text-bad')}>{clp(er.un)}</span>} sub={<Delta a={er.un} b={ea.un} />} />
      </StatGrid>
      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <section aria-label="Estado de resultados" className="rounded-card border border-rule bg-raised p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-label text-[18px]">Estado de resultados</h2>
            {can('financiero', 'x') && (
              <Button className="h-8 px-3 text-[13px]" onClick={exportar}>
                <Download size={14} /> CSV
              </Button>
            )}
          </div>
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-rule text-[12px] text-ink-3">
                <th className="py-1.5 text-left font-semibold">Concepto</th>
                <th className="py-1.5 text-right font-semibold">{datos.etiqueta}</th>
                <th className="py-1.5 text-right font-semibold">%</th>
                <th className="py-1.5 text-right font-semibold">{datos.etiquetaAnterior}</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(([l, a, b, cls]) => (
                <tr key={l} className={cn('border-b border-rule', (cls === 'sub' || cls === 'total') && 'font-semibold', cls === 'total' && 'bg-sunken')}>
                  <td className={cn('py-1.5', cls === 'indent' && 'pl-5 text-ink-2')}>{l}</td>
                  <td className={cn('py-1.5 text-right tabular', a < 0 && 'text-ink-2')}>{clp(r0(a))}</td>
                  <td className="py-1.5 text-right text-[12px] text-ink-3 tabular">{er.ingresos ? pct(a / er.ingresos) : ''}</td>
                  <td className="py-1.5 text-right text-ink-3 tabular">{clp(r0(b))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[12px] text-ink-3">
            Montos netos. El impuesto es una provisión sobre la utilidad; la declaración está en Tributario › Renta.
          </p>
        </section>
        <div className="grid gap-4">
          <ChartCard titulo="Ingresos por canal">
            <BarrasH
              items={Object.entries(er.porCanal)
                .map(([k, v]) => ({ id: k, etiqueta: CANAL[k] ?? k, valor: v }))
                .sort((a, b) => b.valor - a.valor)}
              formato={compacto}
              vacio="Sin ventas en el período."
            />
          </ChartCard>
          {datos.mensual.length > 1 && (
            <ChartCard titulo="Resultado mensual">
              <Lineas
                etiquetasX={datos.mensual.map((m) => nombrePeriodoCorto(m.mes))}
                series={[
                  { id: 'ing', nombre: 'Ingresos', color: 't0', valores: datos.mensual.map((m) => m.ingresos) },
                  { id: 'cos', nombre: 'Costos totales', color: 't1', valores: datos.mensual.map((m) => m.costos) },
                  { id: 'uai', nombre: 'Utilidad antes de impuestos', color: 't2', valores: datos.mensual.map((m) => m.uai) }
                ]}
                formato={compacto}
              />
            </ChartCard>
          )}
        </div>
      </div>
    </>
  );
}

function Ratios({ datos }: { datos: DatosFinanciero }) {
  const filas = Object.values(datos.pf).filter((x) => x.unidades > 0);
  const cols: Column<(typeof filas)[number]>[] = [
    { key: 'nombre', label: 'Formato', render: (x) => <b>{x.nombre}</b> },
    { key: 'unidades', label: 'Unidades', num: true, render: (x) => nf(x.unidades) },
    { key: 'precioProm', label: 'Precio prom.', num: true, render: (x) => pesos(x.precioProm) },
    { key: 'costoProm', label: 'Costo prom.', num: true, render: (x) => pesos(x.costoProm) },
    { key: 'contribucionUnit', label: 'Contribución unit.', num: true, render: (x) => pesos(x.contribucionUnit) },
    { key: 'contribucion', label: 'Contribución', num: true, render: (x) => <b>{pesos(x.contribucion)}</b> },
    { key: 'margen', label: 'Margen', num: true, render: (x) => pct(x.margen) }
  ];
  return (
    <>
      <ul className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Ratios">
        {datos.ratios.map((r) => (
          <li key={r.key} className="rounded-card border border-rule bg-raised p-4" title={r.ayuda}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-ink-2">{r.label}</span>
              <Badge tone={TONO[r.estado]}>{r.estado === 'ok' ? 'Bien' : r.estado === 'warn' ? 'Atención' : 'Bajo'}</Badge>
            </div>
            <div className="mt-1 text-[22px] font-semibold tabular">{fmtRatio(r)}</div>
            <p className="mt-1 text-[12px] text-ink-3">{r.ayuda}</p>
          </li>
        ))}
      </ul>
      <p className="mb-2 text-[13px] text-ink-3">Inventario valorizado para la rotación: {clp(r0(datos.inventario))} (producto terminado, granel e insumos).</p>
      <h2 className="mb-2 font-label text-[18px]">Contribución marginal por formato</h2>
      <DataTable rows={filas} columns={cols} />
    </>
  );
}

function usePe(datos: DatosFinanciero) {
  return (aj: AjustesSimulador = {}) => puntoEquilibrio(datos.er, datos.pf, datos.formatos, datos.participacion, datos.tasaIDPC, aj);
}

function Equilibrio({ datos }: { datos: DatosFinanciero }) {
  const pe = usePe(datos)();
  const escala = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5];
  const cols: Column<(typeof pe.rows)[number]>[] = [
    { key: 'nombre', label: 'Formato', render: (r) => <b>{r.nombre}</b> },
    { key: 'unidades', label: 'Unidades vendidas', num: true, render: (r) => nf(r.unidades) },
    { key: 'share', label: 'Participación (L)', num: true, render: (r) => pct(r.share) },
    { key: 'contribucionUnit', label: 'Contribución unit.', num: true, render: (r) => pesos(r.contribucionUnit) },
    { key: 'peUnidades', label: 'Unidades de equilibrio', num: true, render: (r) => <b>{nf(r.peUnidades)}</b> }
  ];
  return (
    <>
      <StatGrid>
        <Stat label="Punto de equilibrio" value={pesos(pe.pePesos)} sub={pe.alcanzado ? 'Alcanzado' : 'Aún no alcanzado'} />
        <Stat label="En litros" value={`${nf(pe.peLitros)} L`} sub={`Vendidos ${nf(pe.litros)} L`} />
        <Stat label="Margen de seguridad" value={<span className={cn(pe.margenSeguridad < 0 && 'text-bad')}>{pct(pe.margenSeguridad)}</span>} />
        <Stat label="Costos fijos" value={clp(r0(pe.fijos))} sub={`Razón de contribución ${pct(pe.razon)}`} />
      </StatGrid>
      <ChartCard titulo="Ingresos vs costos según volumen" nota="Mezcla de ventas del período; 100 % = lo vendido." className="mb-4">
        <Lineas
          etiquetasX={escala.map((s) => `${s * 100} %`)}
          series={[
            { id: 'ing', nombre: 'Ingresos', color: 't0', valores: escala.map((s) => pe.ingresos * s) },
            { id: 'cos', nombre: 'Costos totales', color: 't1', valores: escala.map((s) => pe.fijos + pe.costosVariables * s) }
          ]}
          formato={compacto}
        />
      </ChartCard>
      <DataTable rows={pe.rows} columns={cols} />
    </>
  );
}

const SLIDERS: [keyof AjustesSimulador, string, number, number][] = [
  ['precio', 'Precio', -30, 30],
  ['volumen', 'Volumen', -50, 50],
  ['costoEnvase', 'Costo del envase', -30, 50],
  ['sueldos', 'Sueldos', -20, 40],
  ['tipoCambio', 'Tipo de cambio', -20, 30],
  ['exportShare', 'Ventas exportadas', 0, 100]
];

function Simulador({ datos }: { datos: DatosFinanciero }) {
  const pe = usePe(datos);
  const [aj, setAj] = useState<Record<string, number>>({ precio: 0, volumen: 0, costoEnvase: 0, sueldos: 0, tipoCambio: 0, exportShare: 0 });
  const base = useMemo(() => pe(), [datos]); // eslint-disable-line react-hooks/exhaustive-deps
  const sim = pe({ ...aj, exportShare: (aj.exportShare ?? 0) / 100 });
  return (
    <>
      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section aria-label="Supuestos" className="grid gap-4 rounded-card border border-rule bg-raised p-5">
          {SLIDERS.map(([k, label, min, max]) => (
            <label key={k} className="grid gap-1 text-[14px]">
              <span className="flex justify-between">
                <span>{label}</span>
                <b className="tabular">
                  {aj[k]! > 0 && k !== 'exportShare' ? '+' : ''}
                  {aj[k]} %
                </b>
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={1}
                value={aj[k]}
                onChange={(e) => setAj({ ...aj, [k]: Number(e.target.value) })}
                className="accent-tinto"
              />
            </label>
          ))}
          <Button onClick={() => setAj({ precio: 0, volumen: 0, costoEnvase: 0, sueldos: 0, tipoCambio: 0, exportShare: 0 })}>Volver a la base</Button>
        </section>
        <section aria-label="Resultado simulado" className="rounded-card border border-rule bg-raised p-5">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-rule text-[12px] text-ink-3">
                <th className="py-1.5 text-left font-semibold" />
                <th className="py-1.5 text-right font-semibold">Actual</th>
                <th className="py-1.5 text-right font-semibold">Simulado</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Ingresos', base.ingresos, sim.ingresos],
                  ['Contribución', base.contribucion, sim.contribucion],
                  ['Costos fijos', base.fijos, sim.fijos],
                  ['Utilidad operacional', base.utilidadOperacional, sim.utilidadOperacional],
                  ['Utilidad neta', base.utilidadNeta, sim.utilidadNeta],
                  ['Punto de equilibrio', base.pePesos, sim.pePesos]
                ] as const
              ).map(([l, a, b]) => (
                <tr key={l} className="border-b border-rule">
                  <td className="py-1.5">{l}</td>
                  <td className="py-1.5 text-right tabular">{pesos(a)}</td>
                  <td className={cn('py-1.5 text-right font-semibold tabular', b < a && l !== 'Costos fijos' && l !== 'Punto de equilibrio' && 'text-bad')}>
                    {pesos(b)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p role="status" className={cn('mt-3 rounded-control px-3 py-2 text-[13px]', sim.alcanzado ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn')}>
            {sim.alcanzado
              ? `Con estos supuestos se supera el punto de equilibrio (margen de seguridad ${pct(sim.margenSeguridad)}).`
              : 'Con estos supuestos no se alcanza el punto de equilibrio.'}
          </p>
        </section>
      </div>
      <h2 className="mb-2 font-label text-[18px]">Escenarios</h2>
      <DataTable
        rows={datos.escenarios.map((e) => ({ ...e, id: e.nombre }))}
        columns={[
          { key: 'nombre', label: 'Escenario', render: (e) => <b>{e.nombre}</b> },
          { key: 'ingresos', label: 'Ingresos', num: true, render: (e) => pesos(e.ingresos) },
          { key: 'utilidad', label: 'Utilidad operacional', num: true, render: (e) => pesos(e.utilidad) },
          { key: 'utilidadNeta', label: 'Utilidad neta', num: true, render: (e) => pesos(e.utilidadNeta) },
          { key: 'pe', label: 'Punto de equilibrio', num: true, render: (e) => pesos(e.pe) }
        ]}
      />
    </>
  );
}

function Flujo({ datos }: { datos: DatosFinanciero }) {
  const f = datos.flujo;
  type Fila = (typeof f.rows)[number] & { id: string };
  const cols: Column<Fila>[] = [
    {
      key: 'mes',
      label: 'Mes',
      render: (r) => (
        <span className="capitalize">
          {nombrePeriodoCorto(r.mes)} {r.proyectado && <Badge className="ml-1">proyectado</Badge>}
        </span>
      )
    },
    { key: 'cobros', label: 'Cobros', num: true, render: (r) => clp(r0(r.cobros)) },
    { key: 'pagosProv', label: 'Proveedores', num: true, render: (r) => clp(r0(r.pagosProv)) },
    { key: 'sueldos', label: 'Sueldos (líquido)', num: true, render: (r) => clp(r0(r.sueldos)) },
    { key: 'gastos', label: 'Gastos', num: true, render: (r) => clp(r0(r.gastos)) },
    { key: 'impuestos', label: 'Impuestos (F29)', num: true, render: (r) => clp(r0(r.impuestos)) },
    { key: 'neto', label: 'Neto', num: true, render: (r) => <span className={cn(r.neto < 0 && 'text-bad')}>{clp(r0(r.neto))}</span> },
    { key: 'saldo', label: 'Saldo', num: true, render: (r) => <b className={cn(r.alerta && 'text-bad')}>{clp(r0(r.saldo))}</b> }
  ];
  return (
    <>
      {f.negativo && (
        <p role="alert" className="mb-4 rounded-card bg-bad-soft px-4 py-3 text-[14px] text-bad">
          El saldo proyectado queda negativo en {nombrePeriodoCorto(f.negativo.mes)} ({clp(r0(f.negativo.saldo))}).
        </p>
      )}
      <StatGrid>
        <Stat label="Saldo inicial" value={clp(f.saldoInicial)} sub={`Año ${f.anio}`} />
        <Stat label="Saldo a diciembre" value={<span className={cn(f.saldoFinal < 0 && 'text-bad')}>{clp(r0(f.saldoFinal))}</span>} />
        <Stat label="Por cobrar" value={clp(r0(f.cxc))} sub="Saldo real de las ventas" />
        <Stat label="Por pagar" value={clp(r0(f.cxp))} sub="Saldo real de compras y gastos" />
      </StatGrid>
      <ChartCard titulo="Saldo y flujo neto" className="mb-4">
        <Lineas
          etiquetasX={f.rows.map((r) => nombrePeriodoCorto(r.mes))}
          series={[
            { id: 'saldo', nombre: 'Saldo', color: 't0', valores: f.rows.map((r) => r.saldo) },
            { id: 'neto', nombre: 'Neto del mes', color: 't1', valores: f.rows.map((r) => r.neto) }
          ]}
          formato={compacto}
          referencia={{ valor: 0, etiqueta: 'Saldo cero' }}
        />
      </ChartCard>
      <DataTable rows={f.rows.map((r) => ({ ...r, id: r.mes }))} columns={cols} />
      <p className="mt-2 text-[12px] text-ink-3">
        Real hasta el mes en curso; después, los saldos por cobrar y por pagar a su vencimiento. Sueldos y honorarios por su líquido; retenciones e impuesto
        único van en el F29.
      </p>
    </>
  );
}

function Rankings({ datos }: { datos: DatosFinanciero }) {
  const pf = Object.values(datos.pf).filter((x) => x.unidades > 0);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard titulo="Contribución por formato">
        <BarrasH
          items={pf.map((x) => ({ id: x.id, etiqueta: x.nombre, valor: x.contribucion })).sort((a, b) => b.valor - a.valor)}
          formato={compacto}
          vacio="Sin ventas."
        />
      </ChartCard>
      <ChartCard titulo="Contribución por canal">
        <BarrasH
          items={datos.canales.map((c) => ({ id: c.id, etiqueta: CANAL[c.id] ?? c.id, valor: c.contribucion })).sort((a, b) => b.valor - a.valor)}
          formato={compacto}
          vacio="Sin ventas."
        />
      </ChartCard>
      <ChartCard titulo="Margen por cuartel" nota="Ingresos atribuidos por kg aportado a cada lote menos el costo de campo y cosecha de la temporada.">
        <BarrasH
          items={datos.cuarteles
            .filter((c) => c.kg || c.costo)
            .map((c) => ({ id: c.id, etiqueta: c.nombre, detalle: `${nf(c.kg)} kg`, valor: c.margen }))
            .sort((a, b) => b.valor - a.valor)}
          formato={compacto}
          vacio="Sin cosechas en la temporada."
        />
      </ChartCard>
      <section aria-label="Matriz BCG" className="rounded-card border border-rule bg-raised p-5">
        <h3 className="mb-1 text-[15px] font-semibold">Matriz BCG simplificada (formatos)</h3>
        <p className="mb-3 text-[12px] text-ink-3">Participación en ingresos vs crecimiento respecto del período anterior.</p>
        <div className="grid grid-cols-2 gap-2">
          {(['q', 'star', 'dog', 'cow'] as const).map((k) => (
            <div key={k} className="rounded-control bg-sunken p-3 text-[13px]">
              <b>{CUADRANTES_BCG[k][0]}</b>
              <span className="block text-[12px] text-ink-3">{CUADRANTES_BCG[k][1]}</span>
              <ul className="mt-1">
                {datos.bcg
                  .filter((b) => b.cuadrante === k)
                  .map((b) => (
                    <li key={b.id}>
                      <b>{b.nombre}</b> · {pct(b.participacion, 0)} · {b.crecimiento >= 0 ? '↑' : '↓'}
                      {pct(Math.abs(b.crecimiento), 0)}
                    </li>
                  ))}
                {!datos.bcg.some((b) => b.cuadrante === k) && <li className="text-ink-4">—</li>}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Resumen({ datos }: { datos: DatosFinanciero }) {
  const { er } = datos;
  return (
    <>
      <StatGrid>
        <Stat label="Ingresos netos" value={clp(er.ingresos)} sub={<Delta a={er.ingresos} b={datos.erAnterior.ingresos} />} />
        <Stat label="Margen bruto" value={pct(er.ingresos ? er.mb / er.ingresos : 0)} />
        <Stat label="Utilidad neta" value={clp(er.un)} />
        <Stat
          label="Saldo de caja a diciembre"
          value={<span className={cn(datos.flujo.saldoFinal < 0 && 'text-bad')}>{clp(r0(datos.flujo.saldoFinal))}</span>}
        />
      </StatGrid>
      <section aria-label="Recomendaciones" className="mb-6 rounded-card border border-rule bg-raised p-5">
        <h2 className="mb-2 font-label text-[18px]">Recomendaciones</h2>
        <ul className="grid list-disc gap-1.5 pl-5 text-[14px]">
          {datos.recomendaciones.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>
      <ul className="grid gap-3 sm:grid-cols-3" aria-label="Ratios principales">
        {datos.ratios.slice(0, 9).map((r) => (
          <li key={r.key} className="flex items-center justify-between rounded-card border border-rule bg-raised px-4 py-3 text-[14px]">
            <span className="text-ink-2">{r.label}</span>
            <span className="flex items-center gap-2">
              <b className="tabular">{fmtRatio(r)}</b>
              <Badge tone={TONO[r.estado]}>{r.estado === 'ok' ? 'Bien' : r.estado === 'warn' ? 'Atención' : 'Bajo'}</Badge>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
