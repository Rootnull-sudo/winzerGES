'use client';
/**
 * Tributario (F6-2; v1: modules/tributario). F29 con los códigos del formulario y su estado, PPM del año, pagos de
 * impuesto y calendario de obligaciones. Un F29 declarado o pagado muestra su foto congelada.
 */
import { clp, ESTADOS_F29, F29_CERRADO, fechaHoy, nombrePeriodoCorto, resumenPpm, TIPOS_PAGO_IMPUESTO, type ResultadoF29 } from '@winzer/domain';
import { ChevronLeft, ChevronRight, Download, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCan, useOrg } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BarrasAgrupadas, ChartCard } from '@/components/ui/chart';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState, Stat, StatGrid } from '@/components/ui/page';
import { Tabs, useTab } from '@/components/ui/tabs';
import { cn } from '@/lib/cn';
import { ErrorForm, fecha, useSubmit } from '../proveedores/comun';
import { deletePagoImpuesto, guardarF29Action, marcarObligacionAction, savePagoImpuesto } from './actions';

interface FilaF29 {
  periodo: string;
  calculo: ResultadoF29;
  estado: string | null;
  folioSii: string | null;
  fechaPago: string | null;
}
export interface DatosTributario {
  periodo: string;
  anioCalendario: number;
  f29: FilaF29[];
  vence: string;
  pagos: { id: string; tipo: string; periodo: string; fecha: string; monto: number; folioSii: string | null; incluidoEnF29: boolean; delF29: boolean }[];
  calendario: { clave: string; tipo: string; nombre: string; fecha: string; modulo: string; estado: string; dias: number; folio: string | null }[];
  trib: { regimen: string; tasaIVA: number; tasaIDPC: number; tasaPPM: number; ilaActivo: boolean; tasaILA: number; diaF29: number; remanenteInicial: number };
}

const TABS = [
  { id: 'f29', label: 'F29' },
  { id: 'ppm', label: 'PPM' },
  { id: 'pagos', label: 'Pagos de impuesto' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'regimen', label: 'Régimen' }
] as const;
const ESTADO = Object.fromEntries(ESTADOS_F29) as Record<string, string>;
const TONO: Record<string, 'neutral' | 'ok' | 'warn' | 'bad' | 'info'> = { borrador: 'neutral', revisado: 'info', declarado: 'ok', pagado: 'ok' };
const TIPO_PAGO = Object.fromEntries(TIPOS_PAGO_IMPUESTO) as Record<string, string>;
const pct = (v: number, d = 2) => `${(v * 100).toLocaleString('es-CL', { maximumFractionDigits: d })} %`;
const REGIMEN: Record<string, string> = {
  '14D3': 'Pro Pyme General (14 D N°3)',
  '14D8': 'Pro Pyme Transparente (14 D N°8)',
  '14A': 'Régimen General Semi Integrado (14 A)'
};

export function TributarioView({ datos }: { datos: DatosTributario }) {
  const [tab, setTab] = useTab(TABS);
  return (
    <>
      <Tabs tabs={TABS} actual={tab} onChange={setTab} />
      {tab === 'f29' && <F29 datos={datos} />}
      {tab === 'ppm' && <Ppm datos={datos} />}
      {tab === 'pagos' && <Pagos datos={datos} />}
      {tab === 'calendario' && <Calendario datos={datos} />}
      {tab === 'regimen' && <Regimen datos={datos} />}
    </>
  );
}

