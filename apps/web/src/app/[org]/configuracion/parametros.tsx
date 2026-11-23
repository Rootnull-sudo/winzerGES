'use client';
import {
  clp,
  fechaHoy,
  GRUPOS_PARAMETRO,
  INDICADORES,
  PARAMETROS,
  PARAMS_ANALISIS,
  PARAMS_CON_RANGO,
  valorPorDefecto,
  vigenteEn,
  type ParametroDef,
  type RangosLab,
  type RangoSO2
} from '@winzer/domain';
import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useCan, useOrg } from '@/components/shell/org-context';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { deleteParametro, saveParametro } from './actions';

export interface ParametroFila {
  id: string;
  clave: string;
  valor: unknown;
  vigenteDesde: string;
}
export interface IndicadorFila {
  clave: string;
  fecha: string;
  valor: number;
  fuente: string | null;
}

const REGIMENES: Record<string, string> = { '14D3': 'Pro Pyme general', '14D8': 'Pro Pyme transparente', '14A': 'Semi integrado' };
const nf = (v: number, max = 4) => v.toLocaleString('es-CL', { maximumFractionDigits: max });
const ETIQUETA_LAB = Object.fromEntries(PARAMS_ANALISIS.map(([k, l, u]) => [k, { l, u }])) as Record<string, { l: string; u: string }>;
const fecha = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });

/** Valor legible según el tipo del parámetro. */
export function mostrar(d: ParametroDef, v: unknown): string {
  switch (d.tipo) {
    case 'tasa':
      return `${nf(Number(v) * 100)} %`;
    case 'clp':
      return clp(v);
    case 'si_no':
      return v ? 'Sí' : 'No';
    case 'regimen':
      return REGIMENES[String(v)] ?? String(v);
    case 'rango_so2': {
      const r = v as RangoSO2;
      return `${nf(r.min)}–${nf(r.max)} · alerta ${nf(r.alerta)} ${d.unidad ?? ''}`.trim();
    }
    case 'rangos_lab': {
      const r = v as RangosLab;
      return PARAMS_CON_RANGO.map((k) => `${ETIQUETA_LAB[k]!.l} ${nf(r[k].min)}–${nf(r[k].max)}`).join(' · ');
    }
    default:
      return `${nf(Number(v))}${d.unidad ? ` ${d.unidad}` : ''}`;
  }
}

