'use client';
import {
  cantidadAditivo,
  clp,
  fechaHoy,
  litrosEntradaLote,
  litrosLote,
  OBJETIVOS_ADITIVO,
  stockInsumo,
  TIPOS_ADITIVO,
  unidadDosis,
  type AdicionSO2,
  type Aditivo,
  type Estanque,
  type Fermentacion,
  type Insumo,
  type Lote,
  type MovBodega,
  type MovInsumo
} from '@winzer/domain';
import { Beaker, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCan, useTemporadaElegida } from '@/components/shell/org-context';
import { Codigo, TipoUva } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { EmptyState, PageHeader } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { useEntity, useSync } from '@/lib/offline/hooks';

type Pend = { _pending: boolean; _version: number };
type AditivoRow = Aditivo & Pend;
const TIPO = Object.fromEntries(TIPOS_ADITIVO) as Record<string, string>;
const nf = (v: number, d = 2) => v.toLocaleString('es-CL', { maximumFractionDigits: d });
const fecha = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });

function useDatos() {
  const aditivos = useEntity<Aditivo>('aditivo') as AditivoRow[] | undefined;
  const lotes = useEntity<Lote>('lote') as (Lote & Pend)[] | undefined;
  const estanques = useEntity<Estanque>('estanque') as (Estanque & Pend)[] | undefined;
  const insumos = useEntity<Insumo>('insumo') as (Insumo & Pend)[] | undefined;
  const movsInsumo = useEntity<MovInsumo>('mov_insumo') as (MovInsumo & Pend)[] | undefined;
  const movs = useEntity<MovBodega>('mov_bodega') as (MovBodega & Pend)[] | undefined;
  const fichas = useEntity<Fermentacion>('fermentacion') as (Fermentacion & Pend)[] | undefined;
  const adiciones = useEntity<AdicionSO2>('adicion_so2') as (AdicionSO2 & Pend)[] | undefined;
  return {
    aditivos: aditivos ?? [],
    lotes: lotes ?? [],
    estanques: estanques ?? [],
    insumos: insumos ?? [],
    movsInsumo: movsInsumo ?? [],
    movs: movs ?? [],
    fichas: fichas ?? [],
    adiciones: adiciones ?? [],
    cargando: !aditivos || !lotes || !insumos || !movs
  };
}
type Datos = ReturnType<typeof useDatos>;

