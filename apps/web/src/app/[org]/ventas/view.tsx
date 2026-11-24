'use client';
import {
  clp,
  DOCUMENTOS_VENTA,
  ESTADO_PAGO_LABEL,
  estadoPagoDoc,
  fechaHoy,
  margenVenta,
  montoLinea,
  totalesVenta,
  vencimientoSugerido,
  type OrgConfig
} from '@winzer/domain';
import { FileText, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CANALES } from '@winzer/domain';
import { useCan, useOrg, useTemporadaElegida } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { EmptyState, Stat, StatGrid } from '@/components/ui/page';
import { Tabs, useTab } from '@/components/ui/tabs';
import { cn } from '@/lib/cn';
import { ErrorForm, fecha, useSubmit } from '../proveedores/comun';
import { anularVentaAction, confirmarVentaAction, deleteVenta, saveVenta } from './actions';
import { Reportes } from './reportes';

export interface LineaVenta {
  id: string;
  tipo: string;
  ordenEnvasadoId: string | null;
  estanqueId: string | null;
  loteId: string | null;
  formatoId: string | null;
  descripcion: string | null;
  cantidad: number;
  precio: number;
  afectoIla: boolean;
  costoUnitario: number | null;
  neto: number;
  litros: number | null;
}
export interface VentaFila {
  id: string;
  version: number;
  codigo: string | null;
  fecha: string;
  clienteId: string;
  canal: string | null;
  documento: string;
  generarDte: boolean;
  vencimiento: string | null;
  estado: string;
  neto: number;
  iva: number;
  ila: number;
  total: number;
  dteTipo: number | null;
  dteFolio: number | null;
  ncFolio: number | null;
  observaciones: string | null;
  /** Saldo por cobrar (v_por_cobrar); null si no está confirmada. */
  saldo: number | null;
  lineas: LineaVenta[];
}
export interface DatosVenta {
  clientes: { id: string; nombre: string; tipo: string; canal: string | null; plazo: number }[];
  productos: { id: string; codigo: string; formatoId: string; loteId: string; stock: number; costoUnitario: number }[];
  granel: { estanqueId: string; loteId: string; litros: number }[];
  formatos: { id: string; nombre: string; litros: number }[];
  lotes: { id: string; codigo: string; variedad: string | null; tipo: string }[];
  estanques: { id: string; codigo: string }[];
  costoLitro: Record<string, number>;
  tributario: OrgConfig['tributario'];
  balance: { loteId: string; codigo: string; entradas: number; envasado: number; granel: number; merma: number; vinagre: number; stock: number }[];
}

export const DOC = Object.fromEntries(DOCUMENTOS_VENTA) as Record<string, string>;
const CANAL = Object.fromEntries(CANALES) as Record<string, string>;
const ESTADO: Record<string, ['ok' | 'warn' | 'neutral', string]> = {
  confirmada: ['ok', 'Confirmada'],
  borrador: ['warn', 'Borrador'],
  anulada: ['neutral', 'Anulada']
};
const nf = (v: number, d = 0) => v.toLocaleString('es-CL', { maximumFractionDigits: d });
const TABS = [
  { id: 'ventas', label: 'Ventas' },
  { id: 'reportes', label: 'Reportes' }
] as const;

export function VentasView({ ventas, datos }: { ventas: VentaFila[]; datos: DatosVenta }) {
  const [tab, setTab] = useTab(TABS);
  return (
    <>
      <Tabs tabs={TABS} actual={tab} onChange={setTab} />
      {tab === 'ventas' && <Ventas ventas={ventas} datos={datos} />}
      {tab === 'reportes' && <Reportes ventas={ventas} datos={datos} />}
    </>
  );
}

/** Nombre legible del producto de una línea. */
export function productoDe(l: Pick<LineaVenta, 'tipo' | 'ordenEnvasadoId' | 'loteId' | 'estanqueId' | 'descripcion'>, d: DatosVenta) {
  if (l.tipo === 'granel') {
    const lo = d.lotes.find((x) => x.id === l.loteId);
    return `Granel ${lo?.codigo ?? ''}${lo?.variedad ? ` · ${lo.variedad}` : ''}`;
  }
  const p = d.productos.find((x) => x.id === l.ordenEnvasadoId);
  const f = d.formatos.find((x) => x.id === p?.formatoId);
  const lo = d.lotes.find((x) => x.id === p?.loteId);
  return `${lo?.variedad ?? lo?.codigo ?? l.descripcion ?? 'Producto'} · ${f?.nombre ?? ''}${p ? ` (${p.codigo})` : ''}`;
}

