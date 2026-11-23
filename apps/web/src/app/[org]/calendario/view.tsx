'use client';
import {
  desviosLote,
  diasVentana,
  enVentana,
  ESTADOS_LOTE,
  fechaHoy,
  hitosReales,
  LOTE_DEFAULTS,
  planLote,
  VALLES,
  VARIEDADES,
  type Cuartel,
  type Fase,
  type Lote,
  type Ventana
} from '@winzer/domain';
import { CalendarClock, CalendarRange, Grape, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCan, useOrg, useTemporadaElegida } from '@/components/shell/org-context';
import { Badge, Codigo, TipoUva } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState, PageHeader } from '@/components/ui/page';
import { Tabs, useTab } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { useEntity, useSync } from '@/lib/offline/hooks';
import { cargarVentanasAction } from './actions';

type Pend = { _pending: boolean; _version: number };
type LoteRow = Lote & Pend;
type VentanaRow = Ventana & Pend;
type CuartelRow = Cuartel & Pend;

const TABS = [
  { id: 'lotes', label: 'Lotes y planificación' },
  { id: 'gantt', label: 'Vista Gantt' },
  { id: 'ventanas', label: 'Ventanas por valle' }
] as const;

/** Color de cada fase (tokens validados con dataviz; la etiqueta va en la barra). */
const FASE_BG: Record<Fase, string> = {
  Vendimia: 'bg-fase-vendimia',
  FA: 'bg-fase-fa',
  Maceración: 'bg-fase-maceracion',
  FML: 'bg-fase-fml',
  Guarda: 'bg-fase-guarda'
};
const TONO_ESTADO = (e: string): 'ok' | 'info' | 'neutral' | 'warn' =>
  e === 'Finalizado' || e === 'Envasado' ? 'ok' : e === 'Planificado' ? 'neutral' : ['Fermentando', 'Macerando', 'FML'].includes(e) ? 'warn' : 'info';
const fecha = (d?: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : '—');
const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function useDatos(desviacionDias: number) {
  const elegida = useTemporadaElegida();
  const lotes = useEntity<Lote>('lote') as LoteRow[] | undefined;
  const ventanas = useEntity<Ventana>('ventana') as VentanaRow[] | undefined;
  const cuarteles = useEntity<Cuartel>('cuartel') as CuartelRow[] | undefined;
  const rows = useMemo(
    () =>
      (lotes ?? [])
        .filter((l) => l.temporadaId === elegida?.id)
        .map((l) => {
          const plan = planLote(l);
          return {
            ...l,
            plan,
            desvios: desviosLote(plan, hitosReales(l), desviacionDias),
            ventana: enVentana(l.fechaVendimiaPlan, l.variedad, l.valle, ventanas ?? [])
          };
        })
        .sort((a, b) => a.fechaVendimiaPlan.localeCompare(b.fechaVendimiaPlan)),
    [lotes, ventanas, elegida, desviacionDias]
  );
  return { elegida, lotes, ventanas, cuarteles, rows, cargando: !lotes || !ventanas || !cuarteles };
}
type Datos = ReturnType<typeof useDatos>;
type LoteCalc = Datos['rows'][number];

export function CalendarioView({ desviacionDias }: { desviacionDias: number }) {
  const [tab, setTab] = useTab(TABS);
  const can = useCan();
  const datos = useDatos(desviacionDias);
  const [editing, setEditing] = useState<LoteRow | 'nuevo' | null>(null);
  const [ventana, setVentana] = useState<VentanaRow | 'nueva' | null>(null);
  const accion =
    tab === 'ventanas'
      ? can('calendario', 'c') && (
          <Button variant="primary" onClick={() => setVentana('nueva')}>
            <Plus size={16} /> Nueva ventana
          </Button>
        )
      : can('calendario', 'c') && (
          <Button variant="primary" onClick={() => setEditing('nuevo')}>
            <Plus size={16} /> Nuevo lote
          </Button>
        );
  return (
    <>
      <PageHeader
        area="Operación"
        title="Calendario de vendimia"
        description="Lotes de la temporada con su plan de vendimia, fermentación, FML y guarda; el Gantt compara el plan con los hitos reales. Funciona sin señal."
      />
      <Tabs tabs={TABS} actual={tab} onChange={setTab} acciones={accion} />
      {datos.cargando ? (
        <div className="h-64 animate-pulse rounded-card bg-sunken" aria-label="Cargando lotes" />
      ) : tab === 'lotes' ? (
        <Lotes datos={datos} desviacionDias={desviacionDias} onEditar={setEditing} />
      ) : tab === 'gantt' ? (
        <Gantt rows={datos.rows} anio={datos.elegida?.anio ?? new Date().getFullYear()} />
      ) : (
        <Ventanas ventanas={datos.ventanas ?? []} onEditar={setVentana} />
      )}
      {editing && <LoteDialog lote={editing === 'nuevo' ? null : editing} datos={datos} onClose={() => setEditing(null)} />}
      {ventana && <VentanaDialog ventana={ventana === 'nueva' ? null : ventana} onClose={() => setVentana(null)} />}
    </>
  );
}

