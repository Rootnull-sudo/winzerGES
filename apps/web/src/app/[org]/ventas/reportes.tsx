'use client';
/** Reportes de ventas (v1: ventas/reportes): por mes, canal y formato, y conciliación de litros por lote. */
import { clp, CANALES } from '@winzer/domain';
import { useCan, useTemporadaElegida } from '@/components/shell/org-context';
import { DataTable, type Column } from '@/components/ui/data-table';
import type { DatosVenta, VentaFila } from './view';

const nf = (v: number, d = 0) => v.toLocaleString('es-CL', { maximumFractionDigits: d });
const CANAL = Object.fromEntries(CANALES) as Record<string, string>;
type Grupo = { id: string; etiqueta: string; ventas: number; neto: number; total: number; litros: number; unidades: number };

function agrupar(ventas: VentaFila[], clave: (v: VentaFila, l: VentaFila['lineas'][number]) => [string, string]): Grupo[] {
  const m = new Map<string, Grupo>();
  for (const v of ventas)
    for (const l of v.lineas) {
      const [id, etiqueta] = clave(v, l);
      const g = m.get(id) ?? { id, etiqueta, ventas: 0, neto: 0, total: 0, litros: 0, unidades: 0 };
      g.neto += l.neto;
      g.total += v.neto ? (l.neto / v.neto) * v.total : 0;
      g.litros += l.litros ?? 0;
      g.unidades += l.tipo === 'envasado' ? l.cantidad : 0;
      m.set(id, g);
    }
  for (const g of m.values()) g.ventas = ventas.filter((v) => v.lineas.some((l) => clave(v, l)[0] === g.id)).length;
  return [...m.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function Reportes({ ventas, datos }: { ventas: VentaFila[]; datos: DatosVenta }) {
  const can = useCan();
  const elegida = useTemporadaElegida();
  const vs = ventas.filter((v) => v.estado === 'confirmada' && (!elegida || (v.fecha >= elegida.inicio && v.fecha <= elegida.fin)));
  const prod = new Map(datos.productos.map((p) => [p.id, p]));
  const fmt = new Map(datos.formatos.map((f) => [f.id, f.nombre]));
  const colsG = (titulo: string): Column<Grupo>[] => [
    { key: 'etiqueta', label: titulo, render: (g) => <b>{g.etiqueta}</b> },
    { key: 'ventas', label: 'Ventas', num: true },
    { key: 'unidades', label: 'Unidades', num: true, render: (g) => (g.unidades ? nf(g.unidades) : '—') },
    { key: 'litros', label: 'Litros', num: true, render: (g) => nf(g.litros, 1) },
    { key: 'neto', label: 'Neto', num: true, render: (g) => clp(g.neto) },
    { key: 'total', label: 'Total', num: true, render: (g) => clp(Math.round(g.total)) }
  ];
  const porMes = agrupar(vs, (v) => [
    v.fecha.slice(0, 7),
    new Date(`${v.fecha.slice(0, 7)}-15T12:00:00`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
  ]);
  const porCanal = agrupar(vs, (v) => [v.canal ?? 'sin', CANAL[v.canal ?? ''] ?? 'Sin canal']);
  const porFormato = agrupar(vs, (_v, l) =>
    l.tipo === 'granel' ? ['granel', 'Granel'] : [l.formatoId ?? prod.get(l.ordenEnvasadoId ?? '')?.formatoId ?? '?', fmt.get(l.formatoId ?? '') ?? 'Envasado']
  );
  type Bal = DatosVenta['balance'][number] & { id: string };
  const colsB: Column<Bal>[] = [
    { key: 'codigo', label: 'Lote', render: (b) => <b>{b.codigo}</b> },
    { key: 'entradas', label: 'Entradas', num: true, render: (b) => `${nf(b.entradas)} L` },
    { key: 'envasado', label: 'Envasado', num: true, render: (b) => `${nf(b.envasado, 1)} L` },
    { key: 'granel', label: 'Venta a granel', num: true, render: (b) => `${nf(b.granel)} L` },
    { key: 'merma', label: 'Mermas', num: true, render: (b) => `${nf(b.merma)} L` },
    { key: 'vinagre', label: 'Vinagre', num: true, render: (b) => `${nf(b.vinagre)} L` },
    { key: 'stock', label: 'Stock', num: true, render: (b) => <b>{nf(b.stock, 1)} L</b> }
  ];
  const seccion = (titulo: string, hijo: React.ReactNode) => (
    <section aria-label={titulo} className="mb-6">
      <h2 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">{titulo}</h2>
      {hijo}
    </section>
  );
  const x = can('ventas', 'x');
  return (
    <>
      {seccion('Por mes', <DataTable rows={porMes} columns={colsG('Mes')} exportName="ventas-por-mes" canExport={x} />)}
      {seccion('Por canal', <DataTable rows={porCanal} columns={colsG('Canal')} exportName="ventas-por-canal" canExport={x} />)}
      {seccion('Por formato', <DataTable rows={porFormato} columns={colsG('Formato')} exportName="ventas-por-formato" canExport={x} />)}
      {seccion(
        'Conciliación de litros por lote',
        <DataTable rows={datos.balance.map((b) => ({ ...b, id: b.loteId }))} columns={colsB} exportName="conciliacion-litros" canExport={x} />
      )}
    </>
  );
}
