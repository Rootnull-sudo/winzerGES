'use client';
import {
  balanceLote,
  ESTADOS_ESTANQUE,
  estadoEstanque,
  fechaHoy,
  litrosEstanque,
  litrosLoteEnEstanque,
  loteDeEstanque,
  lotesEnEstanque,
  MATERIALES_ESTANQUE,
  MOTIVOS_SALIDA,
  ocupacion,
  ORIGENES_ENTRADA,
  rendimientoLKg,
  TIPOS_ESTANQUE,
  TIPOS_MOV_BODEGA,
  validarEntrada,
  validarSalida,
  type Cosecha,
  type Estanque,
  type Lote,
  type MovBodega
} from '@winzer/domain';
import { ArrowRightLeft, Container, Droplets, LogIn, MinusCircle, Plus, Wine } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useCan, useTemporadaElegida } from '@/components/shell/org-context';
import { Badge, Codigo, TipoUva } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState, PageHeader, Stat, StatGrid } from '@/components/ui/page';
import { Tabs, useTab } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { useEntity, useSync } from '@/lib/offline/hooks';

type Pend = { _pending: boolean; _version: number };
type EstanqueRow = Estanque & Pend;
type MovRow = MovBodega & Pend;
type LoteRow = Lote & Pend;

const TABS = [
  { id: 'estanques', label: 'Estanques' },
  { id: 'movimientos', label: 'Movimientos' },
  { id: 'balance', label: 'Balance de masa' }
] as const;
const TIPO_MOV = Object.fromEntries(TIPOS_MOV_BODEGA) as Record<string, string>;
const ESTADO_EST: Record<string, { label: string; tono: 'info' | 'neutral' | 'warn' | 'ok' }> = {
  ocupado: { label: 'Ocupado', tono: 'info' },
  vacio: { label: 'Vacío', tono: 'neutral' },
  mantencion: { label: 'En mantención', tono: 'warn' },
  reservado: { label: 'Reservado', tono: 'ok' }
};
const L = (v: number) => `${Math.round(v).toLocaleString('es-CL')} L`;
const fecha = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
const uid = () => crypto.randomUUID();

function useDatos() {
  const elegida = useTemporadaElegida();
  const estanques = useEntity<Estanque>('estanque') as EstanqueRow[] | undefined;
  const movs = useEntity<MovBodega>('mov_bodega') as MovRow[] | undefined;
  const lotes = useEntity<Lote>('lote') as LoteRow[] | undefined;
  const cosechas = useEntity<Cosecha>('cosecha') as (Cosecha & Pend)[] | undefined;
  const loteById = useMemo(() => new Map((lotes ?? []).map((l) => [l.id, l])), [lotes]);
  const estanqueById = useMemo(() => new Map((estanques ?? []).map((e) => [e.id, e])), [estanques]);
  const ordenados = useMemo(() => (estanques ?? []).slice().sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })), [estanques]);
  return {
    elegida,
    estanques: ordenados,
    movs: movs ?? [],
    lotes: lotes ?? [],
    cosechas: cosechas ?? [],
    loteById,
    estanqueById,
    cargando: !estanques || !movs || !lotes || !cosechas
  };
}
type Datos = ReturnType<typeof useDatos>;
type Operacion = 'entrada' | 'trasiego' | 'salida' | null;

export function BodegaView() {
  const [tab, setTab] = useTab(TABS);
  const can = useCan();
  const datos = useDatos();
  const [op, setOp] = useState<{ tipo: Operacion; estanqueId?: string }>({ tipo: null });
  const [estanque, setEstanque] = useState<EstanqueRow | 'nuevo' | null>(null);
  const [detalle, setDetalle] = useState<EstanqueRow | null>(null);
  const puede = can('bodega', 'c');
  return (
    <>
      <PageHeader
        area="Vinificación y bodega"
        title="Control de bodega"
        description="Estanques con su contenido, entradas, trasiegos y mermas, y el balance de masa por lote. Funciona sin señal; la capacidad y el stock se validan también al sincronizar."
        actions={
          puede && (
            <>
              <Button onClick={() => setOp({ tipo: 'entrada' })}>
                <LogIn size={15} aria-hidden /> Entrada
              </Button>
              <Button onClick={() => setOp({ tipo: 'trasiego' })}>
                <ArrowRightLeft size={15} aria-hidden /> Trasiego
              </Button>
              <Button onClick={() => setOp({ tipo: 'salida' })}>
                <MinusCircle size={15} aria-hidden /> Merma / salida
              </Button>
            </>
          )
        }
      />
      <Tabs tabs={TABS} actual={tab} onChange={setTab} />
      {datos.cargando ? (
        <div className="h-64 animate-pulse rounded-card bg-sunken" aria-label="Cargando bodega" />
      ) : tab === 'estanques' ? (
        <Estanques datos={datos} onDetalle={setDetalle} onEditar={setEstanque} />
      ) : tab === 'movimientos' ? (
        <Movimientos datos={datos} />
      ) : (
        <Balance datos={datos} />
      )}
      {op.tipo === 'entrada' && <EntradaDialog datos={datos} estanqueId={op.estanqueId} onClose={() => setOp({ tipo: null })} />}
      {op.tipo === 'trasiego' && <TrasiegoDialog datos={datos} estanqueId={op.estanqueId} onClose={() => setOp({ tipo: null })} />}
      {op.tipo === 'salida' && <SalidaDialog datos={datos} estanqueId={op.estanqueId} onClose={() => setOp({ tipo: null })} />}
      {estanque && <EstanqueDialog estanque={estanque === 'nuevo' ? null : estanque} onClose={() => setEstanque(null)} />}
      {detalle && (
        <DetalleEstanque
          estanque={detalle}
          datos={datos}
          onOperar={(tipo) => {
            setDetalle(null);
            setOp({ tipo, estanqueId: detalle.id });
          }}
          onEditar={() => {
            setDetalle(null);
            setEstanque(detalle);
          }}
          onClose={() => setDetalle(null)}
        />
      )}
    </>
  );
}

