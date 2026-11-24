'use client';
import { clp, costosUnicosEtiqueta, estadoMarca, fechaHoy, prorrateoEtiqueta, vencimientoMarca, type EstadoMarca } from '@winzer/domain';
import { Plus, Tag } from 'lucide-react';
import { useState } from 'react';
import { Adjuntos } from '@/components/adjuntos';
import { useCan, useOrg } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/page';
import { Tabs, useTab } from '@/components/ui/tabs';
import { ErrorForm, fecha, useSubmit } from '../proveedores/comun';
import { deleteEtiqueta, deleteMarca, saveEtiqueta, saveMarca } from './actions';

export interface MarcaFila {
  id: string;
  version: number;
  nombre: string;
  titular: string | null;
  numeroINAPI: string | null;
  clases: string | null;
  fechaRegistro: string;
  vencimiento: string;
  costo: number;
}
export interface EtiquetaFila {
  id: string;
  version: number;
  versionDiseno: number;
  nombre: string;
  marcaId: string | null;
  fecha: string | null;
  disenador: string | null;
  aprobacionLegal: boolean;
  costoDiseno: number;
  costoFotografia: number;
  costoIlustracion: number;
  tirajeEstimado: number;
  tirajeMinimo: number;
  costoImpresion: number;
  proveedorId: string | null;
  varietal: string | null;
  graduacion: number | null;
  do: string | null;
  denominacion: string | null;
  contenido: string | null;
  /** Botellas producidas con órdenes confirmadas (F5-2). */
  producidas: number;
}
type Opt = { id: string; nombre: string };

const TABS = [
  { id: 'marcas', label: 'Marcas' },
  { id: 'etiquetas', label: 'Etiquetas' }
] as const;
const ESTADO: Record<EstadoMarca, [string, 'ok' | 'warn' | 'bad']> = { vigente: ['Vigente', 'ok'], renovar: ['Renovar', 'warn'], vencida: ['Vencida', 'bad'] };
const dec = (v: number) => v.toLocaleString('es-CL', { maximumFractionDigits: 1 });

export function MarcaView({ marcas, etiquetas, proveedores }: { marcas: MarcaFila[]; etiquetas: EtiquetaFila[]; proveedores: Opt[] }) {
  const [tab, setTab] = useTab(TABS);
  return (
    <>
      <Tabs tabs={TABS} actual={tab} onChange={setTab} />
      {tab === 'marcas' && <Marcas marcas={marcas} />}
      {tab === 'etiquetas' && <Etiquetas etiquetas={etiquetas} marcas={marcas} proveedores={proveedores} />}
    </>
  );
}

