'use client';
/** Pestaña Formatos: envases con sus litros, unidades por caja y stock mínimo de producto terminado. */
import { ENVASES } from '@winzer/domain';
import { Package, Plus } from 'lucide-react';
import { useState } from 'react';
import { useCan, useOrg } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/page';
import { ErrorForm, useSubmit } from '../proveedores/comun';
import { deleteFormato, saveFormato } from './actions';
import type { FormatoFila } from './view';

const ENVASE = Object.fromEntries(ENVASES) as Record<string, string>;
const nf = (v: number) => v.toLocaleString('es-CL', { maximumFractionDigits: 3 });

export function Formatos({ formatos }: { formatos: FormatoFila[] }) {
  const can = useCan();
  const [editing, setEditing] = useState<FormatoFila | 'nuevo' | null>(null);
  const cols: Column<FormatoFila>[] = [
    { key: 'nombre', label: 'Formato', render: (f) => <b>{f.nombre}</b> },
    { key: 'litros', label: 'Litros', num: true, render: (f) => `${nf(f.litros)} L` },
    { key: 'envase', label: 'Envase', value: (f) => ENVASE[f.envase] ?? f.envase },
    { key: 'unidadesCaja', label: 'Unid./caja', num: true },
    { key: 'stockMinimo', label: 'Stock mínimo', num: true, render: (f) => f.stockMinimo.toLocaleString('es-CL') },
    {
      key: 'stock',
      label: 'Stock actual',
      num: true,
      render: (f) => (
        <span className="inline-flex items-center gap-2">
          {f.stock.toLocaleString('es-CL')}
          {f.stockMinimo > 0 && f.stock < f.stockMinimo && <Badge tone="warn">Bajo mínimo</Badge>}
        </span>
      )
    }
  ];
  return (
    <>
      <DataTable
        rows={formatos}
        columns={cols}
        onRowClick={(f) => setEditing(f)}
        exportName="formatos"
        canExport={can('envasado', 'x')}
        toolbar={
          can('envasado', 'c') && (
            <Button variant="primary" onClick={() => setEditing('nuevo')}>
              <Plus size={16} /> Nuevo formato
            </Button>
          )
        }
        empty={
          <EmptyState
            icon={<Package size={28} strokeWidth={1.5} />}
            title="Sin formatos"
            text="Define los envases que usas (0,75 L, magnum, bag in box) con sus unidades por caja."
          />
        }
      />
      {editing && <FormatoDialog formato={editing === 'nuevo' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function FormatoDialog({ formato, onClose }: { formato: FormatoFila | null; onClose: () => void }) {
  const { org } = useOrg();
  const can = useCan();
  const { pending, errors, error, run } = useSubmit(onClose);
  const f = formato;
  const editable = f ? can('envasado', 'e') : can('envasado', 'c');
  const [v, setV] = useState({
    nombre: f?.nombre ?? '',
    litros: f ? String(f.litros) : '0.75',
    envase: f?.envase ?? 'vidrio',
    unidadesCaja: f ? String(f.unidadesCaja) : '12',
    stockMinimo: f ? String(f.stockMinimo) : ''
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Dialog
      open
      onClose={onClose}
      title={f ? f.nombre : 'Nuevo formato'}
      footer={
        <>
          {f && can('envasado', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() => confirm(`¿Eliminar el formato ${f.nombre}?`) && run(() => deleteFormato(org.slug, f.id), 'Formato eliminado.')}
            >
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            {editable ? 'Cancelar' : 'Cerrar'}
          </Button>
          {editable && (
            <Button type="submit" form="formato-form" variant="primary" disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar'}
            </Button>
          )}
        </>
      }
    >
      <form
        id="formato-form"
        onSubmit={(e) => (
          e.preventDefault(),
          run(() => saveFormato(org.slug, { ...v, id: f?.id }, f?.version), f ? 'Formato actualizado.' : 'Formato creado.')
        )}
      >
        <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Formato</legend>
          <Field label="Nombre" required error={errors.nombre} className="sm:col-span-2">
            {(id, d) => <Input id={id} value={v.nombre} onChange={set('nombre')} aria-describedby={d} required />}
          </Field>
          <Field label="Litros por unidad" unit="L" required error={errors.litros}>
            {(id, d) => (
              <Input
                id={id}
                type="number"
                min={0.05}
                max={1000}
                step={0.001}
                value={v.litros}
                onChange={set('litros')}
                aria-describedby={d}
                className="tabular"
                required
              />
            )}
          </Field>
          <Field label="Envase">
            {(id) => (
              <Select id={id} value={v.envase} onChange={set('envase')}>
                {ENVASES.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Unidades por caja" error={errors.unidadesCaja}>
            {(id, d) => (
              <Input id={id} type="number" min={1} step={1} value={v.unidadesCaja} onChange={set('unidadesCaja')} aria-describedby={d} className="tabular" />
            )}
          </Field>
          <Field label="Stock mínimo" unit="unidades" error={errors.stockMinimo} hint="Bajo este stock se avisa.">
            {(id, d) => (
              <Input id={id} type="number" min={0} step={1} value={v.stockMinimo} onChange={set('stockMinimo')} aria-describedby={d} className="tabular" />
            )}
          </Field>
          <ErrorForm error={error} className="sm:col-span-2" />
        </fieldset>
      </form>
    </Dialog>
  );
}