function Ventas({ ventas, datos }: { ventas: VentaFila[]; datos: DatosVenta }) {
  const can = useCan();
  const elegida = useTemporadaElegida();
  const verCostos = can('costos', 'v');
  const [editing, setEditing] = useState<VentaFila | 'nueva' | null>(null);
  const [cli, setCli] = useState('');
  const cliente = useMemo(() => new Map(datos.clientes.map((c) => [c.id, c])), [datos.clientes]);
  const rows = ventas
    .filter((v) => (!elegida || (v.fecha >= elegida.inicio && v.fecha <= elegida.fin)) && (!cli || v.clienteId === cli))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.codigo ?? '').localeCompare(a.codigo ?? ''));
  const confirmadas = rows.filter((v) => v.estado === 'confirmada');
  const suma = (fn: (v: VentaFila) => number) => confirmadas.reduce((s, v) => s + fn(v), 0);
  const costo = (v: VentaFila) => margenVenta(v.neto, v.lineas).costo;
  const cols: Column<VentaFila>[] = [
    { key: 'codigo', label: 'Código', value: (v) => v.codigo ?? '', render: (v) => <b>{v.codigo ?? '—'}</b> },
    { key: 'fecha', label: 'Fecha', render: (v) => fecha(v.fecha) },
    { key: 'cliente', label: 'Cliente', value: (v) => cliente.get(v.clienteId)?.nombre ?? '' },
    {
      key: 'productos',
      label: 'Productos',
      value: (v) => v.lineas.map((l) => productoDe(l, datos)).join(', '),
      render: (v) => <span className="text-ink-2">{v.lineas.length === 1 ? productoDe(v.lineas[0]!, datos) : `${v.lineas.length} líneas`}</span>
    },
    {
      key: 'documento',
      label: 'Documento',
      value: (v) => `${DOC[v.documento]} ${v.dteFolio ?? ''}`,
      render: (v) => `${DOC[v.documento] ?? v.documento}${v.dteFolio ? ` N° ${v.dteFolio}` : ''}`
    },
    { key: 'neto', label: 'Neto', num: true, render: (v) => clp(v.neto) },
    { key: 'total', label: 'Total', num: true, render: (v) => <b>{clp(v.total)}</b> },
    ...(verCostos
      ? [
          {
            key: 'margen',
            label: 'Margen',
            num: true,
            value: (v: VentaFila) => v.neto - costo(v),
            render: (v: VentaFila) =>
              v.estado === 'confirmada' ? <span className={cn(v.neto - costo(v) < 0 && 'text-bad')}>{clp(Math.round(v.neto - costo(v)))}</span> : '—'
          } satisfies Column<VentaFila>
        ]
      : []),
    {
      key: 'pago',
      label: 'Pago',
      value: (v) =>
        v.saldo == null
          ? ''
          : ESTADO_PAGO_LABEL[estadoPagoDoc({ documento: 'factura', total: v.total, saldo: v.saldo, vencimiento: v.vencimiento }, fechaHoy())],
      render: (v) => {
        if (v.saldo == null || v.estado !== 'confirmada') return <span className="text-ink-4">—</span>;
        const e = estadoPagoDoc({ documento: 'factura', total: v.total, saldo: v.saldo, vencimiento: v.vencimiento }, fechaHoy());
        return <Badge tone={e === 'pagada' ? 'ok' : e === 'vencida' ? 'bad' : e === 'parcial' ? 'info' : 'warn'}>{ESTADO_PAGO_LABEL[e]}</Badge>;
      }
    },
    {
      key: 'estado',
      label: 'Estado',
      value: (v) => v.estado,
      render: (v) => {
        const [t, l] = ESTADO[v.estado] ?? ['neutral', v.estado];
        return <Badge tone={t}>{l}</Badge>;
      }
    }
  ];
  return (
    <>
      <StatGrid>
        <Stat
          label="Ventas netas"
          value={clp(suma((v) => v.neto))}
          sub={`${confirmadas.length} confirmadas · temporada ${elegida?.anio ?? ''}`}
          icon={<ShoppingCart size={16} strokeWidth={1.6} />}
        />
        <Stat label="Total facturado" value={clp(suma((v) => v.total))} sub="Con IVA e ILA" />
        <Stat
          label="Litros vendidos"
          value={`${nf(confirmadas.reduce((s, v) => s + v.lineas.reduce((t, l) => t + (l.litros ?? 0), 0), 0))} L`}
          sub="Envasado y granel"
        />
        {verCostos && <Stat label="Margen bruto" value={clp(Math.round(suma((v) => v.neto - costo(v))))} sub="Neto − costo congelado" />}
      </StatGrid>
      <DataTable
        rows={rows}
        columns={cols}
        onRowClick={(v) => setEditing(v)}
        exportName={`ventas-${elegida?.anio ?? ''}`}
        canExport={can('ventas', 'x')}
        toolbar={
          <>
            <div className="w-56">
              <Select aria-label="Cliente" value={cli} onChange={(e) => setCli(e.target.value)} className="h-9 text-[14px]">
                <option value="">Todos los clientes</option>
                {datos.clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </div>
            {can('ventas', 'c') && (
              <Button variant="primary" onClick={() => setEditing('nueva')}>
                <Plus size={16} /> Nueva venta
              </Button>
            )}
          </>
        }
        empty={
          <EmptyState
            icon={<ShoppingCart size={28} strokeWidth={1.5} />}
            title={`Sin ventas en la temporada ${elegida?.anio ?? ''}`}
            text="Registra ventas de botellas o a granel: al confirmarlas se descuenta el stock y se asigna el folio."
          />
        }
      />
      {editing && <VentaDialog venta={editing === 'nueva' ? null : editing} datos={datos} verCostos={verCostos} onClose={() => setEditing(null)} />}
    </>
  );
}

