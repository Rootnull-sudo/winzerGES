'use client';
/**
 * Pestaña Órdenes: costo por botella en vivo (mismas fórmulas que el servidor), litros necesarios contra disponibles y
 * stock de cada material. Confirmar descuenta bodega e insumos y suma botellas en una sola operación del servidor.
 */
import { cajasNecesarias, clp, costoEnvasado, fechaHoy, validarDO } from '@winzer/domain';
import { Plus, Wine } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCan, useOrg } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState, Stat, StatGrid } from '@/components/ui/page';
import { cn } from '@/lib/cn';
import { ErrorForm, fecha, useSubmit } from '../proveedores/comun';
import { anularOrdenAction, confirmarOrden, deleteOrden, saveOrden } from './actions';
import type { DatosEnvasado, FormatoFila, OrdenFila } from './view';

const nf = (v: number, d = 1) => v.toLocaleString('es-CL', { maximumFractionDigits: d });
const PARTES: [string, string][] = [
  ['vino', 'Vino'],
  ['envase', 'Envase'],
  ['etiqueta', 'Etiqueta'],
  ['capsula', 'Cápsula'],
  ['cierre', 'Cierre'],
  ['caja', 'Caja'],
  ['manoObra', 'Mano de obra'],
  ['energia', 'Energía y agua']
];
const ESTADO: Record<string, ['ok' | 'neutral' | 'warn', string]> = {
  confirmada: ['ok', 'Confirmada'],
  borrador: ['warn', 'Borrador'],
  anulada: ['neutral', 'Anulada']
};

export function Ordenes({ ordenes, formatos, datos }: { ordenes: OrdenFila[]; formatos: FormatoFila[]; datos: DatosEnvasado }) {
  const can = useCan();
  const [editing, setEditing] = useState<OrdenFila | 'nueva' | null>(null);
  const lote = useMemo(() => new Map(datos.lotes.map((l) => [l.id, l])), [datos.lotes]);
  const fmt = useMemo(() => new Map(formatos.map((f) => [f.id, f])), [formatos]);
  const rows = [...ordenes].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const cols: Column<OrdenFila>[] = [
    { key: 'codigo', label: 'Código', value: (o) => o.codigo ?? '', render: (o) => <b>{o.codigo ?? '—'}</b> },
    { key: 'fecha', label: 'Fecha', render: (o) => fecha(o.fecha) },
    { key: 'lote', label: 'Lote', value: (o) => lote.get(o.loteId)?.codigo ?? '' },
    { key: 'formato', label: 'Formato', value: (o) => fmt.get(o.formatoId)?.nombre ?? '' },
    { key: 'unidades', label: 'Unidades', num: true, render: (o) => o.unidades.toLocaleString('es-CL') },
    {
      key: 'litros',
      label: 'Litros',
      num: true,
      value: (o) => o.litrosConsumidos ?? o.unidades * (fmt.get(o.formatoId)?.litros ?? 0) * (1 + o.mermaPct / 100),
      render: (o) => nf(o.litrosConsumidos ?? o.unidades * (fmt.get(o.formatoId)?.litros ?? 0) * (1 + o.mermaPct / 100))
    },
    {
      key: 'merma',
      label: 'Merma',
      num: true,
      value: (o) => o.mermaPct,
      render: (o) => <span className={cn(o.mermaPct > datos.mermaMax && 'font-semibold text-warn')}>{nf(o.mermaPct)} %</span>
    },
    {
      key: 'costo',
      label: 'Costo unit.',
      num: true,
      value: (o) => o.costoUnitario ?? 0,
      render: (o) => (o.costoUnitario != null ? clp(Math.round(o.costoUnitario)) : '—')
    },
    { key: 'stock', label: 'Stock', num: true, render: (o) => (o.estado === 'confirmada' ? o.stock.toLocaleString('es-CL') : '—') },
    {
      key: 'do',
      label: 'D.O.',
      value: (o) => (o.declaraDO ? 'Sí' : 'No'),
      render: (o) => (o.declaraDO ? <Badge tone={validarDO(o) ? 'bad' : 'ok'}>D.O.</Badge> : '—')
    },
    {
      key: 'estado',
      label: 'Estado',
      value: (o) => o.estado,
      render: (o) => {
        const [t, l] = ESTADO[o.estado] ?? ['neutral', o.estado];
        return <Badge tone={t}>{l}</Badge>;
      }
    }
  ];
  return (
    <>
      <StatGrid>
        {formatos
          .filter((f) => f.stock > 0 || f.stockMinimo > 0)
          .slice(0, 4)
          .map((f) => (
            <Stat
              key={f.id}
              label={f.nombre}
              value={f.stock.toLocaleString('es-CL')}
              sub={f.stockMinimo && f.stock < f.stockMinimo ? `Bajo el mínimo (${f.stockMinimo.toLocaleString('es-CL')})` : 'unidades en stock'}
              icon={<Wine size={16} strokeWidth={1.6} />}
            />
          ))}
      </StatGrid>
      <DataTable
        rows={rows}
        columns={cols}
        onRowClick={(o) => setEditing(o)}
        exportName="ordenes-envasado"
        canExport={can('envasado', 'x')}
        toolbar={
          can('envasado', 'c') && (
            <Button variant="primary" onClick={() => setEditing('nueva')} disabled={!formatos.length}>
              <Plus size={16} /> Nueva orden
            </Button>
          )
        }
        empty={
          <EmptyState
            icon={<Wine size={28} strokeWidth={1.5} />}
            title="Sin órdenes de envasado"
            text="Planifica una orden: el costo por botella se calcula en vivo y al confirmarla se descuentan bodega e insumos."
          />
        }
      />
      {editing && <OrdenDialog orden={editing === 'nueva' ? null : editing} formatos={formatos} datos={datos} onClose={() => setEditing(null)} />}
    </>
  );
}

