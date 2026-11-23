'use client';
import {
  type AdicionSO2,
  type Estanque,
  etapaFicha,
  fechaHoy,
  type Fermentacion,
  gramosEnUnidad,
  horasDesdeUltimaAdicion,
  type Insumo,
  litrosLote,
  type Lote,
  MOTIVOS_SO2,
  type MovBodega,
  oenology,
  type OrgConfig,
  type SeguimientoFA,
  TEMPERATURA_RIESGO
} from '@winzer/domain';
import { ArrowLeft, Download, FlaskConical, Plus, Printer, Thermometer } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { useCan, useOrg, useTemporadaElegida } from '@/components/shell/org-context';
import { Badge, TipoUva } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChartCard, Lineas } from '@/components/ui/chart';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { EmptyState, PageHeader, Stat, StatGrid } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { useEntity, useSync } from '@/lib/offline/hooks';

const { alcoholProbable, brixDesdeDensidad, dosisMgL, estadoSO2, fraccionSO2, gramosParaDosis, rangoSO2, so2Teorico, eficienciaSO2, tiemposFermentacion } =
  oenology;
type Enologia = OrgConfig['enologia'];
type Pend = { _pending: boolean; _version: number };
type FichaRow = Fermentacion & Pend;
type SegRow = SeguimientoFA & Pend;
type AdiRow = AdicionSO2 & Pend;

const TONO_SO2 = { ok: 'ok', critico: 'bad', alto: 'warn', bajo: 'info' } as const;
const ETIQUETA_SO2 = { ok: 'En rango', critico: 'Crítico', alto: 'Alto', bajo: 'Bajo' } as const;
const dec = (v: unknown, d = 1) => (v == null || v === '' ? '—' : Number(v).toLocaleString('es-CL', { maximumFractionDigits: d }));
const fecha = (d?: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const corta = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'numeric' });

function useDatos() {
  const fichas = useEntity<Fermentacion>('fermentacion') as FichaRow[] | undefined;
  const segs = useEntity<SeguimientoFA>('seguimiento') as SegRow[] | undefined;
  const adiciones = useEntity<AdicionSO2>('adicion_so2') as AdiRow[] | undefined;
  const lotes = useEntity<Lote>('lote') as (Lote & Pend)[] | undefined;
  const estanques = useEntity<Estanque>('estanque') as (Estanque & Pend)[] | undefined;
  const insumos = useEntity<Insumo>('insumo') as (Insumo & Pend)[] | undefined;
  const movs = useEntity<MovBodega>('mov_bodega') as (MovBodega & Pend)[] | undefined;
  return {
    fichas: fichas ?? [],
    segs: segs ?? [],
    adiciones: adiciones ?? [],
    lotes: lotes ?? [],
    estanques: estanques ?? [],
    insumos: insumos ?? [],
    movs: movs ?? [],
    cargando: !fichas || !segs || !adiciones || !lotes || !estanques
  };
}
type Datos = ReturnType<typeof useDatos>;

/** Navega dentro de la página sin ir al servidor (funciona sin señal). */
function useFichaUrl() {
  const sp = useSearchParams();
  const pathname = usePathname();
  const ir = (id: string | null) => {
    const q = new URLSearchParams(sp);
    if (id) q.set('ficha', id);
    else q.delete('ficha');
    window.history.pushState(null, '', q.toString() ? `${pathname}?${q}` : pathname);
  };
  return [sp.get('ficha'), ir] as const;
}

/** Último SO₂ libre medido de una ficha (v1: el último seguimiento con so2Libre). */
const ultimoSO2 = (segs: SegRow[]) =>
  segs
    .filter((s) => s.so2Libre != null)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .at(-1)?.so2Libre ?? null;

export function FermentacionView({ enologia }: { enologia: Enologia }) {
  const datos = useDatos();
  const [fichaId, ir] = useFichaUrl();
  const [nueva, setNueva] = useState(false);
  const can = useCan();
  const ficha = datos.fichas.find((f) => f.id === fichaId);
  if (datos.cargando) return <div className="h-64 animate-pulse rounded-card bg-sunken" aria-label="Cargando fermentación" />;
  if (fichaId && ficha) return <Detalle ficha={ficha} datos={datos} enologia={enologia} onVolver={() => ir(null)} />;
  return (
    <>
      <PageHeader
        area="Vinificación y bodega"
        title="Fermentación"
        description={`Fichas de fermentación con su seguimiento diario y las adiciones de metabisulfito. Modo suave: SO₂ libre ${enologia.so2Tinto.min}–${enologia.so2Tinto.max} mg/L en tintos y ${enologia.so2Blanco.min}–${enologia.so2Blanco.max} en blancos. Funciona sin señal.`}
        actions={
          can('fermentacion', 'c') && (
            <Button variant="primary" onClick={() => setNueva(true)}>
              <Plus size={16} /> Nueva ficha
            </Button>
          )
        }
      />
      <Lista datos={datos} enologia={enologia} onAbrir={(id) => ir(id)} />
      {nueva && <FichaDialog ficha={null} datos={datos} onClose={() => setNueva(false)} />}
    </>
  );
}