export function VinificacionView() {
  const can = useCan();
  const elegida = useTemporadaElegida();
  const datos = useDatos();
  const [editing, setEditing] = useState<AditivoRow | 'nuevo' | null>(null);
  const [lote, setLote] = useState('');
  const loteById = useMemo(() => new Map(datos.lotes.map((l) => [l.id, l])), [datos.lotes]);
  const insById = useMemo(() => new Map(datos.insumos.map((i) => [i.id, i])), [datos.insumos]);
  const lotesTemp = datos.lotes.filter((l) => l.temporadaId === elegida?.id);
  const rows = datos.aditivos
    .filter((a) => loteById.get(a.loteId)?.temporadaId === elegida?.id && (!lote || a.loteId === lote))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  // Costo enológico por lote = Σ aditivos + Σ adiciones de SO₂ de sus fichas (v1: financial.costoLitroLote, parte enológica).
  const costos = lotesTemp
    .map((l) => {
      const ad = datos.aditivos.filter((a) => a.loteId === l.id).reduce((s, a) => s + Number(a.costo), 0);
      const fichas = new Set(datos.fichas.filter((f) => f.loteId === l.id).map((f) => f.id));
      const so2 = datos.adiciones.filter((a) => fichas.has(a.fermentacionId)).reduce((s, a) => s + Number(a.costo), 0);
      const litros = litrosEntradaLote(l.id, datos.movs) || Number(l.litrosEstimados ?? 0);
      return { ...l, ad, so2, total: ad + so2, litros, porLitro: litros ? (ad + so2) / litros : null };
    })
    .filter((x) => x.total > 0 || x.litros > 0);
  type Costo = (typeof costos)[number];

  const cols: Column<AditivoRow>[] = [
    { key: 'fecha', label: 'Fecha', render: (a) => <span className={a._pending ? 'italic' : undefined}>{fecha(a.fecha)}</span> },
    {
      key: 'lote',
      label: 'Lote',
      value: (a) => loteById.get(a.loteId)?.codigo ?? '',
      render: (a) => <Codigo codigo={loteById.get(a.loteId)?.codigo ?? '—'} pending={a._pending} />
    },
    { key: 'tipo', label: 'Tipo', value: (a) => TIPO[a.tipo] ?? a.tipo },
    { key: 'producto', label: 'Producto', value: (a) => insById.get(a.insumoId)?.nombre ?? '' },
    { key: 'dosis', label: 'Dosis', num: true, value: (a) => Number(a.dosis), render: (a) => `${nf(Number(a.dosis))} ${a.unidadDosis}` },
    { key: 'volumen', label: 'Volumen', num: true, value: (a) => Number(a.volumen), render: (a) => `${nf(Number(a.volumen), 0)} L` },
    {
      key: 'cantidad',
      label: 'Cantidad',
      num: true,
      value: (a) => Number(a.cantidad),
      render: (a) => `${nf(Number(a.cantidad), 3)} ${insById.get(a.insumoId)?.unidad ?? ''}`
    },
    { key: 'objetivo', label: 'Objetivo', value: (a) => a.objetivo ?? '', render: (a) => <span className="text-ink-2">{a.objetivo ?? '—'}</span> },
    { key: 'costo', label: 'Costo', num: true, value: (a) => Number(a.costo), render: (a) => clp(a.costo) }
  ];
  const costoCols: Column<Costo>[] = [
    { key: 'codigo', label: 'Lote', render: (l) => <Codigo codigo={l.codigo} /> },
    { key: 'tipo', label: 'Tipo', render: (l) => <TipoUva tipo={l.tipo} /> },
    { key: 'litros', label: 'Litros ingresados', num: true, value: (l) => l.litros, render: (l) => `${nf(l.litros, 0)} L` },
    { key: 'ad', label: 'Aditivos', num: true, value: (l) => l.ad, render: (l) => clp(l.ad) },
    { key: 'so2', label: 'SO₂', num: true, value: (l) => l.so2, render: (l) => clp(l.so2) },
    { key: 'total', label: 'Costo enológico', num: true, value: (l) => l.total, render: (l) => <b>{clp(l.total)}</b> },
    { key: 'porLitro', label: '$/L enológico', num: true, value: (l) => l.porLitro ?? 0, render: (l) => (l.porLitro != null ? `$${nf(l.porLitro, 1)}` : '—') }
  ];

  return (
    <>
      <PageHeader
        area="Vinificación y bodega"
        title="Vinificación y aditivos"
        description="Bentonita, ácido tartárico, taninos, enzimas, levaduras y otros productos por lote, con su costo. El SO₂ se registra en la ficha de fermentación. Funciona sin señal."
        actions={
          can('vinificacion', 'c') && (
            <Button variant="primary" onClick={() => setEditing('nuevo')}>
              <Plus size={16} /> Registrar aplicación
            </Button>
          )
        }
      />
      {datos.cargando ? (
        <div className="h-64 animate-pulse rounded-card bg-sunken" aria-label="Cargando aditivos" />
      ) : (
        <>
          {costos.length > 0 && (
            <section className="mb-6" aria-label="Costo enológico por lote">
              <h2 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Costo enológico acumulado por lote</h2>
              <DataTable rows={costos} columns={costoCols} exportName={`costo-enologico-${elegida?.anio ?? ''}`} canExport={can('vinificacion', 'x')} />
            </section>
          )}
          <DataTable
            rows={rows}
            columns={cols}
            onRowClick={can('vinificacion', 'e') ? (a) => setEditing(a) : undefined}
            exportName={`aditivos-${elegida?.anio ?? ''}`}
            canExport={can('vinificacion', 'x')}
            toolbar={
              <Select aria-label="Lote" value={lote} onChange={(e) => setLote(e.target.value)} className="h-9 w-auto text-[14px]">
                <option value="">Todos los lotes</option>
                {lotesTemp.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo}
                  </option>
                ))}
              </Select>
            }
            empty={
              <EmptyState
                icon={<Beaker size={28} strokeWidth={1.5} />}
                title={`Sin aditivos en la temporada ${elegida?.anio ?? ''}`}
                text="Registra cada producto aplicado con su dosis: descuenta el stock del insumo y suma al costo enológico del lote."
              />
            }
          />
        </>
      )}
      {editing && <AditivoDialog aditivo={editing === 'nuevo' ? null : editing} datos={datos} onClose={() => setEditing(null)} />}
    </>
  );
}