const vacio = (v: string | null | undefined) => v ?? '';

function OrdenDialog({ orden, formatos, datos, onClose }: { orden: OrdenFila | null; formatos: FormatoFila[]; datos: DatosEnvasado; onClose: () => void }) {
  const { org } = useOrg();
  const can = useCan();
  const { pending, errors, error, run } = useSubmit(onClose);
  const o = orden;
  const borrador = !o || o.estado === 'borrador';
  const editable = borrador && (o ? can('envasado', 'e') : can('envasado', 'c'));
  const conVino = datos.enEstanque.filter((e) => e.litros > 0.5);
  const [f, setF] = useState({
    fecha: o?.fecha ?? fechaHoy(),
    estanqueId: o?.estanqueId ?? conVino[0]?.estanqueId ?? '',
    loteId: o?.loteId ?? conVino[0]?.loteId ?? '',
    formatoId: o?.formatoId ?? formatos[0]?.id ?? '',
    unidades: o ? String(o.unidades) : '',
    mermaPct: o ? String(o.mermaPct) : '1.5',
    responsable: vacio(o?.responsable),
    envaseId: vacio(o?.envaseId),
    cierreId: vacio(o?.cierreId),
    capsulaId: vacio(o?.capsulaId),
    cajaId: vacio(o?.cajaId),
    etiquetaId: vacio(o?.etiquetaId),
    etiquetaInsumoId: vacio(o?.etiquetaInsumoId),
    manoObra: o ? String(o.manoObra) : '',
    energiaAgua: o ? String(o.energiaAgua) : '',
    graduacion: o?.graduacion != null ? String(o.graduacion) : '',
    declaraDO: o?.declaraDO ?? false,
    pctUvaZona: o?.pctUvaZona != null ? String(o.pctUvaZona) : '',
    certificadoDO: vacio(o?.certificadoDO)
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const insById = new Map(datos.insumos.map((i) => [i.id, i]));
  const deTipo = (...tipos: string[]) => datos.insumos.filter((i) => tipos.includes(i.tipo));
  const formato = formatos.find((x) => x.id === f.formatoId) ?? null;
  const etiqueta = datos.etiquetas.find((e) => e.id === f.etiquetaId) ?? null;
  const lotesDelEstanque = datos.enEstanque.filter((e) => e.estanqueId === f.estanqueId && e.litros > 0.5);
  const disponibles = datos.enEstanque.find((e) => e.estanqueId === f.estanqueId && e.loteId === f.loteId)?.litros ?? 0;
  const unidades = Number(f.unidades) || 0;
  const c = costoEnvasado(
    { ...f, unidades, mermaPct: Number(f.mermaPct) || 0, manoObra: Number(f.manoObra) || 0, energiaAgua: Number(f.energiaAgua) || 0 },
    {
      formato,
      costoLitro: datos.costoLitro[f.loteId] ?? 0,
      precioInsumo: (id) => (id ? (insById.get(id)?.precio ?? 0) : 0),
      etiqueta,
      producidasEtiqueta: (etiqueta?.producidas ?? 0) + (borrador ? unidades : 0)
    }
  );
  // Si la orden ya está confirmada se muestra la foto congelada.
  const partes = !borrador && o?.costoPartes ? o.costoPartes : (c.partes as unknown as Record<string, number>);
  const unitario = !borrador && o?.costoUnitario != null ? o.costoUnitario : c.unitario;
  const litros = !borrador && o?.litrosConsumidos != null ? o.litrosConsumidos : c.litrosConsumidos;
  const materiales = (
    [
      ['envaseId', 'Envase'],
      ['cierreId', 'Cierre'],
      ['capsulaId', 'Cápsula'],
      ['etiquetaInsumoId', 'Etiqueta'],
      ['cajaId', 'Caja']
    ] as const
  )
    .filter(([k]) => f[k])
    .map(([k, l]) => {
      const i = insById.get(f[k])!;
      const necesita = k === 'cajaId' ? cajasNecesarias(unidades, formato?.unidadesCaja) : unidades;
      return { k, l, i, necesita };
    });
  const datosOrden = {
    ...f,
    unidades,
    mermaPct: Number(f.mermaPct) || 0,
    declaraDO: f.declaraDO,
    pctUvaZona: Number(f.pctUvaZona) || null,
    graduacion: Number(f.graduacion) || null
  };
  const errDO = validarDO(datosOrden);

  const sel = (
    k: keyof typeof f,
    label: string,
    opciones: { id: string; nombre: string; extra?: string }[],
    opts: { required?: boolean; vacio?: string } = {}
  ) => (
    <Field label={label} required={opts.required} error={errors[k]}>
      {(id, d) => (
        <Select id={id} value={String(f[k])} onChange={set(k)} aria-describedby={d} required={opts.required}>
          <option value="">{opts.vacio ?? '—'}</option>
          {opciones.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
              {x.extra ? ` · ${x.extra}` : ''}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
  const num = (k: keyof typeof f, label: string, unit = 'CLP', extra: { step?: number | string; hint?: string; required?: boolean } = {}) => (
    <Field label={label} unit={unit} error={errors[k]} hint={extra.hint} required={extra.required}>
      {(id, d) => (
        <Input
          id={id}
          type="number"
          min={0}
          step={extra.step ?? 1}
          value={String(f[k])}
          onChange={set(k)}
          aria-describedby={d}
          className="tabular"
          required={extra.required}
        />
      )}
    </Field>
  );
  const titulo = (t: string) => <h3 className="mt-1 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase sm:col-span-2">{t}</h3>;
  const opcionesInsumo = (...tipos: string[]) => deTipo(...tipos).map((i) => ({ id: i.id, nombre: i.nombre, extra: `stock ${nf(i.stock, 0)}` }));
  const input = { ...f, id: o?.id };

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={o?.codigo ? `Orden ${o.codigo}` : o ? 'Orden en borrador' : 'Nueva orden de envasado'}
      description={
        borrador
          ? 'Al confirmar se descuentan los litros del lote en el estanque y los materiales, y se suman las botellas al stock.'
          : o?.estado === 'anulada'
            ? 'Orden anulada: sus movimientos se revirtieron.'
            : 'Orden confirmada: el costo quedó congelado. Se puede anular si sus botellas no se han vendido.'
      }
      footer={
        <>
          {o && borrador && can('envasado', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() => confirm('¿Eliminar este borrador?') && run(() => deleteOrden(org.slug, o.id), 'Borrador eliminado.')}
            >
              Eliminar
            </Button>
          )}
          {o?.estado === 'confirmada' && can('envasado', 'e') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() =>
                confirm('¿Anular la orden? Se devuelven los litros a bodega y los materiales al stock.') &&
                run(() => anularOrdenAction(org.slug, o.id), 'Orden anulada.')
              }
            >
              Anular
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            {editable ? 'Cancelar' : 'Cerrar'}
          </Button>
          {editable && (
            <Button type="submit" form="orden-form" disabled={pending}>
              Guardar borrador
            </Button>
          )}
          {editable && (
            <Button
              type="button"
              variant="primary"
              disabled={pending || !!errDO}
              onClick={() =>
                confirm(`¿Confirmar la orden? Se descuentan ${nf(litros)} L del estanque y los materiales.`) &&
                run(() => confirmarOrden(org.slug, input, o?.version), 'Orden confirmada: bodega e insumos actualizados.')
              }
            >
              Confirmar
            </Button>
          )}
        </>
      }
    >
      <form
        id="orden-form"
        onSubmit={(e) => (e.preventDefault(), run(() => saveOrden(org.slug, input, o?.version), 'Borrador guardado.'))}
        className="grid gap-x-6 gap-y-4 lg:grid-cols-[1fr_17rem]"
      >
        <fieldset disabled={!editable} className="grid content-start gap-4 sm:grid-cols-2">
          <legend className="sr-only">Orden de envasado</legend>
          {titulo('Orden')}
          <Field label="Fecha" required error={errors.fecha}>
            {(id, d) => <Input id={id} type="date" value={f.fecha} onChange={set('fecha')} aria-describedby={d} required />}
          </Field>
          <Field label="Estanque" required error={errors.estanqueId}>
            {(id, d) => (
              <Select
                id={id}
                value={f.estanqueId}
                onChange={(e) => {
                  const primero = datos.enEstanque.find((x) => x.estanqueId === e.target.value && x.litros > 0.5);
                  setF({ ...f, estanqueId: e.target.value, loteId: primero?.loteId ?? '' });
                }}
                aria-describedby={d}
                required
              >
                <option value="">Elige…</option>
                {[...new Set(conVino.map((x) => x.estanqueId))].map((eid) => (
                  <option key={eid} value={eid}>
                    {datos.estanques.find((x) => x.id === eid)?.codigo} ·{' '}
                    {nf(
                      conVino.filter((x) => x.estanqueId === eid).reduce((s, x) => s + x.litros, 0),
                      0
                    )}{' '}
                    L
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {sel(
            'loteId',
            'Lote',
            lotesDelEstanque.map((x) => {
              const l = datos.lotes.find((y) => y.id === x.loteId);
              return { id: x.loteId, nombre: `${l?.codigo ?? ''} · ${l?.variedad ?? ''}`, extra: `${nf(x.litros, 0)} L` };
            }),
            { required: true, vacio: 'Elige…' }
          )}
          {sel(
            'formatoId',
            'Formato',
            formatos.map((x) => ({ id: x.id, nombre: x.nombre })),
            { required: true, vacio: 'Elige…' }
          )}
          {num('unidades', 'Unidades', 'un', { required: true })}
          {num('mermaPct', 'Merma', '%', {
            step: 0.1,
            hint: Number(f.mermaPct) > datos.mermaMax ? `Sobre el máximo de la viña (${nf(datos.mermaMax)} %).` : undefined
          })}
          <Field label="Responsable">{(id) => <Input id={id} value={f.responsable} onChange={set('responsable')} />}</Field>
          {titulo('Materiales')}
          {sel('envaseId', 'Envase', opcionesInsumo('Envase vidrio', 'Envase PET', 'Bag in box'), { required: true, vacio: 'Elige…' })}
          {sel('cierreId', 'Cierre', opcionesInsumo('Cierre'))}
          {sel('capsulaId', 'Cápsula', opcionesInsumo('Cápsula'))}
          {sel('cajaId', 'Caja', opcionesInsumo('Caja'))}
          {sel(
            'etiquetaId',
            'Diseño de etiqueta',
            datos.etiquetas.map((e) => ({ id: e.id, nombre: e.nombre }))
          )}
          {sel('etiquetaInsumoId', 'Etiquetas impresas (stock)', opcionesInsumo('Etiqueta'))}
          {titulo('Costos de proceso')}
          {num('manoObra', 'Mano de obra total')}
          {num('energiaAgua', 'Energía y agua total')}
          {titulo('Rotulación y D.O.')}
          {num('graduacion', 'Graduación', '% vol', { step: 0.1 })}
          <label className="flex items-center gap-2.5 self-end pb-2 text-[14px]">
            <input type="checkbox" checked={f.declaraDO} onChange={(e) => setF({ ...f, declaraDO: e.target.checked })} className="size-4 accent-ink" />
            Declara denominación de origen
          </label>
          {f.declaraDO && num('pctUvaZona', 'Uva de la zona', '%', { hint: 'Mínimo 75 %.' })}
          {f.declaraDO && (
            <Field label="N° de certificado D.O." error={errors.certificadoDO}>
              {(id, d) => <Input id={id} value={f.certificadoDO} onChange={set('certificadoDO')} aria-describedby={d} />}
            </Field>
          )}
          {errDO && (
            <p role="alert" className="text-[13px] font-semibold text-bad sm:col-span-2">
              {errDO}
            </p>
          )}
        </fieldset>
        <aside aria-label="Costo por botella" className="self-start rounded-card bg-sunken px-4 py-3 text-[13px] lg:sticky lg:top-0">
          <p className="mb-2 font-semibold text-ink-2">{borrador ? 'Costo estimado por unidad' : 'Costo congelado por unidad'}</p>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
            {PARTES.filter(([k]) => (partes[k] ?? 0) > 0).map(([k, l]) => (
              <div key={k} className="contents">
                <dt className="text-ink-3">{l}</dt>
                <dd className="text-right tabular">{clp(Math.round(partes[k] ?? 0))}</dd>
              </div>
            ))}
            <dt className="font-semibold text-ink">Costo unitario</dt>
            <dd className="text-right text-[15px] font-bold tabular">{clp(Math.round(unitario))}</dd>
            <dt className="text-ink-3">Costo total</dt>
            <dd className="text-right tabular">{clp(Math.round(unitario * unidades))}</dd>
          </dl>
          <div className="mt-3 border-t border-rule pt-2">
            <p className={cn('font-semibold', borrador && litros > disponibles + 0.01 ? 'text-bad' : 'text-ink-2')}>
              {nf(litros)} L necesarios{borrador ? ` · ${nf(disponibles)} L disponibles` : ''}
            </p>
            {borrador && (
              <ul aria-label="Stock de materiales" className="mt-1 space-y-0.5">
                {materiales.map(({ k, l, i, necesita }) => (
                  <li key={k} className={cn('flex justify-between gap-2', i && necesita > i.stock && 'font-semibold text-bad')}>
                    <span>{l}</span>
                    <span className="tabular">
                      {nf(necesita, 0)} / {nf(i?.stock ?? 0, 0)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
        <ErrorForm error={error} className="lg:col-span-2" />
      </form>
    </Dialog>
  );
}
