'use client';
import {
  clp,
  costoCosecha,
  DESTINOS_COSECHA,
  fechaHoy,
  kgPorCajon,
  kgPorPlanta,
  pagoJornal,
  rendimientoKgHa,
  TARIFAS_JORNAL,
  type Cosecha,
  type Cuartel,
  type Jornal,
  type Lote
} from '@winzer/domain';
import { Grape, Plus, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCan, useTemporadaElegida, useTemporadaParaFecha } from '@/components/shell/org-context';
import { Badge, Codigo } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BarrasH, ChartCard } from '@/components/ui/chart';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { EmptyState, PageHeader, Stat, StatGrid } from '@/components/ui/page';
import { Tabs, useTab } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { useEntity, useSync } from '@/lib/offline/hooks';

type Pend = { _pending: boolean; _version: number };
type CosechaRow = Cosecha & Pend;
type JornalRow = Jornal & Pend;
type CuartelRow = Cuartel & Pend;
type Rango = { min: number; max: number };

const TABS = [
  { id: 'registro', label: 'Registro de cosecha' },
  { id: 'personal', label: 'Personal y pagos' }
] as const;
const DESTINO = Object.fromEntries(DESTINOS_COSECHA) as Record<string, string>;
const TARIFA = { kg: 'kg', cajon: 'cajón', dia: 'día' } as Record<string, string>;
const nf = (v: number, d = 0) => v.toLocaleString('es-CL', { maximumFractionDigits: d });
const fecha = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
const fueraDeRango = (kg: unknown, cajones: unknown, r: Rango) => {
  const x = kgPorCajon(kg, cajones);
  return x != null && (x < r.min || x > r.max);
};

function useDatos() {
  const elegida = useTemporadaElegida();
  const cuarteles = useEntity<Cuartel>('cuartel') as CuartelRow[] | undefined;
  const cosechas = useEntity<Cosecha>('cosecha') as CosechaRow[] | undefined;
  const jornales = useEntity<Jornal>('jornal') as JornalRow[] | undefined;
  const lotes = useEntity<Lote>('lote') as (Lote & Pend)[] | undefined;
  const porCuartel = useMemo(() => new Map((cuarteles ?? []).map((c) => [c.id, c])), [cuarteles]);
  const delaTemporada = useMemo(
    () => (cosechas ?? []).filter((c) => c.temporadaId === elegida?.id).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [cosechas, elegida]
  );
  return { elegida, cuarteles, cosechas, jornales, lotes, porCuartel, delaTemporada, cargando: !cuarteles || !cosechas || !jornales || !lotes };
}

export function CosechaView({ kgCajon }: { kgCajon: Rango }) {
  const [tab, setTab] = useTab(TABS);
  const can = useCan();
  const [abierta, setAbierta] = useState<string | 'nueva' | null>(null);
  const datos = useDatos();
  return (
    <>
      <PageHeader
        area="Operación"
        title="Cosecha"
        description="Kilos y cajones por cuartel, costos de la cosecha y el pago del personal por kg, cajón o día. Funciona sin señal."
      />
      <Tabs
        tabs={TABS}
        actual={tab}
        onChange={setTab}
        acciones={
          can('cosecha', 'c') && (
            <Button variant="primary" onClick={() => setAbierta('nueva')}>
              <Plus size={16} /> Registrar cosecha
            </Button>
          )
        }
      />
      {datos.cargando ? (
        <div className="h-64 animate-pulse rounded-card bg-sunken" aria-label="Cargando cosechas" />
      ) : tab === 'registro' ? (
        <Registro datos={datos} kgCajon={kgCajon} onAbrir={setAbierta} />
      ) : (
        <Personal datos={datos} onAbrir={setAbierta} />
      )}
      {abierta && !datos.cargando && (
        <CosechaDialog id={abierta === 'nueva' ? null : abierta} datos={datos} kgCajon={kgCajon} onAbrir={setAbierta} onClose={() => setAbierta(null)} />
      )}
    </>
  );
}

type Datos = ReturnType<typeof useDatos>;