/* ------------------------------ Lotes ------------------------------ */

function Lotes({ datos, desviacionDias, onEditar }: { datos: Datos; desviacionDias: number; onEditar: (l: LoteRow) => void }) {
  const can = useCan();
  const { rows, elegida } = datos;
  const hoy = fechaHoy();
  // Avisos de planificación (v1: calendario renderTop): desviaciones, fases que empiezan en ≤ 7 días y más de 2 lotes el mismo día.
  const avisos = useMemo(() => {
    const out: { tono: 'warn' | 'info'; titulo: string; texto: string }[] = [];
    for (const l of rows)
      for (const d of l.desvios)
        out.push({ tono: 'warn', titulo: `${l.codigo}: desviación ${d}`, texto: `Respecto de lo planificado (umbral ±${desviacionDias} días).` });
    for (const l of rows)
      for (const p of l.plan) {
        const d = dias(hoy, p.desde);
        if (d >= 0 && d <= 7)
          out.push({ tono: 'info', titulo: `${l.codigo}: ${p.fase} comienza en ${d} días`, texto: `${fecha(p.desde)} a ${fecha(p.hasta)}.` });
      }
    const porDia = new Map<string, string[]>();
    for (const l of rows) {
      const v = l.plan.find((p) => p.fase === 'Vendimia');
      if (!v) continue;
      for (let d = v.desde; d <= v.hasta; d = addDays(d, 1)) porDia.set(d, [...(porDia.get(d) ?? []), l.codigo]);
    }
    [...porDia.entries()]
      .filter(([, c]) => c.length > 2)
      .slice(0, 3)
      .forEach(([d, c]) =>
        out.push({
          tono: 'warn',
          titulo: `Solapamiento de vendimia el ${fecha(d)}`,
          texto: `${c.join(', ')} coinciden. Revisa capacidad de recepción y estanques.`
        })
      );
    return out;
  }, [rows, hoy, desviacionDias]);

  const cols: Column<LoteCalc>[] = [
    { key: 'codigo', label: 'Lote', render: (l) => <Codigo codigo={l.codigo} pending={l._pending} /> },
    { key: 'variedad', label: 'Variedad' },
    { key: 'tipo', label: 'Tipo', render: (l) => <TipoUva tipo={l.tipo} /> },
    { key: 'estado', label: 'Estado', render: (l) => <Badge tone={TONO_ESTADO(l.estado)}>{l.estado}</Badge> },
    {
      key: 'fechaVendimiaPlan',
      label: 'Vendimia plan',
      render: (l) => (
        <span className="inline-flex items-center gap-1.5">
          {fecha(l.fechaVendimiaPlan)}
          {l.ventana && !l.ventana.dentro && (
            <Badge tone="warn">
              fuera de ventana ({l.ventana.ventana.desde.split('-').reverse().join('/')}–{l.ventana.ventana.hasta.split('-').reverse().join('/')})
            </Badge>
          )}
        </span>
      )
    },
    {
      key: 'finFA',
      label: 'Fin FA plan',
      value: (l) => l.plan.find((p) => p.fase === 'FA')?.hasta ?? '',
      render: (l) => fecha(l.plan.find((p) => p.fase === 'FA')?.hasta)
    },
    {
      key: 'desvios',
      label: 'Desviaciones',
      value: (l) => l.desvios.join(', '),
      render: (l) =>
        l.desvios.length ? (
          <span className="flex flex-wrap gap-1">
            {l.desvios.map((d) => (
              <Badge key={d} tone="warn">
                {d}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="text-ink-4">—</span>
        )
    }
  ];

  return (
    <>
      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section aria-label="Alertas de planificación" className="rounded-card border border-rule bg-raised p-4">
          <h3 className="mb-2 text-[14px] font-semibold">Alertas de planificación</h3>
          {avisos.length === 0 ? (
            <p className="text-[13px] text-ink-3">Sin solapamientos ni desviaciones relevantes.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {avisos.map((a, i) => (
                <li key={i} className="flex gap-2 text-[13px]">
                  <Badge tone={a.tono}>{a.tono === 'warn' ? 'Atención' : 'Próximo'}</Badge>
                  <span>
                    <b>{a.titulo}</b> <span className="text-ink-2">{a.texto}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <RecordatoriosSAG anio={elegida?.anio ?? new Date().getFullYear()} />
      </div>
      <DataTable
        rows={rows}
        columns={cols}
        onRowClick={can('calendario', 'v') ? (l) => onEditar(l) : undefined}
        exportName={`lotes-${elegida?.anio ?? ''}`}
        canExport={can('calendario', 'x')}
        empty={
          <EmptyState
            icon={<Grape size={28} strokeWidth={1.5} />}
            title={`No hay lotes en la temporada ${elegida?.anio ?? ''}`}
            text="Crea un lote por cada vino que vas a elaborar, con su fecha de vendimia planificada: el plan de fermentación, FML y guarda se calcula solo."
          />
        }
      />
    </>
  );
}

/** Recordatorios del SAG (v1: calendario renderTop). */
function RecordatoriosSAG({ anio }: { anio: number }) {
  const md = fechaHoy().slice(5);
  const cosecha = md >= '06-01' && md <= '07-15';
  const existencias = md <= '01-19';
  return (
    <section aria-label="Recordatorios SAG" className="rounded-card border border-rule bg-raised p-4">
      <h3 className="mb-2 text-[14px] font-semibold">Recordatorios SAG</h3>
      <ul className="flex flex-col gap-2 text-[13px]">
        <li className="flex gap-2">
          <CalendarClock size={15} className={cn('mt-0.5 shrink-0', cosecha ? 'text-warn' : 'text-ink-3')} aria-hidden />
          <span>
            <b>Declaración de cosecha</b> <span className="text-ink-2">Entre el 1 y el 30 de junio de {anio} (correcciones hasta el 15 de julio).</span>
          </span>
        </li>
        <li className="flex gap-2">
          <CalendarClock size={15} className={cn('mt-0.5 shrink-0', existencias ? 'text-warn' : 'text-ink-3')} aria-hidden />
          <span>
            <b>Declaración de existencias</b> <span className="text-ink-2">Entre el 1 y el 19 de enero.</span>
          </span>
        </li>
      </ul>
    </section>
  );
}

function LoteDialog({ lote, datos, onClose }: { lote: LoteRow | null; datos: Datos; onClose: () => void }) {
  const can = useCan();
  const engine = useSync();
  const toast = useToast();
  const { temporadas } = useOrg();
  const l = lote;
  const editable = l ? can('calendario', 'e') : can('calendario', 'c');
  const abiertas = temporadas.filter((t) => t.estado === 'abierta');
  const [f, setF] = useState({
    codigo: l?.codigo ?? '',
    temporadaId: l?.temporadaId ?? (datos.elegida?.estado === 'abierta' ? datos.elegida.id : (abiertas.at(-1)?.id ?? '')),
    cuartelIds: l?.cuartelIds ?? ([] as string[]),
    variedad: l?.variedad ?? '',
    tipo: (l?.tipo ?? LOTE_DEFAULTS.tipo) as string,
    valle: l?.valle ?? '',
    estado: (l?.estado ?? LOTE_DEFAULTS.estado) as string,
    litrosEstimados: l?.litrosEstimados != null ? String(l.litrosEstimados) : '',
    costoUvaComprada: l?.costoUvaComprada != null ? String(l.costoUvaComprada) : '',
    fechaVendimiaPlan: l?.fechaVendimiaPlan ?? '',
    diasVendimia: String(l?.diasVendimia ?? LOTE_DEFAULTS.diasVendimia),
    diasFA: String(l?.diasFA ?? LOTE_DEFAULTS.diasFA),
    diasMaceracion: String(l?.diasMaceracion ?? LOTE_DEFAULTS.diasMaceracion),
    diasFML: String(l?.diasFML ?? LOTE_DEFAULTS.diasFML),
    diasGuarda: String(l?.diasGuarda ?? LOTE_DEFAULTS.diasGuarda)
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const tinto = f.tipo === 'tinto';
  const plan = planLote(f);
  const ventana = enVentana(f.fechaVendimiaPlan, f.variedad, f.valle, datos.ventanas ?? []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  function alternarCuartel(id: string) {
    const ids = f.cuartelIds.includes(id) ? f.cuartelIds.filter((x) => x !== id) : [...f.cuartelIds, id];
    const c = (datos.cuarteles ?? []).find((x) => x.id === ids[0]);
    // Como v1: el primer cuartel propone variedad, tipo y valle si aún no están.
    setF({ ...f, cuartelIds: ids, variedad: f.variedad || c?.variedad || '', tipo: c && !f.variedad ? c.tipo : f.tipo, valle: f.valle || c?.valle || '' });
  }
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!engine) return;
    try {
      await engine.write('lote', 'upsert', l?.id ?? null, {
        ...l,
        ...f,
        _pending: undefined,
        _version: undefined
      });
      toast(navigator.onLine ? (l ? 'Lote actualizado.' : 'Lote creado.') : 'Lote guardado en este equipo; se enviará al recuperar la señal.');
      onClose();
    } catch (err) {
      const x = err as Error & { issues?: { path: PropertyKey[]; message: string }[] };
      setErrors(x.issues ? Object.fromEntries(x.issues.map((i) => [String(i.path[0]), i.message])) : { codigo: x.message });
    }
  }
  async function eliminar() {
    if (!l || !engine || !confirm(`¿Eliminar el lote ${l.codigo}?`)) return;
    await engine.write('lote', 'delete', l.id);
    toast('Lote eliminado.');
    onClose();
  }
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={l ? `Lote ${l.codigo}` : 'Nuevo lote'}
      description="El estado avanza solo con la cosecha, la entrada a bodega y la fermentación; puedes corregirlo a mano."
      footer={
        <>
          {l && can('calendario', 'd') && (
            <Button type="button" variant="danger" className="mr-auto" onClick={() => void eliminar()}>
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            {editable ? 'Cancelar' : 'Cerrar'}
          </Button>
          {editable && (
            <Button type="submit" form="lote-form" variant="primary">
              Guardar
            </Button>
          )}
        </>
      }
    >
      <form id="lote-form" onSubmit={guardar} className="grid gap-x-6 gap-y-4 sm:grid-cols-[1fr_15rem]">
        <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-3">
          <Field label="Código del lote" required error={errors.codigo}>
            {(i, d) => <Input id={i} value={f.codigo} onChange={set('codigo')} placeholder="L-2027-SB" aria-describedby={d} required />}
          </Field>
          <Field label="Temporada" required error={errors.temporadaId}>
            {(i) => (
              <Select id={i} value={f.temporadaId} onChange={set('temporadaId')}>
                {[...temporadas].reverse().map((t) => (
                  <option key={t.id} value={t.id} disabled={t.estado === 'cerrada'}>
                    {t.anio}
                    {t.estado === 'cerrada' ? ' · cerrada' : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Estado" required hint="Se actualiza con eventos reales.">
            {(i, d) => (
              <Select id={i} value={f.estado} onChange={set('estado')} aria-describedby={d}>
                {ESTADOS_LOTE.map((e) => (
                  <option key={e}>{e}</option>
                ))}
              </Select>
            )}
          </Field>
          <fieldset className="sm:col-span-3">
            <legend className="mb-1.5 text-[13px] font-medium">Cuarteles de origen</legend>
            <div className="flex flex-wrap gap-2">
              {(datos.cuarteles ?? []).map((c) => (
                <label
                  key={c.id}
                  className={cn(
                    'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px]',
                    f.cuartelIds.includes(c.id) ? 'border-ink bg-ink text-on-ink' : 'border-rule-strong text-ink-2 hover:bg-sunken'
                  )}
                >
                  <input type="checkbox" className="sr-only" checked={f.cuartelIds.includes(c.id)} onChange={() => alternarCuartel(c.id)} />
                  {c.codigo} · {c.variedad}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Variedad" required error={errors.variedad}>
            {(i, d) => (
              <>
                <Input id={i} list="lote-variedades" value={f.variedad} onChange={set('variedad')} aria-describedby={d} required />
                <datalist id="lote-variedades">
                  {VARIEDADES.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label="Tipo" required>
            {(i) => (
              <Select id={i} value={f.tipo} onChange={set('tipo')}>
                <option value="blanco">Blanco</option>
                <option value="tinto">Tinto</option>
              </Select>
            )}
          </Field>
          <Field label="Valle">
            {(i) => (
              <>
                <Input id={i} list="lote-valles" value={f.valle} onChange={set('valle')} />
                <datalist id="lote-valles">
                  {VALLES.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label="Vendimia planificada" required error={errors.fechaVendimiaPlan}>
            {(i, d) => <Input id={i} type="date" value={f.fechaVendimiaPlan} onChange={set('fechaVendimiaPlan')} aria-describedby={d} required />}
          </Field>
          <Field label="Días de vendimia" unit="días">
            {(i) => <Input id={i} type="number" min={1} step={1} value={f.diasVendimia} onChange={set('diasVendimia')} className="tabular" />}
          </Field>
          <Field label="Duración FA" unit="días">
            {(i) => <Input id={i} type="number" min={1} step={1} value={f.diasFA} onChange={set('diasFA')} className="tabular" />}
          </Field>
          {tinto && (
            <>
              <Field label="Maceración" unit="días">
                {(i) => <Input id={i} type="number" min={0} step={1} value={f.diasMaceracion} onChange={set('diasMaceracion')} className="tabular" />}
              </Field>
              <Field label="Duración FML" unit="días">
                {(i) => <Input id={i} type="number" min={0} step={1} value={f.diasFML} onChange={set('diasFML')} className="tabular" />}
              </Field>
            </>
          )}
          <Field label="Guarda" unit="días">
            {(i) => <Input id={i} type="number" min={0} step={1} value={f.diasGuarda} onChange={set('diasGuarda')} className="tabular" />}
          </Field>
          <Field label="Litros estimados" unit="L">
            {(i) => <Input id={i} type="number" min={0} step="any" value={f.litrosEstimados} onChange={set('litrosEstimados')} className="tabular" />}
          </Field>
          <Field label="Uva o vino comprado a terceros" unit="CLP">
            {(i) => <Input id={i} type="number" min={0} step={1} value={f.costoUvaComprada} onChange={set('costoUvaComprada')} className="tabular" />}
          </Field>
        </fieldset>
        <aside aria-label="Plan" className="self-start rounded-card bg-sunken px-4 py-3 text-[13px]">
          <h4 className="mb-2 font-semibold">Plan de fases</h4>
          {plan.length === 0 ? (
            <p className="text-ink-3">Indica la fecha de vendimia.</p>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              {plan.map((p) => (
                <div key={p.fase} className="contents">
                  <dt className="flex items-center gap-1.5 text-ink-2">
                    <span className={cn('size-2.5 rounded-[3px]', FASE_BG[p.fase])} aria-hidden />
                    {p.fase}
                  </dt>
                  <dd className="text-right tabular">
                    {fecha(p.desde)} – {fecha(p.hasta)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {ventana && (
            <p className={cn('mt-3 text-[12px]', ventana.dentro ? 'text-ok' : 'font-semibold text-warn')}>
              {ventana.dentro ? '✓ Dentro de la ventana' : '⚠ Fuera de la ventana'} de {f.variedad} en {f.valle} (
              {ventana.ventana.desde.split('-').reverse().join('/')} a {ventana.ventana.hasta.split('-').reverse().join('/')}).
            </p>
          )}
        </aside>
      </form>
    </Dialog>
  );
}

/* ------------------------------ Gantt ------------------------------ */

/**
 * Gantt del plan por lote: barras de fase con su nombre (la tabla de Lotes es la vista accesible), hitos reales
 * como marcas y la línea de hoy. Mensual: feb del año de vendimia a ene del siguiente; semanal: −2 a +12 semanas.
 */
function Gantt({ rows, anio }: { rows: LoteCalc[]; anio: number }) {
  const [modo, setModo] = useState<'mensual' | 'semanal'>('mensual');
  const hoy = fechaHoy();
  const desde = modo === 'mensual' ? `${anio}-02-01` : addDays(hoy, -14);
  const hasta = modo === 'mensual' ? `${anio + 1}-01-31` : addDays(hoy, 84);
  const total = dias(desde, hasta) + 1;
  const pct = (d: string) => Math.min(100, Math.max(0, (dias(desde, d) / total) * 100));
  const columnas = useMemo(() => {
    const out: { etiqueta: string; desde: string }[] = [];
    if (modo === 'mensual') {
      for (let i = 0; i < 12; i++) {
        const d = new Date(Date.UTC(anio, 1 + i, 1));
        out.push({ etiqueta: d.toLocaleDateString('es-CL', { month: 'short', timeZone: 'UTC' }), desde: d.toISOString().slice(0, 10) });
      }
    } else for (let i = 0; i < 14; i++) out.push({ etiqueta: `Sem ${fecha(addDays(desde, i * 7))}`, desde: addDays(desde, i * 7) });
    return out;
  }, [modo, anio, desde]);

  if (rows.length === 0)
    return (
      <EmptyState
        icon={<CalendarRange size={28} strokeWidth={1.5} />}
        title={`No hay lotes en la temporada ${anio}`}
        text="Crea lotes con su fecha de vendimia para ver el plan."
      />
    );

  return (
    <section aria-label="Gantt de lotes" className="rounded-card border border-rule bg-raised p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Select aria-label="Escala" value={modo} onChange={(e) => setModo(e.target.value as 'mensual' | 'semanal')} className="h-9 w-auto text-[14px]">
          <option value="mensual">Mensual</option>
          <option value="semanal">Semanal (próximas 12 semanas)</option>
        </Select>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2" aria-label="Leyenda">
          {(Object.keys(FASE_BG) as Fase[]).map((f) => (
            <li key={f} className="flex items-center gap-1.5">
              <span className={cn('size-2.5 rounded-[3px]', FASE_BG[f])} aria-hidden /> {f}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-[3px] rounded-full bg-ink" aria-hidden /> Hito real
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-[2px] bg-bad" aria-hidden /> Hoy
          </li>
        </ul>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[8rem_1fr] border-b border-rule pb-1 text-[11px] text-ink-3">
            <span />
            <div className="relative h-4">
              {columnas.map((c) => (
                <span key={c.desde} className="absolute top-0 capitalize" style={{ left: `${pct(c.desde)}%` }}>
                  {c.etiqueta}
                </span>
              ))}
            </div>
          </div>
          {rows.map((l) => {
            const real = hitosReales(l);
            return (
              <div key={l.id} className="grid grid-cols-[8rem_1fr] items-center border-b border-rule py-2 last:border-0">
                <span className="truncate pr-2 text-[13px] font-semibold">{l.codigo}</span>
                <div className="relative h-7">
                  {columnas.map((c) => (
                    <span key={c.desde} className="absolute inset-y-0 w-px bg-rule" style={{ left: `${pct(c.desde)}%` }} aria-hidden />
                  ))}
                  {l.plan
                    .filter((p) => p.hasta >= desde && p.desde <= hasta)
                    .map((p) => {
                      const x = pct(p.desde);
                      const w = Math.max(0.6, pct(p.hasta) - x);
                      return (
                        <span
                          key={p.fase}
                          title={`${l.codigo} · ${p.fase}: ${fecha(p.desde)} a ${fecha(p.hasta)}`}
                          className={cn(
                            'absolute overflow-hidden rounded-[4px] px-1.5 text-[11px] font-semibold whitespace-nowrap text-side',
                            // La maceración ocurre junto con la FA: va en un carril delgado debajo para no taparla.
                            p.fase === 'Maceración' ? 'top-[22px] h-[6px]' : 'top-0 h-5 leading-5',
                            FASE_BG[p.fase]
                          )}
                          style={{ left: `${x}%`, width: `${w}%` }}
                        >
                          {w > 6 && p.fase !== 'Maceración' ? p.fase : ''}
                        </span>
                      );
                    })}
                  {[real.faIni, real.faFin, real.fmlIni, real.fmlFin]
                    .filter((d): d is string => !!d && d >= desde && d <= hasta)
                    .map((d, i) => (
                      <span
                        key={i}
                        title={`Hito real: ${fecha(d)}`}
                        className="absolute top-0 h-7 w-[3px] rounded-full bg-ink"
                        style={{ left: `${pct(d)}%` }}
                      />
                    ))}
                  {hoy >= desde && hoy <= hasta && <span className="absolute -inset-y-2 w-[2px] bg-bad" style={{ left: `${pct(hoy)}%` }} aria-label="Hoy" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Ventanas ------------------------------ */

function Ventanas({ ventanas, onEditar }: { ventanas: VentanaRow[]; onEditar: (v: VentanaRow) => void }) {
  const can = useCan();
  const { org } = useOrg();
  const engine = useSync();
  const toast = useToast();
  const [cargando, setCargando] = useState(false);
  const rows = useMemo(() => [...ventanas].sort((a, b) => a.variedad.localeCompare(b.variedad, 'es') || a.valle.localeCompare(b.valle, 'es')), [ventanas]);
  const dm = (x: string) => x.split('-').reverse().join('/');
  const cols: Column<VentanaRow>[] = [
    { key: 'variedad', label: 'Variedad' },
    { key: 'valle', label: 'Valle' },
    { key: 'desde', label: 'Desde', render: (v) => dm(v.desde) },
    { key: 'hasta', label: 'Hasta', render: (v) => dm(v.hasta) },
    { key: 'dias', label: 'Días', num: true, value: (v) => diasVentana(v.desde, v.hasta) },
    { key: 'fuente', label: 'Fuente', value: (v) => v.fuente ?? '', render: (v) => <span className="text-ink-3">{v.fuente ?? '—'}</span> }
  ];
  async function cargar() {
    setCargando(true);
    const r = await cargarVentanasAction(org.slug);
    await engine?.sync();
    setCargando(false);
    toast(r.ok ? `Se cargaron ${r.cargadas} ventanas de referencia.` : (r.error ?? 'No se pudo cargar.'));
  }
  return (
    <DataTable
      rows={rows}
      columns={cols}
      onRowClick={can('calendario', 'e') ? onEditar : undefined}
      exportName="ventanas-vendimia"
      canExport={can('calendario', 'x')}
      empty={
        <EmptyState
          icon={<CalendarRange size={28} strokeWidth={1.5} />}
          title="Sin ventanas de vendimia"
          text="Las ventanas indican el período típico de cosecha de cada variedad por valle; el lote avisa si su vendimia planificada cae fuera."
          action={
            can('calendario', 'c') && (
              <Button variant="primary" disabled={cargando} onClick={() => void cargar()}>
                Cargar ventanas de referencia
              </Button>
            )
          }
        />
      }
    />
  );
}

function VentanaDialog({ ventana, onClose }: { ventana: VentanaRow | null; onClose: () => void }) {
  const can = useCan();
  const engine = useSync();
  const toast = useToast();
  const v = ventana;
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!engine) return;
    try {
      await engine.write('ventana', 'upsert', v?.id ?? null, Object.fromEntries(new FormData(e.currentTarget)));
      toast(v ? 'Ventana actualizada.' : 'Ventana creada.');
      onClose();
    } catch (err) {
      const x = err as Error & { issues?: { path: PropertyKey[]; message: string }[] };
      setErrors(x.issues ? Object.fromEntries(x.issues.map((i) => [String(i.path[0]), i.message])) : { valle: x.message });
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={v ? `${v.variedad} · ${v.valle}` : 'Nueva ventana'}
      description="Fechas en formato mm-dd, por ejemplo 03-15 para el 15 de marzo."
      footer={
        <>
          {v && can('calendario', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              onClick={() => confirm('¿Eliminar esta ventana?') && engine && void engine.write('ventana', 'delete', v.id).then(onClose)}
            >
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="ventana-form" variant="primary">
            Guardar
          </Button>
        </>
      }
    >
      <form id="ventana-form" onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
        <Field label="Variedad" required error={errors.variedad}>
          {(i) => <Input id={i} name="variedad" list="ventana-variedades" defaultValue={v?.variedad} required />}
        </Field>
        <datalist id="ventana-variedades">
          {VARIEDADES.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        <Field label="Valle" required error={errors.valle}>
          {(i) => <Input id={i} name="valle" list="ventana-valles" defaultValue={v?.valle} required />}
        </Field>
        <datalist id="ventana-valles">
          {VALLES.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        <Field label="Desde (mm-dd)" required error={errors.desde}>
          {(i) => <Input id={i} name="desde" placeholder="03-15" defaultValue={v?.desde} required />}
        </Field>
        <Field label="Hasta (mm-dd)" required error={errors.hasta}>
          {(i) => <Input id={i} name="hasta" placeholder="04-20" defaultValue={v?.hasta} required />}
        </Field>
        <Field label="Fuente o nota" className="sm:col-span-2">
          {(i) => <Input id={i} name="fuente" defaultValue={v?.fuente ?? ''} />}
        </Field>
      </form>
    </Dialog>
  );
}
