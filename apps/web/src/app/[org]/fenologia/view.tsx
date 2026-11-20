'use client';
import {
  BBCH,
  doyTemporada,
  duracionDesborre,
  fechaHoy,
  gdDia,
  gdTemporada,
  MESES_GD,
  regionWinkler,
  type Clima,
  type Cuartel,
  type Fenologia
} from '@winzer/domain';
import { Plus, Sprout, Thermometer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCan, useOrg, useTemporadaElegida, useTemporadaParaFecha, type TemporadaCtx } from '@/components/shell/org-context';
import { Codigo } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BarrasAgrupadas, ChartCard, Lineas, type ColorSerie, type Serie } from '@/components/ui/chart';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { EmptyState, PageHeader, Stat, StatGrid } from '@/components/ui/page';
import { Tabs, useTab } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { useEntity, useSync } from '@/lib/offline/hooks';

type Pend = { _pending: boolean; _version: number };
type FenRow = Fenologia & Pend;
type ClimaRow = Clima & Pend;

const TABS = [
  { id: 'desborre', label: 'Desborre y fenología' },
  { id: 'clima', label: 'Temperaturas y grados día' }
] as const;

const fecha = (d?: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : '—');
const dec1 = (v: number) => v.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Día de temporada (desde el 1 de julio) → "12 sep". */
const diaComoFecha = (doy: number) =>
  new Date(Date.UTC(2001, 6, 1) + doy * 86_400_000).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** La temporada elegida y hasta dos anteriores, con su color ordinal (t0 = elegida). */
function useTresTemporadas() {
  const { temporadas } = useOrg();
  const elegida = useTemporadaElegida();
  return useMemo(() => {
    if (!elegida) return [];
    const colores: ColorSerie[] = ['t2', 't1', 't0'];
    return [elegida.anio - 2, elegida.anio - 1, elegida.anio]
      .map((anio) => temporadas.find((t) => t.anio === anio))
      .map((t, i) => (t ? { t, color: colores[i]! } : null))
      .filter((x): x is { t: TemporadaCtx; color: ColorSerie } => !!x);
  }, [temporadas, elegida]);
}

export function FenologiaView({ tbase }: { tbase: number }) {
  const [tab, setTab] = useTab(TABS);
  const can = useCan();
  const [nuevo, setNuevo] = useState(false);
  const tabs = (
    <Tabs
      tabs={TABS}
      actual={tab}
      onChange={setTab}
      acciones={
        can('fenologia', 'c') && (
          <Button variant="primary" onClick={() => setNuevo(true)}>
            <Plus size={16} /> {tab === 'desborre' ? 'Registrar desborre' : 'Registrar día'}
          </Button>
        )
      }
    />
  );
  return (
    <>
      <PageHeader
        area="Operación"
        title="Desborre y fenología"
        description="Fechas de desborre y estados fenológicos por cuartel, y temperaturas diarias con sus grados día. Funciona sin señal."
      />
      {tabs}
      {tab === 'desborre' ? (
        <Desborre nuevo={nuevo} onCerrar={() => setNuevo(false)} />
      ) : (
        <ClimaTab tbase={tbase} nuevo={nuevo} onCerrar={() => setNuevo(false)} />
      )}
    </>
  );
}

/* ------------------------------ Desborre ------------------------------ */

