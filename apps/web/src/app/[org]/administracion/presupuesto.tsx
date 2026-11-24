'use client';
/**
 * Pestaña Presupuesto: presupuesto anual vs real por categoría (v1: administracion presupuesto). Todas las categorías
 * se editan en la fila (v1 no dejaba presupuestar una categoría sin gastos). Real = gastos netos del año calendario.
 */
import { clp, fechaHoy, mesesTranscurridos, presupuestoVsReal, type FilaPresupuesto } from '@winzer/domain';
import { useState, useTransition } from 'react';
import { useCan, useOrg } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Input, Select } from '@/components/ui/field';
import { Stat, StatGrid } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { useRouter } from 'next/navigation';
import { savePresupuesto } from './actions';
import type { GastoRow, PresupuestoRow } from './view';

const pct = (v: number, d = 0) => `${(v * 100).toLocaleString('es-CL', { maximumFractionDigits: d })} %`;
type Fila = FilaPresupuesto & { id: string };

export function Presupuesto({ gastos, presupuestos }: { gastos: GastoRow[]; presupuestos: PresupuestoRow[] }) {
  const can = useCan();
  const hoy = fechaHoy();
  const actual = Number(hoy.slice(0, 4));
  const anios = [...new Set([actual, actual + 1, ...gastos.map((g) => Number(g.fecha.slice(0, 4))), ...presupuestos.map((p) => p.anio)])].sort((a, b) => b - a);
  const [anio, setAnio] = useState(actual);
  const filas: Fila[] = presupuestoVsReal(gastos, presupuestos, anio, hoy).map((f) => ({ ...f, id: f.categoria }));
  const total = filas.reduce((a, f) => ({ p: a.p + f.presupuesto, r: a.r + f.real, y: a.y + f.proyeccion }), { p: 0, r: 0, y: 0 });
  const meses = mesesTranscurridos(anio, hoy);
  const editable = can('administracion', 'e') && can('administracion', 'c');

  const cols: Column<Fila>[] = [
    { key: 'etiqueta', label: 'Categoría', render: (f) => <b>{f.etiqueta}</b> },
    {
      key: 'presupuesto',
      label: 'Presupuesto anual',
      num: true,
      render: (f) => (editable ? <MontoEditable anio={anio} fila={f} /> : clp(f.presupuesto))
    },
    { key: 'real', label: 'Real acumulado', num: true, render: (f) => clp(f.real) },
    {
      key: 'avance',
      label: 'Avance',
      value: (f) => f.avance ?? -1,
      render: (f) =>
        f.avance == null ? (
          <span className="text-ink-4">—</span>
        ) : (
          <span className="flex min-w-32 items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
              <span
                className={cn('block h-full rounded-full', f.avance >= 1 ? 'bg-bad' : f.avance >= 0.85 ? 'bg-warn' : 'bg-ok')}
                style={{ width: `${Math.min(100, f.avance * 100)}%` }}
              />
            </span>
            <span className="text-[12px] text-ink-2 tabular">{pct(f.avance)}</span>
          </span>
        )
    },
    { key: 'proyeccion', label: 'Proyección al cierre', num: true, render: (f) => clp(f.proyeccion) },
    {
      key: 'desviacion',
      label: 'Desviación',
      num: true,
      value: (f) => f.desviacion ?? -99,
      render: (f) =>
        f.desviacion == null ? (
          f.real > 0 ? (
            <Badge tone="neutral">Sin presupuesto</Badge>
          ) : (
            <span className="text-ink-4">—</span>
          )
        ) : (
          <Badge tone={f.desviacion > 0.1 ? 'bad' : f.desviacion > 0 ? 'warn' : 'ok'}>
            {f.desviacion > 0 ? '+' : ''}
            {pct(f.desviacion, 1)}
          </Badge>
        )
    }
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-2">
          Real = gastos netos del año calendario. Proyección = real ÷ {meses} {meses === 1 ? 'mes' : 'meses'} × 12.
        </p>
        <div className="w-36">
          <Select aria-label="Año" value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="h-9 text-[14px]">
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <StatGrid>
        <Stat label={`Presupuesto ${anio}`} value={clp(total.p)} />
        <Stat label="Real acumulado" value={clp(total.r)} sub={total.p ? `${pct(total.r / total.p)} del presupuesto` : undefined} />
        <Stat
          label="Proyección al cierre"
          value={<span className={cn(total.p > 0 && total.y > total.p * 1.1 && 'text-bad')}>{clp(total.y)}</span>}
          sub={total.p ? `${total.y >= total.p ? '+' : ''}${pct((total.y - total.p) / total.p, 1)} vs. presupuesto` : undefined}
        />
      </StatGrid>
      <DataTable rows={filas} columns={cols} exportName={`presupuesto-${anio}`} canExport={can('administracion', 'x')} />
    </>
  );
}

/** Monto del presupuesto editable en la fila: se guarda al salir del campo o con Enter. */
function MontoEditable({ anio, fila }: { anio: number; fila: Fila }) {
  const { org } = useOrg();
  const toast = useToast();
  const router = useRouter();
  const [valor, setValor] = useState(fila.presupuesto ? String(fila.presupuesto) : '');
  const [pending, start] = useTransition();
  const [clave, setClave] = useState(`${anio}:${fila.presupuesto}`);
  if (clave !== `${anio}:${fila.presupuesto}`) {
    setClave(`${anio}:${fila.presupuesto}`);
    setValor(fila.presupuesto ? String(fila.presupuesto) : '');
  }
  function guardar() {
    const monto = Number(valor) || 0;
    if (monto === fila.presupuesto) return;
    start(async () => {
      const r = await savePresupuesto(org.slug, { anio, categoria: fila.categoria, monto });
      if (r.ok) {
        toast(`Presupuesto de ${fila.etiqueta.toLowerCase()} actualizado.`);
        router.refresh();
      } else toast(r.error);
    });
  }
  return (
    <Input
      aria-label={`Presupuesto ${fila.etiqueta}`}
      type="number"
      min={0}
      step={1000}
      value={valor}
      placeholder="0"
      disabled={pending}
      onChange={(e) => setValor(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      onClick={(e) => e.stopPropagation()}
      className="ml-auto h-8 w-36 text-right text-[14px] tabular"
    />
  );
}