function AditivoDialog({ aditivo, datos, onClose }: { aditivo: AditivoRow | null; datos: Datos; onClose: () => void }) {
  const can = useCan();
  const engine = useSync();
  const toast = useToast();
  const elegida = useTemporadaElegida();
  const a = aditivo;
  const productos = datos.insumos.filter((i) => i.categoria === 'enologico' && i.tipo !== 'Sulfitante' && unidadDosis(i.unidad));
  const [f, setF] = useState({
    fecha: a?.fecha ?? fechaHoy(),
    loteId: a?.loteId ?? '',
    estanqueId: a?.estanqueId ?? '',
    tipo: a?.tipo ?? 'bentonita',
    insumoId: a?.insumoId ?? '',
    volumen: a ? String(a.volumen) : '',
    dosis: a ? String(a.dosis) : '',
    objetivo: a?.objetivo ?? '',
    responsable: a?.responsable ?? '',
    observaciones: a?.observaciones ?? ''
  });
  const [error, setError] = useState<string | null>(null);
  const insumo = productos.find((i) => i.id === f.insumoId);
  const unidad = unidadDosis(insumo?.unidad);
  const cantidad = insumo ? cantidadAditivo(f.dosis, f.volumen, insumo.unidad) : null;
  const costo = cantidad != null && insumo ? Math.round(cantidad * Number(insumo.precio)) : 0;
  const disponible = insumo ? stockInsumo(insumo, datos.movsInsumo) + (a && a.insumoId === insumo.id ? Number(a.cantidad) : 0) : null;
  const lotes = datos.lotes.filter((l) => l.temporadaId === elegida?.id || l.id === a?.loteId);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!engine) return;
    try {
      await engine.write('aditivo', 'upsert', a?.id ?? null, { ...f, unidadDosis: unidad, cantidad: cantidad ?? 0, costo });
      toast(navigator.onLine ? 'Aplicación registrada.' : 'Aplicación guardada en este equipo; se enviará al recuperar la señal.');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={a ? 'Editar aplicación' : 'Registrar aplicación'}
      description="Cantidad = dosis × volumen / 100, en la unidad del producto (g/hL para polvos, mL/hL para líquidos)."
      footer={
        <>
          {a && can('vinificacion', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              onClick={() =>
                confirm('¿Eliminar esta aplicación? El producto vuelve al stock.') && engine && void engine.write('aditivo', 'delete', a.id).then(onClose)
              }
            >
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="aditivo-form" variant="primary">
            Guardar
          </Button>
        </>
      }
    >
      <form id="aditivo-form" onSubmit={guardar} className="grid gap-x-6 gap-y-4 sm:grid-cols-[1fr_15rem]">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha" required>
            {(i) => <Input id={i} type="date" value={f.fecha} onChange={set('fecha')} required />}
          </Field>
          <Field label="Lote" required>
            {(i) => (
              <Select
                id={i}
                value={f.loteId}
                onChange={(e) => setF({ ...f, loteId: e.target.value, volumen: String(Math.round(litrosLote(e.target.value, datos.movs)) || f.volumen) })}
                required
              >
                <option value="" disabled>
                  Elige…
                </option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo} · {l.variedad}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Tipo de aditivo" required>
            {(i) => (
              <Select id={i} value={f.tipo} onChange={set('tipo')}>
                {TIPOS_ADITIVO.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Producto"
            required
            hint={productos.length === 0 ? 'No hay insumos enológicos en kg, g, L o mL: créalos en Insumos (con conexión).' : undefined}
          >
            {(i, d) => (
              <Select id={i} value={f.insumoId} onChange={set('insumoId')} aria-describedby={d} required>
                <option value="" disabled>
                  Elige…
                </option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({p.unidad})
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Volumen tratado" unit="L" required>
            {(i) => <Input id={i} type="number" min={1} step="any" value={f.volumen} onChange={set('volumen')} className="tabular" required />}
          </Field>
          <Field label="Dosis" unit={unidad ?? 'g/hL'} required>
            {(i) => <Input id={i} type="number" min={0} step="any" value={f.dosis} onChange={set('dosis')} className="tabular" required />}
          </Field>
          <Field label="Estanque">
            {(i) => (
              <Select id={i} value={f.estanqueId} onChange={set('estanqueId')}>
                <option value="">—</option>
                {datos.estanques.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.codigo}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Objetivo">
            {(i) => (
              <>
                <Input id={i} list="objetivos-aditivo" value={f.objetivo} onChange={set('objetivo')} />
                <datalist id="objetivos-aditivo">
                  {OBJETIVOS_ADITIVO.map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label="Responsable">{(i) => <Input id={i} value={f.responsable} onChange={set('responsable')} />}</Field>
          <Field label="Observaciones" className="sm:col-span-2">
            {(i) => <Textarea id={i} value={f.observaciones} onChange={set('observaciones')} />}
          </Field>
        </div>
        <aside aria-label="Cálculo" className="self-start rounded-card bg-sunken px-4 py-3 text-[13px]">
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
            <dt className="text-ink-3">Cantidad</dt>
            <dd className="text-right font-semibold tabular">{cantidad != null ? `${nf(cantidad, 3)} ${insumo!.unidad}` : '—'}</dd>
            <dt className="text-ink-3">Precio</dt>
            <dd className="text-right tabular">{insumo ? `${clp(insumo.precio)} / ${insumo.unidad}` : '—'}</dd>
            <dt className="text-ink-3">Costo</dt>
            <dd className="text-right tabular">{insumo ? clp(costo) : '—'}</dd>
            <dt className="text-ink-3">$/L</dt>
            <dd className="text-right tabular">{insumo && Number(f.volumen) ? `$${nf(costo / Number(f.volumen), 1)}` : '—'}</dd>
            <dt className="text-ink-3">Stock disponible</dt>
            <dd className={`text-right tabular ${disponible != null && cantidad != null && cantidad > disponible ? 'font-semibold text-bad' : ''}`}>
              {disponible != null ? `${nf(disponible, 3)} ${insumo!.unidad}` : '—'}
            </dd>
          </dl>
        </aside>
        {error && (
          <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad sm:col-span-2">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
