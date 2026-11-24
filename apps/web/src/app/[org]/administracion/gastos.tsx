'use client';
/** Pestaña Gastos: IVA solo en factura afecta; a crédito queda en Por pagar (Proveedores y compras). */
import { AREAS_GASTO, CATEGORIAS_GASTO, clasificacionGasto, clp, DOCUMENTOS_GASTO, fechaHoy, MEDIOS_PAGO_GASTO, totalesGasto } from '@winzer/domain';
import { Plus, Receipt } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Adjuntos } from '@/components/adjuntos';
import { useCan, useOrg, useTemporadaElegida } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { EmptyState, Stat, StatGrid } from '@/components/ui/page';
import { ErrorForm, fecha, useSubmit } from '../proveedores/comun';
import { deleteGasto, saveGasto } from './actions';
import type { GastoRow, ProveedorOpt } from './view';

export const CATEGORIA = Object.fromEntries(CATEGORIAS_GASTO) as Record<string, string>;
const DOCUMENTO = Object.fromEntries(DOCUMENTOS_GASTO) as Record<string, string>;

export function Gastos({ gastos, proveedores, tasaIVA }: { gastos: GastoRow[]; proveedores: ProveedorOpt[]; tasaIVA: number }) {
  const can = useCan();
  const elegida = useTemporadaElegida();
  const [editing, setEditing] = useState<GastoRow | 'nuevo' | null>(null);
  const [cat, setCat] = useState('');
  const provById = useMemo(() => new Map(proveedores.map((p) => [p.id, p.nombre])), [proveedores]);
  const deTemporada = gastos.filter((g) => !elegida || (g.fecha >= elegida.inicio && g.fecha <= elegida.fin));
  const rows = deTemporada.filter((g) => !cat || g.categoria === cat).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const suma = (fn: (g: GastoRow) => number, xs = rows) => xs.reduce((s, g) => s + fn(g), 0);
  const cols: Column<GastoRow>[] = [
    { key: 'fecha', label: 'Fecha', render: (g) => fecha(g.fecha) },
    { key: 'categoria', label: 'Categoría', value: (g) => CATEGORIA[g.categoria] ?? g.categoria },
    { key: 'descripcion', label: 'Descripción', render: (g) => <b>{g.descripcion}</b> },
    {
      key: 'proveedor',
      label: 'Proveedor',
      value: (g) => (g.proveedorId ? (provById.get(g.proveedorId) ?? '') : ''),
      render: (g) => <span className="text-ink-2">{g.proveedorId ? provById.get(g.proveedorId) : '—'}</span>
    },
    {
      key: 'documento',
      label: 'Documento',
      value: (g) => `${DOCUMENTO[g.documento]} ${g.folio ?? ''}`,
      render: (g) => `${DOCUMENTO[g.documento] ?? g.documento}${g.folio ? ` ${g.folio}` : ''}`
    },
    { key: 'monto', label: 'Neto', num: true, render: (g) => clp(g.monto) },
    { key: 'iva', label: 'IVA', num: true, render: (g) => clp(g.iva) },
    { key: 'total', label: 'Total', num: true, render: (g) => <b>{clp(g.total)}</b> },
    {
      key: 'estado',
      label: 'Pago',
      value: (g) => (g.saldo != null && g.saldo > 0 ? 'Por pagar' : 'Pagado'),
      render: (g) => (g.saldo != null && g.saldo > 0 ? <Badge tone="warn">Por pagar {clp(g.saldo)}</Badge> : <Badge tone="ok">Pagado</Badge>)
    }
  ];
  return (
    <>
      <StatGrid>
        <Stat
          label="Gastos netos"
          value={clp(suma((g) => g.monto, deTemporada))}
          sub={`temporada ${elegida?.anio ?? ''}`}
          icon={<Receipt size={16} strokeWidth={1.6} />}
        />
        <Stat label="IVA crédito" value={clp(suma((g) => g.iva, deTemporada))} sub="Facturas afectas" />
        <Stat label="Costos indirectos" value={clp(suma((g) => (g.area === 'produccion' ? g.monto : 0), deTemporada))} sub="Área producción" />
        <Stat label="Por pagar" value={clp(suma((g) => Math.max(0, g.saldo ?? 0), deTemporada))} sub="Gastos a crédito; se pagan en Proveedores y compras" />
      </StatGrid>
      <DataTable
        rows={rows}
        columns={cols}
        onRowClick={(g) => setEditing(g)}
        exportName={`gastos-${elegida?.anio ?? ''}`}
        canExport={can('administracion', 'x')}
        toolbar={
          <>
            <div className="w-56">
              <Select aria-label="Categoría" value={cat} onChange={(e) => setCat(e.target.value)} className="h-9 text-[14px]">
                <option value="">Todas las categorías</option>
                {CATEGORIAS_GASTO.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            {can('administracion', 'c') && (
              <Button variant="primary" onClick={() => setEditing('nuevo')}>
                <Plus size={16} /> Nuevo gasto
              </Button>
            )}
          </>
        }
        empty={
          <EmptyState
            icon={<Receipt size={28} strokeWidth={1.5} />}
            title={`Sin gastos en la temporada ${elegida?.anio ?? ''}`}
            text="Registra servicios, arriendos, seguros y otros gastos con su documento."
          />
        }
      />
      {rows.length > 0 && (
        <p aria-label="Totales de gastos" className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-2">
          <span>
            Neto <b className="text-ink tabular">{clp(suma((g) => g.monto))}</b>
          </span>
          <span>
            IVA <b className="text-ink tabular">{clp(suma((g) => g.iva))}</b>
          </span>
          <span>
            Total <b className="text-ink tabular">{clp(suma((g) => g.total))}</b>
          </span>
        </p>
      )}
      {editing && <GastoDialog gasto={editing === 'nuevo' ? null : editing} proveedores={proveedores} tasaIVA={tasaIVA} onClose={() => setEditing(null)} />}
    </>
  );
}

function GastoDialog({ gasto, proveedores, tasaIVA, onClose }: { gasto: GastoRow | null; proveedores: ProveedorOpt[]; tasaIVA: number; onClose: () => void }) {
  const { org } = useOrg();
  const can = useCan();
  const { pending, errors, error, run } = useSubmit(onClose);
  const g = gasto;
  const editable = g ? can('administracion', 'e') : can('administracion', 'c');
  const [f, setF] = useState({
    fecha: g?.fecha ?? fechaHoy(),
    categoria: g?.categoria ?? 'servicios',
    descripcion: g?.descripcion ?? '',
    proveedorId: g?.proveedorId ?? '',
    monto: g ? String(g.monto) : '',
    documento: g?.documento ?? 'factura',
    folio: g?.folio ?? '',
    afectoIVA: g ? g.afectoIVA : true,
    medioPago: g?.medioPago ?? 'transferencia',
    estado: g?.estado ?? 'pagado',
    tipoCosto: g?.tipoCosto ?? 'fijo',
    area: g?.area ?? 'admin',
    noDeducible: g?.noDeducible ?? false,
    observaciones: g?.observaciones ?? ''
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const factura = f.documento === 'factura';
  const t = totalesGasto({ monto: f.monto, documento: f.documento, afectoIVA: factura && f.afectoIVA }, tasaIVA);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(() => saveGasto(org.slug, { ...f, id: g?.id }, g?.version), g ? 'Gasto actualizado.' : 'Gasto registrado.');
  }
  const opciones = (xs: readonly (readonly [string, string])[]) =>
    xs.map(([v, l]) => (
      <option key={v} value={v}>
        {l}
      </option>
    ));
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={g ? g.descripcion : 'Nuevo gasto'}
      description="Monto neto. El IVA solo se recupera con factura afecta; a crédito, el gasto queda en Por pagar."
      footer={
        <>
          {g && can('administracion', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() => confirm('¿Eliminar este gasto?') && run(() => deleteGasto(org.slug, g.id), 'Gasto eliminado.')}
            >
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            {editable ? 'Cancelar' : 'Cerrar'}
          </Button>
          {editable && (
            <Button type="submit" form="gasto-form" variant="primary" disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar'}
            </Button>
          )}
        </>
      }
    >
      <form id="gasto-form" onSubmit={submit} className="grid gap-x-6 gap-y-4 sm:grid-cols-[1fr_15rem]">
        <fieldset disabled={!editable} className="grid content-start gap-4 sm:grid-cols-2">
          <legend className="sr-only">Gasto</legend>
          <Field label="Fecha" required error={errors.fecha}>
            {(id, d) => <Input id={id} type="date" value={f.fecha} onChange={set('fecha')} aria-describedby={d} required />}
          </Field>
          <Field label="Categoría" required>
            {(id) => (
              <Select id={id} value={f.categoria} onChange={set('categoria')}>
                {opciones(CATEGORIAS_GASTO)}
              </Select>
            )}
          </Field>
          <Field label="Descripción" required error={errors.descripcion} className="sm:col-span-2">
            {(id, d) => <Input id={id} value={f.descripcion} onChange={set('descripcion')} aria-describedby={d} required />}
          </Field>
          <Field label="Proveedor">
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
          <Field label="Monto neto" unit="CLP" required error={errors.monto}>
            {(id, d) => (
              <Input id={id} type="number" min={1} step={1} value={f.monto} onChange={set('monto')} aria-describedby={d} className="tabular" required />
            )}
          </Field>
          <Field label="Documento">
            {(id) => (
              <Select id={id} value={f.documento} onChange={set('documento')}>
                {opciones(DOCUMENTOS_GASTO)}
              </Select>
            )}
          </Field>
          {f.documento !== 'otro' ? (
            <Field label="Folio" error={errors.folio}>
              {(id, d) => <Input id={id} value={f.folio} onChange={set('folio')} aria-describedby={d} className="tabular" />}
            </Field>
          ) : (
            <span />
          )}
          {factura && (
            <label className="flex items-center gap-2.5 text-[14px] sm:col-span-2">
              <input type="checkbox" checked={f.afectoIVA} onChange={(e) => setF({ ...f, afectoIVA: e.target.checked })} className="size-4 accent-ink" />
              Factura afecta a IVA (da crédito fiscal)
            </label>
          )}
          <Field label="Pago">
            {(id) => (
              <Select id={id} value={f.estado} onChange={set('estado')}>
                <option value="pagado">Al contado (pagado)</option>
                <option value="pendiente">A crédito (por pagar)</option>
              </Select>
            )}
          </Field>
          <Field label="Medio de pago">
            {(id) => (
              <Select id={id} value={f.medioPago} onChange={set('medioPago')}>
                {opciones(MEDIOS_PAGO_GASTO)}
              </Select>
            )}
          </Field>
          <Field label="Tipo de costo">
            {(id) => (
              <Select id={id} value={f.tipoCosto} onChange={set('tipoCosto')}>
                <option value="fijo">Fijo</option>
                <option value="variable">Variable</option>
              </Select>
            )}
          </Field>
          <Field label="Área">
            {(id) => (
              <Select id={id} value={f.area} onChange={set('area')}>
                {opciones(AREAS_GASTO)}
              </Select>
            )}
          </Field>
          <label className="flex items-center gap-2.5 text-[14px] sm:col-span-2">
            <input type="checkbox" checked={f.noDeducible} onChange={(e) => setF({ ...f, noDeducible: e.target.checked })} className="size-4 accent-ink" />
            No deducible (se agrega en la renta)
          </label>
          <Field label="Observaciones" className="sm:col-span-2">
            {(id) => <Textarea id={id} value={f.observaciones} onChange={set('observaciones')} />}
          </Field>
        </fieldset>
        <aside aria-label="Cálculo" className="self-start rounded-card bg-sunken px-4 py-3 text-[13px]">
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
            <dt className="text-ink-3">Neto</dt>
            <dd className="text-right tabular">{clp(Number(f.monto) || 0)}</dd>
            <dt className="text-ink-3">IVA</dt>
            <dd className="text-right tabular">{clp(t.iva)}</dd>
            <dt className="font-semibold text-ink">Total</dt>
            <dd className="text-right text-[15px] font-bold tabular">{clp(t.total)}</dd>
          </dl>
          <p className="mt-2 border-t border-rule pt-2 text-ink-2">{clasificacionGasto(f.area)}</p>
          {g?.saldo != null && g.saldo > 0 && <p className="mt-1 text-ink-2">Saldo por pagar {clp(g.saldo)}: se paga en Proveedores y compras → Por pagar.</p>}
        </aside>
        <ErrorForm error={error} className="sm:col-span-2" />
      </form>
      {g && <Adjuntos entidad="gasto" registroId={g.id} />}
    </Dialog>
  );
}
