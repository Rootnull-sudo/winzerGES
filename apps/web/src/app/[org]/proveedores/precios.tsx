'use client';
/** Pestaña Precios: evolución del precio por insumo (historial con compras y cambios manuales). */
import { clp, variacionPrecio } from '@winzer/domain';
import { LineChart } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCan } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { ChartCard, Lineas } from '@/components/ui/chart';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Select } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/page';
import { fecha, type InsumoOpt, type PrecioRow, type ProveedorRow } from './comun';

type Resumen = {
  id: string;
  nombre: string;
  unidad: string;
  primero: number;
  ultimo: number;
  desde: string;
  hasta: string;
  n: number;
  variacion: number | null;
};
const pct = (v: number) => `${(v * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })} %`;

export function Precios({ precios, insumos, proveedores }: { precios: PrecioRow[]; insumos: InsumoOpt[]; proveedores: ProveedorRow[] }) {
  const can = useCan();
  const provById = new Map(proveedores.map((p) => [p.id, p.nombre]));
  const resumen = useMemo(
    () =>
      insumos
        .map((i): Resumen | null => {
          const ps = precios.filter((p) => p.insumoId === i.id);
          if (!ps.length) return null;
          const a = ps[0]!,
            b = ps.at(-1)!;
          return {
            id: i.id,
            nombre: i.nombre,
            unidad: i.unidad,
            primero: a.precio,
            ultimo: b.precio,
            desde: a.fecha,
            hasta: b.fecha,
            n: ps.length,
            variacion: variacionPrecio(b.precio, a.precio)
          };
        })
        .filter((x): x is Resumen => !!x),
    [precios, insumos]
  );
  const [sel, setSel] = useState('');
  const elegido = resumen.find((r) => r.id === sel) ?? resumen.toSorted((a, b) => b.n - a.n)[0];
  if (!resumen.length)
    return (
      <EmptyState
        icon={<LineChart size={28} strokeWidth={1.5} />}
        title="Sin historial de precios"
        text="Cada compra y cada cambio manual del precio de un insumo queda registrado aquí."
      />
    );
  const hist = precios.filter((p) => p.insumoId === elegido?.id);
  const cols: Column<Resumen>[] = [
    { key: 'nombre', label: 'Insumo', render: (r) => <b>{r.nombre}</b> },
    { key: 'primero', label: 'Primer precio', num: true, render: (r) => `${clp(r.primero)} · ${fecha(r.desde)}` },
    { key: 'ultimo', label: 'Último precio', num: true, render: (r) => `${clp(r.ultimo)} · ${fecha(r.hasta)}` },
    { key: 'n', label: 'Registros', num: true },
    {
      key: 'variacion',
      label: 'Variación',
      num: true,
      value: (r) => r.variacion ?? 0,
      render: (r) =>
        r.variacion == null || r.n < 2 ? (
          <span className="text-ink-4">—</span>
        ) : (
          <Badge tone={r.variacion > 0.05 ? 'bad' : r.variacion < 0 ? 'ok' : 'neutral'}>
            {r.variacion >= 0 ? '↑' : '↓'} {pct(Math.abs(r.variacion))}
          </Badge>
        )
    }
  ];
  return (
    <>
      {elegido && (
        <section aria-label="Evolución del precio" className="mb-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Evolución del precio</h2>
            <div className="w-64">
              <Select aria-label="Insumo" value={elegido.id} onChange={(e) => setSel(e.target.value)} className="h-9 text-[14px]">
                {resumen.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <ChartCard
            titulo={elegido.nombre}
            nota={`CLP por ${elegido.unidad}, neto. ${hist.map((h) => (h.proveedorId ? provById.get(h.proveedorId) : null)).filter(Boolean).length ? 'Con el proveedor de cada compra en la tabla.' : ''}`}
          >
            <Lineas
              etiquetasX={hist.map((h) => fecha(h.fecha))}
              series={[{ id: 'precio', nombre: 'Precio', color: 't0', valores: hist.map((h) => h.precio) }]}
              formato={(v) => clp(v)}
              unidad="CLP"
            />
          </ChartCard>
        </section>
      )}
      <DataTable rows={resumen} columns={cols} onRowClick={(r) => setSel(r.id)} exportName="precios-insumos" canExport={can('proveedores', 'x')} />
    </>
  );
}