function Lista({ datos, enologia, onAbrir }: { datos: Datos; enologia: Enologia; onAbrir: (id: string) => void }) {
  const elegida = useTemporadaElegida();
  const loteById = new Map(datos.lotes.map((l) => [l.id, l]));
  const estById = new Map(datos.estanques.map((e) => [e.id, e]));
  const fichas = datos.fichas
    .filter((f) => loteById.get(f.loteId)?.temporadaId === elegida?.id)
    .sort((a, b) => (b.inicioFA ?? b.fechaMolienda ?? '').localeCompare(a.inicioFA ?? a.fechaMolienda ?? ''));
  if (fichas.length === 0)
    return (
      <EmptyState
        icon={<FlaskConical size={28} strokeWidth={1.5} />}
        title={`No hay fichas en la temporada ${elegida?.anio ?? ''}`}
        text="La ficha se crea sola, en borrador, con la primera entrada de uva o mosto del lote a bodega. También puedes crearla a mano."
      />
    );
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {fichas.map((f) => {
        const segs = datos.segs.filter((s) => s.fermentacionId === f.id);
        const t = tiemposFermentacion(f, segs, enologia, fechaHoy());
        const so2 = ultimoSO2(segs);
        const est = so2 != null ? estadoSO2(so2, f.tipo, enologia) : null;
        return (
          <li key={f.id}>
            <button onClick={() => onAbrir(f.id)} className="w-full rounded-card border border-rule bg-raised p-4 text-left hover:border-rule-strong">
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className={cn('block font-label text-[20px] leading-tight', f._pending && 'italic')}>{f.codigo}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-ink-3">
                    {loteById.get(f.loteId)?.codigo ?? '—'} · {estById.get(f.estanqueId ?? '')?.codigo ?? 'sin estanque'} · {dec(f.volumen, 0)} L
                  </span>
                </span>
                <TipoUva tipo={f.tipo} />
              </span>
              <span className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone={f.estado === 'borrador' ? 'neutral' : f.estado === 'cerrada' ? 'ok' : 'info'}>
                  {f.estado === 'borrador' ? 'Borrador' : etapaFicha(f)}
                </Badge>
                {t.alertaDesvio && (
                  <Badge tone="warn">
                    Desvío {t.desvio! > 0 ? '+' : ''}
                    {t.desvio} d
                  </Badge>
                )}
                {est && <Badge tone={TONO_SO2[est]}>SO₂ {dec(so2, 0)} mg/L</Badge>}
              </span>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
                <dt className="text-ink-3">Días de FA</dt>
                <dd className="text-right tabular">
                  {t.diasFA ?? '—'}
                  {f.diasPlanificados ? ` / ${f.diasPlanificados} plan.` : ''}
                </dd>
                <dt className="text-ink-3">Latencia</dt>
                <dd className="text-right tabular">{t.latencia != null ? `${t.latencia} d` : '—'}</dd>
                <dt className="text-ink-3">Velocidad</dt>
                <dd className="text-right tabular">{t.velocidad != null ? `${dec(t.velocidad)} g/L/día` : '—'}</dd>
                <dt className="text-ink-3">°Brix actual</dt>
                <dd className="text-right tabular">{dec(t.brixActual)}</dd>
              </dl>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------ Detalle ------------------------------ */

function Detalle({ ficha: f, datos, enologia, onVolver }: { ficha: FichaRow; datos: Datos; enologia: Enologia; onVolver: () => void }) {
  const can = useCan();
  const engine = useSync();
  const toast = useToast();
  const [dialogo, setDialogo] = useState<'ficha' | 'seg' | 'so2' | null>(null);
  const [seg, setSeg] = useState<SegRow | null>(null);
  const segs = datos.segs.filter((s) => s.fermentacionId === f.id).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const adiciones = datos.adiciones.filter((a) => a.fermentacionId === f.id).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const lote = datos.lotes.find((l) => l.id === f.loteId);
  const t = tiemposFermentacion(f, segs, enologia, fechaHoy());
  const rango = rangoSO2(f.tipo, enologia);
  const so2 = ultimoSO2(segs);
  const est = so2 != null ? estadoSO2(so2, f.tipo, enologia) : null;
  const horas = horasDesdeUltimaAdicion(adiciones);
  const ultimoSeg = segs.at(-1);

  // Avisos de la ficha (v1: fermentacion/index.js:108-113) + temperatura sobre 32 °C (v1 la bloqueaba).
  const avisos: { tono: 'bad' | 'warn' | 'info'; titulo: string; texto: string }[] = [];
  if (est === 'critico')
    avisos.push({
      tono: 'bad',
      titulo: 'Sobre-sulfitado',
      texto: `SO₂ libre ${dec(so2, 0)} mg/L supera el umbral de alerta (${rango.alerta} mg/L). No agregues más metabisulfito; evalúa airear o mezclar.`
    });
  if (est === 'alto') avisos.push({ tono: 'warn', titulo: 'SO₂ libre sobre el rango suave', texto: `${dec(so2, 0)} mg/L (rango ${rango.min}–${rango.max}).` });
  if (est === 'bajo' && f.finFA)
    avisos.push({ tono: 'info', titulo: 'SO₂ libre bajo el rango', texto: `${dec(so2, 0)} mg/L. Evalúa una adición para proteger el vino.` });
  if (t.alertaDesvio)
    avisos.push({
      tono: 'warn',
      titulo: `Desviación de ${t.desvio! > 0 ? '+' : ''}${t.desvio} días`,
      texto: `La FA ${f.finFA ? 'duró' : 'lleva'} ${t.diasFA} días vs ${f.diasPlanificados} planificados.`
    });
  if (horas != null && horas < enologia.intervaloMinHoras)
    avisos.push({
      tono: 'info',
      titulo: 'Intervalo mínimo entre adiciones',
      texto: `La última adición fue hace menos de ${enologia.intervaloMinHoras} h. Espera antes de una nueva.`
    });
  if (t.enCurso && ultimoSeg && (Date.now() - Date.parse(`${ultimoSeg.fecha}T12:00:00`)) / 86_400_000 > 2)
    avisos.push({ tono: 'warn', titulo: 'Seguimiento atrasado', texto: `El último registro es del ${fecha(ultimoSeg.fecha)}.` });
  if (ultimoSeg?.temperatura != null && Number(ultimoSeg.temperatura) > TEMPERATURA_RIESGO)
    avisos.push({
      tono: 'warn',
      titulo: 'Temperatura muy alta',
      texto: `${dec(ultimoSeg.temperatura)} °C el ${fecha(ultimoSeg.fecha)}: riesgo de parada de fermentación.`
    });

  function abrirSO2() {
    if (
      horas != null &&
      horas < enologia.intervaloMinHoras &&
      !confirm(`La última adición fue hace ${Math.round(horas)} horas (mínimo recomendado ${enologia.intervaloMinHoras} h). ¿Registrar de todas formas?`)
    )
      return;
    setDialogo('so2');
  }
  function reporte() {
    const totalG = adiciones.reduce((a, x) => a + Number(x.gramos), 0);
    const costo = adiciones.reduce((a, x) => a + Number(x.costo), 0);
    const filas: (string | number)[][] = [
      ['Ficha', f.codigo],
      ['Lote', lote?.codigo ?? ''],
      ['Variedad', f.variedad ?? ''],
      ['Tipo', f.tipo],
      ['Volumen (L)', Number(f.volumen)],
      ['Inicio FA', f.inicioFA ?? ''],
      ['Fin FA', f.finFA ?? ''],
      ['Días FA', t.diasFA ?? ''],
      ['Latencia (días)', t.latencia ?? ''],
      ['Velocidad (g/L/día)', t.velocidad != null ? Math.round(t.velocidad * 10) / 10 : ''],
      ['FML', f.inicioFML ? `${f.inicioFML} a ${f.finFML ?? ''}` : ''],
      ['Alcohol final (% vol)', f.alcoholFinal ?? ''],
      ['Azúcar residual (g/L)', f.azucarResidual ?? ''],
      ['SO₂ agregado total (g)', totalG],
      ['Costo SO₂', costo],
      [],
      ['Fecha', 'Densidad', '°Brix', 'T° °C', 'pH', 'AV', 'SO₂ libre', 'SO₂ total', 'Responsable', 'Observaciones'],
      ...segs.map((s) => [
        s.fecha,
        s.densidad ?? '',
        s.brix ?? '',
        s.temperatura ?? '',
        s.ph ?? '',
        s.acidezVolatil ?? '',
        s.so2Libre ?? '',
        s.so2Total ?? '',
        s.responsable ?? '',
        s.observaciones ?? ''
      ])
    ];
    // ; y BOM para que Excel en español lo abra bien (igual que v1).
    const csv = '﻿' + filas.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `cierre_${f.codigo}.csv`;
    a.click();
  }

  const segCols: Column<SegRow>[] = [
    { key: 'fecha', label: 'Fecha', render: (s) => <span className={s._pending ? 'italic' : undefined}>{fecha(s.fecha)}</span> },
    { key: 'densidad', label: 'Densidad', num: true, value: (s) => Number(s.densidad ?? 0), render: (s) => dec(s.densidad) },
    { key: 'brix', label: '°Brix', num: true, value: (s) => Number(s.brix ?? 0), render: (s) => dec(s.brix) },
    {
      key: 'temperatura',
      label: 'T° °C',
      num: true,
      value: (s) => Number(s.temperatura ?? 0),
      render: (s) => <span className={Number(s.temperatura) > TEMPERATURA_RIESGO ? 'font-semibold text-warn' : ''}>{dec(s.temperatura)}</span>
    },
    { key: 'ph', label: 'pH', num: true, value: (s) => Number(s.ph ?? 0), render: (s) => dec(s.ph, 2) },
    { key: 'acidezVolatil', label: 'AV', num: true, value: (s) => Number(s.acidezVolatil ?? 0), render: (s) => dec(s.acidezVolatil, 2) },
    {
      key: 'so2Libre',
      label: 'SO₂ L',
      num: true,
      value: (s) => Number(s.so2Libre ?? 0),
      render: (s) => (s.so2Libre == null ? '—' : <Badge tone={TONO_SO2[estadoSO2(s.so2Libre, f.tipo, enologia)]}>{dec(s.so2Libre, 0)}</Badge>)
    },
    { key: 'so2Total', label: 'SO₂ T', num: true, value: (s) => Number(s.so2Total ?? 0), render: (s) => dec(s.so2Total, 0) },
    { key: 'responsable', label: 'Responsable', value: (s) => s.responsable ?? '' },
    {
      key: 'observaciones',
      label: 'Observaciones',
      value: (s) => s.observaciones ?? '',
      render: (s) => <span className="text-ink-2">{s.observaciones ?? ''}</span>
    }
  ];
  const adiCols: Column<AdiRow>[] = [
    { key: 'fecha', label: 'Fecha', render: (a) => <span className={a._pending ? 'italic' : undefined}>{fecha(a.fecha)}</span> },
    { key: 'producto', label: 'Producto', value: (a) => a.producto ?? '' },
    { key: 'gramos', label: 'Gramos', num: true, value: (a) => Number(a.gramos), render: (a) => dec(a.gramos, 0) },
    { key: 'volumen', label: 'Volumen', num: true, value: (a) => Number(a.volumen), render: (a) => `${dec(a.volumen, 0)} L` },
    { key: 'dosisMgL', label: 'Dosis mg/L', num: true, value: (a) => Number(a.dosisMgL), render: (a) => dec(a.dosisMgL) },
    { key: 'so2Previo', label: 'SO₂ previo', num: true, value: (a) => Number(a.so2Previo ?? 0), render: (a) => dec(a.so2Previo) },
    { key: 'so2Teorico', label: 'Teórico', num: true, value: (a) => Number(a.so2Teorico), render: (a) => dec(a.so2Teorico) },
    { key: 'so2Medido', label: 'Medido', num: true, value: (a) => Number(a.so2Medido ?? 0), render: (a) => dec(a.so2Medido) },
    {
      key: 'diferencia',
      label: 'Diferencia',
      num: true,
      value: (a) => (a.so2Medido != null ? Number(a.so2Medido) - Number(a.so2Teorico) : 0),
      render: (a) => {
        if (a.so2Medido == null) return '—';
        const d = Number(a.so2Medido) - Number(a.so2Teorico);
        return <span className={d < -10 ? 'font-semibold text-warn' : ''}>{dec(d)}</span>;
      }
    },
    { key: 'costo', label: 'Costo', num: true, value: (a) => Number(a.costo), render: (a) => `$${Number(a.costo).toLocaleString('es-CL')}` }
  ];
  const fechasSeg = segs.map((s) => corta(s.fecha));

  return (
    <>
      <button onClick={onVolver} className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> Fichas de fermentación
      </button>
      <PageHeader
        area="Vinificación y bodega"
        title={f.codigo}
        description={[lote?.codigo, f.variedad, `${dec(f.volumen, 0)} L`, f.estado === 'borrador' ? 'Borrador' : etapaFicha(f)].filter(Boolean).join(' · ')}
      />
      <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
        {can('fermentacion', 'c') && (
          <>
            <Button variant="primary" onClick={() => setDialogo('seg')}>
              <Plus size={15} aria-hidden /> Registrar seguimiento
            </Button>
            <Button onClick={abrirSO2}>Adición de metabisulfito</Button>
          </>
        )}
        {can('fermentacion', 'e') && <Button onClick={() => setDialogo('ficha')}>Editar hitos y datos</Button>}
        <Button variant="ghost" onClick={reporte} aria-label="Reporte de cierre (CSV)">
          <Download size={15} aria-hidden />
        </Button>
        <Button variant="ghost" onClick={() => window.print()} aria-label="Imprimir o guardar en PDF">
          <Printer size={15} aria-hidden />
        </Button>

        <span className="ml-auto text-[12px] text-ink-3">
          Modo suave SO₂ libre {rango.min}–{rango.max} mg/L · alerta &gt; {rango.alerta}
        </span>
      </div>
      <StatGrid>
        <Stat label="Días de FA" value={t.diasFA ?? '—'} sub={f.diasPlanificados ? `${f.diasPlanificados} planificados` : undefined} />
        <Stat label="Latencia" value={t.latencia != null ? `${t.latencia} d` : '—'} sub="inicio FA → fase tumultuosa" />
        <Stat label="Velocidad media" value={t.velocidad != null ? dec(t.velocidad) : '—'} sub="g/L/día de azúcar consumida" />
        <Stat
          label="SO₂ libre actual"
          value={so2 != null ? `${dec(so2, 0)} mg/L` : '—'}
          sub={est ? ETIQUETA_SO2[est] : 'sin medición'}
          icon={<Thermometer size={16} strokeWidth={1.6} />}
        />
      </StatGrid>
      {avisos.length > 0 && (
        <ul className="mb-6 flex flex-col gap-2" aria-label="Avisos de la ficha">
          {avisos.map((a, i) => (
            <li
              key={i}
              className={cn(
                'rounded-card px-4 py-2.5 text-[13px]',
                a.tono === 'bad' ? 'bg-bad-soft text-bad' : a.tono === 'warn' ? 'bg-warn-soft text-warn' : 'bg-info-soft text-info'
              )}
            >
              <b>{a.titulo}.</b> {a.texto}
            </li>
          ))}
        </ul>
      )}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <ChartCard titulo="Curva de fermentación" nota="°Brix por fecha de seguimiento (con densidad se calcula).">
          <Lineas
            etiquetasX={fechasSeg}
            series={[{ id: 'brix', nombre: '°Brix', color: 't0', valores: segs.map((s) => (s.brix != null ? Number(s.brix) : null)) }]}
            unidad="°Bx"
          />
        </ChartCard>
        <ChartCard titulo="Temperatura" nota={`°C. Sobre ${TEMPERATURA_RIESGO} °C hay riesgo de parada.`}>
          <Lineas
            etiquetasX={fechasSeg}
            series={[{ id: 't', nombre: 'Temperatura', color: 't0', valores: segs.map((s) => (s.temperatura != null ? Number(s.temperatura) : null)) }]}
            referencia={{ valor: TEMPERATURA_RIESGO, etiqueta: `${TEMPERATURA_RIESGO} °C` }}
            unidad="°C"
          />
        </ChartCard>
        <ChartCard titulo="Evolución del SO₂ libre" nota={`Franja: rango suave ${rango.min}–${rango.max} mg/L. Línea: alerta ${rango.alerta} mg/L.`}>
          <Lineas
            etiquetasX={fechasSeg}
            series={[{ id: 'so2', nombre: 'SO₂ libre', color: 't0', valores: segs.map((s) => (s.so2Libre != null ? Number(s.so2Libre) : null)) }]}
            banda={{ desde: rango.min, hasta: rango.max, etiqueta: 'Rango suave' }}
            referencia={{ valor: rango.alerta, etiqueta: `Alerta ${rango.alerta}` }}
            unidad="mg/L"
          />
        </ChartCard>
        <ChartCard titulo="Hitos">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
            {(
              [
                ['Molienda', f.fechaMolienda],
                ['Inicio FA', f.inicioFA],
                ['Fase tumultuosa', f.inicioTumultuosa],
                ['Corte / enfriado', f.fechaCorte],
                ['Fin FA', f.finFA],
                ...(f.tipo === 'tinto'
                  ? [
                      ['Inicio maceración', f.inicioMaceracion],
                      ['Descube', f.finMaceracion],
                      ['Inicio FML', f.inicioFML],
                      ['Fin FML', f.finFML]
                    ]
                  : [])
              ] as [string, string | null | undefined][]
            ).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-ink-3">{k}</dt>
                <dd className="text-right tabular">{fecha(v)}</dd>
              </div>
            ))}
            <dt className="text-ink-3">Alcohol probable inicial</dt>
            <dd className="text-right tabular">{f.brixInicial != null ? `${dec(alcoholProbable(f.brixInicial))} % vol` : '—'}</dd>
            <dt className="text-ink-3">Alcohol final</dt>
            <dd className="text-right tabular">{f.alcoholFinal != null ? `${dec(f.alcoholFinal)} % vol` : '—'}</dd>
          </dl>
        </ChartCard>
      </div>
      <h2 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Adiciones de metabisulfito</h2>
      <div className="mb-6">
        <DataTable
          rows={adiciones}
          columns={adiCols}
          exportName={`adiciones-so2-${f.codigo}`}
          canExport={can('fermentacion', 'x')}
          onRowClick={
            can('fermentacion', 'd')
              ? (a) => {
                  if (confirm('¿Eliminar esta adición? Se devuelve el metabisulfito al stock y se quita su medición.') && engine)
                    void engine.write('adicion_so2', 'delete', a.id).then(() => toast('Adición eliminada.'));
                }
              : undefined
          }
          empty={<p className="rounded-card border border-dashed border-rule-strong px-4 py-3 text-[13px] text-ink-3">Sin adiciones.</p>}
        />
      </div>
      <h2 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Seguimiento</h2>
      <DataTable
        rows={[...segs].reverse()}
        columns={segCols}
        exportName={`seguimiento-${f.codigo}`}
        canExport={can('fermentacion', 'x')}
        onRowClick={can('fermentacion', 'e') ? (s) => setSeg(s) : undefined}
        empty={
          <p className="rounded-card border border-dashed border-rule-strong px-4 py-3 text-[13px] text-ink-3">
            Sin registros. Anota densidad o °Brix y temperatura cada día.
          </p>
        }
      />
      {dialogo === 'ficha' && <FichaDialog ficha={f} datos={datos} onClose={() => setDialogo(null)} onBorrada={onVolver} />}
      {(dialogo === 'seg' || seg) && (
        <SeguimientoDialog
          ficha={f}
          seg={seg}
          enologia={enologia}
          onClose={() => {
            setDialogo(null);
            setSeg(null);
          }}
        />
      )}
      {dialogo === 'so2' && <SO2Dialog ficha={f} datos={datos} enologia={enologia} so2Previo={so2} onClose={() => setDialogo(null)} />}
    </>
  );
}

/* ------------------------------ Diálogos ------------------------------ */

function useGuardar(onClose: () => void) {
  const engine = useSync();
  const toast = useToast();
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function guardar(entity: string, id: string | null, data: Record<string, unknown>, ok: string) {
    if (!engine) return;
    try {
      await engine.write(entity, 'upsert', id, data);
      toast(navigator.onLine ? ok : `${ok} Guardado en este equipo; se enviará al recuperar la señal.`);
      onClose();
    } catch (e) {
      const x = e as Error & { issues?: { path: PropertyKey[]; message: string }[] };
      setErrors(x.issues ? Object.fromEntries(x.issues.map((i) => [String(i.path[0]), i.message])) : { _: x.message });
    }
  }
  return { errors, guardar };
}

function Pie({ onClose, form, enviar = 'Guardar' }: { onClose: () => void; form: string; enviar?: string }) {
  return (
    <>
      <Button type="button" onClick={onClose}>
        Cancelar
      </Button>
      <Button type="submit" form={form} variant="primary">
        {enviar}
      </Button>
    </>
  );
}

function ErrorGeneral({ errors, className }: { errors: Record<string, string>; className?: string }) {
  if (!errors._) return null;
  return (
    <p role="alert" className={cn('rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad', className)}>
      {errors._}
    </p>
  );
}

function FichaDialog({ ficha, datos, onClose, onBorrada }: { ficha: FichaRow | null; datos: Datos; onClose: () => void; onBorrada?: () => void }) {
  const { errors, guardar } = useGuardar(onClose);
  const can = useCan();
  const engine = useSync();
  const elegida = useTemporadaElegida();
  const f = ficha;
  const [tipo, setTipo] = useState<string>(f?.tipo ?? 'tinto');
  const [loteId, setLoteId] = useState(f?.loteId ?? '');
  const [codigo, setCodigo] = useState(f?.codigo ?? '');
  const lotes = datos.lotes.filter((l) => l.temporadaId === elegida?.id || l.id === f?.loteId);
  function elegirLote(id: string) {
    setLoteId(id);
    const l = datos.lotes.find((x) => x.id === id);
    if (l) {
      setTipo(l.tipo);
      if (!codigo) setCodigo(`FA-${l.codigo}`);
    }
  }
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    void guardar('fermentacion', f?.id ?? null, { ...data, codigo, loteId, tipo }, f ? 'Ficha actualizada.' : 'Ficha creada.');
  }
  const fld = (name: keyof Fermentacion, label: string, props: Record<string, unknown> = {}, unit?: string): ReactNode => (
    <Field label={label} unit={unit} error={errors[name as string]}>
      {(i, d) => <Input id={i} name={name as string} defaultValue={(f?.[name] as string | number | null) ?? ''} aria-describedby={d} {...props} />}
    </Field>
  );
  const fecha = (name: keyof Fermentacion, label: string) => fld(name, label, { type: 'date' });
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={f ? `Ficha ${f.codigo}` : 'Nueva ficha de fermentación'}
      footer={
        <>
          {f && can('fermentacion', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              onClick={() =>
                confirm(`¿Eliminar la ficha ${f.codigo}? Se eliminan también su seguimiento y sus adiciones de SO₂ (el metabisulfito vuelve al stock).`) &&
                engine &&
                void engine.write('fermentacion', 'delete', f.id).then(() => {
                  onClose();
                  onBorrada?.();
                })
              }
            >
              Eliminar
            </Button>
          )}
          <Pie onClose={onClose} form="ficha-form" />
        </>
      }
    >
      <form id="ficha-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
        <Field label="Código de la ficha" required error={errors.codigo}>
          {(i) => <Input id={i} value={codigo} onChange={(e) => setCodigo(e.target.value)} required />}
        </Field>
        <Field label="Lote" required error={errors.loteId}>
          {(i) => (
            <Select id={i} value={loteId} onChange={(e) => elegirLote(e.target.value)} required>
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
        <Field label="Estanque">
          {(i) => (
            <Select id={i} name="estanqueId" defaultValue={f?.estanqueId ?? ''}>
              <option value="">—</option>
              {datos.estanques.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.codigo}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Tipo" required>
          {(i) => (
            <Select id={i} value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="blanco">Blanco</option>
              <option value="tinto">Tinto</option>
            </Select>
          )}
        </Field>
        {fld('variedad', 'Variedad')}
        {fld('volumen', 'Volumen', { type: 'number', min: 1, step: 'any', required: true, className: 'tabular' }, 'L')}
        {fld('brixInicial', '°Brix inicial', { type: 'number', min: 10, max: 32, step: 0.1, className: 'tabular' })}
        {fld('phInicial', 'pH inicial', { type: 'number', min: 2.8, max: 4.2, step: 0.01, className: 'tabular' })}
        {fld('acidezInicial', 'Acidez total inicial', { type: 'number', min: 0, step: 0.1, className: 'tabular' }, 'g/L')}
        {fld('levadura', 'Levadura')}
        {fld('nutrientes', 'Nutrientes')}
        {fld('temperaturaObjetivo', 'Temperatura objetivo', { placeholder: '14–16 °C' })}
        {fld('diasPlanificados', 'Días de FA planificados', { type: 'number', min: 1, step: 1, className: 'tabular' }, 'días')}
        <Field label="Estado de la ficha">
          {(i) => (
            <Select id={i} name="estado" defaultValue={f?.estado ?? 'activa'}>
              <option value="borrador">Borrador</option>
              <option value="activa">Activa</option>
              <option value="cerrada">Cerrada</option>
            </Select>
          )}
        </Field>
        <h3 className="mt-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase sm:col-span-3">Hitos</h3>
        {fecha('fechaMolienda', 'Molienda')}
        {fecha('inicioFA', 'Inicio FA')}
        {fecha('inicioTumultuosa', 'Inicio fase tumultuosa')}
        {fecha('fechaCorte', 'Corte / enfriado')}
        {fecha('finFA', 'Fin FA')}
        {tipo === 'tinto' && (
          <>
            {fecha('inicioMaceracion', 'Inicio maceración')}
            {fecha('finMaceracion', 'Descube')}
            {fecha('inicioFML', 'Inicio FML')}
            {fecha('finFML', 'Fin FML')}
          </>
        )}
        {fld('alcoholFinal', 'Alcohol final', { type: 'number', min: 0, max: 18, step: 0.1, className: 'tabular' }, '% vol')}
        {fld('azucarResidual', 'Azúcar residual', { type: 'number', min: 0, step: 0.1, className: 'tabular' }, 'g/L')}
        <ErrorGeneral errors={errors} className="sm:col-span-3" />
      </form>
    </Dialog>
  );
}

function SeguimientoDialog({ ficha, seg, enologia, onClose }: { ficha: FichaRow; seg: SegRow | null; enologia: Enologia; onClose: () => void }) {
  const { errors, guardar } = useGuardar(onClose);
  const { user } = useOrg();
  const engine = useSync();
  const s = seg;
  const [v, setV] = useState({
    densidad: String(s?.densidad ?? ''),
    brix: String(s?.brix ?? ''),
    temperatura: String(s?.temperatura ?? ''),
    so2Libre: String(s?.so2Libre ?? '')
  });
  const brix = v.brix !== '' ? Number(v.brix) : v.densidad !== '' ? brixDesdeDensidad(v.densidad) : null;
  const est = v.so2Libre !== '' ? estadoSO2(v.so2Libre, ficha.tipo, enologia) : null;
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    void guardar('seguimiento', s?.id ?? null, { ...data, fermentacionId: ficha.id }, 'Seguimiento registrado.');
  }
  const num = (name: string, label: string, min: number, max: number, step: number | string, unit?: string, ctrl?: keyof typeof v) => (
    <Field label={label} unit={unit} error={errors[name]}>
      {(i, d) =>
        ctrl ? (
          <Input
            id={i}
            name={name}
            type="number"
            min={min}
            max={max}
            step={step}
            value={v[ctrl]}
            onChange={(e) => setV({ ...v, [ctrl]: e.target.value })}
            className="tabular"
            aria-describedby={d}
          />
        ) : (
          <Input
            id={i}
            name={name}
            type="number"
            min={min}
            max={max}
            step={step}
            defaultValue={(s?.[name as keyof SegRow] as number | null) ?? ''}
            className="tabular"
            aria-describedby={d}
          />
        )
      }
    </Field>
  );
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={s ? 'Editar seguimiento' : 'Registrar seguimiento'}
      description={ficha.codigo}
      footer={
        <>
          {s && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              onClick={() => confirm('¿Eliminar este registro?') && engine && void engine.write('seguimiento', 'delete', s.id).then(onClose)}
            >
              Eliminar
            </Button>
          )}
          <Pie onClose={onClose} form="seg-form" />
        </>
      }
    >
      <form id="seg-form" onSubmit={submit} className="grid gap-x-6 gap-y-4 sm:grid-cols-[1fr_14rem]">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Fecha" required error={errors.fecha}>
            {(i) => <Input id={i} name="fecha" type="date" defaultValue={s?.fecha ?? fechaHoy()} required />}
          </Field>
          <Field label="Responsable">{(i) => <Input id={i} name="responsable" defaultValue={s?.responsable ?? user.name} />}</Field>
          {num('densidad', 'Densidad', 980, 1140, 0.1, 'g/L', 'densidad')}
          <Field label="°Brix" hint="Si lo dejas vacío y hay densidad, se calcula." error={errors.brix}>
            {(i, d) => (
              <Input
                id={i}
                name="brix"
                type="number"
                min={-3}
                max={32}
                step={0.1}
                value={v.brix}
                onChange={(e) => setV({ ...v, brix: e.target.value })}
                className="tabular"
                aria-describedby={d}
              />
            )}
          </Field>
          {num('temperatura', 'Temperatura', 0, 40, 0.1, '°C', 'temperatura')}
          {num('ph', 'pH', 2.8, 4.3, 0.01)}
          {num('acidezVolatil', 'Acidez volátil', 0, 2, 0.01, 'g/L')}
          {num('so2Libre', 'SO₂ libre', 0, 150, 1, 'mg/L', 'so2Libre')}
          {num('so2Total', 'SO₂ total', 0, 400, 1, 'mg/L')}
          <Field label="Observaciones" className="sm:col-span-3">
            {(i) => <Textarea id={i} name="observaciones" defaultValue={s?.observaciones ?? ''} />}
          </Field>
        </div>
        <aside aria-label="Cálculo" className="self-start rounded-card bg-sunken px-4 py-3 text-[13px]">
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
            <dt className="text-ink-3">°Brix</dt>
            <dd className="text-right tabular">{brix != null ? dec(brix) : '—'}</dd>
            <dt className="text-ink-3">Alcohol potencial restante</dt>
            <dd className="text-right tabular">{brix != null ? `${dec(alcoholProbable(Math.max(0, brix)))} % vol` : '—'}</dd>
            <dt className="text-ink-3">Estado SO₂</dt>
            <dd className="text-right">{est ? <Badge tone={TONO_SO2[est]}>{ETIQUETA_SO2[est]}</Badge> : '—'}</dd>
          </dl>
          {Number(v.temperatura) > TEMPERATURA_RIESGO && (
            <p className="mt-2 text-[12px] font-semibold text-warn">Temperatura muy alta: riesgo de parada de fermentación.</p>
          )}
          {brix != null && brix <= 0 && !ficha.finFA && ficha.inicioFA && (
            <p className="mt-2 text-[12px] text-info">El °Brix indica fin de FA. Registra la fecha de término en «Editar hitos».</p>
          )}
        </aside>
        <ErrorGeneral errors={errors} className="sm:col-span-2" />
      </form>
    </Dialog>
  );
}

function SO2Dialog({
  ficha,
  datos,
  enologia,
  so2Previo,
  onClose
}: {
  ficha: FichaRow;
  datos: Datos;
  enologia: Enologia;
  so2Previo: number | null;
  onClose: () => void;
}) {
  const { errors, guardar } = useGuardar(onClose);
  const { user } = useOrg();
  const sulfitantes = datos.insumos.filter((i) => i.tipo === 'Sulfitante');
  const rango = rangoSO2(ficha.tipo, enologia);
  const previo0 = Number(so2Previo ?? 0);
  const [v, setV] = useState({
    insumoId: sulfitantes[0]?.id ?? '',
    volumen: String(Math.round(litrosLote(ficha.loteId, datos.movs)) || Number(ficha.volumen)),
    so2Previo: String(previo0),
    objetivo: String(Math.max(0, Math.round((rango.min + rango.max) / 2 - previo0))),
    gramos: '',
    so2Medido: ''
  });
  const insumo = sulfitantes.find((i) => i.id === v.insumoId);
  const fr = fraccionSO2(insumo);
  const sugeridos = gramosParaDosis(v.objetivo, v.volumen, fr);
  const dosis = dosisMgL(v.gramos, v.volumen, fr);
  const teorico = so2Teorico(v.so2Previo, dosis);
  const estTeo = estadoSO2(teorico, ficha.tipo, enologia);
  const cantidad = insumo ? gramosEnUnidad(v.gramos, insumo.unidad) : null;
  const costo = cantidad != null && insumo ? Math.round(cantidad * Number(insumo.precio)) : 0;
  const efic = v.so2Medido !== '' ? eficienciaSO2(v.so2Previo, v.so2Medido, dosis) : null;
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      estTeo === 'critico' &&
      !confirm(`El SO₂ libre teórico quedaría en ${dec(teorico)} mg/L, sobre el umbral de alerta (${rango.alerta}). ¿Confirmas la adición?`)
    )
      return;
    const data = Object.fromEntries(new FormData(e.currentTarget));
    void guardar(
      'adicion_so2',
      null,
      { ...data, fermentacionId: ficha.id, fraccion: fr, producto: insumo?.nombre ?? null, costo, responsable: user.name },
      'Adición de metabisulfito registrada.'
    );
  }
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Adición de metabisulfito"
      description={`${ficha.codigo} · rango suave ${rango.min}–${rango.max} mg/L, alerta > ${rango.alerta}. K₂S₂O₅ ≈ 57% SO₂; Na₂S₂O₅ ≈ 67% SO₂.`}
      footer={<Pie onClose={onClose} form="so2-form" enviar="Registrar adición" />}
    >
      <form id="so2-form" onSubmit={submit} className="grid gap-x-6 gap-y-4 sm:grid-cols-[1fr_15rem]">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha" required>
            {(i) => <Input id={i} name="fecha" type="date" defaultValue={fechaHoy()} required />}
          </Field>
          <Field
            label="Producto"
            required
            error={errors.insumoId}
            hint={sulfitantes.length === 0 ? 'No hay insumos de tipo Sulfitante: créalos en Insumos (con conexión).' : undefined}
          >
            {(i, d) => (
              <Select id={i} name="insumoId" value={v.insumoId} onChange={(e) => setV({ ...v, insumoId: e.target.value })} aria-describedby={d} required>
                {sulfitantes.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nombre} ({x.unidad})
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Volumen del lote" unit="L" required error={errors.volumen}>
            {(i) => (
              <Input
                id={i}
                name="volumen"
                type="number"
                min={1}
                step="any"
                value={v.volumen}
                onChange={(e) => setV({ ...v, volumen: e.target.value })}
                className="tabular"
                required
              />
            )}
          </Field>
          <Field label="SO₂ libre previo" unit="mg/L">
            {(i) => (
              <Input
                id={i}
                name="so2Previo"
                type="number"
                min={0}
                step="any"
                value={v.so2Previo}
                onChange={(e) => setV({ ...v, so2Previo: e.target.value })}
                className="tabular"
              />
            )}
          </Field>
          <Field label="Aporte deseado" unit="mg/L" hint={`Sugeridos: ${dec(sugeridos, 0)} g.`}>
            {(i, d) => (
              <Input
                id={i}
                type="number"
                min={0}
                max={60}
                step="any"
                value={v.objetivo}
                onChange={(e) => setV({ ...v, objetivo: e.target.value })}
                className="tabular"
                aria-describedby={d}
              />
            )}
          </Field>
          <Field label="Gramos de producto" unit="g" required error={errors.gramos}>
            {(i) => (
              <span className="flex gap-2">
                <Input
                  id={i}
                  name="gramos"
                  type="number"
                  min={1}
                  step="any"
                  value={v.gramos}
                  onChange={(e) => setV({ ...v, gramos: e.target.value })}
                  className="tabular"
                  required
                />
                <Button type="button" size="sm" variant="ghost" className="h-10" onClick={() => setV({ ...v, gramos: String(Math.round(sugeridos)) })}>
                  Usar sugeridos
                </Button>
              </span>
            )}
          </Field>
          <Field label="Modo">
            {(i) => (
              <Select id={i} name="modo" defaultValue="suave">
                <option value="suave">Suave</option>
                <option value="moderado">Moderado</option>
              </Select>
            )}
          </Field>
          <Field label="SO₂ libre medido después" unit="mg/L" hint="Opcional: se anota también en el seguimiento.">
            {(i, d) => (
              <Input
                id={i}
                name="so2Medido"
                type="number"
                min={0}
                step="any"
                value={v.so2Medido}
                onChange={(e) => setV({ ...v, so2Medido: e.target.value })}
                className="tabular"
                aria-describedby={d}
              />
            )}
          </Field>
          <Field label="Motivo" className="sm:col-span-2">
            {(i) => (
              <>
                <Input id={i} name="motivo" list="motivos-so2" />
                <datalist id="motivos-so2">
                  {MOTIVOS_SO2.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
        </div>
        <aside aria-label="Cálculo" className="self-start rounded-card bg-sunken px-4 py-3 text-[13px]">
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
            <dt className="text-ink-3">Fracción SO₂</dt>
            <dd className="text-right tabular">{dec(fr * 100, 0)} %</dd>
            <dt className="text-ink-3">Dosis</dt>
            <dd className="text-right tabular">{v.gramos ? `${dec(dosis)} mg/L` : '—'}</dd>
            <dt className="text-ink-3">SO₂ teórico</dt>
            <dd className={cn('text-right font-semibold tabular', estTeo === 'critico' ? 'text-bad' : estTeo === 'alto' ? 'text-warn' : '')}>
              {v.gramos ? `${dec(teorico)} mg/L` : '—'}
            </dd>
            <dt className="text-ink-3">Costo</dt>
            <dd className="text-right tabular">{cantidad != null ? `$${costo.toLocaleString('es-CL')}` : '—'}</dd>
            {efic != null && (
              <>
                <dt className="text-ink-3">Diferencia</dt>
                <dd className="text-right tabular">{dec(Number(v.so2Medido) - teorico)} mg/L</dd>
                <dt className="text-ink-3">Eficiencia</dt>
                <dd className="text-right tabular">{dec(efic * 100, 0)} %</dd>
              </>
            )}
          </dl>
          {v.gramos && estTeo === 'critico' && <p className="mt-2 text-[12px] font-semibold text-bad">Riesgo de sobre-sulfitado.</p>}
          {v.gramos && estTeo === 'alto' && <p className="mt-2 text-[12px] font-semibold text-warn">Quedaría sobre el rango suave.</p>}
          {insumo && cantidad == null && <p className="mt-2 text-[12px] font-semibold text-bad">El producto debe estar en kg o g en el maestro de insumos.</p>}
        </aside>
        <ErrorGeneral errors={errors} className="sm:col-span-2" />
      </form>
    </Dialog>
  );
}
