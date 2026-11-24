'use client';
/** Pestaña Activos fijos: depreciación lineal prorrateada por día que termina al cumplir la vida útil (corrige v1). */
import { clp, depreciacionAcumulada, depreciacionAnual, estadoActivo, fechaHoy, finVidaUtil, valorLibro, type EstadoActivo } from '@winzer/domain';
import { Factory, Plus } from 'lucide-react';
import { useState } from 'react';
import { useCan, useOrg } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import { EmptyState, Stat, StatGrid } from '@/components/ui/page';
import { ErrorForm, fecha, useSubmit } from '../proveedores/comun';
import { deleteActivo, saveActivo } from './actions';
import type { ActivoRow } from './view';

const ESTADO: Record<EstadoActivo, [string, 'ok' | 'neutral' | 'warn']> = {
  en_uso: ['En uso', 'ok'],
  depreciado: ['Depreciado', 'neutral'],
  de_baja: ['De baja', 'warn']
};

export function Activos({ activos }: { activos: ActivoRow[] }) {
  const can = useCan();
  const hoy = fechaHoy();
  const [editing, setEditing] = useState<ActivoRow | 'nuevo' | null>(null);
  const vigentes = activos.filter((a) => estadoActivo(a, hoy) !== 'de_baja');
  const anualHoy = (a: ActivoRow) => (estadoActivo(a, hoy) === 'en_uso' ? depreciacionAnual(a) : 0);
  const suma = (fn: (a: ActivoRow) => number) => activos.reduce((s, a) => s + fn(a), 0);
  const cols: Column<ActivoRow>[] = [
    { key: 'nombre', label: 'Activo', render: (a) => <b>{a.nombre}</b> },
    { key: 'fechaCompra', label: 'Compra', render: (a) => fecha(a.fechaCompra) },
    { key: 'valor', label: 'Valor', num: true, render: (a) => clp(a.valor) },
    { key: 'vidaUtilAnios', label: 'Vida útil', num: true, render: (a) => `${a.vidaUtilAnios} años` },
    { key: 'anual', label: 'Depreciación anual', num: true, value: anualHoy, render: (a) => clp(Math.round(anualHoy(a))) },
    {
      key: 'acumulada',
      label: 'Acumulada',
      num: true,
      value: (a) => depreciacionAcumulada(a, hoy),
      render: (a) => clp(Math.round(depreciacionAcumulada(a, hoy)))
    },
    { key: 'libro', label: 'Valor libro', num: true, value: (a) => valorLibro(a, hoy), render: (a) => <b>{clp(Math.round(valorLibro(a, hoy)))}</b> },
    {
      key: 'estado',
      label: 'Estado',
      value: (a) => ESTADO[estadoActivo(a, hoy)][0],
      render: (a) => {
        const [l, t] = ESTADO[estadoActivo(a, hoy)];
        return <Badge tone={t}>{l}</Badge>;
      }
    }
  ];
  return (
    <>
      <StatGrid>
        <Stat
          label="Valor de compra"
          value={clp(suma((a) => a.valor))}
          sub={`${vigentes.length} activos vigentes`}
          icon={<Factory size={16} strokeWidth={1.6} />}
        />
        <Stat label="Depreciación anual" value={clp(Math.round(suma(anualHoy)))} sub="De los activos en uso" />
        <Stat label="Valor libro hoy" value={clp(Math.round(suma((a) => valorLibro(a, hoy))))} />
      </StatGrid>
      <DataTable
        rows={activos}
        columns={cols}
        onRowClick={(a) => setEditing(a)}
        exportName="activos-fijos"
        canExport={can('administracion', 'x')}
        toolbar={
          can('administracion', 'c') && (
            <Button variant="primary" onClick={() => setEditing('nuevo')}>
              <Plus size={16} /> Nuevo activo
            </Button>
          )
        }
        empty={
          <EmptyState
            icon={<Factory size={28} strokeWidth={1.5} />}
            title="Sin activos fijos"
            text="Registra prensas, equipos de frío, estanques y maquinaria con su valor y vida útil."
          />
        }
      />
      {editing && <ActivoDialog activo={editing === 'nuevo' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ActivoDialog({ activo, onClose }: { activo: ActivoRow | null; onClose: () => void }) {
  const { org } = useOrg();
  const can = useCan();
  const { pending, errors, error, run } = useSubmit(onClose);
  const a = activo;
  const editable = a ? can('administracion', 'e') : can('administracion', 'c');
  const [f, setF] = useState({
    nombre: a?.nombre ?? '',
    valor: a ? String(a.valor) : '',
    vidaUtilAnios: a ? String(a.vidaUtilAnios) : '10',
    fechaCompra: a?.fechaCompra ?? fechaHoy(),
    fechaBaja: a?.fechaBaja ?? '',
    observaciones: a?.observaciones ?? ''
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const calc = { valor: Number(f.valor) || 0, vidaUtilAnios: Number(f.vidaUtilAnios) || 1, fechaCompra: f.fechaCompra, fechaBaja: f.fechaBaja || null };
  const hoy = fechaHoy();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(() => saveActivo(org.slug, { ...f, id: a?.id }, a?.version), a ? 'Activo actualizado.' : 'Activo registrado.');
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={a ? a.nombre : 'Nuevo activo'}
      description="Depreciación lineal: valor ÷ vida útil por año, prorrateada por día desde la compra y hasta el fin de la vida útil o la baja."
      footer={
        <>
          {a && can('administracion', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() =>
                confirm(`¿Eliminar ${a.nombre}? Para un activo vendido o desechado, usa la fecha de baja.`) &&
                run(() => deleteActivo(org.slug, a.id), 'Activo eliminado.')
              }
            >
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            {editable ? 'Cancelar' : 'Cerrar'}
          </Button>
          {editable && (
            <Button type="submit" form="activo-form" variant="primary" disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar'}
            </Button>
          )}
        </>
      }
    >
      <form id="activo-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <fieldset disabled={!editable} className="contents">
          <Field label="Nombre" required error={errors.nombre} className="sm:col-span-2">
            {(id, d) => <Input id={id} value={f.nombre} onChange={set('nombre')} aria-describedby={d} required />}
          </Field>
          <Field label="Valor neto" unit="CLP" required error={errors.valor}>
            {(id, d) => (
              <Input id={id} type="number" min={0} step={1} value={f.valor} onChange={set('valor')} aria-describedby={d} className="tabular" required />
            )}
          </Field>
          <Field label="Vida útil" unit="años" required error={errors.vidaUtilAnios}>
            {(id, d) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={80}
                step={1}
                value={f.vidaUtilAnios}
                onChange={set('vidaUtilAnios')}
                aria-describedby={d}
                className="tabular"
                required
              />
            )}
          </Field>
          <Field label="Fecha de compra" required error={errors.fechaCompra}>
            {(id, d) => <Input id={id} type="date" value={f.fechaCompra} onChange={set('fechaCompra')} aria-describedby={d} required />}
          </Field>
          <Field label="Fecha de baja" error={errors.fechaBaja} hint="Si se vendió o desechó.">
            {(id, d) => <Input id={id} type="date" value={f.fechaBaja} onChange={set('fechaBaja')} aria-describedby={d} />}
          </Field>
          <Field label="Observaciones" className="sm:col-span-2">
            {(id) => <Textarea id={id} value={f.observaciones} onChange={set('observaciones')} />}
          </Field>
        </fieldset>
        <dl aria-label="Cálculo" className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 rounded-card bg-sunken px-4 py-3 text-[13px] sm:col-span-2">
          <dt className="text-ink-3">Depreciación anual</dt>
          <dd className="text-right tabular">{clp(Math.round(depreciacionAnual(calc)))}</dd>
          <dt className="text-ink-3">Fin de la vida útil</dt>
          <dd className="text-right">{f.fechaCompra ? fecha(finVidaUtil(calc)) : '—'}</dd>
          <dt className="text-ink-3">Acumulada a hoy</dt>
          <dd className="text-right tabular">{clp(Math.round(depreciacionAcumulada(calc, hoy)))}</dd>
          <dt className="font-semibold text-ink">Valor libro hoy</dt>
          <dd className="text-right font-bold tabular">{clp(Math.round(valorLibro(calc, hoy)))}</dd>
        </dl>
        <ErrorForm error={error} className="sm:col-span-2" />
      </form>
    </Dialog>
  );
}