function Registro({ datos, kgCajon, onAbrir }: { datos: Datos; kgCajon: Rango; onAbrir: (id: string) => void }) {
  const can = useCan();
  const { elegida, cuarteles, jornales, porCuartel, delaTemporada: rows } = datos;
  const k = useMemo(() => {
    const kg = rows.reduce((a, c) => a + Number(c.kg), 0);
    const cajones = rows.reduce((a, c) => a + Number(c.cajones), 0);
    const costo = rows.reduce((a, c) => a + costoCosecha(c, jornales ?? []).total, 0);
    return { kg, cajones, costo };
  }, [rows, jornales]);
  const porCuartelKg = useMemo(
    () =>
      (cuarteles ?? [])
        .slice()
        .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
        .map((c) => ({
          id: c.id,
          etiqueta: c.codigo,
          detalle: c.variedad,
          valor: rows.filter((r) => r.cuartelId === c.id).reduce((a, r) => a + Number(r.kg), 0)
        })),
    [cuarteles, rows]
  );

  const cols: Column<CosechaRow>[] = [
    { key: 'fecha', label: 'Fecha', render: (c) => fecha(c.fecha) },
    {
      key: 'cuartel',
      label: 'Cuartel',
      value: (c) => porCuartel.get(c.cuartelId)?.codigo ?? '',
      render: (c) => <Codigo codigo={porCuartel.get(c.cuartelId)?.codigo ?? '—'} pending={c._pending} />
    },
    { key: 'cajones', label: 'Cajones', num: true, value: (c) => Number(c.cajones), render: (c) => nf(Number(c.cajones)) },
    { key: 'kg', label: 'Kg', num: true, value: (c) => Number(c.kg), render: (c) => <b>{nf(Number(c.kg))}</b> },
    {
      key: 'kgCajon',
      label: 'Kg/cajón',
      num: true,
      value: (c) => kgPorCajon(c.kg, c.cajones) ?? 0,
      render: (c) => {
        const x = kgPorCajon(c.kg, c.cajones);
        if (x == null) return '—';
        return fueraDeRango(c.kg, c.cajones, kgCajon) ? <Badge tone="warn">{nf(x, 1)}</Badge> : nf(x, 1);
      }
    },
    {
      key: 'kgHa',
      label: 'Kg/ha',
      num: true,
      value: (c) => rendimientoKgHa(c.kg, porCuartel.get(c.cuartelId)?.superficie) ?? 0,
      render: (c) => {
        const r = rendimientoKgHa(c.kg, porCuartel.get(c.cuartelId)?.superficie);
        return r == null ? '—' : nf(r);
      }
    },
    { key: 'costo', label: 'Costo', num: true, value: (c) => costoCosecha(c, jornales ?? []).total, render: (c) => clp(costoCosecha(c, jornales ?? []).total) },
    { key: 'porKg', label: '$/kg', num: true, value: (c) => costoCosecha(c, jornales ?? []).porKg, render: (c) => clp(costoCosecha(c, jornales ?? []).porKg) },
    { key: 'destino', label: 'Destino', value: (c) => DESTINO[c.destino] ?? c.destino }
  ];

  return (
    <>
      <StatGrid>
        <Stat label="Kg cosechados" value={nf(k.kg)} sub={`temporada ${elegida?.anio ?? ''}`} icon={<Grape size={16} strokeWidth={1.6} />} />
        <Stat label="Cajones" value={nf(k.cajones)} sub={k.cajones ? `${nf(k.kg / k.cajones, 1)} kg/cajón promedio` : undefined} />
        <Stat label="Costo de cosecha" value={clp(k.costo)} sub="personal + bins + transporte + alimentación" />
        <Stat label="Costo por kg" value={k.kg ? clp(k.costo / k.kg) : '—'} sub="solo costo de cosecha" />
      </StatGrid>
      {rows.length > 0 && (
        <ChartCard titulo="Kg por cuartel" nota={`Temporada ${elegida?.anio ?? ''}`} className="mb-6">
          <BarrasH items={porCuartelKg} formato={(v) => `${nf(v)} kg`} />
        </ChartCard>
      )}
      <DataTable
        rows={rows}
        columns={cols}
        onRowClick={can('cosecha', 'v') ? (c) => onAbrir(c.id) : undefined}
        exportName={`cosecha-${elegida?.anio ?? ''}`}
        canExport={can('cosecha', 'x')}
        empty={
          <EmptyState
            icon={<Grape size={28} strokeWidth={1.5} />}
            title={`Sin cosechas en la temporada ${elegida?.anio ?? ''}`}
            text="Registra cada día de cosecha por cuartel con sus cajones y kilos; después agrega la cuadrilla para calcular el pago."
          />
        }
      />
    </>
  );
}