function Marcas({ marcas }: { marcas: MarcaFila[] }) {
  const can = useCan();
  const hoy = fechaHoy();
  const [editing, setEditing] = useState<MarcaFila | 'nueva' | null>(null);
  const cols: Column<MarcaFila>[] = [
    { key: 'nombre', label: 'Marca', render: (m) => <b>{m.nombre}</b> },
    { key: 'numeroINAPI', label: 'N° INAPI', render: (m) => m.numeroINAPI ?? '—' },
    { key: 'clases', label: 'Clases', render: (m) => m.clases ?? '—' },
    { key: 'fechaRegistro', label: 'Registro', render: (m) => fecha(m.fechaRegistro) },
    {
      key: 'vencimiento',
      label: 'Vence',
      render: (m) => {
        const [l, t] = ESTADO[estadoMarca(m.vencimiento, hoy).estado];
        return (
          <span className="flex items-center gap-2">
            {fecha(m.vencimiento)} <Badge tone={t}>{l}</Badge>
          </span>
        );
      }
    },
    { key: 'costo', label: 'Costo', num: true, render: (m) => clp(m.costo) },
    { key: 'amortizacion', label: 'Amortización anual', num: true, value: (m) => m.costo / 10, render: (m) => clp(Math.round(m.costo / 10)) }
  ];
  return (
    <>
      <DataTable
        rows={marcas}
        columns={cols}
        onRowClick={(m) => setEditing(m)}
        exportName="marcas"
        canExport={can('marca', 'x')}
        toolbar={
          can('marca', 'c') && (
            <Button variant="primary" onClick={() => setEditing('nueva')}>
              <Plus size={16} /> Nueva marca
            </Button>
          )
        }
        empty={
          <EmptyState
            icon={<Tag size={28} strokeWidth={1.5} />}
            title="Sin marcas registradas"
            text="Registra tus marcas con su N° INAPI: se avisa 180 días antes de que venzan."
          />
        }
      />
      {editing && <MarcaDialog marca={editing === 'nueva' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function MarcaDialog({ marca, onClose }: { marca: MarcaFila | null; onClose: () => void }) {
  const { org } = useOrg();
  const can = useCan();
  const { pending, errors, error, run } = useSubmit(onClose);
  const m = marca;
  const editable = m ? can('marca', 'e') : can('marca', 'c');
  const [f, setF] = useState({
    nombre: m?.nombre ?? '',
    titular: m?.titular ?? '',
    numeroINAPI: m?.numeroINAPI ?? '',
    clases: m?.clases ?? '33',
    fechaRegistro: m?.fechaRegistro ?? fechaHoy(),
    vencimiento: m?.vencimiento ?? vencimientoMarca(fechaHoy()),
    costo: m ? String(m.costo) : ''
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF(
      k === 'fechaRegistro' && e.target.value
        ? { ...f, fechaRegistro: e.target.value, vencimiento: vencimientoMarca(e.target.value) }
        : { ...f, [k]: e.target.value }
    );
  return (
    <Dialog
      open
      onClose={onClose}
      title={m ? m.nombre : 'Nueva marca'}
      description="El registro INAPI vence a los 10 años; su costo se amortiza en ese plazo."
      footer={
        <>
          {m && can('marca', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() => confirm(`¿Eliminar la marca ${m.nombre}?`) && run(() => deleteMarca(org.slug, m.id), 'Marca eliminada.')}
            >
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            {editable ? 'Cancelar' : 'Cerrar'}
          </Button>
          {editable && (
            <Button type="submit" form="marca-form" variant="primary" disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar'}
            </Button>
          )}
        </>
      }
    >
      <form
        id="marca-form"
        onSubmit={(e) => (e.preventDefault(), run(() => saveMarca(org.slug, { ...f, id: m?.id }, m?.version), m ? 'Marca actualizada.' : 'Marca registrada.'))}
      >
        <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Marca</legend>
          <Field label="Nombre de la marca" required error={errors.nombre} className="sm:col-span-2">
            {(id, d) => <Input id={id} value={f.nombre} onChange={set('nombre')} aria-describedby={d} required />}
          </Field>
          <Field label="Titular">{(id) => <Input id={id} value={f.titular} onChange={set('titular')} />}</Field>
          <Field label="N° de registro INAPI">{(id) => <Input id={id} value={f.numeroINAPI} onChange={set('numeroINAPI')} />}</Field>
          <Field label="Clases (Niza)">{(id) => <Input id={id} value={f.clases} onChange={set('clases')} />}</Field>
          <Field label="Costo del registro" unit="CLP">
            {(id) => <Input id={id} type="number" min={0} step={1} value={f.costo} onChange={set('costo')} className="tabular" />}
          </Field>
          <Field label="Fecha de registro" required error={errors.fechaRegistro}>
            {(id, d) => <Input id={id} type="date" value={f.fechaRegistro} onChange={set('fechaRegistro')} aria-describedby={d} required />}
          </Field>
          <Field label="Vencimiento" error={errors.vencimiento} hint="10 años desde el registro.">
            {(id, d) => <Input id={id} type="date" value={f.vencimiento} onChange={set('vencimiento')} aria-describedby={d} />}
          </Field>
          <ErrorForm error={error} className="sm:col-span-2" />
        </fieldset>
      </form>
      {m && <Adjuntos entidad="marca" registroId={m.id} />}
    </Dialog>
  );
}

function Etiquetas({ etiquetas, marcas, proveedores }: { etiquetas: EtiquetaFila[]; marcas: MarcaFila[]; proveedores: Opt[] }) {
  const can = useCan();
  const [editing, setEditing] = useState<EtiquetaFila | 'nueva' | null>(null);
  const marcaById = new Map(marcas.map((m) => [m.id, m.nombre]));
  const total = (e: EtiquetaFila) => prorrateoEtiqueta(e, e.producidas) + e.costoImpresion;
  const cols: Column<EtiquetaFila>[] = [
    {
      key: 'nombre',
      label: 'Diseño',
      value: (e) => `${e.nombre} v${e.versionDiseno}`,
      render: (e) => (
        <>
          <b>{e.nombre}</b> <span className="text-ink-3">v{e.versionDiseno}</span>
        </>
      )
    },
    { key: 'marca', label: 'Marca', value: (e) => (e.marcaId ? (marcaById.get(e.marcaId) ?? '') : '') },
    { key: 'unicos', label: 'Costos únicos', num: true, value: costosUnicosEtiqueta, render: (e) => clp(costosUnicosEtiqueta(e)) },
    { key: 'producidas', label: 'Botellas producidas', num: true, render: (e) => e.producidas.toLocaleString('es-CL') },
    {
      key: 'prorrateo',
      label: 'Diseño/bot.',
      num: true,
      value: (e) => prorrateoEtiqueta(e, e.producidas),
      render: (e) => `$${dec(prorrateoEtiqueta(e, e.producidas))}`
    },
    { key: 'costoImpresion', label: 'Impresión', num: true, render: (e) => `$${dec(e.costoImpresion)}` },
    { key: 'total', label: 'Total/bot.', num: true, value: total, render: (e) => <b>${dec(total(e))}</b> },
    {
      key: 'legal',
      label: 'Rotulación',
      value: (e) => (e.aprobacionLegal ? 'Aprobada' : 'Pendiente'),
      render: (e) => (e.aprobacionLegal ? <Badge tone="ok">Aprobada</Badge> : <Badge tone="warn">Pendiente</Badge>)
    }
  ];
  return (
    <>
      <DataTable
        rows={etiquetas}
        columns={cols}
        onRowClick={(e) => setEditing(e)}
        exportName="etiquetas"
        canExport={can('marca', 'x')}
        toolbar={
          can('marca', 'c') && (
            <Button variant="primary" onClick={() => setEditing('nueva')}>
              <Plus size={16} /> Nueva versión
            </Button>
          )
        }
        empty={
          <EmptyState
            icon={<Tag size={28} strokeWidth={1.5} />}
            title="Sin etiquetas"
            text="Registra cada versión de etiqueta con sus costos de diseño e impresión y sus declaraciones."
          />
        }
      />
      {editing && <EtiquetaDialog etiqueta={editing === 'nueva' ? null : editing} marcas={marcas} proveedores={proveedores} onClose={() => setEditing(null)} />}
    </>
  );
}

function EtiquetaDialog({
  etiqueta,
  marcas,
  proveedores,
  onClose
}: {
  etiqueta: EtiquetaFila | null;
  marcas: MarcaFila[];
  proveedores: Opt[];
  onClose: () => void;
}) {
  const { org } = useOrg();
  const can = useCan();
  const { pending, errors, error, run } = useSubmit(onClose);
  const e = etiqueta;
  const editable = e ? can('marca', 'e') : can('marca', 'c');
  const s = (v: number | null | undefined) => (v == null ? '' : String(v));
  const [f, setF] = useState({
    nombre: e?.nombre ?? '',
    versionDiseno: e ? String(e.versionDiseno) : '1',
    marcaId: e?.marcaId ?? marcas[0]?.id ?? '',
    fecha: e?.fecha ?? fechaHoy(),
    disenador: e?.disenador ?? '',
    aprobacionLegal: e?.aprobacionLegal ?? false,
    costoDiseno: s(e?.costoDiseno),
    costoFotografia: s(e?.costoFotografia),
    costoIlustracion: s(e?.costoIlustracion),
    tirajeEstimado: e ? String(e.tirajeEstimado) : '10000',
    tirajeMinimo: s(e?.tirajeMinimo),
    costoImpresion: s(e?.costoImpresion),
    proveedorId: e?.proveedorId ?? '',
    varietal: e?.varietal ?? '',
    graduacion: s(e?.graduacion),
    do: e?.do ?? '',
    denominacion: e?.denominacion ?? 'Vino',
    contenido: e?.contenido ?? '750 mL'
  });
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: ev.target.value });
  const unicos = costosUnicosEtiqueta(f);
  const prorr = prorrateoEtiqueta(f, e?.producidas ?? 0);
  const num = (k: keyof typeof f, label: string, unit = 'CLP') => (
    <Field label={label} unit={unit} error={errors[k]}>
      {(id, d) => <Input id={id} type="number" min={0} step="any" value={String(f[k])} onChange={set(k)} aria-describedby={d} className="tabular" />}
    </Field>
  );
  const texto = (k: keyof typeof f, label: string) => <Field label={label}>{(id) => <Input id={id} value={String(f[k])} onChange={set(k)} />}</Field>;
  const titulo = (t: string) => <h3 className="mt-1 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase sm:col-span-2">{t}</h3>;
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={e ? `${e.nombre} v${e.versionDiseno}` : 'Nueva versión de etiqueta'}
      description="Los costos únicos se prorratean entre máx(botellas producidas, tiraje estimado)."
      footer={
        <>
          {e && can('marca', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() => confirm('¿Eliminar esta versión de etiqueta?') && run(() => deleteEtiqueta(org.slug, e.id), 'Etiqueta eliminada.')}
            >
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            {editable ? 'Cancelar' : 'Cerrar'}
          </Button>
          {editable && (
            <Button type="submit" form="etiqueta-form" variant="primary" disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar'}
            </Button>
          )}
        </>
      }
    >
      <form
        id="etiqueta-form"
        onSubmit={(ev) => (
          ev.preventDefault(),
          run(() => saveEtiqueta(org.slug, { ...f, id: e?.id }, e?.version), e ? 'Etiqueta actualizada.' : 'Etiqueta registrada.')
        )}
        className="grid gap-x-6 gap-y-4 sm:grid-cols-[1fr_14rem]"
      >
        <fieldset disabled={!editable} className="grid content-start gap-4 sm:grid-cols-2">
          <legend className="sr-only">Etiqueta</legend>
          {titulo('Diseño')}
          <Field label="Nombre del diseño" required error={errors.nombre}>
            {(id, d) => <Input id={id} value={f.nombre} onChange={set('nombre')} aria-describedby={d} required />}
          </Field>
          {num('versionDiseno', 'Versión', '')}
          <Field label="Marca">
            {(id) => (
              <Select id={id} value={f.marcaId} onChange={set('marcaId')}>
                <option value="">—</option>
                {marcas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {texto('disenador', 'Diseñador')}
          <label className="flex items-center gap-2.5 text-[14px] sm:col-span-2">
            <input
              type="checkbox"
              checked={f.aprobacionLegal}
              onChange={(ev) => setF({ ...f, aprobacionLegal: ev.target.checked })}
              className="size-4 accent-ink"
            />
            Rotulación aprobada (Ley 18.455 / Decreto 78)
          </label>
          {titulo('Costos únicos (se prorratean)')}
          {num('costoDiseno', 'Diseño')}
          {num('costoFotografia', 'Fotografía')}
          {num('costoIlustracion', 'Ilustración')}
          {num('tirajeEstimado', 'Botellas estimadas', 'bot.')}
          {titulo('Impresión')}
          {num('costoImpresion', 'Impresión por etiqueta')}
          {num('tirajeMinimo', 'Tiraje mínimo', 'un')}
          <Field label="Imprenta">
            {(id) => (
              <Select id={id} value={f.proveedorId} onChange={set('proveedorId')}>
                <option value="">—</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {titulo('Rotulación')}
          {texto('varietal', 'Varietal declarado')}
          {num('graduacion', 'Graduación', '% vol')}
          {texto('do', 'D.O. declarada')}
          {texto('denominacion', 'Denominación')}
          {texto('contenido', 'Contenido')}
        </fieldset>
        <aside aria-label="Costo por botella" className="self-start rounded-card bg-sunken px-4 py-3 text-[13px]">
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
            <dt className="text-ink-3">Costos únicos</dt>
            <dd className="text-right tabular">{clp(unicos)}</dd>
            <dt className="text-ink-3">Diseño por botella</dt>
            <dd className="text-right tabular">${dec(prorr)}</dd>
            <dt className="text-ink-3">Impresión</dt>
            <dd className="text-right tabular">${dec(Number(f.costoImpresion) || 0)}</dd>
            <dt className="font-semibold text-ink">Total por botella</dt>
            <dd className="text-right font-bold tabular">${dec(prorr + (Number(f.costoImpresion) || 0))}</dd>
          </dl>
        </aside>
        <ErrorForm error={error} className="sm:col-span-2" />
      </form>
      {e && <Adjuntos entidad="etiqueta" registroId={e.id} />}
    </Dialog>
  );
}