/** Parámetros de la viña con vigencia: valor de hoy, desde cuándo rige y cambios programados. */
export function Parametros({ filas, indicadores }: { filas: ParametroFila[]; indicadores: IndicadorFila[] }) {
  const can = useCan();
  const editable = can('configuracion', 'e');
  const hoy = fechaHoy();
  const [abierto, setAbierto] = useState<ParametroDef | null>(null);
  const vigentes = filas.map((f) => ({ ...f, desde: f.vigenteDesde }));

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        {GRUPOS_PARAMETRO.map((g) => (
          <section key={g.id} aria-labelledby={`grupo-${g.id}`}>
            <h3 id={`grupo-${g.id}`} className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">
              {g.nombre}
            </h3>
            <ul className="divide-y divide-rule rounded-card border border-rule bg-raised">
              {g.id === 'remuneraciones' && <IndicadoresFila indicadores={indicadores} hoy={hoy} />}
              {PARAMETROS.filter((d) => d.grupo === g.id).map((d) => {
                const v = vigenteEn(vigentes, d.clave, hoy);
                const prox = vigentes.filter((f) => f.clave === d.clave && f.desde > hoy).sort((a, b) => a.desde.localeCompare(b.desde))[0];
                return (
                  <li key={d.clave} className="flex min-h-12 items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] text-ink">{d.etiqueta}</span>
                      <span className="block text-[12px] text-ink-3">
                        {v ? `Desde el ${fecha(v.desde)}` : 'Valor por defecto'}
                        {prox && ` · cambia a ${mostrar(d, prox.valor)} el ${fecha(prox.desde)}`}
                      </span>
                    </span>
                    <span className="text-right text-[14px] font-semibold tabular">{mostrar(d, v ? v.valor : valorPorDefecto(d.clave))}</span>
                    {editable && (
                      <Button size="sm" variant="ghost" onClick={() => setAbierto(d)} aria-label={`Cambiar ${d.etiqueta}`}>
                        Cambiar
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {abierto && <ParametroDialog def={abierto} filas={filas.filter((f) => f.clave === abierto.clave)} onClose={() => setAbierto(null)} />}
    </>
  );
}

/** UF, UTM e IMM vigentes: globales, se leen aquí pero no se editan por viña. */
function IndicadoresFila({ indicadores, hoy }: { indicadores: IndicadorFila[]; hoy: string }) {
  const filas = indicadores.map((i) => ({ ...i, desde: i.fecha }));
  return (
    <li className="px-4 py-2.5">
      <span className="block text-[12px] text-ink-3">Indicadores del día (comunes a todas las viñas)</span>
      <span className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
        {(['uf', 'utm', 'imm'] as const).map((k) => {
          const v = vigenteEn(filas, k, hoy);
          const valor = v ? v.valor : Number(valorPorDefecto(INDICADORES[k].campo));
          return (
            <span key={k} title={v ? `${fecha(v.fecha)} · ${v.fuente ?? ''}` : 'Valor por defecto'}>
              <span className="text-ink-3">{INDICADORES[k].etiqueta}</span> <b className="tabular">{clp(valor)}</b>
            </span>
          );
        })}
      </span>
    </li>
  );
}

function ParametroDialog({ def, filas, onClose }: { def: ParametroDef; filas: ParametroFila[]; onClose: () => void }) {
  const { org } = useOrg();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const hoy = fechaHoy();
  const actual = vigenteEn(
    filas.map((f) => ({ ...f, desde: f.vigenteDesde })),
    def.clave,
    hoy
  );
  const base = actual ? actual.valor : valorPorDefecto(def.clave);

  function leerValor(fd: FormData): unknown {
    switch (def.tipo) {
      case 'tasa':
        return Number((Number(String(fd.get('valor')).replace(',', '.')) / 100).toFixed(8));
      case 'si_no':
        return fd.get('valor') === 'si';
      case 'regimen':
        return fd.get('valor');
      case 'rango_so2':
        return { min: fd.get('min'), max: fd.get('max'), alerta: fd.get('alerta') };
      case 'rangos_lab':
        return Object.fromEntries(PARAMS_CON_RANGO.map((k) => [k, { min: fd.get(`${k}.min`), max: fd.get(`${k}.max`) }]));
      default:
        return String(fd.get('valor')).replace(',', '.');
    }
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string> }>, ok: string, cerrar = true) {
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast(ok);
        if (cerrar) onClose();
        router.refresh();
      } else {
        setError(r.error ?? null);
        setErrors(r.fieldErrors ?? {});
      }
    });
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(() => saveParametro(org.slug, { clave: def.clave, valor: leerValor(fd), vigenteDesde: fd.get('vigenteDesde') }), `${def.etiqueta}: cambio registrado.`);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={def.etiqueta}
      description="El nuevo valor rige desde la fecha que indiques. Los cálculos de fechas anteriores siguen usando el valor de entonces."
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="parametro-form" variant="primary" disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <form id="parametro-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <ValorInput def={def} base={base} error={errors.valor} />
        <Field label="Rige desde" required error={errors.vigenteDesde}>
          {(id, d) => <Input id={id} name="vigenteDesde" type="date" defaultValue={hoy} aria-describedby={d} required />}
        </Field>
        {def.ayuda && <p className="text-[13px] text-ink-3 sm:col-span-2">{def.ayuda}</p>}
        {error && (
          <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad sm:col-span-2">
            {error}
          </p>
        )}
      </form>
      <h4 className="mt-6 mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Historia</h4>
      <ul className="divide-y divide-rule rounded-card border border-rule text-[14px]">
        {[...filas].reverse().map((f) => (
          <li key={f.id} className="flex items-center gap-3 px-3 py-2">
            <span className="w-28 text-ink-3 tabular">{fecha(f.vigenteDesde)}</span>
            <span className="flex-1 font-semibold tabular">{mostrar(def, f.valor)}</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              aria-label={`Quitar el valor desde el ${fecha(f.vigenteDesde)}`}
              onClick={() => run(() => deleteParametro(org.slug, f.id), 'Valor quitado de la historia.', false)}
            >
              <Trash2 size={14} aria-hidden />
            </Button>
          </li>
        ))}
        <li className="flex items-center gap-3 px-3 py-2 text-ink-3">
          <span className="w-28">Antes</span>
          <span className="flex-1 tabular">{mostrar(def, valorPorDefecto(def.clave))} (por defecto)</span>
        </li>
      </ul>
    </Dialog>
  );
}

function ValorInput({ def, base, error }: { def: ParametroDef; base: unknown; error?: string }) {
  switch (def.tipo) {
    case 'si_no':
      return (
        <Field label="Valor" required error={error}>
          {(id) => (
            <Select id={id} name="valor" defaultValue={base ? 'si' : 'no'}>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </Select>
          )}
        </Field>
      );
    case 'regimen':
      return (
        <Field label="Régimen" required error={error}>
          {(id) => (
            <Select id={id} name="valor" defaultValue={String(base)}>
              <option value="14D3">Pro Pyme general (14 D N°3)</option>
              <option value="14D8">Pro Pyme transparente (14 D N°8)</option>
              <option value="14A">Semi integrado (14 A)</option>
            </Select>
          )}
        </Field>
      );
    case 'rango_so2': {
      const r = base as RangoSO2;
      return (
        <fieldset className="grid grid-cols-3 gap-3 sm:col-span-2">
          <legend className="sr-only">Rango de SO₂ libre</legend>
          {(['min', 'max', 'alerta'] as const).map((k) => (
            <Field key={k} label={k === 'min' ? 'Mínimo' : k === 'max' ? 'Máximo' : 'Alerta'} unit={def.unidad} error={k === 'min' ? error : undefined}>
              {(id, d) => <Input id={id} name={k} type="number" min={0} step="any" defaultValue={r[k]} aria-describedby={d} className="tabular" required />}
            </Field>
          ))}
        </fieldset>
      );
    }
    case 'rangos_lab': {
      const r = base as RangosLab;
      return (
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-[13px] font-semibold text-ink-2">Rango objetivo por parámetro</legend>
          {error && (
            <p role="alert" className="mb-2 text-[13px] text-bad">
              {error}
            </p>
          )}
          <div className="grid grid-cols-[1fr_96px_96px] items-center gap-x-3 gap-y-2 text-[14px]">
            <span />
            <span className="text-[12px] font-semibold text-ink-3">Mínimo</span>
            <span className="text-[12px] font-semibold text-ink-3">Máximo</span>
            {PARAMS_CON_RANGO.map((k) => {
              const e = ETIQUETA_LAB[k]!;
              return (
                <div key={k} className="contents">
                  <span>
                    {e.l}
                    {e.u && <span className="ml-1 text-[12px] text-ink-3">{e.u}</span>}
                  </span>
                  {(['min', 'max'] as const).map((m) => (
                    <Input
                      key={m}
                      name={`${k}.${m}`}
                      aria-label={`${e.l} ${m === 'min' ? 'mínimo' : 'máximo'}`}
                      type="number"
                      min={0}
                      step="any"
                      defaultValue={r[k][m]}
                      className="tabular"
                      required
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </fieldset>
      );
    }
    default: {
      const tasa = def.tipo === 'tasa';
      return (
        <Field label="Valor" unit={tasa ? '%' : def.tipo === 'clp' ? 'CLP' : def.unidad} required error={error}>
          {(id, d) => (
            <Input
              id={id}
              name="valor"
              inputMode="decimal"
              defaultValue={tasa ? nf(Number(base) * 100, 6) : String(base)}
              aria-describedby={d}
              className="tabular"
              required
            />
          )}
        </Field>
      );
    }
  }
}