function Desborre({ nuevo, onCerrar }: { nuevo: boolean; onCerrar: () => void }) {
  const can = useCan();
  const elegida = useTemporadaElegida();
  const tres = useTresTemporadas();
  const cuarteles = useEntity<Cuartel>('cuartel') as (Cuartel & Pend)[] | undefined;
  const registros = useEntity<Fenologia>('fenologia') as FenRow[] | undefined;
  const [editing, setEditing] = useState<FenRow | null>(null);

  const porCuartel = useMemo(() => new Map((cuarteles ?? []).map((c) => [c.id, c])), [cuarteles]);
  const codigos = useMemo(() => (cuarteles ?? []).slice().sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })), [cuarteles]);
  const rows = useMemo(
    () =>
      (registros ?? [])
        .filter((r) => r.temporadaId === elegida?.id)
        .sort((a, b) => (porCuartel.get(a.cuartelId)?.codigo ?? '').localeCompare(porCuartel.get(b.cuartelId)?.codigo ?? '', 'es', { numeric: true })),
    [registros, elegida, porCuartel]
  );
  const series: Serie[] = tres.map(({ t, color }) => ({
    id: t.id,
    nombre: `Temporada ${t.anio}`,
    color,
    valores: codigos.map((c) => doyTemporada((registros ?? []).find((r) => r.cuartelId === c.id && r.temporadaId === t.id)?.desborreInicio))
  }));

  if (!registros || !cuarteles) return <div className="h-64 animate-pulse rounded-card bg-sunken" aria-label="Cargando registros" />;

  const cols: Column<FenRow>[] = [
    {
      key: 'cuartel',
      label: 'Cuartel',
      value: (r) => porCuartel.get(r.cuartelId)?.codigo ?? '',
      render: (r) => <Codigo codigo={porCuartel.get(r.cuartelId)?.codigo ?? '—'} pending={r._pending} />
    },
    { key: 'desborreInicio', label: 'Inicio', render: (r) => fecha(r.desborreInicio) },
    { key: 'desborre50', label: '50%', value: (r) => r.desborre50 ?? '', render: (r) => fecha(r.desborre50) },
    { key: 'desborreFin', label: 'Fin', value: (r) => r.desborreFin ?? '', render: (r) => fecha(r.desborreFin) },
    {
      key: 'duracion',
      label: 'Duración',
      num: true,
      value: (r) => duracionDesborre(r) ?? -1,
      render: (r) => (duracionDesborre(r) != null ? `${duracionDesborre(r)} d` : '—')
    },
    { key: 'bbch', label: 'BBCH', value: (r) => r.bbch ?? '', render: (r) => (r.bbch ? r.bbch.split(' — ')[0] : '—') },
    { key: 'floracion', label: 'Floración', value: (r) => r.floracion ?? '', render: (r) => fecha(r.floracion) },
    { key: 'envero', label: 'Envero', value: (r) => r.envero ?? '', render: (r) => fecha(r.envero) }
  ];

  return (
    <>
      {codigos.length > 0 && tres.length > 0 && (
        <ChartCard
          titulo="Inicio de desborre por cuartel"
          nota="Fecha de inicio en las últimas temporadas: una barra más alta es un desborre más tardío."
          className="mb-6"
        >
          <BarrasAgrupadas categorias={codigos.map((c) => c.codigo)} series={series} formato={diaComoFecha} />
        </ChartCard>
      )}
      <DataTable
        rows={rows}
        columns={cols}
        onRowClick={can('fenologia', 'e') ? (r) => setEditing(r) : undefined}
        exportName={`fenologia-${elegida?.anio ?? ''}`}
        canExport={can('fenologia', 'x')}
        empty={
          <EmptyState
            icon={<Sprout size={28} strokeWidth={1.5} />}
            title={`Sin registros en la temporada ${elegida?.anio ?? ''}`}
            text="Registra el inicio del desborre de cada cuartel; con varias temporadas verás si se adelanta o se atrasa."
          />
        }
      />
      {(nuevo || editing) && (
        <FenologiaDialog
          registro={editing}
          cuarteles={codigos}
          registros={registros}
          onClose={() => {
            setEditing(null);
            onCerrar();
          }}
        />
      )}
    </>
  );
}

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
      const err = e as Error & { issues?: { path: PropertyKey[]; message: string }[]; field?: string };
      setErrors(err.issues ? Object.fromEntries(err.issues.map((i) => [String(i.path[0]), i.message])) : { [err.field ?? '_']: err.message });
    }
  }
  async function eliminar(id: string, ok: string) {
    await engine?.write(entity, 'delete', id);
    toast(ok);
    onClose();
  }
  return { errors, setErrors, guardar, eliminar };
}

