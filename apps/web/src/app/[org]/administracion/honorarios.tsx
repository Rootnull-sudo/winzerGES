'use client';
/** Pestaña Honorarios: boletas recibidas con la retención a la tasa vigente en la fecha de cada boleta. */
import { calcularHonorario, clp, fechaHoy, valorPorDefecto, vigenteEn } from '@winzer/domain';
import { Plus, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { Adjuntos } from '@/components/adjuntos';
import { useCan, useOrg, useTemporadaElegida } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { EmptyState, Stat, StatGrid } from '@/components/ui/page';
import { ErrorForm, fecha, useSubmit } from '../proveedores/comun';
import { deleteHonorario, pagarHonorario, saveHonorario } from './actions';
import type { HonorarioFila, TasaVigente } from './view';

const pct = (v: number) => `${(v * 100).toLocaleString('es-CL', { maximumFractionDigits: 2 })} %`;

export function Honorarios({ honorarios, tasas }: { honorarios: HonorarioFila[]; tasas: TasaVigente[] }) {
  const can = useCan();
  const elegida = useTemporadaElegida();
  const [editing, setEditing] = useState<HonorarioFila | 'nueva' | null>(null);
  const rows = honorarios.filter((h) => !elegida || (h.fecha >= elegida.inicio && h.fecha <= elegida.fin)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const suma = (k: 'bruto' | 'retencion' | 'liquido') => rows.reduce((s, h) => s + h[k], 0);
  const cols: Column<HonorarioFila>[] = [
    { key: 'fecha', label: 'Fecha', render: (h) => fecha(h.fecha) },
    { key: 'nombre', label: 'Prestador', render: (h) => <b>{h.nombre}</b> },
    { key: 'rut', label: 'RUT', className: 'tabular' },
    { key: 'numero', label: 'N° boleta', num: true, value: (h) => h.numero ?? '' },
    { key: 'descripcion', label: 'Servicio', render: (h) => <span className="text-ink-2">{h.descripcion ?? '—'}</span> },
    { key: 'bruto', label: 'Bruto', num: true, render: (h) => clp(h.bruto) },
    {
      key: 'retencion',
      label: 'Retención',
      num: true,
      render: (h) => (
        <span className="leading-tight">
          {clp(h.retencion)}
          <span className="block text-[11px] text-ink-3">{pct(h.tasaRetencion)}</span>
        </span>
      )
    },
    { key: 'liquido', label: 'Líquido', num: true, render: (h) => <b>{clp(h.liquido)}</b> },
    {
      key: 'estado',
      label: 'Estado',
      value: (h) => h.estado,
      render: (h) => (h.estado === 'pagada' ? <Badge tone="ok">Pagada {h.fechaPago ? fecha(h.fechaPago) : ''}</Badge> : <Badge tone="warn">Por pagar</Badge>)
    }
  ];
  return (
    <>
      <StatGrid>
        <Stat
          label="Honorarios brutos"
          value={clp(suma('bruto'))}
          sub={`temporada ${elegida?.anio ?? ''}`}
          icon={<ReceiptText size={16} strokeWidth={1.6} />}
        />
        <Stat label="Retenciones" value={clp(suma('retencion'))} sub="Van al F29 de cada mes" />
        <Stat label="Por pagar" value={clp(rows.filter((h) => h.estado !== 'pagada').reduce((s, h) => s + h.liquido, 0))} sub="Líquido de boletas pendientes" />
      </StatGrid>
      <DataTable
        rows={rows}
        columns={cols}
        onRowClick={(h) => setEditing(h)}
        exportName={`honorarios-${elegida?.anio ?? ''}`}
        canExport={can('administracion', 'x')}
        toolbar={
          can('administracion', 'c') && (
            <Button variant="primary" onClick={() => setEditing('nueva')}>
              <Plus size={16} /> Nueva boleta
            </Button>
          )
        }
        empty={
          <EmptyState
            icon={<ReceiptText size={28} strokeWidth={1.5} />}
            title={`Sin honorarios en la temporada ${elegida?.anio ?? ''}`}
            text="Registra las boletas de honorarios recibidas: se calcula la retención con la tasa vigente en su fecha."
          />
        }
      />
      {suma('bruto') > 0 && (
        <p aria-label="Totales de honorarios" className="mt-3 flex flex-wrap gap-x-5 text-[13px] text-ink-2">
          <span>
            Bruto <b className="text-ink tabular">{clp(suma('bruto'))}</b>
          </span>
          <span>
            Retención <b className="text-ink tabular">{clp(suma('retencion'))}</b>
          </span>
          <span>
            Líquido <b className="text-ink tabular">{clp(suma('liquido'))}</b>
          </span>
        </p>
      )}
      {editing && <HonorarioDialog honorario={editing === 'nueva' ? null : editing} tasas={tasas} onClose={() => setEditing(null)} />}
    </>
  );
}

function HonorarioDialog({ honorario, tasas, onClose }: { honorario: HonorarioFila | null; tasas: TasaVigente[]; onClose: () => void }) {
  const { org } = useOrg();
  const can = useCan();
  const { pending, errors, error, run } = useSubmit(onClose);
  const h = honorario;
  const pagada = h?.estado === 'pagada';
  const editable = !pagada && (h ? can('administracion', 'e') : can('administracion', 'c'));
  const [f, setF] = useState({
    fecha: h?.fecha ?? fechaHoy(),
    nombre: h?.nombre ?? '',
    rut: h?.rut ?? '',
    numero: h?.numero != null ? String(h.numero) : '',
    descripcion: h?.descripcion ?? '',
    bruto: h ? String(h.bruto) : ''
  });
  const [fechaPago, setFechaPago] = useState(fechaHoy());
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  // Misma regla que el servidor: tasa vigente en la fecha de la boleta (o la por defecto si no hay indicador).
  const tasa = vigenteEn(tasas, 'retencion_honorarios', f.fecha)?.valor ?? (valorPorDefecto('tributario.retencionHonorarios') as number);
  const c = calcularHonorario(f.bruto, pagada && h ? h.tasaRetencion : tasa);
  return (
    <Dialog
      open
      onClose={onClose}
      title={h ? `Boleta ${h.numero ?? ''} · ${h.nombre}` : 'Nueva boleta de honorarios'}
      description={
        pagada
          ? `Pagada el ${h?.fechaPago ? fecha(h.fechaPago) : '—'}: revierte el pago para modificarla.`
          : 'La retención usa la tasa vigente en la fecha de la boleta (cambia cada año).'
      }
      footer={
        <>
          {h && !pagada && can('administracion', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() => confirm('¿Eliminar esta boleta?') && run(() => deleteHonorario(org.slug, h.id), 'Boleta eliminada.')}
            >
              Eliminar
            </Button>
          )}
          {h && pagada && can('administracion', 'e') && (
            <Button type="button" disabled={pending} onClick={() => run(() => pagarHonorario(org.slug, h.id, null), 'Pago revertido.')}>
              Revertir pago
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            {editable ? 'Cancelar' : 'Cerrar'}
          </Button>
          {editable && (
            <Button type="submit" form="honorario-form" variant="primary" disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar'}
            </Button>
          )}
        </>
      }
    >
      <form
        id="honorario-form"
        onSubmit={(e) => (
          e.preventDefault(),
          run(() => saveHonorario(org.slug, { ...f, id: h?.id }, h?.version), h ? 'Boleta actualizada.' : 'Boleta registrada.')
        )}
        className="grid gap-4 sm:grid-cols-2"
      >
        <fieldset disabled={!editable} className="contents">
          <Field label="Fecha" required error={errors.fecha}>
            {(id, d) => <Input id={id} type="date" value={f.fecha} onChange={set('fecha')} aria-describedby={d} required />}
          </Field>
          <Field label="N° de boleta" error={errors.numero}>
            {(id, d) => <Input id={id} type="number" min={1} step={1} value={f.numero} onChange={set('numero')} aria-describedby={d} className="tabular" />}
          </Field>
          <Field label="Prestador" required error={errors.nombre}>
            {(id, d) => <Input id={id} value={f.nombre} onChange={set('nombre')} aria-describedby={d} required />}
          </Field>
          <Field label="RUT" required error={errors.rut}>
            {(id, d) => <Input id={id} value={f.rut} onChange={set('rut')} aria-describedby={d} required />}
          </Field>
          <Field label="Servicio" className="sm:col-span-2">
            {(id) => <Input id={id} value={f.descripcion} onChange={set('descripcion')} />}
          </Field>
          <Field label="Monto bruto" unit="CLP" required error={errors.bruto}>
            {(id, d) => (
              <Input id={id} type="number" min={1} step={1} value={f.bruto} onChange={set('bruto')} aria-describedby={d} className="tabular" required />
            )}
          </Field>
        </fieldset>
        <dl aria-label="Cálculo" className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 self-end rounded-card bg-sunken px-4 py-3 text-[13px]">
          <dt className="text-ink-3">Retención ({pct(c.tasaRetencion)})</dt>
          <dd className="text-right tabular">{clp(c.retencion)}</dd>
          <dt className="font-semibold text-ink">Líquido a pagar</dt>
          <dd className="text-right font-bold tabular">{clp(c.liquido)}</dd>
        </dl>
        {h && !pagada && can('administracion', 'e') && (
          <div className="flex flex-wrap items-end gap-3 border-t border-rule pt-4 sm:col-span-2">
            <Field label="Fecha de pago">{(id) => <Input id={id} type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />}</Field>
            <Button type="button" disabled={pending} onClick={() => run(() => pagarHonorario(org.slug, h.id, fechaPago), 'Boleta pagada.')}>
              Marcar pagada
            </Button>
          </div>
        )}
        <ErrorForm error={error} className="sm:col-span-2" />
      </form>
      {h && <Adjuntos entidad="honorario" registroId={h.id} />}
    </Dialog>
  );
}