function Personal({ datos, onAbrir }: { datos: Datos; onAbrir: (id: string) => void }) {
  const can = useCan();
  const { elegida, jornales, porCuartel, delaTemporada } = datos;
  const cosechaPorId = useMemo(() => new Map(delaTemporada.map((c) => [c.id, c])), [delaTemporada]);
  const rows = useMemo(() => (jornales ?? []).filter((j) => cosechaPorId.has(j.cosechaId)), [jornales, cosechaPorId]);
  const total = rows.reduce((a, j) => a + Number(j.pago), 0);
  const cols: Column<JornalRow>[] = [
    { key: 'fecha', label: 'Fecha', value: (j) => cosechaPorId.get(j.cosechaId)?.fecha ?? '', render: (j) => fecha(cosechaPorId.get(j.cosechaId)!.fecha) },
    { key: 'cuartel', label: 'Cuartel', value: (j) => porCuartel.get(cosechaPorId.get(j.cosechaId)!.cuartelId)?.codigo ?? '' },
    {
      key: 'nombre',
      label: 'Nombre / cuadrilla',
      render: (j) => (
        <span className={j._pending ? 'italic' : undefined}>
          {j.nombre}
          {j.cuadrilla && <span className="text-ink-3"> · {j.cuadrilla}</span>}
        </span>
      )
    },
    { key: 'rut', label: 'RUT', value: (j) => j.rut ?? '', render: (j) => j.rut ?? <span className="text-ink-4">—</span> },
    { key: 'trabajadores', label: 'Trab.', num: true },
    { key: 'tarifa', label: 'Tarifa', num: true, value: (j) => Number(j.tarifa), render: (j) => `${clp(j.tarifa)}/${TARIFA[j.tarifaTipo]}` },
    { key: 'cantidad', label: 'Cantidad', num: true, value: (j) => cantidadJornal(j), render: (j) => `${nf(cantidadJornal(j), 1)} ${TARIFA[j.tarifaTipo]}` },
    { key: 'pago', label: 'Pago', num: true, value: (j) => Number(j.pago), render: (j) => <b>{clp(j.pago)}</b> }
  ];
  return (
    <>
      <StatGrid>
        <Stat label="Total a pagar" value={clp(total)} sub={`temporada ${elegida?.anio ?? ''}`} icon={<Users size={16} strokeWidth={1.6} />} />
        <Stat label="Registros de personal" value={rows.length} />
        <Stat label="Trabajadores" value={nf(rows.reduce((a, j) => a + Number(j.trabajadores || 0), 0))} sub="suma por registro" />
      </StatGrid>
      <DataTable
        rows={rows}
        columns={cols}
        onRowClick={can('cosecha', 'v') ? (j) => onAbrir(j.cosechaId) : undefined}
        exportName={`personal-cosecha-${elegida?.anio ?? ''}`}
        canExport={can('cosecha', 'x')}
        empty={
          <EmptyState
            icon={<Users size={28} strokeWidth={1.5} />}
            title="Sin personal registrado"
            text="Abre una cosecha y agrega su cuadrilla con la tarifa por kg, cajón o día."
          />
        }
      />
    </>
  );
}

const cantidadJornal = (j: { tarifaTipo: string; kg?: unknown; cajones?: unknown; jornadas?: unknown }) =>
  Number(j.tarifaTipo === 'kg' ? j.kg : j.tarifaTipo === 'cajon' ? j.cajones : j.jornadas) || 0;