type LineaForm = {
  key: string;
  id?: string;
  tipo: 'envasado' | 'granel';
  ordenEnvasadoId: string;
  granel: string;
  cantidad: string;
  precio: string;
  afectoIla: boolean;
};
const lineaVacia = (): LineaForm => ({
  key: crypto.randomUUID(),
  tipo: 'envasado',
  ordenEnvasadoId: '',
  granel: '',
  cantidad: '',
  precio: '',
  afectoIla: true
});

function VentaDialog({ venta, datos, verCostos, onClose }: { venta: VentaFila | null; datos: DatosVenta; verCostos: boolean; onClose: () => void }) {
  const { org } = useOrg();
  const can = useCan();
  const { pending, errors, error, run } = useSubmit(onClose);
  const v = venta;
  const borrador = !v || v.estado === 'borrador';
  const editable = borrador && (v ? can('ventas', 'e') : can('ventas', 'c'));
  const [f, setF] = useState({
    fecha: v?.fecha ?? fechaHoy(),
    clienteId: v?.clienteId ?? '',
    canal: v?.canal ?? '',
    documento: v?.documento ?? 'factura',
    generarDte: v?.generarDte ?? true,
    vencimiento: v?.vencimiento ?? '',
    observaciones: v?.observaciones ?? ''
  });
  const [lineas, setLineas] = useState<LineaForm[]>(
    v?.lineas.length
      ? v.lineas.map((l) => ({
          key: l.id,
          id: l.id,
          tipo: l.tipo as 'envasado' | 'granel',
          ordenEnvasadoId: l.ordenEnvasadoId ?? '',
          granel: l.estanqueId && l.loteId ? `${l.estanqueId}|${l.loteId}` : '',
          cantidad: String(l.cantidad),
          precio: String(l.precio),
          afectoIla: l.afectoIla
        }))
      : [lineaVacia()]
  );
  const tot = totalesVenta(
    lineas.map((l) => ({ cantidad: Number(l.cantidad) || 0, precio: Number(l.precio) || 0, afectoIla: l.afectoIla })),
    f.documento,
    datos.tributario
  );
  const costoLinea = (l: LineaForm) =>
    l.tipo === 'envasado'
      ? (datos.productos.find((p) => p.id === l.ordenEnvasadoId)?.costoUnitario ?? 0)
      : (datos.costoLitro[l.granel.split('|')[1] ?? ''] ?? 0);
  const m = borrador
    ? margenVenta(
        tot.neto,
        lineas.map((l) => ({ cantidad: Number(l.cantidad) || 0, costoUnitario: costoLinea(l) }))
      )
    : margenVenta(v!.neto, v!.lineas);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  function elegirCliente(id: string) {
    const c = datos.clientes.find((x) => x.id === id);
    setF({
      ...f,
      clienteId: id,
      canal: c?.canal ?? f.canal,
      documento: c?.tipo === 'Persona' ? 'boleta' : 'factura',
      vencimiento: c ? vencimientoSugerido(f.fecha, c.plazo) : f.vencimiento
    });
  }
  const linea = (i: number, c: Partial<LineaForm>) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...c } : l)));
  const input = () => ({
    ...f,
    id: v?.id,
    lineas: lineas.map((l) => {
      const [estanqueId, loteId] = l.granel.split('|');
      return {
        id: l.id,
        tipo: l.tipo,
        ordenEnvasadoId: l.tipo === 'envasado' ? l.ordenEnvasadoId : null,
        estanqueId: l.tipo === 'granel' ? estanqueId : null,
        loteId: l.tipo === 'granel' ? loteId : null,
        cantidad: l.cantidad,
        precio: l.precio,
        afectoIla: l.afectoIla
      };
    })
  });
  const conStock = datos.productos.filter((p) => p.stock > 0);
  const granelOpts = datos.granel.filter((g) => g.litros > 0.5);
  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={v?.codigo ? `Venta ${v.codigo}` : v ? 'Venta en borrador' : 'Nueva venta'}
      description={
        borrador
          ? f.documento === 'boleta'
            ? 'Boleta: los precios incluyen IVA e ILA.'
            : 'Precios netos. El ILA se aplica a las líneas marcadas.'
          : v?.estado === 'anulada'
            ? `Venta anulada${v.ncFolio ? ` con nota de crédito N° ${v.ncFolio}` : ''}: el stock se repuso.`
            : `Confirmada${v?.dteFolio ? ` · ${DOC[v.documento]} N° ${v.dteFolio}` : ''}. Para corregirla, anúlala y regístrala de nuevo.`
      }
      footer={
        <>
          {v && borrador && can('ventas', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() => confirm('¿Eliminar este borrador?') && run(() => deleteVenta(org.slug, v.id), 'Borrador eliminado.')}
            >
              Eliminar
            </Button>
          )}
          {v?.estado === 'confirmada' && can('ventas', 'e') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() =>
                confirm('¿Anular la venta? Se repone el stock' + (v.documento === 'factura' && v.dteFolio ? ' y se emite una nota de crédito.' : '.')) &&
                run(() => anularVentaAction(org.slug, v.id), 'Venta anulada.')
              }
            >
              Anular
            </Button>
          )}
          {v && (
            <Link
              href={`/${org.slug}/ventas/${v.id}`}
              className="inline-flex h-10 items-center gap-1.5 rounded-control px-4 text-[14px] font-medium text-ink-2 hover:bg-sunken hover:text-ink"
            >
              <FileText size={16} /> Documento
            </Link>
          )}
          <Button type="button" onClick={onClose}>
            {editable ? 'Cancelar' : 'Cerrar'}
          </Button>
          {editable && (
            <Button type="submit" form="venta-form" disabled={pending}>
              Guardar borrador
            </Button>
          )}
          {editable && (
            <Button
              type="button"
              variant="primary"
              disabled={pending}
              onClick={() =>
                confirm(`¿Confirmar la venta por ${clp(tot.total)}? Se descuenta el stock.`) &&
                run(() => confirmarVentaAction(org.slug, input(), v?.version), 'Venta confirmada.')
              }
            >
              Confirmar
            </Button>
          )}
        </>
      }
    >
      <form
        id="venta-form"
        onSubmit={(e) => (e.preventDefault(), run(() => saveVenta(org.slug, input(), v?.version), 'Borrador guardado.'))}
        className="grid gap-x-6 gap-y-4 lg:grid-cols-[1fr_16rem]"
      >
        <fieldset disabled={!editable} className="grid content-start gap-4 sm:grid-cols-3">
          <legend className="sr-only">Venta</legend>
          <Field label="Fecha" required error={errors.fecha}>
            {(id, d) => <Input id={id} type="date" value={f.fecha} onChange={set('fecha')} aria-describedby={d} required />}
          </Field>
          <Field label="Cliente" required error={errors.clienteId} className="sm:col-span-2">
            {(id, d) => (
              <Select id={id} value={f.clienteId} onChange={(e) => elegirCliente(e.target.value)} aria-describedby={d} required>
                <option value="">Elige…</option>
                {datos.clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Documento">
            {(id) => (
              <Select id={id} value={f.documento} onChange={set('documento')}>
                {DOCUMENTOS_VENTA.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Canal">
            {(id) => (
              <Select id={id} value={f.canal} onChange={set('canal')}>
                <option value="">—</option>
                {CANALES.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Vencimiento" error={errors.vencimiento}>
            {(id, d) => <Input id={id} type="date" value={f.vencimiento} onChange={set('vencimiento')} aria-describedby={d} />}
          </Field>
          <label className="flex items-center gap-2.5 text-[14px] sm:col-span-3">
            <input type="checkbox" checked={f.generarDte} onChange={(e) => setF({ ...f, generarDte: e.target.checked })} className="size-4 accent-ink" />
            Emitir documento tributario (asigna folio al confirmar)
          </label>
          <div className="sm:col-span-3">
            <h3 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Líneas</h3>
            {errors.lineas && (
              <p role="alert" className="mb-2 text-[13px] text-bad">
                {errors.lineas}
              </p>
            )}
            <ol className="flex flex-col gap-2">
              {lineas.map((l, i) => {
                const err = (k: string) => errors[`lineas.${i}.${k}`];
                const stock =
                  l.tipo === 'envasado'
                    ? datos.productos.find((p) => p.id === l.ordenEnvasadoId)?.stock
                    : datos.granel.find((g) => `${g.estanqueId}|${g.loteId}` === l.granel)?.litros;
                const excede = stock != null && Number(l.cantidad) > stock;
                return (
                  <li key={l.key} aria-label={`Línea ${i + 1}`} className="grid gap-2 rounded-control bg-sunken/60 p-2">
                    <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
                      <Select
                        aria-label={`Línea ${i + 1} · Tipo`}
                        value={l.tipo}
                        onChange={(e) => linea(i, { tipo: e.target.value as 'envasado' | 'granel', afectoIla: e.target.value === 'envasado' })}
                        className="h-9 text-[14px]"
                      >
                        <option value="envasado">Envasado</option>
                        <option value="granel">Granel</option>
                      </Select>
                      {l.tipo === 'envasado' ? (
                        <Select
                          aria-label={`Línea ${i + 1} · Producto`}
                          aria-invalid={!!err('ordenEnvasadoId')}
                          value={l.ordenEnvasadoId}
                          onChange={(e) => linea(i, { ordenEnvasadoId: e.target.value })}
                          className="h-9 text-[14px]"
                        >
                          <option value="">Elige el producto…</option>
                          {[...conStock, ...datos.productos.filter((p) => p.id === l.ordenEnvasadoId && p.stock <= 0)].map((p) => (
                            <option key={p.id} value={p.id}>
                              {productoDe({ tipo: 'envasado', ordenEnvasadoId: p.id, loteId: null, estanqueId: null, descripcion: null }, datos)} · stock{' '}
                              {nf(p.stock)}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Select
                          aria-label={`Línea ${i + 1} · Estanque y lote`}
                          aria-invalid={!!err('loteId')}
                          value={l.granel}
                          onChange={(e) => linea(i, { granel: e.target.value })}
                          className="h-9 text-[14px]"
                        >
                          <option value="">Elige estanque y lote…</option>
                          {granelOpts.map((g) => (
                            <option key={`${g.estanqueId}|${g.loteId}`} value={`${g.estanqueId}|${g.loteId}`}>
                              {datos.estanques.find((x) => x.id === g.estanqueId)?.codigo} · {datos.lotes.find((x) => x.id === g.loteId)?.codigo} ·{' '}
                              {nf(g.litros)} L
                            </option>
                          ))}
                        </Select>
                      )}
                    </div>
                    <div className="grid grid-cols-[6.5rem_minmax(0,8rem)_auto_1fr_auto] items-center gap-2">
                      <Input
                        aria-label={`Línea ${i + 1} · Cantidad`}
                        aria-invalid={!!err('cantidad') || excede}
                        type="number"
                        min={0}
                        step={l.tipo === 'envasado' ? 1 : 'any'}
                        placeholder={l.tipo === 'envasado' ? 'Unidades' : 'Litros'}
                        value={l.cantidad}
                        onChange={(e) => linea(i, { cantidad: e.target.value })}
                        className="h-9 text-[14px] tabular"
                        required
                      />
                      <Input
                        aria-label={`Línea ${i + 1} · Precio`}
                        aria-invalid={!!err('precio')}
                        type="number"
                        min={0}
                        step="any"
                        placeholder={f.documento === 'boleta' ? 'Precio con IVA' : 'Precio neto'}
                        value={l.precio}
                        onChange={(e) => linea(i, { precio: e.target.value })}
                        className="h-9 text-[14px] tabular"
                        required
                      />
                      <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
                        <input
                          type="checkbox"
                          checked={l.afectoIla}
                          onChange={(e) => linea(i, { afectoIla: e.target.checked })}
                          className="size-4 accent-ink"
                        />
                        ILA
                      </label>
                      <span className="text-right text-[14px] font-semibold tabular" aria-label={`Línea ${i + 1} · Monto`}>
                        {clp(montoLinea({ cantidad: Number(l.cantidad) || 0, precio: Number(l.precio) || 0 }))}
                      </span>
                      <button
                        type="button"
                        aria-label={`Quitar línea ${i + 1}`}
                        disabled={lineas.length === 1}
                        onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}
                        className="grid size-9 place-items-center rounded-control text-ink-3 hover:bg-sunken hover:text-bad disabled:opacity-40"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {(excede || err('cantidad') || err('ordenEnvasadoId') || err('loteId')) && (
                      <p className="text-[12px] text-bad">
                        {excede ? `Supera el stock disponible (${nf(stock ?? 0, 1)}).` : (err('cantidad') ?? err('ordenEnvasadoId') ?? err('loteId'))}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
            <Button type="button" variant="ghost" className="mt-2" onClick={() => setLineas((ls) => [...ls, lineaVacia()])}>
              <Plus size={15} /> Agregar línea
            </Button>
          </div>
          <Field label="Observaciones" className="sm:col-span-3">
            {(id) => <Textarea id={id} value={f.observaciones} onChange={set('observaciones')} />}
          </Field>
        </fieldset>
        <aside aria-label="Totales" className="self-start rounded-card bg-sunken px-4 py-3 text-[13px] lg:sticky lg:top-0">
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
            <dt className="text-ink-3">Neto</dt>
            <dd className="text-right tabular">{clp(borrador ? tot.neto : v!.neto)}</dd>
            <dt className="text-ink-3">IVA</dt>
            <dd className="text-right tabular">{clp(borrador ? tot.iva : v!.iva)}</dd>
            <dt className="text-ink-3">ILA</dt>
            <dd className="text-right tabular">{clp(borrador ? tot.ila : v!.ila)}</dd>
            <dt className="font-semibold text-ink">Total</dt>
            <dd className="text-right text-[15px] font-bold tabular">{clp(borrador ? tot.total : v!.total)}</dd>
          </dl>
          {verCostos && (
            <dl aria-label="Margen" className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-rule pt-2">
              <dt className="text-ink-3">Costo</dt>
              <dd className="text-right tabular">{clp(Math.round(m.costo))}</dd>
              <dt className="font-semibold text-ink">Margen</dt>
              <dd className={cn('text-right font-semibold tabular', m.margen < 0 && 'text-bad')}>
                {clp(Math.round(m.margen))}
                {m.pct != null && ` · ${nf(m.pct * 100, 1)} %`}
              </dd>
            </dl>
          )}
        </aside>
        <ErrorForm error={error} className="lg:col-span-2" />
      </form>
    </Dialog>
  );
}
