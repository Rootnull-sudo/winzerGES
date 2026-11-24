'use client';
/** Pestaña Proveedores: maestro con condiciones de pago y adjuntos (contratos, certificados). */
import { CATEGORIAS_PROVEEDOR, CONDICIONES_PROVEEDOR } from '@winzer/domain';
import { Plus, Truck } from 'lucide-react';
import { useState } from 'react';
import { Adjuntos } from '@/components/adjuntos';
import { useCan, useOrg } from '@/components/shell/org-context';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/page';
import { deleteProveedor, saveProveedor } from './actions';
import { ErrorForm, useSubmit, type ProveedorRow } from './comun';

export function Maestro({
  proveedores,
  columnasExtra = [],
  acciones
}: {
  proveedores: ProveedorRow[];
  columnasExtra?: Column<ProveedorRow>[];
  acciones?: React.ReactNode;
}) {
  const can = useCan();
  const [editing, setEditing] = useState<ProveedorRow | 'nuevo' | null>(null);
  const cols: Column<ProveedorRow>[] = [
    { key: 'nombre', label: 'Razón social', render: (p) => <b>{p.nombre}</b> },
    { key: 'rut', label: 'RUT', className: 'tabular' },
    { key: 'categoria', label: 'Categoría', render: (p) => <span className="text-ink-2">{p.categoria ?? '—'}</span> },
    { key: 'contacto', label: 'Contacto', render: (p) => <span className="text-ink-2">{[p.contacto, p.telefono].filter(Boolean).join(' · ') || '—'}</span> },
    { key: 'plazo', label: 'Plazo', num: true, render: (p) => (p.plazo === 0 ? 'Contado' : `${p.plazo} días`) },
    ...columnasExtra
  ];
  return (
    <>
      <DataTable
        rows={proveedores}
        columns={cols}
        onRowClick={can('proveedores', 'e') ? (p) => setEditing(p) : undefined}
        exportName="proveedores"
        canExport={can('proveedores', 'x')}
        toolbar={
          <>
            {acciones}
            {can('proveedores', 'c') && (
              <Button variant="primary" onClick={() => setEditing('nuevo')}>
                <Plus size={16} /> Nuevo proveedor
              </Button>
            )}
          </>
        }
        empty={
          <EmptyState
            icon={<Truck size={28} strokeWidth={1.5} />}
            title="Aún no hay proveedores"
            text="Registra a quienes te venden insumos, envases y servicios, con su RUT y plazo de pago."
          />
        }
      />
      {editing && <ProveedorDialog proveedor={editing === 'nuevo' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ProveedorDialog({ proveedor, onClose }: { proveedor: ProveedorRow | null; onClose: () => void }) {
  const { org } = useOrg();
  const can = useCan();
  const { pending, errors, error, run } = useSubmit(onClose);
  const p = proveedor;
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    run(() => saveProveedor(org.slug, { ...data, id: p?.id }, p?.version), p ? 'Proveedor actualizado.' : 'Proveedor creado.');
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={p ? p.nombre : 'Nuevo proveedor'}
      description={p ? `RUT ${p.rut}` : 'El plazo propone el vencimiento de sus facturas (0 = contado).'}
      footer={
        <>
          {p && can('proveedores', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() => confirm(`¿Eliminar a ${p.nombre}?`) && run(() => deleteProveedor(org.slug, p.id), 'Proveedor eliminado.')}
            >
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="proveedor-form" variant="primary" disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <form id="proveedor-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Razón social" required error={errors.nombre} className="sm:col-span-2">
          {(id, d) => <Input id={id} name="nombre" defaultValue={p?.nombre} aria-invalid={!!errors.nombre} aria-describedby={d} required autoFocus />}
        </Field>
        <Field label="RUT" required error={errors.rut}>
          {(id, d) => <Input id={id} name="rut" defaultValue={p?.rut} placeholder="76.123.456-0" aria-invalid={!!errors.rut} aria-describedby={d} required />}
        </Field>
        <Field label="Categoría">
          {(id) => (
            <>
              <Input id={id} name="categoria" list="categorias-proveedor" defaultValue={p?.categoria ?? ''} />
              <datalist id="categorias-proveedor">
                {CATEGORIAS_PROVEEDOR.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Contacto">{(id) => <Input id={id} name="contacto" defaultValue={p?.contacto ?? ''} />}</Field>
        <Field label="Teléfono">{(id) => <Input id={id} name="telefono" type="tel" defaultValue={p?.telefono ?? ''} />}</Field>
        <Field label="Correo" error={errors.email} className="sm:col-span-2">
          {(id, d) => <Input id={id} name="email" type="email" defaultValue={p?.email ?? ''} aria-describedby={d} />}
        </Field>
        <Field label="Condiciones de pago">
          {(id) => (
            <>
              <Input id={id} name="condiciones" list="condiciones-proveedor" defaultValue={p?.condiciones ?? '30 días'} />
              <datalist id="condiciones-proveedor">
                {CONDICIONES_PROVEEDOR.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Plazo de pago" unit="días" error={errors.plazo} hint="0 = contado.">
          {(id, d) => (
            <Input id={id} name="plazo" type="number" min={0} max={365} step={1} defaultValue={p?.plazo ?? 30} aria-describedby={d} className="tabular" />
          )}
        </Field>
        <ErrorForm error={error} className="sm:col-span-2" />
      </form>
      {p && <Adjuntos entidad="proveedor" registroId={p.id} />}
    </Dialog>
  );
}
