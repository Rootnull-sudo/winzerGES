'use client';
/** Costos por botella/litro (F7-1; v1: modules/costos). */
import { clp, PARTES_COSTO, type ParteCosto } from '@winzer/domain';
import { Calculator, Printer } from 'lucide-react';
import Link from 'next/link';
import { useCan, useOrg } from '@/components/shell/org-context';
import { TipoUva } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BarrasAgrupadas, ChartCard } from '@/components/ui/chart';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState, Stat, StatGrid } from '@/components/ui/page';
import { cn } from '@/lib/cn';

interface Formato {
  id: string;
  nombre: string;
  litros: number;
  unidades: number;
  partes: Record<ParteCosto, number>;
  directo: number;
  indirecto: number;
  total: number;
  precio: number;
  margen: number | null;
}
interface Lote {
  id: string;
  codigo: string;
  tipo: string | null;
  variedad: string | null;
  litros: number;
  total: number;
  costoLitro: number;
  cosecha: number;
  agricola: number;
  enologico: number;
  comprada: number;
}
export interface DatosCostos {
  etiqueta: string;
  costoLitroPromedio: number;
  indirectos: number;
  indirectoPorLitro: number;
  litrosVendidos: number;
  cogs: number;
  formatos: Formato[];
  lotes: Lote[];
}

const nf = (v: number) => v.toLocaleString('es-CL', { maximumFractionDigits: 0 });
const pct = (v: number) => `${(v * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })} %`;
/** Tonos de la barra apilada (tokens de globals.css). */
const TONOS = ['bg-tinto', 'bg-ink-2', 'bg-blanco', 'bg-info', 'bg-ok', 'bg-warn', 'bg-ink-3', 'bg-ink-4'];

