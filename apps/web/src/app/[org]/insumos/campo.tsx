'use client';
/** Pestañas Aplicaciones y Labores (offline): se registran en el cuartel sin señal y se sincronizan al volver. */
import {
  cantidadSugerida,
  clp,
  cosecharDesde,
  costoAplicacion,
  costoLabor,
  fechaHoy,
  TIPOS_LABOR,
  type Aplicacion,
  type Cuartel,
  type Labor
} from '@winzer/domain';
import { FlaskConical, Hammer, Plus } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useCan, useTemporadaElegida, useTemporadaParaFecha } from '@/components/shell/org-context';
import { Badge, Codigo } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { EmptyState, Stat, StatGrid } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { useEntity, useSync } from '@/lib/offline/hooks';
import { useStock, type InsumoRow } from './comun';

type Pend = { _pending: boolean; _version: number };
type AplRow = Aplicacion & Pend;
type LaborRow = Labor & Pend;
type CuartelRow = Cuartel & Pend;

const nf = (v: number) => v.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const fecha = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });

function useCuarteles() {
  const cuarteles = useEntity<Cuartel>('cuartel') as CuartelRow[] | undefined;
  const ordenados = useMemo(() => (cuarteles ?? []).slice().sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })), [cuarteles]);
  const porId = useMemo(() => new Map(ordenados.map((c) => [c.id, c])), [ordenados]);
  return { cuarteles: ordenados, porId, cargando: !cuarteles };
}

/** Guarda con el motor offline y muestra errores por campo (Zod) o generales. */
function useGuardar(entity: string, onClose: () => void) {
  const engine = useSync();
  const toast = useToast();
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function guardar(id: string | null, data: Record<string, unknown>, ok: string) {
    if (!engine) return;
    try {
      await engine.write(entity, 'upsert', id, data);
      toast(navigator.onLine ? ok : `${ok} Guardado en este equipo; se enviará al recuperar la señal.`);
      onClose();
    } catch (e) {
      const err = e as Error & { issues?: { path: PropertyKey[]; message: string }[] };
      setErrors(err.issues ? Object.fromEntries(err.issues.map((i) => [String(i.path[0]), i.message])) : { _: err.message });
    }
  }
  async function eliminar(id: string, ok: string) {
    await engine?.write(entity, 'delete', id);
    toast(ok);
    onClose();
  }
  return { errors, guardar, eliminar };
}