/* ------------------------------ Estanques ------------------------------ */

function Estanques({ datos, onDetalle, onEditar }: { datos: Datos; onDetalle: (e: EstanqueRow) => void; onEditar: (e: EstanqueRow | 'nuevo') => void }) {
  const can = useCan();
  const { estanques, movs, loteById } = datos;
  const o = ocupacion(estanques, movs, (id) => loteById.get(id)?.tipo ?? null);
  const cols: Column<EstanqueRow>[] = [
    { key: 'codigo', label: 'Código', render: (e) => <Codigo codigo={e.codigo} pending={e._pending} /> },
    {
      key: 'capacidad',
      label: 'Capacidad',
      num: true,
      value: (e) => Number(e.capacidad),
      render: (e) => `${L(Number(e.capacidad))} · ${Number(e.capacidad) / 100} hL`
    },
    { key: 'contenido', label: 'Contenido', num: true, value: (e) => litrosEstanque(e.id, movs), render: (e) => L(litrosEstanque(e.id, movs)) },
    { key: 'material', label: 'Material', value: (e) => e.material ?? '' },
    { key: 'tipo', label: 'Tipo', value: (e) => e.tipo ?? '' },
    { key: 'ubicacion', label: 'Ubicación', value: (e) => e.ubicacion ?? '' },
    {
      key: 'estado',
      label: 'Estado',
      value: (e) => estadoEstanque(e, movs),
      render: (e) => {
        const s = ESTADO_EST[estadoEstanque(e, movs)]!;
        return <Badge tone={s.tono}>{s.label}</Badge>;
      }
    }
  ];
  return (
    <>
      <StatGrid>
        <Stat
          label="Ocupación global"
          value={`${Math.round(o.pct * 100)} %`}
          sub={`${L(o.usado)} de ${L(o.capacidad)}`}
          icon={<Container size={16} strokeWidth={1.6} />}
        />
        <Stat label="Estanques ocupados" value={`${o.ocupados} / ${o.total}`} sub={`${o.vacios} vacíos`} />
        <Stat label="Vino blanco" value={L(o.porTipo.blanco ?? 0)} icon={<Droplets size={16} strokeWidth={1.6} />} />
        <Stat label="Vino tinto" value={L(o.porTipo.tinto ?? 0)} icon={<Wine size={16} strokeWidth={1.6} />} />
      </StatGrid>
      {estanques.length > 0 && (
        <ul className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Estanques">
          {estanques.map((e) => {
            const litros = litrosEstanque(e.id, movs);
            const pct = Number(e.capacidad) ? litros / Number(e.capacidad) : 0;
            const lotes = lotesEnEstanque(e.id, movs);
            const principal = loteById.get(loteDeEstanque(e.id, movs) ?? '');
            const estado = ESTADO_EST[estadoEstanque(e, movs)]!;
            return (
              <li key={e.id}>
                <button onClick={() => onDetalle(e)} className="w-full rounded-card border border-rule bg-raised p-3.5 text-left hover:border-rule-strong">
                  <span className="flex items-center justify-between gap-2">
                    <Codigo codigo={e.codigo} pending={e._pending} />
                    {pct > 1 ? <Badge tone="bad">Sobrecapacidad</Badge> : <Badge tone={estado.tono}>{estado.label}</Badge>}
                  </span>
                  <span className="mt-3 block h-2.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
                    <span
                      className={cn('block h-full rounded-full', pct > 1 ? 'bg-bad' : principal?.tipo === 'blanco' ? 'bg-blanco-fill' : 'bg-tinto')}
                      style={{ width: `${Math.min(100, pct * 100)}%` }}
                    />
                  </span>
                  <span className="mt-2 block text-[13px] tabular">
                    <b>{L(litros)}</b> <span className="text-ink-3">/ {L(Number(e.capacidad))}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-ink-3">
                    {principal ? principal.codigo : 'Sin vino'}
                    {lotes.length > 1 && ` + ${lotes.length - 1} lote${lotes.length > 2 ? 's' : ''}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <h2 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Maestro de estanques</h2>
      <DataTable
        rows={estanques}
        columns={cols}
        onRowClick={can('bodega', 'e') ? (e) => onEditar(e) : undefined}
        exportName="estanques"
        canExport={can('bodega', 'x')}
        toolbar={
          can('bodega', 'c') && (
            <Button size="sm" variant="primary" className="ml-auto" onClick={() => onEditar('nuevo')}>
              <Plus size={14} aria-hidden /> Nuevo estanque
            </Button>
          )
        }
        empty={
          <EmptyState
            icon={<Container size={28} strokeWidth={1.5} />}
            title="Aún no hay estanques"
            text="Registra cada estanque con su capacidad: el contenido se calcula con las entradas, trasiegos y mermas."
            action={
              can('bodega', 'c') && (
                <Button variant="primary" onClick={() => onEditar('nuevo')}>
                  <Plus size={16} /> Nuevo estanque
                </Button>
              )
            }
          />
        }
      />
    </>
  );
}

function DetalleEstanque({
  estanque: e,
  datos,
  onOperar,
  onEditar,
  onClose
}: {
  estanque: EstanqueRow;
  datos: Datos;
  onOperar: (t: Operacion) => void;
  onEditar: () => void;
  onClose: () => void;
}) {
  const can = useCan();
  const lotes = lotesEnEstanque(e.id, datos.movs);
  const movs = datos.movs.filter((m) => m.estanqueId === e.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Estanque ${e.codigo}`}
      description={`${L(litrosEstanque(e.id, datos.movs))} de ${L(Number(e.capacidad))} · ${[e.material, e.ubicacion].filter(Boolean).join(' · ')}`}
      footer={
        <>
          {can('bodega', 'e') && (
            <Button type="button" variant="ghost" className="mr-auto" onClick={onEditar}>
              Editar estanque
            </Button>
          )}
          {can('bodega', 'c') && (
            <>
              <Button onClick={() => onOperar('entrada')}>Entrada</Button>
              <Button onClick={() => onOperar('trasiego')} disabled={lotes.length === 0}>
                Trasiego
              </Button>
              <Button onClick={() => onOperar('salida')} disabled={lotes.length === 0}>
                Merma / salida
              </Button>
            </>
          )}
        </>
      }
    >
      <h3 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Lotes</h3>
      {lotes.length === 0 ? (
        <p className="mb-4 text-[13px] text-ink-3">Vacío.</p>
      ) : (
        <ul className="mb-4 flex flex-wrap gap-2">
          {lotes.map((l) => (
            <li key={l.loteId}>
              <Badge>
                {datos.loteById.get(l.loteId)?.codigo ?? '—'} · {L(l.litros)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <h3 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Movimientos</h3>
      <ul className="max-h-72 divide-y divide-rule overflow-y-auto rounded-card border border-rule text-[13px]">
        {movs.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-3 py-2">
            <span className="w-24 text-ink-3 tabular">{fecha(m.fecha)}</span>
            <span className="min-w-0 flex-1 truncate">
              {TIPO_MOV[m.tipo]} · {datos.loteById.get(m.loteId)?.codigo ?? '—'}
              {(m.glosa || m.motivo) && <span className="text-ink-3"> · {m.glosa ?? m.motivo}</span>}
            </span>
            <span className={cn('font-semibold tabular', Number(m.litros) > 0 ? 'text-ok' : '')}>
              {Number(m.litros) > 0 ? '+' : ''}
              {L(Number(m.litros))}
            </span>
          </li>
        ))}
        {movs.length === 0 && <li className="px-3 py-2 text-ink-3">Sin movimientos.</li>}
      </ul>
    </Dialog>
  );
}

function EstanqueDialog({ estanque: e, onClose }: { estanque: EstanqueRow | null; onClose: () => void }) {
  const can = useCan();
  const engine = useSync();
  const toast = useToast();
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function guardar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!engine) return;
    try {
      await engine.write('estanque', 'upsert', e?.id ?? null, Object.fromEntries(new FormData(ev.currentTarget)));
      toast(e ? 'Estanque actualizado.' : 'Estanque creado.');
      onClose();
    } catch (err) {
      const x = err as Error & { issues?: { path: PropertyKey[]; message: string }[] };
      setErrors(x.issues ? Object.fromEntries(x.issues.map((i) => [String(i.path[0]), i.message])) : { codigo: x.message });
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={e ? `Estanque ${e.codigo}` : 'Nuevo estanque'}
      description="Ocupado o vacío se calcula con los movimientos; aquí se indica si está en mantención o reservado."
      footer={
        <>
          {e && can('bodega', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              onClick={() => confirm(`¿Eliminar el estanque ${e.codigo}?`) && engine && void engine.write('estanque', 'delete', e.id).then(onClose)}
            >
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="estanque-form" variant="primary">
            Guardar
          </Button>
        </>
      }
    >
      <form id="estanque-form" onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
        <Field label="Código" required error={errors.codigo}>
          {(i) => <Input id={i} name="codigo" defaultValue={e?.codigo} placeholder="E-05" required />}
        </Field>
        <Field label="Capacidad" unit="L" required hint="1 hL = 100 L." error={errors.capacidad}>
          {(i, d) => (
            <Input
              id={i}
              name="capacidad"
              type="number"
              min={1}
              step="any"
              defaultValue={e?.capacidad ?? ''}
              className="tabular"
              aria-describedby={d}
              required
            />
          )}
        </Field>
        <Field label="Material">
          {(i) => (
            <Select id={i} name="material" defaultValue={e?.material ?? 'Acero inoxidable'}>
              {MATERIALES_ESTANQUE.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Tipo">
          {(i) => (
            <>
              <Input id={i} name="tipo" list="tipos-estanque" defaultValue={e?.tipo ?? ''} />
              <datalist id="tipos-estanque">
                {TIPOS_ESTANQUE.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Ubicación">{(i) => <Input id={i} name="ubicacion" defaultValue={e?.ubicacion ?? ''} />}</Field>
        <Field label="Estado operativo">
          {(i) => (
            <Select id={i} name="estado" defaultValue={e?.estado ?? 'operativo'}>
              {ESTADOS_ESTANQUE.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Costo de mantención anual" unit="CLP">
          {(i) => <Input id={i} name="costoMantencion" type="number" min={0} step={1} defaultValue={e?.costoMantencion ?? ''} className="tabular" />}
        </Field>
      </form>
    </Dialog>
  );
}

/* ------------------------------ Operaciones ------------------------------ */

function OperacionDialog({
  titulo,
  descripcion,
  children,
  calculo,
  error,
  onClose,
  onSubmit,
  enviar
}: {
  titulo: string;
  descripcion: string;
  children: ReactNode;
  calculo: ReactNode;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
  enviar: string;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={titulo}
      description={descripcion}
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="operacion-form" variant="primary">
            {enviar}
          </Button>
        </>
      }
    >
      <form
        id="operacion-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="grid gap-x-6 gap-y-4 sm:grid-cols-[1fr_15rem]"
      >
        <div className="grid gap-4 sm:grid-cols-2">{children}</div>
        <aside aria-label="Cálculo" className="self-start rounded-card bg-sunken px-4 py-3 text-[13px]">
          {calculo}
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

function Fila({ etiqueta, valor, mal }: { etiqueta: string; valor: ReactNode; mal?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <dt className="text-ink-3">{etiqueta}</dt>
      <dd className={cn('text-right tabular', mal && 'font-semibold text-bad')}>{valor}</dd>
    </div>
  );
}

function useOperacion(onClose: () => void) {
  const engine = useSync();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  async function ejecutar(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast(navigator.onLine ? ok : `${ok} Guardado en este equipo; se enviará al recuperar la señal.`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return { engine, error, setError, ejecutar };
}

function SelectLote({
  lotes,
  value,
  onChange,
  label = 'Lote'
}: {
  lotes: { id: string; codigo: string; extra?: string }[];
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <Field label={label} required>
      {(i) => (
        <Select id={i} value={value} onChange={(e) => onChange(e.target.value)} required>
          <option value="" disabled>
            Elige…
          </option>
          {lotes.map((l) => (
            <option key={l.id} value={l.id}>
              {l.codigo}
              {l.extra ? ` · ${l.extra}` : ''}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function EntradaDialog({ datos, estanqueId, onClose }: { datos: Datos; estanqueId?: string; onClose: () => void }) {
  const { engine, error, setError, ejecutar } = useOperacion(onClose);
  const [f, setF] = useState({ fecha: fechaHoy(), origen: 'mosto', loteId: '', estanqueId: estanqueId ?? '', litros: '', kgUva: '', glosa: '' });
  const e = datos.estanqueById.get(f.estanqueId);
  const ocupado = e ? litrosEstanque(e.id, datos.movs) : 0;
  const litros = Number(f.litros) || 0;
  const lotes = datos.lotes.filter((l) => l.temporadaId === datos.elegida?.id || l.id === f.loteId);
  function guardar() {
    const msg = validarEntrada(e, litros, datos.movs);
    if (msg) return setError(msg);
    void ejecutar(
      () => engine!.write('mov_bodega', 'upsert', null, { ...f, litros, tipo: 'entrada', kgUva: f.origen === 'vino' ? null : f.kgUva }),
      'Entrada registrada. Estanque actualizado.'
    );
  }
  return (
    <OperacionDialog
      titulo="Registrar entrada"
      descripcion="Uva, mosto o vino que entra a un estanque. Una entrada de uva o mosto pasa el lote a «En molienda»."
      error={error}
      onClose={onClose}
      onSubmit={guardar}
      enviar="Registrar entrada"
      calculo={
        <dl>
          <Fila etiqueta="Capacidad" valor={e ? L(Number(e.capacidad)) : '—'} />
          <Fila etiqueta="Ocupado" valor={e ? L(ocupado) : '—'} />
          <Fila etiqueta="Libre" valor={e ? L(Number(e.capacidad) - ocupado) : '—'} mal={!!e && litros > Number(e.capacidad) - ocupado} />
          <Fila etiqueta="Ocupación final" valor={e && Number(e.capacidad) ? `${Math.round(((ocupado + litros) / Number(e.capacidad)) * 100)} %` : '—'} />
          <Fila
            etiqueta="Rendimiento"
            valor={
              rendimientoLKg(litros, f.kgUva) != null ? `${rendimientoLKg(litros, f.kgUva)!.toLocaleString('es-CL', { maximumFractionDigits: 3 })} L/kg` : '—'
            }
          />
        </dl>
      }
    >
      <Field label="Fecha" required>
        {(i) => <Input id={i} type="date" value={f.fecha} onChange={(x) => setF({ ...f, fecha: x.target.value })} required />}
      </Field>
      <Field label="Origen" required>
        {(i) => (
          <Select id={i} value={f.origen} onChange={(x) => setF({ ...f, origen: x.target.value })}>
            {ORIGENES_ENTRADA.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <SelectLote lotes={lotes.map((l) => ({ id: l.id, codigo: l.codigo, extra: l.variedad }))} value={f.loteId} onChange={(v) => setF({ ...f, loteId: v })} />
      <Field label="Estanque" required>
        {(i) => (
          <Select id={i} value={f.estanqueId} onChange={(x) => setF({ ...f, estanqueId: x.target.value })} required>
            <option value="" disabled>
              Elige…
            </option>
            {datos.estanques.map((x) => (
              <option key={x.id} value={x.id} disabled={x.estado === 'mantencion'}>
                {x.codigo} · libre {L(Number(x.capacidad) - litrosEstanque(x.id, datos.movs))}
                {x.estado === 'mantencion' ? ' (mantención)' : ''}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Litros" unit="L" required>
        {(i) => (
          <Input
            id={i}
            type="number"
            min={1}
            step="any"
            value={f.litros}
            onChange={(x) => setF({ ...f, litros: x.target.value })}
            className="tabular"
            required
          />
        )}
      </Field>
      {f.origen !== 'vino' && (
        <Field label="Kg de uva" unit="kg" hint="Permite calcular el rendimiento L/kg.">
          {(i, d) => (
            <Input
              id={i}
              type="number"
              min={0}
              step="any"
              value={f.kgUva}
              onChange={(x) => setF({ ...f, kgUva: x.target.value })}
              className="tabular"
              aria-describedby={d}
            />
          )}
        </Field>
      )}
      <Field label="Observación" className="sm:col-span-2">
        {(i) => <Input id={i} value={f.glosa} onChange={(x) => setF({ ...f, glosa: x.target.value })} />}
      </Field>
    </OperacionDialog>
  );
}

function TrasiegoDialog({ datos, estanqueId, onClose }: { datos: Datos; estanqueId?: string; onClose: () => void }) {
  const { engine, error, setError, ejecutar } = useOperacion(onClose);
  const inicial = estanqueId && lotesEnEstanque(estanqueId, datos.movs)[0]?.loteId;
  const [f, setF] = useState({ fecha: fechaHoy(), origenId: estanqueId ?? '', loteId: inicial ?? '', destinoId: '', litros: '', merma: '', glosa: 'Trasiego' });
  const origen = datos.estanqueById.get(f.origenId);
  const destino = datos.estanqueById.get(f.destinoId);
  const litros = Number(f.litros) || 0;
  const merma = Number(f.merma) || 0;
  const disponible = origen && f.loteId ? litrosLoteEnEstanque(origen.id, f.loteId, datos.movs) : 0;
  const conVino = datos.estanques.filter((e) => litrosEstanque(e.id, datos.movs) > 0.5);
  function guardar() {
    if (f.origenId === f.destinoId) return setError('El destino debe ser distinto del origen.');
    const msg = validarSalida(origen, litros + merma, f.loteId, datos.movs) ?? validarEntrada(destino, litros, datos.movs);
    if (msg) return setError(msg);
    const grupo = uid();
    const base = { fecha: f.fecha, loteId: f.loteId, grupo, glosa: f.glosa || 'Trasiego' };
    // Salida, entrada y merma viajan como un grupo atómico: el servidor aplica las tres o ninguna.
    void ejecutar(
      () =>
        engine!.escribirGrupo([
          { entity: 'mov_bodega', data: { ...base, estanqueId: f.origenId, litros: -litros, tipo: 'trasiego_salida' } },
          { entity: 'mov_bodega', data: { ...base, estanqueId: f.destinoId, litros, tipo: 'trasiego_entrada' } },
          ...(merma > 0
            ? [{ entity: 'mov_bodega', data: { ...base, glosa: null, estanqueId: f.origenId, litros: -merma, tipo: 'merma', motivo: 'Borras de trasiego' } }]
            : [])
        ]),
      'Trasiego registrado.'
    );
  }
  return (
    <OperacionDialog
      titulo="Registrar trasiego"
      descripcion="Mueve vino de un estanque a otro. La merma (borras) se descuenta del origen. Se guarda como una sola operación."
      error={error}
      onClose={onClose}
      onSubmit={guardar}
      enviar="Registrar trasiego"
      calculo={
        <dl>
          <Fila etiqueta="Disponible del lote" valor={origen && f.loteId ? L(disponible) : '—'} mal={litros + merma > disponible + 0.01} />
          <Fila etiqueta="Sale del origen" valor={L(litros + merma)} />
          <Fila
            etiqueta="Libre en destino"
            valor={destino ? L(Number(destino.capacidad) - litrosEstanque(destino.id, datos.movs)) : '—'}
            mal={!!destino && litros > Number(destino.capacidad) - litrosEstanque(destino.id, datos.movs)}
          />
          <Fila etiqueta="Merma" valor={litros ? `${((merma / (litros + merma)) * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })} %` : '—'} />
        </dl>
      }
    >
      <Field label="Fecha" required>
        {(i) => <Input id={i} type="date" value={f.fecha} onChange={(x) => setF({ ...f, fecha: x.target.value })} required />}
      </Field>
      <Field label="Estanque de origen" required>
        {(i) => (
          <Select
            id={i}
            value={f.origenId}
            onChange={(x) => setF({ ...f, origenId: x.target.value, loteId: lotesEnEstanque(x.target.value, datos.movs)[0]?.loteId ?? '' })}
            required
          >
            <option value="" disabled>
              Elige…
            </option>
            {conVino.map((e) => (
              <option key={e.id} value={e.id}>
                {e.codigo} · {L(litrosEstanque(e.id, datos.movs))}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <SelectLote
        lotes={(origen ? lotesEnEstanque(origen.id, datos.movs) : []).map((l) => ({
          id: l.loteId,
          codigo: datos.loteById.get(l.loteId)?.codigo ?? '—',
          extra: L(l.litros)
        }))}
        value={f.loteId}
        onChange={(v) => setF({ ...f, loteId: v })}
      />
      <Field label="Estanque de destino" required>
        {(i) => (
          <Select id={i} value={f.destinoId} onChange={(x) => setF({ ...f, destinoId: x.target.value })} required>
            <option value="" disabled>
              Elige…
            </option>
            {datos.estanques
              .filter((e) => e.id !== f.origenId)
              .map((e) => (
                <option key={e.id} value={e.id} disabled={e.estado === 'mantencion'}>
                  {e.codigo} · libre {L(Number(e.capacidad) - litrosEstanque(e.id, datos.movs))}
                </option>
              ))}
          </Select>
        )}
      </Field>
      <Field label="Litros trasegados" unit="L" required>
        {(i) => (
          <Input
            id={i}
            type="number"
            min={1}
            step="any"
            value={f.litros}
            onChange={(x) => setF({ ...f, litros: x.target.value })}
            className="tabular"
            required
          />
        )}
      </Field>
      <Field label="Merma en el trasiego (borras)" unit="L">
        {(i) => <Input id={i} type="number" min={0} step="any" value={f.merma} onChange={(x) => setF({ ...f, merma: x.target.value })} className="tabular" />}
      </Field>
      <Field label="Observación" className="sm:col-span-2">
        {(i) => <Input id={i} value={f.glosa} onChange={(x) => setF({ ...f, glosa: x.target.value })} />}
      </Field>
    </OperacionDialog>
  );
}

function SalidaDialog({ datos, estanqueId, onClose }: { datos: Datos; estanqueId?: string; onClose: () => void }) {
  const { engine, error, setError, ejecutar } = useOperacion(onClose);
  const inicial = estanqueId && lotesEnEstanque(estanqueId, datos.movs)[0]?.loteId;
  const [f, setF] = useState({ fecha: fechaHoy(), tipo: 'merma', estanqueId: estanqueId ?? '', loteId: inicial ?? '', litros: '', motivo: '' });
  const e = datos.estanqueById.get(f.estanqueId);
  const valor = Number(f.litros) || 0;
  const litros = f.tipo === 'ajuste' ? valor : -Math.abs(valor);
  const disponible = e && f.loteId ? litrosLoteEnEstanque(e.id, f.loteId, datos.movs) : 0;
  function guardar() {
    const msg = litros < 0 ? validarSalida(e, -litros, f.loteId, datos.movs) : validarEntrada(e, litros, datos.movs);
    if (msg) return setError(msg);
    void ejecutar(() => engine!.write('mov_bodega', 'upsert', null, { ...f, litros }), 'Movimiento registrado.');
  }
  return (
    <OperacionDialog
      titulo="Registrar merma o salida interna"
      descripcion="Para mermas y vinagre ingresa los litros en positivo: se descuentan solos. En ajustes usa el signo (+ entra, − sale)."
      error={error}
      onClose={onClose}
      onSubmit={guardar}
      enviar="Registrar"
      calculo={
        <dl>
          <Fila etiqueta="Disponible del lote" valor={e && f.loteId ? L(disponible) : '—'} mal={litros < 0 && -litros > disponible + 0.01} />
          <Fila etiqueta="Movimiento" valor={valor ? `${litros > 0 ? '+' : ''}${L(litros)}` : '—'} />
          <Fila etiqueta="Queda" valor={e && f.loteId ? L(disponible + litros) : '—'} />
        </dl>
      }
    >
      <Field label="Fecha" required>
        {(i) => <Input id={i} type="date" value={f.fecha} onChange={(x) => setF({ ...f, fecha: x.target.value })} required />}
      </Field>
      <Field label="Tipo" required>
        {(i) => (
          <Select id={i} value={f.tipo} onChange={(x) => setF({ ...f, tipo: x.target.value })}>
            <option value="merma">Merma</option>
            <option value="vinagre">Destino a vinagre</option>
            <option value="ajuste">Ajuste de inventario (+/−)</option>
          </Select>
        )}
      </Field>
      <Field label="Estanque" required>
        {(i) => (
          <Select
            id={i}
            value={f.estanqueId}
            onChange={(x) => setF({ ...f, estanqueId: x.target.value, loteId: lotesEnEstanque(x.target.value, datos.movs)[0]?.loteId ?? '' })}
            required
          >
            <option value="" disabled>
              Elige…
            </option>
            {datos.estanques.map((x) => (
              <option key={x.id} value={x.id}>
                {x.codigo} · {L(litrosEstanque(x.id, datos.movs))}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <SelectLote
        lotes={(e ? lotesEnEstanque(e.id, datos.movs) : []).map((l) => ({
          id: l.loteId,
          codigo: datos.loteById.get(l.loteId)?.codigo ?? '—',
          extra: L(l.litros)
        }))}
        value={f.loteId}
        onChange={(v) => setF({ ...f, loteId: v })}
      />
      <Field label="Litros" unit="L" required>
        {(i) => (
          <Input id={i} type="number" step="any" value={f.litros} onChange={(x) => setF({ ...f, litros: x.target.value })} className="tabular" required />
        )}
      </Field>
      <Field label="Motivo" required>
        {(i) => (
          <>
            <Input id={i} list="motivos-salida" value={f.motivo} onChange={(x) => setF({ ...f, motivo: x.target.value })} required />
            <datalist id="motivos-salida">
              {MOTIVOS_SALIDA.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </>
        )}
      </Field>
    </OperacionDialog>
  );
}

/* ------------------------------ Movimientos y balance ------------------------------ */

function Movimientos({ datos }: { datos: Datos }) {
  const can = useCan();
  const engine = useSync();
  const toast = useToast();
  const [tipo, setTipo] = useState('');
  const [estanque, setEstanque] = useState('');
  const delaTemporada = new Set(datos.lotes.filter((l) => l.temporadaId === datos.elegida?.id).map((l) => l.id));
  const rows = datos.movs
    .filter((m) => delaTemporada.has(m.loteId) && (!tipo || m.tipo === tipo) && (!estanque || m.estanqueId === estanque))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  async function eliminar(m: MovRow) {
    if (m.tipo === 'envasado' || m.tipo === 'venta_granel') return toast(`Se gestiona desde ${m.tipo === 'envasado' ? 'Envasado' : 'Ventas'}.`);
    const grupo = m.grupo ? datos.movs.filter((x) => x.grupo === m.grupo) : [m];
    if (
      !confirm(
        grupo.length > 1
          ? 'Se eliminará el trasiego completo (salida, entrada y merma asociada).'
          : 'Se eliminará el movimiento y el stock del estanque se recalculará.'
      )
    )
      return;
    await engine?.escribirGrupo(grupo.map((x) => ({ entity: 'mov_bodega', op: 'delete', id: x.id })));
    toast('Movimiento eliminado.');
  }
  const cols: Column<MovRow>[] = [
    { key: 'fecha', label: 'Fecha', render: (m) => fecha(m.fecha) },
    {
      key: 'tipo',
      label: 'Tipo',
      value: (m) => TIPO_MOV[m.tipo] ?? m.tipo,
      render: (m) => <Badge tone={Number(m.litros) > 0 ? 'ok' : m.tipo === 'merma' || m.tipo === 'vinagre' ? 'warn' : 'info'}>{TIPO_MOV[m.tipo]}</Badge>
    },
    {
      key: 'estanque',
      label: 'Estanque',
      value: (m) => datos.estanqueById.get(m.estanqueId)?.codigo ?? '',
      render: (m) => <Codigo codigo={datos.estanqueById.get(m.estanqueId)?.codigo ?? '—'} pending={m._pending} />
    },
    { key: 'lote', label: 'Lote', value: (m) => datos.loteById.get(m.loteId)?.codigo ?? '' },
    {
      key: 'litros',
      label: 'Litros',
      num: true,
      value: (m) => Number(m.litros),
      render: (m) => (
        <span className={cn('font-semibold', Number(m.litros) > 0 && 'text-ok')}>
          {Number(m.litros) > 0 ? '+' : ''}
          {L(Number(m.litros))}
        </span>
      )
    },
    {
      key: 'detalle',
      label: 'Detalle',
      value: (m) => m.glosa ?? m.motivo ?? '',
      render: (m) => <span className="text-ink-2">{m.glosa ?? m.motivo ?? '—'}</span>
    }
  ];
  return (
    <DataTable
      rows={rows}
      columns={cols}
      onRowClick={can('bodega', 'd') ? (m) => void eliminar(m) : undefined}
      exportName={`movimientos-bodega-${datos.elegida?.anio ?? ''}`}
      canExport={can('bodega', 'x')}
      toolbar={
        <>
          <Select aria-label="Tipo de movimiento" value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-9 w-auto text-[14px]">
            <option value="">Todos los tipos</option>
            {TIPOS_MOV_BODEGA.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select aria-label="Estanque" value={estanque} onChange={(e) => setEstanque(e.target.value)} className="h-9 w-auto text-[14px]">
            <option value="">Todos los estanques</option>
            {datos.estanques.map((e) => (
              <option key={e.id} value={e.id}>
                {e.codigo}
              </option>
            ))}
          </Select>
        </>
      }
      empty={
        <EmptyState
          icon={<ArrowRightLeft size={28} strokeWidth={1.5} />}
          title={`Sin movimientos en la temporada ${datos.elegida?.anio ?? ''}`}
          text="Registra entradas, trasiegos y mermas desde los botones de arriba."
        />
      }
    />
  );
}

function Balance({ datos }: { datos: Datos }) {
  const can = useCan();
  const rows = datos.lotes
    .filter((l) => l.temporadaId === datos.elegida?.id && datos.movs.some((m) => m.loteId === l.id))
    .map((l) => {
      const b = balanceLote(l.id, datos.movs);
      const kg = datos.cosechas.filter((c) => c.loteId === l.id).reduce((a, c) => a + Number(c.kg), 0);
      return { ...l, ...b, kg, lkg: rendimientoLKg(b.entradas, kg) };
    });
  type Row = (typeof rows)[number];
  const cols: Column<Row>[] = [
    { key: 'codigo', label: 'Lote', render: (r) => <Codigo codigo={r.codigo} pending={r._pending} /> },
    { key: 'tipo', label: 'Tipo', render: (r) => <TipoUva tipo={r.tipo} /> },
    { key: 'kg', label: 'Kg uva', num: true, value: (r) => r.kg, render: (r) => (r.kg ? Math.round(r.kg).toLocaleString('es-CL') : '—') },
    { key: 'entradas', label: 'Entradas', num: true, value: (r) => r.entradas, render: (r) => L(r.entradas) },
    {
      key: 'lkg',
      label: 'L/kg',
      num: true,
      value: (r) => r.lkg ?? 0,
      render: (r) => (r.lkg != null ? r.lkg.toLocaleString('es-CL', { maximumFractionDigits: 3 }) : '—')
    },
    { key: 'envasado', label: 'Envasado', num: true, value: (r) => r.envasado, render: (r) => L(r.envasado) },
    { key: 'ventaGranel', label: 'Granel', num: true, value: (r) => r.ventaGranel, render: (r) => L(r.ventaGranel) },
    {
      key: 'merma',
      label: 'Mermas',
      num: true,
      value: (r) => r.merma,
      render: (r) => (
        <span className={r.pctMerma > 0.03 ? 'font-semibold text-warn' : ''}>
          {L(r.merma)} <span className="text-ink-3">({(r.pctMerma * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })} %)</span>
        </span>
      )
    },
    { key: 'vinagre', label: 'Vinagre', num: true, value: (r) => r.vinagre, render: (r) => L(r.vinagre) },
    { key: 'ajustes', label: 'Ajustes', num: true, value: (r) => r.ajustes, render: (r) => L(r.ajustes) },
    { key: 'stock', label: 'Stock', num: true, value: (r) => r.stock, render: (r) => <b>{L(r.stock)}</b> }
  ];
  return (
    <>
      <p className="mb-4 max-w-3xl text-[13px] text-ink-2">
        Entradas = stock + envasado + granel vendido + mermas + vinagre ± ajustes. El rendimiento en litros por kg de uva cosechada sirve para detectar
        pérdidas: un tinto suele rendir entre 0,65 y 0,75 L/kg.
      </p>
      <DataTable
        rows={rows}
        columns={cols}
        exportName={`balance-masa-${datos.elegida?.anio ?? ''}`}
        canExport={can('bodega', 'x')}
        empty={
          <EmptyState
            icon={<Droplets size={28} strokeWidth={1.5} />}
            title="Sin lotes con movimientos"
            text="El balance aparece cuando un lote tiene su primera entrada a bodega."
          />
        }
      />
    </>
  );
}