export function CostosView({ datos }: { datos: DatosCostos }) {
  const can = useCan();
  const { org } = useOrg();
  const cols: Column<Lote>[] = [
    {
      key: 'codigo',
      label: 'Lote',
      render: (l) => (
        <span className="inline-flex items-center gap-2">
          <b>{l.codigo}</b> <TipoUva tipo={l.tipo} />
        </span>
      )
    },
    { key: 'litros', label: 'Litros', num: true, render: (l) => nf(l.litros) },
    { key: 'cosecha', label: 'Cosecha', num: true, render: (l) => clp(Math.round(l.cosecha)) },
    { key: 'agricola', label: 'Campo (prorrateado)', num: true, render: (l) => clp(Math.round(l.agricola)) },
    { key: 'enologico', label: 'Enológico', num: true, render: (l) => clp(Math.round(l.enologico)) },
    { key: 'comprada', label: 'Uva comprada', num: true, render: (l) => clp(Math.round(l.comprada)) },
    { key: 'total', label: 'Total', num: true, render: (l) => <b>{clp(Math.round(l.total))}</b> },
    { key: 'costoLitro', label: '$/L', num: true, render: (l) => clp(Math.round(l.costoLitro)) }
  ];
  return (
    <>
      <div className="mb-4 flex items-center gap-2 print:hidden">
        <p className="text-[13px] text-ink-3">
          {datos.etiqueta} · Cambia la temporada en la barra superior.{' '}
          <Link href={`/${org.slug}/administracion?tab=activos`} className="font-semibold text-ink underline">
            Activos y depreciación
          </Link>
        </p>
        <Button className="ml-auto" onClick={() => window.print()}>
          <Printer size={15} /> Imprimir
        </Button>
      </div>
      <StatGrid>
        <Stat
          label="Costo promedio ponderado"
          value={`${clp(Math.round(datos.costoLitroPromedio))}/L`}
          sub="Costo directo de todos los lotes"
          icon={<Calculator size={16} strokeWidth={1.6} />}
        />
        <Stat label="Costos indirectos" value={clp(Math.round(datos.indirectos))} sub="GAV + indirectos + depreciación + financieros" />
        <Stat label="Indirecto por litro vendido" value={clp(Math.round(datos.indirectoPorLitro))} sub={`${nf(datos.litrosVendidos)} L vendidos`} />
        <Stat label="Costo de ventas" value={clp(Math.round(datos.cogs))} sub="Costo directo de lo vendido" />
      </StatGrid>

      <h2 className="mt-2 mb-3 font-label text-[20px]">Costo por formato</h2>
      {datos.formatos.length ? (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {datos.formatos.map((f) => (
            <section key={f.id} aria-label={`Costo ${f.nombre}`} className="rounded-card border border-rule bg-raised p-5">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h3 className="font-label text-[18px]">{f.nombre}</h3>
                <span className="text-[12px] text-ink-3">{nf(f.unidades)} unidades envasadas</span>
              </div>
              <dl className="mb-4 grid grid-cols-3 gap-2">
                <div>
                  <dt className="text-[12px] text-ink-3">Costo directo</dt>
                  <dd className="text-[20px] font-semibold tabular">{clp(Math.round(f.directo))}</dd>
                </div>
                <div>
                  <dt className="text-[12px] text-ink-3">+ Indirectos</dt>
                  <dd className="text-[20px] font-semibold tabular">{clp(Math.round(f.indirecto))}</dd>
                </div>
                <div>
                  <dt className="text-[12px] text-ink-3">Costo total</dt>
                  <dd className="text-[20px] font-semibold tabular">{clp(Math.round(f.total))}</dd>
                </div>
              </dl>
              <div className="flex h-3 overflow-hidden rounded-full bg-sunken" aria-hidden>
                {PARTES_COSTO.map(([k], i) =>
                  f.partes[k] > 0 ? <span key={k} className={TONOS[i]} style={{ width: `${(f.partes[k] / (f.directo || 1)) * 100}%` }} /> : null
                )}
              </div>
              <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[13px]">
                {PARTES_COSTO.filter(([k]) => f.partes[k] > 0).map(([k, label]) => (
                  <li key={k} className="flex justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-ink-2">
                      <span className={cn('size-2 rounded-full', TONOS[PARTES_COSTO.findIndex(([x]) => x === k)])} aria-hidden />
                      {label}
                    </span>
                    <span className="tabular">{clp(Math.round(f.partes[k]))}</span>
                  </li>
                ))}
              </ul>
              {f.precio > 0 && (
                <p className="mt-3 text-[13px]">
                  Precio promedio neto <b>{clp(Math.round(f.precio))}</b> · margen sobre costo total{' '}
                  <b className={cn(f.margen != null && f.margen < 0 ? 'text-bad' : 'text-ok')}>{f.margen != null ? pct(f.margen) : '—'}</b>
                </p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className="mb-6">
          <EmptyState title="Sin órdenes de envasado confirmadas" text="Confirma órdenes para ver el costo por formato." />
        </div>
      )}

      {datos.formatos.length > 0 && (
        <ChartCard
          titulo="Comparativa entre formatos (por litro)"
          nota="Costo directo y total (con indirectos) por litro frente al precio promedio por litro."
          className="mb-6"
        >
          <BarrasAgrupadas
            categorias={datos.formatos.map((f) => f.nombre)}
            series={[
              { id: 'dir', nombre: 'Costo directo/L', color: 't2', valores: datos.formatos.map((f) => Math.round(f.directo / f.litros)) },
              { id: 'tot', nombre: 'Costo total/L', color: 't1', valores: datos.formatos.map((f) => Math.round(f.total / f.litros)) },
              { id: 'pre', nombre: 'Precio/L', color: 't0', valores: datos.formatos.map((f) => Math.round(f.precio / f.litros)) }
            ]}
            formato={(v) => clp(v)}
          />
        </ChartCard>
      )}

      <h2 className="mb-3 font-label text-[20px]">Costo directo por lote</h2>
      <DataTable
        rows={datos.lotes}
        columns={cols}
        exportName="costo-por-lote"
        canExport={can('costos', 'x')}
        empty={<EmptyState title="Sin lotes con litros" />}
      />
    </>
  );
}
