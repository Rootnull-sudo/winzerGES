'use client';
import {
  fechaHoy,
  fueraDeRango,
  PARAMS_ANALISIS,
  rangosAnalisis,
  type Analisis,
  type Lote,
  type OrgConfig,
  type ParamAnalisis,
  type Rango
} from '@winzer/domain';
import { FlaskConical, Plus, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Adjuntos } from '@/components/adjuntos';
import { useCan, useTemporadaElegida } from '@/components/shell/org-context';
import { Badge, Codigo } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChartCard, Lineas } from '@/components/ui/chart';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { EmptyState, PageHeader } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { useEntity, useSync, useSyncState } from '@/lib/offline/hooks';

type Enologia = OrgConfig['enologia'];
type Pend = { _pending: boolean; _version: number };
type AnalisisRow = Analisis & Pend;
const PARAM = Object.fromEntries(PARAMS_ANALISIS.map(([k, l, u, d]) => [k, { l, u, d }])) as Record<ParamAnalisis, { l: string; u: string; d: number }>;
const nf = (v: number, d = 2) => v.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d });
const fecha = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
const fechaCorta = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });

/** Columnas de resultados en la tabla (abreviadas como v1). */
const COLS_TABLA: [ParamAnalisis, string][] = [
  ['ph', 'pH'],
  ['acidezTotal', 'AT'],
  ['acidezVolatil', 'AV'],
  ['so2Libre', 'SO₂ L'],
  ['so2Total', 'SO₂ T'],
  ['alcohol', 'Alc.']
];