function CosechaDialog({
  id,
  datos,
  kgCajon,
  onAbrir,
  onClose
}: {
  id: string | null;
  datos: Datos;
  kgCajon: Rango;
  onAbrir: (id: string) => void;
  onClose: () => void;
}) {
  const can = useCan();
  const engine = useSync();
  const toast = useToast();
  const temporadaPara = useTemporadaParaFecha();
  const c = id ? (datos.cosechas ?? []).find((x) => x.id === id) : null;
  const editable = c ? can('cosecha', 'e') : can('cosecha', 'c');
  const [f, setF] = useState({
    fecha: c?.fecha ?? fechaHoy(),
    cuartelId: c?.cuartelId ?? '',
    cajones: c ? String(c.cajones) : '',
    kg: c ? String(c.kg) : '',
    costoBins: c?.costoBins != null ? String(c.costoBins) : '',
    costoTransporte: c?.costoTransporte != null ? String(c.costoTransporte) : '',
    costoAlimentacion: c?.costoAlimentacion != null ? String(c.costoAlimentacion) : '',
    otrosCostos: c?.otrosCostos != null ? String(c.otrosCostos) : ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const t = temporadaPara(f.fecha);
  const cuartel = datos.porCuartel.get(f.cuartelId);
  const jornales = (datos.jornales ?? []).filter((j) => c && j.cosechaId === c.id);
  const costo = costoCosecha({ ...f, id: c?.id ?? '' }, jornales);
  const xCajon = kgPorCajon(f.kg, f.cajones);
  const malCajon = fueraDeRango(f.kg, f.cajones, kgCajon);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!engine) return;
    if (malCajon) {
      setErrors({ kg: `El peso por cajón (${nf(xCajon!, 1)} kg) está fuera del rango ${kgCajon.min}–${kgCajon.max} kg. Revisa kg o cajones.` });
      return;
    }
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const nuevoId = await engine.write('cosecha', 'upsert', c?.id ?? null, { ...data, temporadaId: t.temporada?.id ?? '' });
      toast(navigator.onLine ? 'Cosecha guardada.' : 'Cosecha guardada en este equipo; se enviará al recuperar la señal.');
      setErrors({});
      // Una cosecha nueva queda abierta para agregar su cuadrilla.
      if (!c) onAbrir(nuevoId);
      else onClose();
    } catch (err) {
      const x = err as Error & { issues?: { path: PropertyKey[]; message: string }[] };
      setErrors(x.issues ? Object.fromEntries(x.issues.map((i) => [String(i.path[0]), i.message])) : { _: x.message });
    }
  }
  async function eliminar() {
    if (!c || !engine || !confirm('¿Eliminar esta cosecha y su personal?')) return;
    await engine.write('cosecha', 'delete', c.id);
    toast('Cosecha eliminada.');
    onClose();
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={c ? `Cosecha · ${cuartel?.codigo ?? ''} · ${fecha(c.fecha)}` : 'Registrar cosecha'}
      description={`Kg por cajón aceptado: ${kgCajon.min}–${kgCajon.max} kg (parámetro de la viña).`}
      footer={
        <>
          {c && can('cosecha', 'd') && (
            <Button type="button" variant="danger" className="mr-auto" onClick={() => void eliminar()}>
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            {c ? 'Cerrar' : 'Cancelar'}
          </Button>
          {editable && (
            <Button type="submit" form="cosecha-form" variant="primary" disabled={!!t.error}>
              {c ? 'Guardar' : 'Guardar y agregar personal'}
            </Button>
          )}
        </>
      }
    >
      <form id="cosecha-form" onSubmit={submit} className="grid gap-x-6 gap-y-4 sm:grid-cols-[1fr_15rem]">
        <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Fecha"
            required
            error={errors.fecha ?? t.error ?? undefined}
            hint={t.temporada && !t.error ? `Temporada ${t.temporada.anio}` : undefined}
          >
            {(i, d) => <Input id={i} name="fecha" type="date" value={f.fecha} onChange={set('fecha')} aria-describedby={d} required />}
          </Field>
          <Field label="Cuartel" required error={errors.cuartelId}>
            {(i, d) => (
              <Select id={i} name="cuartelId" value={f.cuartelId} onChange={set('cuartelId')} aria-describedby={d} required>
                <option value="" disabled>
                  Elige…
                </option>
                {(datos.cuarteles ?? []).map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.codigo} · {q.variedad}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Cajones" required error={errors.cajones}>
            {(i, d) => (
              <Input
                id={i}
                name="cajones"
                type="number"
                min={1}
                step={1}
                value={f.cajones}
                onChange={set('cajones')}
                className="tabular"
                aria-describedby={d}
                required
              />
            )}
          </Field>
          <Field label="Kg" required error={errors.kg}>
            {(i, d) => (
              <Input id={i} name="kg" type="number" min={1} step="any" value={f.kg} onChange={set('kg')} className="tabular" aria-describedby={d} required />
            )}
          </Field>
          <Field label="Lote" hint="Al asignarlo, un lote planificado pasa a «En vendimia».">
            {(i, d) => (
              <Select id={i} name="loteId" defaultValue={c?.loteId ?? ''} aria-describedby={d}>
                <option value="">Sin lote</option>
                {(datos.lotes ?? [])
                  .filter((l) => l.temporadaId === t.temporada?.id || l.id === c?.loteId)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.codigo} · {l.variedad}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label="Destino">
            {(i) => (
              <Select id={i} name="destino" defaultValue={c?.destino ?? 'propia'}>
                {DESTINOS_COSECHA.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Bins / arriendo" unit="CLP">
            {(i) => <Input id={i} name="costoBins" type="number" min={0} step={1} value={f.costoBins} onChange={set('costoBins')} className="tabular" />}
          </Field>
          <Field label="Transporte" unit="CLP">
            {(i) => (
              <Input
                id={i}
                name="costoTransporte"
                type="number"
                min={0}
                step={1}
                value={f.costoTransporte}
                onChange={set('costoTransporte')}
                className="tabular"
              />
            )}
          </Field>
          <Field label="Alimentación" unit="CLP">
            {(i) => (
              <Input
                id={i}
                name="costoAlimentacion"
                type="number"
                min={0}
                step={1}
                value={f.costoAlimentacion}
                onChange={set('costoAlimentacion')}
                className="tabular"
              />
            )}
          </Field>
          <Field label="Otros costos" unit="CLP">
            {(i) => <Input id={i} name="otrosCostos" type="number" min={0} step={1} value={f.otrosCostos} onChange={set('otrosCostos')} className="tabular" />}
          </Field>
          <Field label="Observaciones" className="sm:col-span-2">
            {(i) => <Textarea id={i} name="observaciones" defaultValue={c?.observaciones ?? ''} />}
          </Field>
        </fieldset>
        <aside aria-label="Cálculo" className="self-start rounded-card bg-sunken px-4 py-3 text-[13px]">
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
            <dt className="text-ink-3">Kg por cajón</dt>
            <dd className={`text-right tabular ${malCajon ? 'font-semibold text-warn' : ''}`}>
              {xCajon != null ? `${nf(xCajon, 1)} ${malCajon ? '⚠' : '✓'}` : '—'}
            </dd>
            <dt className="text-ink-3">Rendimiento</dt>
            <dd className="text-right tabular">{cuartel && f.kg ? `${nf(rendimientoKgHa(f.kg, cuartel.superficie) ?? 0)} kg/ha` : '—'}</dd>
            <dt className="text-ink-3">Kg por planta</dt>
            <dd className="text-right tabular">{cuartel?.plantas && f.kg ? nf(kgPorPlanta(f.kg, cuartel.plantas) ?? 0, 2) : '—'}</dd>
            <dt className="text-ink-3">Personal</dt>
            <dd className="text-right tabular">{clp(costo.jornales)}</dd>
            <dt className="text-ink-3">Otros costos</dt>
            <dd className="text-right tabular">{clp(costo.otros)}</dd>
            <dt className="text-ink-3">Costo total</dt>
            <dd className="text-right font-semibold tabular">{clp(costo.total)}</dd>
            <dt className="text-ink-3">Costo por kg</dt>
            <dd className="text-right tabular">{Number(f.kg) ? clp(costo.porKg) : '—'}</dd>
          </dl>
        </aside>
        {(errors._ || errors.temporadaId) && (
          <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad sm:col-span-2">
            {errors._ ?? errors.temporadaId}
          </p>
        )}
      </form>
      {c && <PersonalDeCosecha cosechaId={c.id} jornales={jornales} editable={can('cosecha', 'c')} />}
    </Dialog>
  );
}

/** Personal de una cosecha: lista con pago y formulario en línea (sin un segundo diálogo encima). */
function PersonalDeCosecha({ cosechaId, jornales, editable }: { cosechaId: string; jornales: JornalRow[]; editable: boolean }) {
  const engine = useSync();
  const toast = useToast();
  const vacio = { id: null as string | null, nombre: '', rut: '', cuadrilla: '', trabajadores: '1', tarifaTipo: 'cajon', tarifa: '650', cantidad: '' };
  const [f, setF] = useState(vacio);
  const [error, setError] = useState<string | null>(null);
  const campoCantidad = f.tarifaTipo === 'kg' ? 'kg' : f.tarifaTipo === 'cajon' ? 'cajones' : 'jornadas';
  const pago = pagoJornal({ tarifa: f.tarifa, tarifaTipo: f.tarifaTipo, [campoCantidad]: f.cantidad || 0 });
  const total = jornales.reduce((a, j) => a + Number(j.pago), 0);

  async function agregar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!engine) return;
    try {
      await engine.write('jornal', 'upsert', f.id, {
        cosechaId,
        nombre: f.nombre,
        rut: f.rut,
        cuadrilla: f.cuadrilla,
        trabajadores: f.trabajadores,
        tarifaTipo: f.tarifaTipo,
        tarifa: f.tarifa,
        [campoCantidad]: f.cantidad
      });
      toast(f.id ? 'Personal actualizado.' : 'Personal agregado.');
      setF({ ...vacio, tarifaTipo: f.tarifaTipo, tarifa: f.tarifa });
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <section aria-label="Personal y pagos" className="mt-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Personal y pagos</h3>
        <span className="text-[13px] text-ink-2">
          Total <b className="text-ink tabular">{clp(total)}</b>
        </span>
      </div>
      {jornales.length > 0 && (
        <ul className="mb-3 divide-y divide-rule rounded-card border border-rule text-[14px]">
          {jornales.map((j) => (
            <li key={j.id} className="flex items-center gap-3 px-3 py-2">
              <button
                type="button"
                disabled={!editable}
                className="min-w-0 flex-1 text-left"
                onClick={() =>
                  setF({
                    id: j.id,
                    nombre: j.nombre,
                    rut: j.rut ?? '',
                    cuadrilla: j.cuadrilla ?? '',
                    trabajadores: String(j.trabajadores),
                    tarifaTipo: j.tarifaTipo,
                    tarifa: String(j.tarifa),
                    cantidad: String(cantidadJornal(j))
                  })
                }
              >
                <span className={`block truncate ${j._pending ? 'italic' : ''}`}>
                  {j.nombre}
                  {j.cuadrilla && <span className="text-ink-3"> · {j.cuadrilla}</span>}
                </span>
                <span className="block text-[12px] text-ink-3 tabular">
                  {j.trabajadores} trab. · {clp(j.tarifa)}/{TARIFA[j.tarifaTipo]} × {nf(cantidadJornal(j), 1)}
                </span>
              </button>
              <span className="font-semibold tabular">{clp(j.pago)}</span>
              {editable && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Quitar ${j.nombre}`}
                  onClick={() => engine && void engine.write('jornal', 'delete', j.id).then(() => toast('Personal quitado.'))}
                >
                  <Trash2 size={14} aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <form
          onSubmit={agregar}
          aria-label={f.id ? 'Editar personal' : 'Agregar personal'}
          className="grid gap-3 rounded-card border border-dashed border-rule-strong p-3 sm:grid-cols-6"
        >
          <Field label="Nombre o cuadrilla" required className="sm:col-span-2">
            {(i) => <Input id={i} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required />}
          </Field>
          <Field label="Trabajadores" className="sm:col-span-1">
            {(i) => (
              <Input
                id={i}
                type="number"
                min={1}
                step={1}
                value={f.trabajadores}
                onChange={(e) => setF({ ...f, trabajadores: e.target.value })}
                className="tabular"
              />
            )}
          </Field>
          <Field label="Tarifa por" className="sm:col-span-1">
            {(i) => (
              <Select id={i} value={f.tarifaTipo} onChange={(e) => setF({ ...f, tarifaTipo: e.target.value })}>
                {TARIFAS_JORNAL.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l.replace('Por ', '')}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Tarifa" unit="CLP" required className="sm:col-span-1">
            {(i) => (
              <Input
                id={i}
                type="number"
                min={0}
                step={1}
                value={f.tarifa}
                onChange={(e) => setF({ ...f, tarifa: e.target.value })}
                className="tabular"
                required
              />
            )}
          </Field>
          <Field label={f.tarifaTipo === 'kg' ? 'Kg' : f.tarifaTipo === 'cajon' ? 'Cajones' : 'Jornadas'} required className="sm:col-span-1">
            {(i) => (
              <Input
                id={i}
                type="number"
                min={0}
                step="any"
                value={f.cantidad}
                onChange={(e) => setF({ ...f, cantidad: e.target.value })}
                className="tabular"
                required
              />
            )}
          </Field>
          <Field label="RUT" className="sm:col-span-2">
            {(i) => <Input id={i} value={f.rut} onChange={(e) => setF({ ...f, rut: e.target.value })} placeholder="12.345.678-5" />}
          </Field>
          <Field label="Cuadrilla" className="sm:col-span-2">
            {(i) => <Input id={i} value={f.cuadrilla} onChange={(e) => setF({ ...f, cuadrilla: e.target.value })} />}
          </Field>
          <div className="flex items-end justify-end gap-2 sm:col-span-2">
            <span className="mr-auto text-[13px] text-ink-2">
              Pago <b className="text-ink tabular">{clp(pago)}</b>
            </span>
            {f.id && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setF(vacio)}>
                Cancelar
              </Button>
            )}
            <Button type="submit" size="sm" variant="primary">
              <Plus size={14} aria-hidden /> {f.id ? 'Guardar' : 'Agregar'}
            </Button>
          </div>
          {error && (
            <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad sm:col-span-6">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