function FenologiaDialog({
  registro,
  cuarteles,
  registros,
  onClose
}: {
  registro: FenRow | null;
  cuarteles: (Cuartel & Pend)[];
  registros: FenRow[];
  onClose: () => void;
}) {
  const can = useCan();
  const { temporadas } = useOrg();
  const elegida = useTemporadaElegida();
  const r = registro;
  const [temporadaId, setTemporadaId] = useState(
    r?.temporadaId ?? (elegida?.estado === 'abierta' ? elegida.id : (temporadas.find((t) => t.estado === 'abierta')?.id ?? ''))
  );
  const { errors, guardar, eliminar } = useGuardar('fenologia', onClose);
  const ocupados = new Set(registros.filter((x) => x.temporadaId === temporadaId && x.id !== r?.id).map((x) => x.cuartelId));
  const cerrada = temporadas.find((t) => t.id === temporadaId)?.estado === 'cerrada';

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    void guardar(r?.id ?? null, { ...data, temporadaId }, r ? 'Registro actualizado.' : 'Desborre registrado.');
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={r ? `Fenología · ${cuarteles.find((c) => c.id === r.cuartelId)?.codigo ?? ''}` : 'Registrar desborre'}
      description="Fechas del desborre (inicio ≤ 50% ≤ fin) y estados fenológicos de la temporada."
      footer={
        <>
          {r && can('fenologia', 'd') && !cerrada && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              onClick={() => confirm('¿Eliminar este registro?') && void eliminar(r.id, 'Registro eliminado.')}
            >
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="fenologia-form" variant="primary" disabled={cerrada}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="fenologia-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
        <Field label="Cuartel" required error={errors.cuartelId} className="sm:col-span-2">
          {(id, d) => (
            <Select id={id} name="cuartelId" defaultValue={r?.cuartelId ?? ''} aria-describedby={d} required>
              <option value="" disabled>
                Elige un cuartel…
              </option>
              {cuarteles.map((c) => (
                <option key={c.id} value={c.id} disabled={ocupados.has(c.id)}>
                  {c.codigo} · {c.variedad}
                  {ocupados.has(c.id) ? ' (ya registrado)' : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Temporada" required error={cerrada ? 'Temporada cerrada: solo lectura.' : undefined}>
          {(id, d) => (
            <Select id={id} value={temporadaId} onChange={(e) => setTemporadaId(e.target.value)} aria-describedby={d}>
              {[...temporadas].reverse().map((t) => (
                <option key={t.id} value={t.id}>
                  {t.anio}
                  {t.estado === 'cerrada' ? ' · cerrada' : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Inicio del desborre" required error={errors.desborreInicio}>
          {(id, d) => <Input id={id} name="desborreInicio" type="date" defaultValue={r?.desborreInicio ?? fechaHoy()} aria-describedby={d} required />}
        </Field>
        <Field label="50% de desborre" error={errors.desborre50}>
          {(id, d) => <Input id={id} name="desborre50" type="date" defaultValue={r?.desborre50 ?? ''} aria-describedby={d} />}
        </Field>
        <Field label="Fin del desborre" error={errors.desborreFin}>
          {(id, d) => <Input id={id} name="desborreFin" type="date" defaultValue={r?.desborreFin ?? ''} aria-describedby={d} />}
        </Field>
        <Field label="Estado BBCH" className="sm:col-span-3">
          {(id) => (
            <Select id={id} name="bbch" defaultValue={r?.bbch ?? ''}>
              <option value="">—</option>
              {BBCH.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Floración">{(id) => <Input id={id} name="floracion" type="date" defaultValue={r?.floracion ?? ''} />}</Field>
        <Field label="Envero">{(id) => <Input id={id} name="envero" type="date" defaultValue={r?.envero ?? ''} />}</Field>
        <Field label="Observaciones" className="sm:col-span-3">
          {(id) => <Textarea id={id} name="observaciones" defaultValue={r?.observaciones ?? ''} />}
        </Field>
        {errors._ && (
          <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad sm:col-span-3">
            {errors._}
          </p>
        )}
        {errors.temporadaId && (
          <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad sm:col-span-3">
            {errors.temporadaId}
          </p>
        )}
      </form>
    </Dialog>
  );
}

/* ------------------------------ Clima ------------------------------ */

function ClimaTab({ tbase, nuevo, onCerrar }: { tbase: number; nuevo: boolean; onCerrar: () => void }) {
  const can = useCan();
  const elegida = useTemporadaElegida();
  const tres = useTresTemporadas();
  const registros = useEntity<Clima>('clima') as ClimaRow[] | undefined;
  const [editing, setEditing] = useState<ClimaRow | null>(null);

  const rows = useMemo(
    () => (registros ?? []).filter((r) => r.temporadaId === elegida?.id).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [registros, elegida]
  );
  const gd = useMemo(() => gdTemporada(rows, tbase), [rows, tbase]);
  const series: Serie[] = tres.map(({ t, color }) => ({
    id: t.id,
    nombre: `Temporada ${t.anio}`,
    color,
    valores: gdTemporada(
      (registros ?? []).filter((r) => r.temporadaId === t.id),
      tbase
    ).porMes
  }));

  if (!registros) return <div className="h-64 animate-pulse rounded-card bg-sunken" aria-label="Cargando temperaturas" />;

  const cols: Column<ClimaRow>[] = [
    {
      key: 'fecha',
      label: 'Fecha',
      render: (r) => (
        <span className={r._pending ? 'italic' : undefined}>
          {new Date(`${r.fecha}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      )
    },
    { key: 'tmax', label: 'Máx °C', num: true, value: (r) => Number(r.tmax), render: (r) => dec1(Number(r.tmax)) },
    { key: 'tmin', label: 'Mín °C', num: true, value: (r) => Number(r.tmin), render: (r) => dec1(Number(r.tmin)) },
    {
      key: 'media',
      label: 'Media °C',
      num: true,
      value: (r) => (Number(r.tmax) + Number(r.tmin)) / 2,
      render: (r) => dec1((Number(r.tmax) + Number(r.tmin)) / 2)
    },
    { key: 'gd', label: 'GD del día', num: true, value: (r) => gdDia(r.tmax, r.tmin, tbase), render: (r) => <b>{dec1(gdDia(r.tmax, r.tmin, tbase))}</b> },
    { key: 'estacion', label: 'Estación', value: (r) => r.estacion ?? '', render: (r) => r.estacion ?? <span className="text-ink-4">—</span> }
  ];

  return (
    <>
      <StatGrid>
        <Stat
          label="Grados día acumulados"
          value={Math.round(gd.total).toLocaleString('es-CL')}
          sub={`1 sep – 30 abr · base ${tbase} °C`}
          icon={<Thermometer size={16} strokeWidth={1.6} />}
        />
        <Stat
          label="Región de Winkler"
          value={regionWinkler(gd.total).replace(/ \(.+\)/, '')}
          sub={regionWinkler(gd.total).match(/\((.+)\)/)?.[1] ?? 'según los GD acumulados'}
        />
        <Stat label="Días registrados" value={rows.length} sub={`temporada ${elegida?.anio ?? ''}`} />
      </StatGrid>
      {tres.length > 0 && (
        <ChartCard titulo="Grados día acumulados por temporada" nota="Acumulado al último registro de cada mes, de septiembre a abril." className="mb-6">
          <Lineas etiquetasX={MESES_GD.map((m) => m[1])} series={series} formato={(v) => Math.round(v).toLocaleString('es-CL')} unidad="GD" />
        </ChartCard>
      )}
      <DataTable
        rows={rows}
        columns={cols}
        onRowClick={can('fenologia', 'e') ? (r) => setEditing(r) : undefined}
        exportName={`temperaturas-${elegida?.anio ?? ''}`}
        canExport={can('fenologia', 'x')}
        empty={
          <EmptyState
            icon={<Thermometer size={28} strokeWidth={1.5} />}
            title={`Sin temperaturas en la temporada ${elegida?.anio ?? ''}`}
            text="Registra la máxima y la mínima de cada día para calcular los grados día y la región de Winkler."
          />
        }
      />
      {(nuevo || editing) && (
        <ClimaDialog
          registro={editing}
          tbase={tbase}
          estaciones={[...new Set(registros.map((r) => r.estacion).filter(Boolean) as string[])]}
          onClose={() => {
            setEditing(null);
            onCerrar();
          }}
        />
      )}
    </>
  );
}

function ClimaDialog({ registro, tbase, estaciones, onClose }: { registro: ClimaRow | null; tbase: number; estaciones: string[]; onClose: () => void }) {
  const can = useCan();
  const r = registro;
  const temporadaPara = useTemporadaParaFecha();
  const [fechaR, setFechaR] = useState(r?.fecha ?? fechaHoy());
  const [tmax, setTmax] = useState(r?.tmax != null ? String(r.tmax) : '');
  const [tmin, setTmin] = useState(r?.tmin != null ? String(r.tmin) : '');
  const { errors, guardar, eliminar } = useGuardar('clima', onClose);
  const t = temporadaPara(fechaR);
  const listo = tmax !== '' && tmin !== '';

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    void guardar(r?.id ?? null, { ...data, temporadaId: t.temporada?.id ?? '' }, r ? 'Registro actualizado.' : 'Temperatura registrada.');
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={r ? 'Editar temperatura' : 'Registrar día'}
      description={`Grados día = max(0, (Tmáx + Tmín)/2 − ${tbase} °C).`}
      footer={
        <>
          {r && can('fenologia', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              onClick={() => confirm('¿Eliminar este registro?') && void eliminar(r.id, 'Registro eliminado.')}
            >
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="clima-form" variant="primary" disabled={!!t.error}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="clima-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha" required error={errors.fecha ?? t.error ?? undefined} hint={t.temporada && !t.error ? `Temporada ${t.temporada.anio}` : undefined}>
          {(id, d) => <Input id={id} name="fecha" type="date" value={fechaR} onChange={(e) => setFechaR(e.target.value)} aria-describedby={d} required />}
        </Field>
        <Field label="Estación">
          {(id) => (
            <>
              <Input id={id} name="estacion" list="estaciones" defaultValue={r?.estacion ?? estaciones[0] ?? ''} />
              <datalist id="estaciones">
                {estaciones.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Temperatura máxima" unit="°C" required error={errors.tmax}>
          {(id, d) => (
            <Input
              id={id}
              name="tmax"
              type="number"
              step="0.1"
              min={-10}
              max={50}
              value={tmax}
              onChange={(e) => setTmax(e.target.value)}
              className="tabular"
              aria-describedby={d}
              required
            />
          )}
        </Field>
        <Field label="Temperatura mínima" unit="°C" required error={errors.tmin}>
          {(id, d) => (
            <Input
              id={id}
              name="tmin"
              type="number"
              step="0.1"
              min={-15}
              max={40}
              value={tmin}
              onChange={(e) => setTmin(e.target.value)}
              className="tabular"
              aria-describedby={d}
              required
            />
          )}
        </Field>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-card bg-sunken px-4 py-3 text-[13px] sm:col-span-2">
          <dt className="text-ink-3">Temperatura media</dt>
          <dd className="text-right font-semibold tabular">{listo ? `${dec1((Number(tmax) + Number(tmin)) / 2)} °C` : '—'}</dd>
          <dt className="text-ink-3">Grados día</dt>
          <dd className="text-right font-semibold tabular">{listo ? dec1(gdDia(tmax, tmin, tbase)) : '—'}</dd>
        </dl>
        {(errors._ || errors.temporadaId) && (
          <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad sm:col-span-2">
            {errors._ ?? errors.temporadaId}
          </p>
        )}
      </form>
    </Dialog>
  );
}