function F29({ datos }: { datos: DatosTributario }) {
  const can = useCan();
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const fila = datos.f29.find((f) => f.periodo === datos.periodo)!;
  const f = fila.calculo;
  const cerrado = !!fila.estado && F29_CERRADO.includes(fila.estado);
  const ir = (p: string) => router.push(`?periodo=${p}`);
  const linea = (cod: string, label: string, v: number, cls?: 'sub' | 'total' | 'indent') => (
    <tr className={cn('border-b border-rule', cls === 'total' && 'font-semibold', cls === 'sub' && 'text-ink-2')}>
      <td className={cn('py-1.5', cls === 'indent' && 'pl-6')}>
        {cod && (
          <span className="mr-2 inline-block w-10 rounded-full bg-sunken text-center text-[11px] font-bold text-ink-2" title="Código del formulario 29">
            {cod}
          </span>
        )}
        {label}
      </td>
      <td className="py-1.5 text-right tabular">{cls === 'sub' ? '' : clp(v)}</td>
    </tr>
  );
  function exportar() {
    const filas: [string, string | number][] = [
      ['Período', f.periodo],
      ['Ventas netas', f.ventas.neto],
      ['IVA débito (538)', f.ivaDebito],
      ['Compras netas', f.compras.neto],
      ['IVA crédito (537)', f.ivaCredito],
      ['Remanente anterior (504)', f.remanenteAnterior],
      ['IVA a pagar (89)', f.ivaPagar],
      ['Remanente siguiente (77)', f.remanenteSiguiente],
      ['ILA', f.ilaDebito],
      ['PPM (62)', f.ppm],
      ['Retención honorarios (151)', f.retencionHonorarios],
      ['Impuesto único (48)', f.impuestoUnico],
      ['Total a pagar (91)', f.total]
    ];
    const csv = '﻿' + [['Concepto', 'Monto'], ...filas].map((r) => r.join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `F29_${f.periodo}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const cols: Column<FilaF29 & { id: string }>[] = [
    { key: 'periodo', label: 'Período', render: (r) => <b className="capitalize">{nombrePeriodoCorto(r.periodo)}</b> },
    { key: 'iva', label: 'IVA a pagar', num: true, value: (r) => r.calculo.ivaPagar, render: (r) => clp(r.calculo.ivaPagar) },
    { key: 'ppm', label: 'PPM', num: true, value: (r) => r.calculo.ppm, render: (r) => clp(r.calculo.ppm) },
    { key: 'total', label: 'Total', num: true, value: (r) => r.calculo.total, render: (r) => <b>{clp(r.calculo.total)}</b> },
    {
      key: 'estado',
      label: 'Estado',
      value: (r) => r.estado ?? '',
      render: (r) => <Badge tone={TONO[r.estado ?? ''] ?? 'warn'}>{r.estado ? ESTADO[r.estado] : 'Sin guardar'}</Badge>
    }
  ];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Período tributario">
          {(id) => <Input id={id} type="month" value={datos.periodo} onChange={(e) => e.target.value && ir(e.target.value)} className="w-44" />}
        </Field>
        <p className="pb-2 text-[13px] text-ink-3">
          Vence el {fecha(datos.vence)} · <Badge tone={TONO[fila.estado ?? ''] ?? 'warn'}>{fila.estado ? ESTADO[fila.estado] : 'Sin guardar'}</Badge>
          {fila.folioSii && <span className="ml-2">Folio SII {fila.folioSii}</span>}
          {cerrado && <span className="ml-2">· Foto congelada al declarar</span>}
        </p>
        <div className="ml-auto flex gap-2 pb-0.5">
          {can('tributario', 'x') && (
            <Button onClick={exportar}>
              <Download size={15} /> CSV
            </Button>
          )}
          {(can('tributario', 'e') || can('tributario', 'c')) && (
            <Button variant="primary" onClick={() => setEditando(true)}>
              Cambiar estado
            </Button>
          )}
        </div>
      </div>
      <StatGrid>
        <Stat label="IVA débito" value={clp(f.ivaDebito)} sub={`${f.ventas.documentos} documentos de venta`} />
        <Stat label="IVA crédito" value={clp(f.ivaCredito)} sub={`${f.compras.documentos} documentos de compra`} />
        <Stat label="PPM" value={clp(f.ppm)} sub={`${pct(f.tasaPPM)} de ${clp(f.baseIngresosPPM)}`} />
        <Stat
          label={f.total ? 'Total a pagar' : 'Sin pago'}
          value={<span className={cn(f.total > 0 && 'text-ink')}>{clp(f.total)}</span>}
          sub={`Remanente siguiente ${clp(f.remanenteSiguiente)}`}
        />
      </StatGrid>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section aria-label={`Borrador F29 ${f.periodo}`} className="rounded-card border border-rule bg-raised p-5">
          <h2 className="mb-3 font-label text-[18px] capitalize">Borrador F29 — {nombrePeriodoCorto(f.periodo)}</h2>
          <table className="w-full text-[14px]">
            <tbody>
              {linea('', 'Débitos (ventas)', 0, 'sub')}
              {linea('', `Ventas netas afectas (${f.ventas.documentos} docs.)`, f.ventas.neto, 'indent')}
              {linea('', 'Ventas exentas', f.ventas.exento, 'indent')}
              {linea('538', 'Total débito fiscal IVA', f.ivaDebito)}
              {linea('', 'Créditos (compras)', 0, 'sub')}
              {linea('', `Compras netas afectas (${f.compras.documentos} docs.)`, f.compras.neto, 'indent')}
              {linea('', 'Compras exentas', f.compras.exento, 'indent')}
              {linea('537', 'Total crédito fiscal IVA', f.ivaCredito)}
              {linea('504', 'Remanente de crédito del período anterior', f.remanenteAnterior)}
              {linea('', 'IVA determinado (débito − crédito − remanente)', f.ivaDeterminado)}
              {linea('89', 'IVA a pagar', f.ivaPagar)}
              {linea('77', 'Remanente para el período siguiente', f.remanenteSiguiente)}
              {linea('', 'ILA vinos (débito − crédito)', f.ilaDebito)}
              {linea('62', `PPM (${pct(f.tasaPPM)} × ingresos)`, f.ppm)}
              {linea('151', 'Retención honorarios', f.retencionHonorarios)}
              {linea('48', 'Impuesto único trabajadores', f.impuestoUnico)}
              {linea('91', 'Total a pagar', f.total, 'total')}
            </tbody>
          </table>
          <p className="mt-3 text-[12px] text-ink-3">Códigos referenciales del formulario. El remanente no incluye reajuste por UTM.</p>
        </section>
        <section aria-label="F29 del año">
          <h2 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">F29 del año {datos.periodo.slice(0, 4)}</h2>
          <DataTable
            rows={datos.f29.map((r) => ({ ...r, id: r.periodo }))}
            columns={cols}
            onRowClick={(r) => ir(r.periodo)}
            rowClassName={(r) => (r.periodo === datos.periodo ? 'bg-sunken' : undefined)}
          />
        </section>
      </div>
      {editando && <EstadoF29 fila={fila} onClose={() => setEditando(false)} />}
    </>
  );
}

function EstadoF29({ fila, onClose }: { fila: FilaF29; onClose: () => void }) {
  const { org } = useOrg();
  const { pending, errors, error, run } = useSubmit(onClose);
  const [estado, setEstado] = useState(fila.estado ?? 'borrador');
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run(() => guardarF29Action(org.slug, { ...Object.fromEntries(new FormData(e.currentTarget)), periodo: fila.periodo, estado }), 'F29 actualizado.');
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Estado del F29 · ${nombrePeriodoCorto(fila.periodo)}`}
      description="Declarar o pagar congela el cálculo. Pagar registra el pago del F29 y del PPM y cumple la obligación del calendario."
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="f29-form" variant="primary" disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <form id="f29-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Estado" className="sm:col-span-2">
          {(id) => (
            <Select id={id} value={estado} onChange={(e) => setEstado(e.target.value)}>
              {ESTADOS_F29.map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Folio SII" error={errors.folioSii}>
          {(id) => <Input id={id} name="folioSii" defaultValue={fila.folioSii ?? ''} maxLength={20} />}
        </Field>
        {estado === 'pagado' && (
          <Field label="Fecha de pago" required error={errors.fechaPago}>
            {(id) => <Input id={id} name="fechaPago" type="date" defaultValue={fila.fechaPago ?? fechaHoy()} required />}
          </Field>
        )}
        <ErrorForm error={error} className="sm:col-span-2" />
      </form>
    </Dialog>
  );
}

function Ppm({ datos }: { datos: DatosTributario }) {
  const anio = datos.periodo.slice(0, 4);
  const porMes = datos.f29.map((f) => ({ periodo: f.periodo, ppm: f.calculo.ppm, base: f.calculo.baseIngresosPPM }));
  const pagadoMes = (p: string) => datos.pagos.filter((x) => x.tipo === 'PPM' && x.periodo === p).reduce((s, x) => s + x.monto, 0);
  const r = resumenPpm(
    porMes,
    datos.pagos.filter((p) => p.tipo === 'PPM' && p.periodo.startsWith(anio)).reduce((s, p) => s + p.monto, 0)
  );
  type Fila = (typeof porMes)[number] & { id: string };
  const cols: Column<Fila>[] = [
    { key: 'periodo', label: 'Período', render: (m) => <span className="capitalize">{nombrePeriodoCorto(m.periodo)}</span> },
    { key: 'base', label: 'Ingresos netos', num: true, render: (m) => clp(m.base) },
    { key: 'ppm', label: 'PPM calculado', num: true, render: (m) => clp(m.ppm) },
    { key: 'pagado', label: 'Pagado', num: true, value: (m) => pagadoMes(m.periodo), render: (m) => clp(pagadoMes(m.periodo)) }
  ];
  return (
    <>
      <p className="mb-4 text-[13px] text-ink-3">
        PPM = ingresos netos del mes × tasa ({pct(datos.trib.tasaPPM)}). Se imputan como crédito contra el impuesto de primera categoría en la Renta.
      </p>
      <StatGrid>
        <Stat label={`PPM acumulado ${anio}`} value={clp(r.total)} />
        <Stat label="PPM pagado" value={clp(r.pagados)} />
        <Stat label="Proyección anual" value={clp(r.proyeccion)} sub="Promedio mensual × 12" />
      </StatGrid>
      <ChartCard titulo="PPM por mes" className="mb-4">
        <BarrasAgrupadas
          categorias={porMes.map((m) => nombrePeriodoCorto(m.periodo))}
          series={[
            { id: 'calc', nombre: 'Calculado', color: 't0', valores: porMes.map((m) => m.ppm) },
            { id: 'pag', nombre: 'Pagado', color: 't1', valores: porMes.map((m) => pagadoMes(m.periodo)) }
          ]}
          formato={(v) => clp(v)}
        />
      </ChartCard>
      <DataTable rows={porMes.map((m) => ({ ...m, id: m.periodo }))} columns={cols} />
    </>
  );
}

function Pagos({ datos }: { datos: DatosTributario }) {
  const can = useCan();
  const { org } = useOrg();
  const [nuevo, setNuevo] = useState(false);
  type Fila = DatosTributario['pagos'][number];
  const cols: Column<Fila>[] = [
    { key: 'fecha', label: 'Fecha', render: (p) => fecha(p.fecha) },
    { key: 'tipo', label: 'Tipo', value: (p) => TIPO_PAGO[p.tipo] ?? p.tipo },
    { key: 'periodo', label: 'Período', render: (p) => <span className="capitalize">{nombrePeriodoCorto(p.periodo)}</span> },
    { key: 'folioSii', label: 'Folio SII', value: (p) => p.folioSii ?? '' },
    {
      key: 'origen',
      label: 'Origen',
      value: (p) => (p.delF29 ? 'F29' : 'Manual'),
      render: (p) => (p.incluidoEnF29 ? <span className="text-ink-3">Incluido en el F29</span> : p.delF29 ? 'F29 pagado' : 'Manual')
    },
    { key: 'monto', label: 'Monto', num: true, render: (p) => <b>{clp(p.monto)}</b> }
  ];
  return (
    <>
      <DataTable
        rows={datos.pagos}
        columns={cols}
        onRowClick={
          can('tributario', 'd') ? (p) => !p.delF29 && confirm('¿Eliminar este pago de impuesto?') && void deletePagoImpuesto(org.slug, p.id) : undefined
        }
        exportName="pagos-impuesto"
        canExport={can('tributario', 'x')}
        toolbar={
          can('tributario', 'c') && (
            <Button variant="primary" onClick={() => setNuevo(true)}>
              <Plus size={16} /> Registrar pago
            </Button>
          )
        }
        empty={
          <EmptyState
            title="Sin pagos de impuesto"
            text="Al marcar un F29 como pagado se registran sus pagos. Las patentes y contribuciones se registran aquí."
          />
        }
      />
      {nuevo && <PagoDialog onClose={() => setNuevo(false)} />}
    </>
  );
}

function PagoDialog({ onClose }: { onClose: () => void }) {
  const { org } = useOrg();
  const { pending, errors, error, run } = useSubmit(onClose);
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run(() => savePagoImpuesto(org.slug, Object.fromEntries(new FormData(e.currentTarget))), 'Pago registrado.');
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Registrar pago de impuesto"
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="pago-imp" variant="primary" disabled={pending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="pago-imp" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo" required>
          {(id) => (
            <Select id={id} name="tipo" defaultValue="patente">
              {TIPOS_PAGO_IMPUESTO.filter(([k]) => k !== 'F29' && k !== 'PPM').map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Período" required error={errors.periodo}>
          {(id) => <Input id={id} name="periodo" type="month" defaultValue={fechaHoy().slice(0, 7)} required />}
        </Field>
        <Field label="Fecha de pago" required error={errors.fecha}>
          {(id) => <Input id={id} name="fecha" type="date" defaultValue={fechaHoy()} required />}
        </Field>
        <Field label="Monto" unit="CLP" required error={errors.monto}>
          {(id) => <Input id={id} name="monto" type="number" min={1} step={1} className="tabular" required />}
        </Field>
        <Field label="Folio SII" error={errors.folioSii} className="sm:col-span-2">
          {(id) => <Input id={id} name="folioSii" maxLength={20} />}
        </Field>
        <ErrorForm error={error} className="sm:col-span-2" />
      </form>
    </Dialog>
  );
}

function Calendario({ datos }: { datos: DatosTributario }) {
  const can = useCan();
  const { org } = useOrg();
  const router = useRouter();
  const [pendiente, setPendiente] = useState<string | null>(null);
  const y = datos.anioCalendario;
  async function alternar(clave: string, estado: string) {
    setPendiente(clave);
    await marcarObligacionAction(org.slug, { clave, estado: estado === 'cumplida' ? 'pendiente' : 'cumplida' });
    setPendiente(null);
    router.refresh();
  }
  const tono = (e: string, dias: number) => (e === 'cumplida' ? 'ok' : e === 'vencida' ? 'bad' : dias <= 10 ? 'warn' : 'neutral');
  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <Link
          href={`?tab=calendario&anio=${y - 1}`}
          className="inline-flex h-9 items-center gap-1 rounded-control border border-rule px-3 text-[13px] font-semibold hover:bg-sunken"
        >
          <ChevronLeft size={14} aria-hidden /> {y - 1}
        </Link>
        <b className="px-2 text-[16px]">{y}</b>
        <Link
          href={`?tab=calendario&anio=${y + 1}`}
          className="inline-flex h-9 items-center gap-1 rounded-control border border-rule px-3 text-[13px] font-semibold hover:bg-sunken"
        >
          {y + 1} <ChevronRight size={14} aria-hidden />
        </Link>
      </div>
      <ul className="divide-y divide-rule rounded-card border border-rule bg-raised" aria-label={`Calendario ${y}`}>
        {datos.calendario.map((i) => (
          <li key={i.clave} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 px-4 py-2.5 text-[14px]">
            <span className="tabular">{fecha(i.fecha)}</span>
            <span>
              <b>{i.nombre}</b>
              <span className="block text-[12px] text-ink-3">
                {i.tipo}
                {i.modulo === 'cumplimiento' && ' · cumplimiento'}
                {i.estado !== 'cumplida' && i.dias >= 0 && i.dias <= 30 && ` · en ${i.dias} días`}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <Badge tone={tono(i.estado, i.dias)}>{i.estado === 'cumplida' ? 'Cumplida' : i.estado === 'vencida' ? 'Vencida' : 'Pendiente'}</Badge>
              {can('tributario', 'e') && (
                <Button
                  className="h-8 px-3 text-[13px]"
                  disabled={pendiente === i.clave}
                  onClick={() => alternar(i.clave, i.estado)}
                  aria-label={`${i.estado === 'cumplida' ? 'Reabrir' : 'Marcar cumplida'}: ${i.nombre}`}
                >
                  {i.estado === 'cumplida' ? 'Reabrir' : 'Cumplida'}
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Regimen({ datos }: { datos: DatosTributario }) {
  const { org } = useOrg();
  const t = datos.trib;
  const filas: [string, string][] = [
    ['Régimen', REGIMEN[t.regimen] ?? t.regimen],
    ['Impuesto de primera categoría', pct(t.tasaIDPC, 1)],
    ['Tasa PPM', pct(t.tasaPPM)],
    ['IVA', pct(t.tasaIVA, 1)],
    ['ILA vinos', t.ilaActivo ? pct(t.tasaILA, 1) : 'No se aplica'],
    ['Vencimiento F29', `día ${t.diaF29} del mes siguiente`],
    ['Remanente de crédito inicial', clp(t.remanenteInicial)]
  ];
  return (
    <section className="max-w-2xl rounded-card border border-rule bg-raised p-5">
      <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-[14px]">
        {filas.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-2">{k}</dt>
            <dd className="text-right font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[13px] text-ink-3">
        Las tasas y plazos tienen vigencia por fecha y se editan en{' '}
        <Link href={`/${org.slug}/configuracion#parametros`} className="font-semibold text-ink underline">
          Configuración › Parámetros
        </Link>
        . Revísalos al inicio de cada año con tu contador.
      </p>
    </section>
  );
}