function FiltroCuartel({ cuarteles, value, onChange }: { cuarteles: CuartelRow[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select aria-label="Cuartel" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-auto text-[14px]">
      <option value="">Todos los cuarteles</option>
      {cuarteles.map((c) => (
        <option key={c.id} value={c.id}>
          {c.codigo}
        </option>
      ))}
    </Select>
  );
}

function ErrorGeneral({ errors, className }: { errors: Record<string, string>; className?: string }) {
  const msg = errors._ ?? errors.temporadaId;
  if (!msg) return null;
  return (
    <p role="alert" className={`rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad ${className ?? ''}`}>
      {msg}
    </p>
  );
}

/* ------------------------------ Aplicaciones ------------------------------ */

export function AplicacionesTab({ tabs }: { tabs: (acciones: ReactNode) => ReactNode }) {
  const can = useCan();
  const elegida = useTemporadaElegida();
  const { cuarteles, porId, cargando } = useCuarteles();
  const { insumos, stock } = useStock();
  const registros = useEntity<Aplicacion>('aplicacion') as AplRow[] | undefined;
  const [cuartel, setCuartel] = useState('');
  const [editing, setEditing] = useState<AplRow | 'new' | null>(null);
  const hoy = fechaHoy();
  const insumoPorId = useMemo(() => new Map((insumos ?? []).map((i) => [i.id, i])), [insumos]);
  const rows = useMemo(
    () =>
      (registros ?? []).filter((r) => r.temporadaId === elegida?.id && (!cuartel || r.cuartelId === cuartel)).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [registros, elegida, cuartel]
  );
  const total = rows.reduce((a, r) => a + Number(r.costo || 0), 0);
  const vigentes = rows.filter((r) => r.carencia && cosecharDesde(r.fecha, r.carencia) > hoy).length;

  const acciones = can('insumos', 'c') && (
    <Button variant="primary" onClick={() => setEditing('new')}>
      <Plus size={16} /> Registrar aplicación
    </Button>
  );
  if (!registros || cargando || !insumos)
    return (
      <>
        {tabs(acciones)}
        <div className="h-64 animate-pulse rounded-card bg-sunken" aria-label="Cargando aplicaciones" />
      </>
    );

  const cols: Column<AplRow>[] = [
    { key: 'fecha', label: 'Fecha', render: (r) => fecha(r.fecha) },
    {
      key: 'cuartel',
      label: 'Cuartel',
      value: (r) => porId.get(r.cuartelId)?.codigo ?? '',
      render: (r) => <Codigo codigo={porId.get(r.cuartelId)?.codigo ?? '—'} pending={r._pending} />
    },
    { key: 'insumo', label: 'Insumo', value: (r) => insumoPorId.get(r.insumoId)?.nombre ?? '' },
    {
      key: 'dosis',
      label: 'Dosis/ha',
      num: true,
      value: (r) => Number(r.dosis),
      render: (r) => `${nf(Number(r.dosis))} ${insumoPorId.get(r.insumoId)?.unidad ?? ''}`
    },
    {
      key: 'cantidad',
      label: 'Cantidad',
      num: true,
      value: (r) => Number(r.cantidad),
      render: (r) => `${nf(Number(r.cantidad))} ${insumoPorId.get(r.insumoId)?.unidad ?? ''}`
    },
    { key: 'costo', label: 'Costo', num: true, value: (r) => Number(r.costo), render: (r) => clp(r.costo) },
    {
      key: 'carencia',
      label: 'Cosechar desde',
      value: (r) => (r.carencia ? cosecharDesde(r.fecha, r.carencia) : ''),
      render: (r) => {
        if (!r.carencia) return <span className="text-ink-4">—</span>;
        const libre = cosecharDesde(r.fecha, r.carencia);
        return libre > hoy ? <Badge tone="warn">{fecha(libre)}</Badge> : <span className="text-ink-2">{fecha(libre)}</span>;
      }
    }
  ];

  return (
    <>
      {tabs(acciones)}
      <StatGrid>
        <Stat label="Aplicaciones" value={rows.length} sub={`temporada ${elegida?.anio ?? ''}`} icon={<FlaskConical size={16} strokeWidth={1.6} />} />
        <Stat label="Costo de aplicaciones" value={clp(total)} sub={cuartel ? `cuartel ${porId.get(cuartel)?.codigo}` : 'todos los cuarteles'} />
        <Stat label="Carencias vigentes" value={vigentes} sub="no cosechar todavía" />
      </StatGrid>
      <DataTable
        rows={rows}
        columns={cols}
        onRowClick={can('insumos', 'e') ? (r) => setEditing(r) : undefined}
        exportName={`aplicaciones-${elegida?.anio ?? ''}`}
        canExport={can('insumos', 'x')}
        toolbar={<FiltroCuartel cuarteles={cuarteles} value={cuartel} onChange={setCuartel} />}
        empty={
          <EmptyState
            icon={<FlaskConical size={28} strokeWidth={1.5} />}
            title={`Sin aplicaciones en la temporada ${elegida?.anio ?? ''}`}
            text="Registra cada aplicación con su dosis por hectárea: descuenta el stock del insumo y calcula desde cuándo se puede cosechar."
          />
        }
      />
      {editing && (
        <AplicacionDialog
          registro={editing === 'new' ? null : editing}
          cuarteles={cuarteles}
          insumos={(insumos ?? []).filter((i) => i.categoria === 'agricola' || (editing !== 'new' && i.id === editing.insumoId))}
          stock={stock}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function AplicacionDialog({
  registro,
  cuarteles,
  insumos,
  stock,
  onClose
}: {
  registro: AplRow | null;
  cuarteles: CuartelRow[];
  insumos: InsumoRow[];
  stock: Map<string, number>;
  onClose: () => void;
}) {
  const can = useCan();
  const r = registro;
  const temporadaPara = useTemporadaParaFecha();
  const { errors, guardar, eliminar } = useGuardar('aplicacion', onClose);
  const [f, setF] = useState({
    fecha: r?.fecha ?? fechaHoy(),
    cuartelId: r?.cuartelId ?? '',
    insumoId: r?.insumoId ?? '',
    dosis: r?.dosis != null ? String(r.dosis) : '',
    cantidad: r?.cantidad != null ? String(r.cantidad) : '',
    carencia: r?.carencia != null ? String(r.carencia) : ''
  });
  const [cantidadTocada, setCantidadTocada] = useState(!!r);
  const cuartel = cuarteles.find((c) => c.id === f.cuartelId);
  const insumo = insumos.find((i) => i.id === f.insumoId);
  const sugerida = cuartel && f.dosis !== '' ? cantidadSugerida(f.dosis, cuartel.superficie) : null;
  const cantidad = f.cantidad !== '' ? Number(f.cantidad) : (sugerida ?? 0);
  const costo = insumo ? costoAplicacion(cantidad, insumo.precio) : 0;
  // Disponible: el stock local más lo que esta misma aplicación ya descontó (al editar).
  const disponible = insumo ? (stock.get(insumo.id) ?? 0) + (r && r.insumoId === insumo.id ? Number(r.cantidad) : 0) : null;
  const t = temporadaPara(f.fecha);

  function set<K extends keyof typeof f>(k: K, v: string) {
    setF((x) => {
      const n = { ...x, [k]: v };
      if (k === 'insumoId') n.carencia = String(insumos.find((i) => i.id === v)?.carencia ?? '');
      // La cantidad sigue a la sugerida mientras el usuario no la escriba.
      if ((k === 'dosis' || k === 'cuartelId') && !cantidadTocada) {
        const c = cuarteles.find((q) => q.id === n.cuartelId);
        n.cantidad = c && n.dosis !== '' ? String(cantidadSugerida(n.dosis, c.superficie)) : '';
      }
      return n;
    });
  }
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    void guardar(r?.id ?? null, { ...data, temporadaId: t.temporada?.id ?? '', costo }, r ? 'Aplicación actualizada.' : 'Aplicación registrada.');
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={r ? 'Editar aplicación' : 'Registrar aplicación'}
      description="Descuenta el insumo del stock al sincronizar. El costo y la carencia quedan con los valores del insumo de hoy."
      footer={
        <>
          {r && can('insumos', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              onClick={() => confirm('¿Eliminar esta aplicación? Se devuelve el stock.') && void eliminar(r.id, 'Aplicación eliminada.')}
            >
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="aplicacion-form" variant="primary" disabled={!!t.error}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="aplicacion-form" onSubmit={submit} className="grid gap-x-6 gap-y-4 sm:grid-cols-[1fr_15rem]">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Fecha"
            required
            error={errors.fecha ?? t.error ?? undefined}
            hint={t.temporada && !t.error ? `Temporada ${t.temporada.anio}` : undefined}
          >
            {(id, d) => <Input id={id} name="fecha" type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} aria-describedby={d} required />}
          </Field>
          <Field label="Cuartel" required error={errors.cuartelId}>
            {(id, d) => (
              <Select id={id} name="cuartelId" value={f.cuartelId} onChange={(e) => set('cuartelId', e.target.value)} aria-describedby={d} required>
                <option value="" disabled>
                  Elige…
                </option>
                {cuarteles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} · {nf(Number(c.superficie))} ha
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Insumo"
            required
            error={errors.insumoId}
            className="sm:col-span-2"
            hint={insumos.length === 0 ? 'No hay insumos agrícolas: créalos en la pestaña Insumos (con conexión).' : undefined}
          >
            {(id, d) => (
              <Select id={id} name="insumoId" value={f.insumoId} onChange={(e) => set('insumoId', e.target.value)} aria-describedby={d} required>
                <option value="" disabled>
                  Elige…
                </option>
                {insumos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nombre} ({i.unidad})
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Dosis por hectárea" unit={insumo ? `${insumo.unidad}/ha` : undefined} required error={errors.dosis}>
            {(id, d) => (
              <Input
                id={id}
                name="dosis"
                type="number"
                min={0}
                step="any"
                value={f.dosis}
                onChange={(e) => set('dosis', e.target.value)}
                className="tabular"
                aria-describedby={d}
                required
              />
            )}
          </Field>
          <Field
            label="Cantidad aplicada"
            unit={insumo?.unidad}
            required
            error={errors.cantidad}
            hint={sugerida != null ? `Sugerida: ${nf(sugerida)} (dosis × ${nf(Number(cuartel!.superficie))} ha)` : undefined}
          >
            {(id, d) => (
              <Input
                id={id}
                name="cantidad"
                type="number"
                min={0}
                step="any"
                value={f.cantidad}
                onChange={(e) => {
                  setCantidadTocada(true);
                  set('cantidad', e.target.value);
                }}
                className="tabular"
                aria-describedby={d}
                required
              />
            )}
          </Field>
          <Field label="Carencia" unit="días" error={errors.carencia}>
            {(id, d) => (
              <Input
                id={id}
                name="carencia"
                type="number"
                min={0}
                step={1}
                value={f.carencia}
                onChange={(e) => set('carencia', e.target.value)}
                className="tabular"
                aria-describedby={d}
              />
            )}
          </Field>
          <Field label="Responsable">{(id) => <Input id={id} name="responsable" defaultValue={r?.responsable ?? ''} />}</Field>
          <Field label="Observaciones" className="sm:col-span-2">
            {(id) => <Textarea id={id} name="observaciones" defaultValue={r?.observaciones ?? ''} />}
          </Field>
        </div>
        <aside aria-label="Cálculo" className="self-start rounded-card bg-sunken px-4 py-3 text-[13px]">
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
            <dt className="text-ink-3">Precio</dt>
            <dd className="text-right tabular">{insumo ? `${clp(insumo.precio)} / ${insumo.unidad}` : '—'}</dd>
            <dt className="text-ink-3">Costo</dt>
            <dd className="text-right font-semibold tabular">{insumo ? clp(costo) : '—'}</dd>
            <dt className="text-ink-3">Costo por ha</dt>
            <dd className="text-right tabular">{insumo && cuartel && Number(cuartel.superficie) ? clp(costo / Number(cuartel.superficie)) : '—'}</dd>
            <dt className="text-ink-3">Stock disponible</dt>
            <dd className={`text-right tabular ${disponible != null && cantidad > disponible ? 'font-semibold text-bad' : ''}`}>
              {disponible != null ? `${nf(disponible)} ${insumo!.unidad}` : '—'}
            </dd>
            <dt className="text-ink-3">Cosechar desde</dt>
            <dd className="text-right font-semibold tabular">{f.carencia ? fecha(cosecharDesde(f.fecha, f.carencia)) : '—'}</dd>
          </dl>
          {disponible != null && cantidad > disponible && (
            <p className="mt-2 text-[12px] text-bad">La cantidad supera el stock registrado. Se guarda igual; revisa el inventario.</p>
          )}
        </aside>
        <ErrorGeneral errors={errors} className="sm:col-span-2" />
      </form>
    </Dialog>
  );
}

/* ------------------------------ Labores ------------------------------ */

export function LaboresTab({ tabs, valorJornada }: { tabs: (acciones: ReactNode) => ReactNode; valorJornada: number }) {
  const can = useCan();
  const elegida = useTemporadaElegida();
  const { cuarteles, porId, cargando } = useCuarteles();
  const registros = useEntity<Labor>('labor') as LaborRow[] | undefined;
  const [cuartel, setCuartel] = useState('');
  const [editing, setEditing] = useState<LaborRow | 'new' | null>(null);
  const rows = useMemo(
    () =>
      (registros ?? []).filter((r) => r.temporadaId === elegida?.id && (!cuartel || r.cuartelId === cuartel)).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [registros, elegida, cuartel]
  );
  const total = rows.reduce((a, r) => a + Number(r.costo || 0), 0);
  const jornadas = rows.reduce((a, r) => a + Number(r.jornadas || 0), 0);

  const acciones = can('insumos', 'c') && (
    <Button variant="primary" onClick={() => setEditing('new')}>
      <Plus size={16} /> Registrar labor
    </Button>
  );
  if (!registros || cargando)
    return (
      <>
        {tabs(acciones)}
        <div className="h-64 animate-pulse rounded-card bg-sunken" aria-label="Cargando labores" />
      </>
    );

  const cols: Column<LaborRow>[] = [
    { key: 'fecha', label: 'Fecha', render: (r) => fecha(r.fecha) },
    {
      key: 'cuartel',
      label: 'Cuartel',
      value: (r) => porId.get(r.cuartelId)?.codigo ?? '',
      render: (r) => <Codigo codigo={porId.get(r.cuartelId)?.codigo ?? '—'} pending={r._pending} />
    },
    { key: 'tipo', label: 'Labor' },
    {
      key: 'jornadas',
      label: 'Jornadas',
      num: true,
      value: (r) => Number(r.jornadas ?? 0),
      render: (r) => (r.jornadas != null ? nf(Number(r.jornadas)) : '—')
    },
    { key: 'costo', label: 'Costo', num: true, value: (r) => Number(r.costo), render: (r) => clp(r.costo) },
    { key: 'responsable', label: 'Responsable', value: (r) => r.responsable ?? '', render: (r) => r.responsable ?? <span className="text-ink-4">—</span> }
  ];

  return (
    <>
      {tabs(acciones)}
      <StatGrid>
        <Stat label="Labores" value={rows.length} sub={`temporada ${elegida?.anio ?? ''}`} icon={<Hammer size={16} strokeWidth={1.6} />} />
        <Stat label="Costo de labores" value={clp(total)} sub={cuartel ? `cuartel ${porId.get(cuartel)?.codigo}` : 'todos los cuarteles'} />
        <Stat label="Jornadas" value={nf(jornadas)} />
      </StatGrid>
      <DataTable
        rows={rows}
        columns={cols}
        onRowClick={can('insumos', 'e') ? (r) => setEditing(r) : undefined}
        exportName={`labores-${elegida?.anio ?? ''}`}
        canExport={can('insumos', 'x')}
        toolbar={<FiltroCuartel cuarteles={cuarteles} value={cuartel} onChange={setCuartel} />}
        empty={
          <EmptyState
            icon={<Hammer size={28} strokeWidth={1.5} />}
            title={`Sin labores en la temporada ${elegida?.anio ?? ''}`}
            text="Registra poda, amarra, desbrote y otras labores con sus jornadas: el costo por cuartel queda listo para el análisis de costos."
          />
        }
      />
      {editing && (
        <LaborDialog registro={editing === 'new' ? null : editing} cuarteles={cuarteles} valorJornada={valorJornada} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function LaborDialog({
  registro,
  cuarteles,
  valorJornada,
  onClose
}: {
  registro: LaborRow | null;
  cuarteles: CuartelRow[];
  valorJornada: number;
  onClose: () => void;
}) {
  const can = useCan();
  const r = registro;
  const temporadaPara = useTemporadaParaFecha();
  const { errors, guardar, eliminar } = useGuardar('labor', onClose);
  const [f, setF] = useState({
    fecha: r?.fecha ?? fechaHoy(),
    jornadas: r?.jornadas != null ? String(r.jornadas) : '',
    valorJornada: String(r?.valorJornada ?? valorJornada),
    otrosCostos: r?.otrosCostos != null ? String(r.otrosCostos) : ''
  });
  const t = temporadaPara(f.fecha);
  const manoObra = Number(f.jornadas || 0) * Number(f.valorJornada || 0);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    void guardar(r?.id ?? null, { ...data, temporadaId: t.temporada?.id ?? '' }, r ? 'Labor actualizada.' : 'Labor registrada.');
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={r ? 'Editar labor' : 'Registrar labor'}
      description="Costo = jornadas × valor de la jornada + otros costos."
      footer={
        <>
          {r && can('insumos', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              onClick={() => confirm('¿Eliminar esta labor?') && void eliminar(r.id, 'Labor eliminada.')}
            >
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="labor-form" variant="primary" disabled={!!t.error}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="labor-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha" required error={errors.fecha ?? t.error ?? undefined} hint={t.temporada && !t.error ? `Temporada ${t.temporada.anio}` : undefined}>
          {(id, d) => (
            <Input id={id} name="fecha" type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} aria-describedby={d} required />
          )}
        </Field>
        <Field label="Cuartel" required error={errors.cuartelId}>
          {(id, d) => (
            <Select id={id} name="cuartelId" defaultValue={r?.cuartelId ?? ''} aria-describedby={d} required>
              <option value="" disabled>
                Elige…
              </option>
              {cuarteles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Labor" required error={errors.tipo}>
          {(id, d) => (
            <>
              <Input id={id} name="tipo" list="tipos-labor" defaultValue={r?.tipo ?? ''} aria-describedby={d} required />
              <datalist id="tipos-labor">
                {TIPOS_LABOR.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Jornadas" error={errors.jornadas}>
          {(id, d) => (
            <Input
              id={id}
              name="jornadas"
              type="number"
              min={0}
              step="any"
              value={f.jornadas}
              onChange={(e) => setF({ ...f, jornadas: e.target.value })}
              className="tabular"
              aria-describedby={d}
            />
          )}
        </Field>
        <Field label="Valor de la jornada" unit="CLP" error={errors.valorJornada}>
          {(id, d) => (
            <Input
              id={id}
              name="valorJornada"
              type="number"
              min={0}
              step={1}
              value={f.valorJornada}
              onChange={(e) => setF({ ...f, valorJornada: e.target.value })}
              className="tabular"
              aria-describedby={d}
            />
          )}
        </Field>
        <Field label="Otros costos" unit="CLP" error={errors.otrosCostos}>
          {(id, d) => (
            <Input
              id={id}
              name="otrosCostos"
              type="number"
              min={0}
              step={1}
              value={f.otrosCostos}
              onChange={(e) => setF({ ...f, otrosCostos: e.target.value })}
              className="tabular"
              aria-describedby={d}
            />
          )}
        </Field>
        <Field label="Responsable">{(id) => <Input id={id} name="responsable" defaultValue={r?.responsable ?? ''} />}</Field>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 self-end rounded-card bg-sunken px-4 py-3 text-[13px]">
          <dt className="text-ink-3">Mano de obra</dt>
          <dd className="text-right tabular">{clp(manoObra)}</dd>
          <dt className="text-ink-3">Total</dt>
          <dd className="text-right font-semibold tabular">{clp(costoLabor(f))}</dd>
        </dl>
        <ErrorGeneral errors={errors} className="sm:col-span-2" />
      </form>
    </Dialog>
  );
}