export function LaboratorioView({ enologia }: { enologia: Enologia }) {
  const can = useCan();
  const elegida = useTemporadaElegida();
  const analisis = useEntity<Analisis>('analisis') as AnalisisRow[] | undefined;
  const lotes = (useEntity<Lote>('lote') as (Lote & Pend)[] | undefined) ?? [];
  const [editing, setEditing] = useState<AnalisisRow | 'nuevo' | null>(null);
  const [filtro, setFiltro] = useState('');
  const loteById = useMemo(() => new Map(lotes.map((l) => [l.id, l])), [lotes]);
  const rangosDe = (loteId: string) => rangosAnalisis(loteById.get(loteId)?.tipo, enologia);
  const lotesTemp = lotes.filter((l) => l.temporadaId === elegida?.id);
  const deTemporada = (analisis ?? []).filter((a) => loteById.get(a.loteId)?.temporadaId === elegida?.id);
  const rows = deTemporada.filter((a) => !filtro || a.loteId === filtro).sort((a, b) => b.fecha.localeCompare(a.fecha));

  // Evolución: el lote del filtro o, si no hay, el con más análisis.
  const conAnalisis = lotesTemp.filter((l) => deTemporada.some((a) => a.loteId === l.id));
  const [loteGraf, setLoteGraf] = useState('');
  const loteSel =
    loteById.get(filtro || loteGraf) ??
    conAnalisis.toSorted((a, b) => deTemporada.filter((x) => x.loteId === b.id).length - deTemporada.filter((x) => x.loteId === a.id).length)[0];

  const cols: Column<AnalisisRow>[] = [
    { key: 'fecha', label: 'Fecha', render: (a) => <span className={a._pending ? 'italic' : undefined}>{fecha(a.fecha)}</span> },
    {
      key: 'lote',
      label: 'Lote',
      value: (a) => loteById.get(a.loteId)?.codigo ?? '',
      render: (a) => <Codigo codigo={loteById.get(a.loteId)?.codigo ?? '—'} pending={a._pending} />
    },
    {
      key: 'laboratorio',
      label: 'Laboratorio',
      value: (a) => a.laboratorio,
      render: (a) => (
        <span className="flex items-center gap-2">
          {a.laboratorio}
          {a.autorizadoSAG ? <Badge tone="ok">SAG</Badge> : <Badge tone="warn">No autorizado</Badge>}
        </span>
      )
    },
    ...COLS_TABLA.map(([k, label]): Column<AnalisisRow> => ({
      key: k,
      label,
      num: true,
      value: (a) => (a[k] != null ? Number(a[k]) : null) as number,
      render: (a) => <Valor valor={a[k]} clave={k} rango={rangosDe(a.loteId)[k as keyof ReturnType<typeof rangosDe>]} />
    })),
    {
      key: 'fuera',
      label: 'Fuera de rango',
      value: (a) =>
        fueraDeRango(a, rangosDe(a.loteId))
          .map((f) => f.etiqueta)
          .join(', '),
      render: (a) => {
        const f = fueraDeRango(a, rangosDe(a.loteId));
        return f.length ? (
          <span className="flex flex-wrap gap-1">
            {f.map((x) => (
              <Badge key={x.clave} tone="warn">
                {x.etiqueta}
              </Badge>
            ))}
          </span>
        ) : (
          <Badge tone="ok">En rango</Badge>
        );
      }
    }
  ];

  return (
    <>
      <PageHeader
        area="Operación"
        title="Laboratorio"
        description="Resultados por lote comparados con los rangos objetivo de la viña (Configuración → Parámetros). Para el certificado D.O. y exportaciones, el análisis debe venir de un laboratorio autorizado por el SAG. Funciona sin señal; el informe se adjunta con conexión."
        actions={
          can('laboratorio', 'c') && (
            <Button variant="primary" onClick={() => setEditing('nuevo')}>
              <Plus size={16} /> Nuevo análisis
            </Button>
          )
        }
      />
      {!analisis ? (
        <div className="h-64 animate-pulse rounded-card bg-sunken" aria-label="Cargando análisis" />
      ) : (
        <>
          {loteSel && (
            <Evolucion
              lote={loteSel}
              analisis={deTemporada.filter((a) => a.loteId === loteSel.id).sort((a, b) => a.fecha.localeCompare(b.fecha))}
              rangos={rangosDe(loteSel.id)}
              selector={
                !filtro &&
                conAnalisis.length > 1 && (
                  <Select aria-label="Lote del gráfico" value={loteSel.id} onChange={(e) => setLoteGraf(e.target.value)} className="h-9 text-[14px]">
                    {conAnalisis.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.codigo}
                      </option>
                    ))}
                  </Select>
                )
              }
            />
          )}
          <DataTable
            rows={rows}
            columns={cols}
            onRowClick={(a) => setEditing(a)}
            exportName={`analisis-${elegida?.anio ?? ''}`}
            canExport={can('laboratorio', 'x')}
            toolbar={
              <Select aria-label="Lote" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="h-9 w-auto text-[14px]">
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
                icon={<FlaskConical size={28} strokeWidth={1.5} />}
                title={`Sin análisis en la temporada ${elegida?.anio ?? ''}`}
                text="Registra los resultados del laboratorio por lote: se comparan con los rangos objetivo y puedes adjuntar el informe."
              />
            }
          />
        </>
      )}
      {editing && (
        <AnalisisDialog
          analisis={editing === 'nuevo' ? (filtro ? ({ loteId: filtro } as AnalisisRow) : null) : editing}
          lotes={lotes.filter((l) => l.temporadaId === elegida?.id || (editing !== 'nuevo' && l.id === editing.loteId))}
          enologia={enologia}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

/** Valor de un parámetro en la tabla: fuera de rango en color de aviso, con ícono (el color no es la única señal). */
function Valor({ valor, clave, rango }: { valor: unknown; clave: ParamAnalisis; rango?: Rango }) {
  if (valor == null || valor === '') return <span className="text-ink-4">—</span>;
  const v = Number(valor);
  const fuera = rango && (v < rango.min || v > rango.max);
  return (
    <span className={cn('inline-flex items-center gap-1', fuera && 'font-semibold text-warn')} title={rango ? `Objetivo ${rango.min}–${rango.max}` : undefined}>
      {fuera && <TriangleAlert size={13} aria-label="fuera de rango" />}
      {nf(v, PARAM[clave].d)}
    </span>
  );
}

function Evolucion({
  lote,
  analisis,
  rangos,
  selector
}: {
  lote: Lote;
  analisis: AnalisisRow[];
  rangos: ReturnType<typeof rangosAnalisis>;
  selector: React.ReactNode;
}) {
  const x = analisis.map((a) => fechaCorta(a.fecha));
  const serie = (k: ParamAnalisis) => analisis.map((a) => (a[k] != null ? Number(a[k]) : null));
  return (
    <section aria-label="Evolución por lote" className="mb-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Evolución del lote {lote.codigo}</h2>
        {selector && <div className="w-44">{selector}</div>}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard titulo="SO₂ libre" nota={`mg/L. Franja: objetivo ${rangos.so2Libre.min}–${rangos.so2Libre.max} mg/L.`}>
          <Lineas
            etiquetasX={x}
            series={[{ id: 'so2', nombre: 'SO₂ libre', color: 't0', valores: serie('so2Libre') }]}
            banda={{ desde: rangos.so2Libre.min, hasta: rangos.so2Libre.max, etiqueta: 'Objetivo' }}
            unidad="mg/L"
          />
        </ChartCard>
        <ChartCard titulo="Acidez total" nota={`g/L de ácido tartárico. Franja: objetivo ${nf(rangos.acidezTotal.min, 1)}–${nf(rangos.acidezTotal.max, 1)}.`}>
          <Lineas
            etiquetasX={x}
            series={[{ id: 'at', nombre: 'Acidez total', color: 't0', valores: serie('acidezTotal') }]}
            banda={{ desde: rangos.acidezTotal.min, hasta: rangos.acidezTotal.max, etiqueta: 'Objetivo' }}
            formato={(v) => nf(v, 1)}
            unidad="g/L"
          />
        </ChartCard>
      </div>
    </section>
  );
}

function AnalisisDialog({ analisis, lotes, enologia, onClose }: { analisis: AnalisisRow | null; lotes: Lote[]; enologia: Enologia; onClose: () => void }) {
  const can = useCan();
  const engine = useSync();
  const sync = useSyncState();
  const toast = useToast();
  const a = analisis?.id ? analisis : null;
  const editable = a ? can('laboratorio', 'e') : can('laboratorio', 'c');
  const [f, setF] = useState<Record<string, string | boolean>>({
    fecha: a?.fecha ?? fechaHoy(),
    loteId: analisis?.loteId ?? '',
    laboratorio: a?.laboratorio ?? '',
    autorizadoSAG: a ? !!a.autorizadoSAG : true,
    ...Object.fromEntries(PARAMS_ANALISIS.map(([k]) => [k, a?.[k] != null ? String(a[k]) : ''])),
    color: a?.color ?? '',
    certificadoDO: a ? !!a.certificadoDO : false,
    observaciones: a?.observaciones ?? ''
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const lote = lotes.find((l) => l.id === f.loteId);
  const rangos = rangosAnalisis(lote?.tipo, enologia);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const check = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.checked });

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!engine) return;
    setErrores({});
    try {
      await engine.write('analisis', 'upsert', a?.id ?? null, f);
      toast(navigator.onLine ? 'Análisis guardado.' : 'Análisis guardado en este equipo; se enviará al recuperar la señal.');
      onClose();
    } catch (err) {
      const issues = (err as { issues?: { path: PropertyKey[]; message: string }[] }).issues;
      if (issues) setErrores(Object.fromEntries(issues.map((i) => [String(i.path[0]), i.message])));
      setError((err as Error).message);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={a ? `Análisis del ${fecha(a.fecha)}` : 'Nuevo análisis'}
      description="Resultados comparados con el rango objetivo según el tipo de vino del lote."
      footer={
        <>
          {a && can('laboratorio', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              onClick={() => confirm('¿Eliminar este análisis?') && engine && void engine.write('analisis', 'delete', a.id).then(onClose)}
            >
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            {editable ? 'Cancelar' : 'Cerrar'}
          </Button>
          {editable && (
            <Button type="submit" form="analisis-form" variant="primary">
              Guardar
            </Button>
          )}
        </>
      }
    >
      <form id="analisis-form" onSubmit={guardar} className="grid gap-x-6 gap-y-5 sm:grid-cols-[1fr_15rem]">
        <fieldset disabled={!editable} className="grid content-start gap-4 sm:grid-cols-2">
          <legend className="sr-only">Muestra y resultados</legend>
          <Field label="Fecha" required error={errores.fecha}>
            {(i, d) => <Input id={i} type="date" value={String(f.fecha)} onChange={set('fecha')} aria-describedby={d} required />}
          </Field>
          <Field label="Lote" required error={errores.loteId}>
            {(i, d) => (
              <Select id={i} value={String(f.loteId)} onChange={set('loteId')} aria-describedby={d} required>
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
          <Field label="Laboratorio" required error={errores.laboratorio}>
            {(i, d) => <Input id={i} value={String(f.laboratorio)} onChange={set('laboratorio')} aria-describedby={d} required />}
          </Field>
          <label className="flex items-center gap-2.5 self-end pb-2 text-[14px]">
            <input type="checkbox" checked={!!f.autorizadoSAG} onChange={check('autorizadoSAG')} className="size-4 accent-ink" />
            Laboratorio autorizado por el SAG
          </label>
          <h3 className="mt-1 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase sm:col-span-2">Resultados</h3>
          {PARAMS_ANALISIS.map(([k, label, unidad]) => (
            <Field
              key={k}
              label={label}
              unit={unidad || undefined}
              error={errores[k]}
              hint={k === 'acidezVolatil' ? 'Límite legal referencial: 1,5 g/L. Sobre 0,7 g/L suele ser perceptible.' : undefined}
            >
              {(i, d) => <Input id={i} type="number" min={0} step="any" value={String(f[k])} onChange={set(k)} aria-describedby={d} className="tabular" />}
            </Field>
          ))}
          <Field label="Color u observación visual">{(i) => <Input id={i} value={String(f.color)} onChange={set('color')} />}</Field>
          <label className="flex items-center gap-2.5 self-end pb-2 text-[14px]">
            <input type="checkbox" checked={!!f.certificadoDO} onChange={check('certificadoDO')} className="size-4 accent-ink" />
            Respalda el certificado de D.O.
          </label>
          <Field label="Observaciones" className="sm:col-span-2">
            {(i) => <Textarea id={i} value={String(f.observaciones)} onChange={set('observaciones')} />}
          </Field>
        </fieldset>
        <aside aria-label="Comparación con rangos" className="self-start rounded-card bg-sunken px-4 py-3 text-[13px]">
          <p className="mb-2 font-semibold text-ink-2">
            {lote ? `Objetivo para ${lote.tipo === 'blanco' ? 'blancos' : 'tintos'}` : 'Elige el lote para comparar'}
          </p>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
            {(Object.keys(rangos) as (keyof typeof rangos)[])
              .sort((x, y) => PARAMS_ANALISIS.findIndex((p) => p[0] === x) - PARAMS_ANALISIS.findIndex((p) => p[0] === y))
              .map((k) => {
                const r = rangos[k];
                const v = f[k];
                const tiene = v !== '' && v != null;
                const ok = !tiene || (Number(v) >= r.min && Number(v) <= r.max);
                return (
                  <div key={k} className="contents">
                    <dt className="text-ink-3">
                      {PARAM[k].l}{' '}
                      <span className="text-[11px] tabular">
                        ({r.min}–{r.max})
                      </span>
                    </dt>
                    <dd className={cn('text-right tabular', tiene && (ok ? 'text-ok' : 'font-semibold text-warn'))}>
                      {tiene ? `${nf(Number(v), PARAM[k].d)} ${ok ? '✓' : '⚠'}` : '—'}
                    </dd>
                  </div>
                );
              })}
          </dl>
        </aside>
        {error && (
          <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad sm:col-span-2">
            {error}
          </p>
        )}
      </form>
      {a && (
        <section aria-label="Informe del laboratorio" className="mt-6 border-t border-rule pt-4">
          <h3 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Informe del laboratorio</h3>
          {a._pending || sync?.online === false ? (
            <p className="text-[13px] text-ink-3">El informe en PDF se adjunta con conexión, una vez sincronizado el análisis.</p>
          ) : (
            <Adjuntos entidad="analisis" registroId={a.id} />
          )}
        </section>
      )}
    </Dialog>
  );
}
