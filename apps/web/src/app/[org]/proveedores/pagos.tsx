'use client';
/**
 * Pestañas Por pagar y Pagos (F3-3). El saldo de cada documento viene de v_por_pagar (total − NC − pagos aplicados);
 * un pago se reparte entre los documentos abiertos del proveedor, primero los que vencen antes.
 */
import {
  aplicarEnOrden,
  clp,
  DIAS_AVISO_POR_PAGAR,
  diasAlVencimiento,
  ESTADO_PAGO_LABEL,
  estadoPagoDoc,
  fechaHoy,
  MEDIOS_PAGO,
  resumenPorPagar
} from '@winzer/domain';
import { Banknote, Plus, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCan, useOrg } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState, Stat, StatGrid } from '@/components/ui/page';
import { cn } from '@/lib/cn';
import { deletePago, savePago } from './actions';
import { ErrorForm, fecha, useSubmit, type DocPorPagar, type PagoRow, type ProveedorRow } from './comun';
import { DOC } from './compras';

const MEDIO = Object.fromEntries(MEDIOS_PAGO) as Record<string, string>;
export const nombreDoc = (d: Pick<DocPorPagar, 'origen' | 'documento' | 'folio'>) =>
  `${d.origen === 'gasto' ? 'Gasto · ' : ''}${DOC[d.documento] ?? d.documento}${d.folio ? ` ${d.folio}` : ''}`;

function Dias({ d }: { d: DocPorPagar }) {
  if (!d.vencimiento) return <span className="text-ink-4">—</span>;
  const dias = diasAlVencimiento(d.vencimiento, fechaHoy());
  if (dias < 0) return <span className="font-semibold text-bad">Vencida hace {-dias} d</span>;
  if (dias === 0) return <span className="font-semibold text-warn">Vence hoy</span>;
  return <span className={cn(dias <= DIAS_AVISO_POR_PAGAR && 'font-semibold text-warn')}>En {dias} d</span>;
}

export function PorPagar({ docs, proveedores }: { docs: DocPorPagar[]; proveedores: ProveedorRow[] }) {
  const can = useCan();
  const [pagando, setPagando] = useState<{ proveedorId?: string; docId?: string } | null>(null);
  const provById = useMemo(() => new Map(proveedores.map((p) => [p.id, p.nombre])), [proveedores]);
  const hoy = fechaHoy();
  const abiertos = docs
    .filter((d) => d.saldo > 0)
    .sort((a, b) => (a.vencimiento ?? '9999').localeCompare(b.vencimiento ?? '9999') || a.fecha.localeCompare(b.fecha));
  const r = resumenPorPagar(abiertos, hoy);
  const cols: Column<DocPorPagar>[] = [
    {
      key: 'proveedor',
      label: 'Proveedor',
      value: (d) => (d.proveedorId ? (provById.get(d.proveedorId) ?? '') : '—'),
      render: (d) => <b>{d.proveedorId ? provById.get(d.proveedorId) : '—'}</b>
    },
    { key: 'documento', label: 'Documento', value: (d) => nombreDoc(d) },
    { key: 'fecha', label: 'Fecha', render: (d) => fecha(d.fecha) },
    { key: 'vencimiento', label: 'Vencimiento', value: (d) => d.vencimiento ?? '', render: (d) => (d.vencimiento ? fecha(d.vencimiento) : '—') },
    { key: 'dias', label: 'Plazo', value: (d) => diasAlVencimiento(d.vencimiento, hoy), render: (d) => <Dias d={d} /> },
    { key: 'total', label: 'Total', num: true, render: (d) => clp(d.total) },
    { key: 'saldo', label: 'Saldo', num: true, render: (d) => <b>{clp(d.saldo)}</b> },
    {
      key: 'estado',
      label: 'Estado',
      value: (d) => ESTADO_PAGO_LABEL[estadoPagoDoc({ ...d, documento: d.origen === 'gasto' ? 'factura' : d.documento }, hoy)],
      render: (d) => {
        const e = estadoPagoDoc({ ...d, documento: d.origen === 'gasto' ? 'factura' : d.documento }, hoy);
        return <Badge tone={e === 'vencida' ? 'bad' : e === 'parcial' ? 'info' : 'warn'}>{ESTADO_PAGO_LABEL[e]}</Badge>;
      }
    }
  ];
  return (
    <>
      <StatGrid>
        <Stat label="Por pagar" value={clp(r.total)} sub={`${abiertos.length} documentos`} icon={<Wallet size={16} strokeWidth={1.6} />} />
        <Stat label="Vencido" value={<span className={cn(r.vencido > 0 && 'text-bad')}>{clp(r.vencido)}</span>} sub="Ya pasó su vencimiento" />
        <Stat
          label={`Vence en ${DIAS_AVISO_POR_PAGAR} días`}
          value={<span className={cn(r.proximo > 0 && 'text-warn')}>{clp(r.proximo)}</span>}
          sub="Programa estos pagos"
        />
      </StatGrid>
      <DataTable
        rows={abiertos}
        columns={cols}
        onRowClick={can('proveedores', 'c') ? (d) => setPagando({ proveedorId: d.proveedorId ?? undefined, docId: d.id }) : undefined}
        exportName="cuentas-por-pagar"
        canExport={can('proveedores', 'x')}
        toolbar={
          can('proveedores', 'c') && (
            <Button variant="primary" onClick={() => setPagando({})} disabled={!abiertos.length}>
              <Plus size={16} /> Registrar pago
            </Button>
          )
        }
        empty={
          <EmptyState
            icon={<Wallet size={28} strokeWidth={1.5} />}
            title="Nada por pagar"
            text="Las facturas y boletas con saldo aparecen aquí, ordenadas por vencimiento."
          />
        }
      />
      {pagando && <PagoDialog docs={abiertos} proveedores={proveedores} inicial={pagando} onClose={() => setPagando(null)} />}
    </>
  );
}

function PagoDialog({
  docs,
  proveedores,
  inicial,
  onClose
}: {
  docs: DocPorPagar[];
  proveedores: ProveedorRow[];
  inicial: { proveedorId?: string; docId?: string };
  onClose: () => void;
}) {
  const { org } = useOrg();
  const { pending, errors, error, run } = useSubmit(onClose);
  const conDeuda = proveedores.filter((p) => docs.some((d) => d.proveedorId === p.id));
  const [prov, setProv] = useState(inicial.proveedorId ?? conDeuda[0]?.id ?? '');
  const abiertos = docs.filter((d) => d.proveedorId === prov);
  const saldoProv = abiertos.reduce((s, d) => s + d.saldo, 0);
  const montoInicial = inicial.docId ? (docs.find((d) => d.id === inicial.docId)?.saldo ?? 0) : saldoProv;
  const [f, setF] = useState({ fecha: fechaHoy(), medio: 'transferencia', referencia: '', monto: String(montoInicial) });
  const [aplica, setAplica] = useState<Record<string, string>>(() => distribuir(abiertos, montoInicial, inicial.docId));
  const suma = Object.values(aplica).reduce((s, v) => s + (Number(v) || 0), 0);
  const monto = Number(f.monto) || 0;

  function distribuir(ds: DocPorPagar[], m: number, primero?: string) {
    const orden = primero ? [...ds.filter((d) => d.id === primero), ...ds.filter((d) => d.id !== primero)] : ds;
    const reparto = primero
      ? (() => {
          const out: { id: string; monto: number }[] = [];
          let resto = m;
          for (const d of orden) {
            const x = Math.min(resto, d.saldo);
            if (x > 0) out.push({ id: d.id, monto: x });
            resto -= x;
          }
          return out;
        })()
      : aplicarEnOrden(ds, m);
    return Object.fromEntries(reparto.map((a) => [a.id, String(a.monto)]));
  }
  function cambiarProveedor(id: string) {
    setProv(id);
    const ds = docs.filter((d) => d.proveedorId === id);
    const m = ds.reduce((s, d) => s + d.saldo, 0);
    setF({ ...f, monto: String(m) });
    setAplica(distribuir(ds, m));
  }
  function cambiarMonto(v: string) {
    setF({ ...f, monto: v });
    setAplica(distribuir(abiertos, Number(v) || 0));
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const aplicaciones = abiertos
      .filter((d) => Number(aplica[d.id]) > 0)
      .map((d) => ({ [d.origen === 'gasto' ? 'gastoId' : 'compraId']: d.id, monto: Number(aplica[d.id]) }));
    run(() => savePago(org.slug, { ...f, proveedorId: prov || null, monto, aplicaciones }), 'Pago registrado.');
  }
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Registrar pago"
      description="El monto se reparte entre los documentos abiertos, primero los que vencen antes. Puedes ajustar cada uno."
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="pago-form" variant="primary" disabled={pending || suma !== monto || monto <= 0}>
            {pending ? 'Guardando…' : 'Registrar pago'}
          </Button>
        </>
      }
    >
      <form id="pago-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Proveedor" required className="sm:col-span-2">
          {(id) => (
            <Select id={id} value={prov} onChange={(e) => cambiarProveedor(e.target.value)} required>
              {conDeuda.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Fecha" required error={errors.fecha}>
          {(id, d) => <Input id={id} type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} aria-describedby={d} required />}
        </Field>
        <Field label="Monto del pago" unit="CLP" required error={errors.monto}>
          {(id, d) => (
            <Input
              id={id}
              type="number"
              min={1}
              step={1}
              value={f.monto}
              onChange={(e) => cambiarMonto(e.target.value)}
              aria-describedby={d}
              className="tabular"
              required
            />
          )}
        </Field>
        <Field label="Medio">
          {(id) => (
            <Select id={id} value={f.medio} onChange={(e) => setF({ ...f, medio: e.target.value })}>
              {MEDIOS_PAGO.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Referencia" hint="N° de transferencia o cheque.">
          {(id, d) => <Input id={id} value={f.referencia} onChange={(e) => setF({ ...f, referencia: e.target.value })} aria-describedby={d} />}
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Aplicar a</legend>
          <ul className="divide-y divide-rule rounded-card border border-rule">
            {abiertos.map((d) => (
              <li key={d.id} className="grid grid-cols-[1fr_auto_8rem] items-center gap-3 px-3 py-2 text-[14px]">
                <span>
                  <b>{nombreDoc(d)}</b>
                  <span className="block text-[12px] text-ink-3">
                    {d.vencimiento ? `Vence ${fecha(d.vencimiento)}` : fecha(d.fecha)} · saldo {clp(d.saldo)}
                  </span>
                </span>
                <Dias d={d} />
                <Input
                  aria-label={`Aplicar a ${nombreDoc(d)}`}
                  type="number"
                  min={0}
                  max={d.saldo}
                  step={1}
                  value={aplica[d.id] ?? ''}
                  onChange={(e) => setAplica({ ...aplica, [d.id]: e.target.value })}
                  className="h-9 text-[14px] tabular"
                />
              </li>
            ))}
          </ul>
          <p aria-live="polite" className={cn('mt-2 text-right text-[13px]', suma === monto ? 'text-ink-2' : 'font-semibold text-bad')}>
            Aplicado {clp(suma)} de {clp(monto)}
            {suma !== monto && ' · debe ser igual al monto del pago'}
          </p>
        </fieldset>
        <ErrorForm error={error ?? errors.aplicaciones ?? null} className="sm:col-span-2" />
      </form>
    </Dialog>
  );
}

export function Pagos({ pagos, docs, proveedores }: { pagos: PagoRow[]; docs: DocPorPagar[]; proveedores: ProveedorRow[] }) {
  const can = useCan();
  const [viendo, setViendo] = useState<PagoRow | null>(null);
  const provById = useMemo(() => new Map(proveedores.map((p) => [p.id, p.nombre])), [proveedores]);
  const docById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const rows = [...pagos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const aplicadoA = (p: PagoRow) =>
    p.aplicaciones
      .map((a) => {
        const d = docById.get(a.compraId ?? a.gastoId ?? '');
        return d ? nombreDoc(d) : 'Documento';
      })
      .join(', ');
  const cols: Column<PagoRow>[] = [
    { key: 'fecha', label: 'Fecha', render: (p) => fecha(p.fecha) },
    { key: 'proveedor', label: 'Proveedor', value: (p) => (p.proveedorId ? (provById.get(p.proveedorId) ?? '') : '—') },
    { key: 'medio', label: 'Medio', value: (p) => MEDIO[p.medio] ?? p.medio },
    { key: 'referencia', label: 'Referencia', render: (p) => <span className="text-ink-2">{p.referencia ?? '—'}</span> },
    { key: 'documentos', label: 'Aplicado a', value: aplicadoA, render: (p) => <span className="text-ink-2">{aplicadoA(p)}</span> },
    { key: 'monto', label: 'Monto', num: true, render: (p) => <b>{clp(p.monto)}</b> }
  ];
  return (
    <>
      <DataTable
        rows={rows}
        columns={cols}
        onRowClick={(p) => setViendo(p)}
        exportName="pagos-proveedores"
        canExport={can('proveedores', 'x')}
        empty={
          <EmptyState
            icon={<Banknote size={28} strokeWidth={1.5} />}
            title="Sin pagos registrados"
            text="Registra los pagos desde Por pagar: se aplican a cada documento y bajan su saldo."
          />
        }
      />
      {viendo && (
        <PagoDetalle
          pago={viendo}
          nombre={(id) => (docById.get(id) ? nombreDoc(docById.get(id)!) : 'Documento')}
          proveedor={viendo.proveedorId ? provById.get(viendo.proveedorId) : undefined}
          onClose={() => setViendo(null)}
        />
      )}
    </>
  );
}

function PagoDetalle({ pago, nombre, proveedor, onClose }: { pago: PagoRow; nombre: (id: string) => string; proveedor?: string; onClose: () => void }) {
  const { org } = useOrg();
  const can = useCan();
  const { pending, error, run } = useSubmit(onClose);
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Pago de ${clp(pago.monto)}`}
      description={`${proveedor ?? 'Sin proveedor'} · ${fecha(pago.fecha)} · ${MEDIO[pago.medio] ?? pago.medio}${pago.referencia ? ` · ${pago.referencia}` : ''}`}
      footer={
        <>
          {can('proveedores', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() =>
                confirm('¿Eliminar este pago? Los documentos vuelven a quedar con su saldo.') && run(() => deletePago(org.slug, pago.id), 'Pago eliminado.')
              }
            >
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            Cerrar
          </Button>
        </>
      }
    >
      <ul className="divide-y divide-rule rounded-card border border-rule text-[14px]">
        {pago.aplicaciones.map((a, i) => (
          <li key={i} className="flex justify-between px-3 py-2">
            <span>{nombre(a.compraId ?? a.gastoId ?? '')}</span>
            <b className="tabular">{clp(a.monto)}</b>
          </li>
        ))}
      </ul>
      <ErrorForm error={error} className="mt-3" />
    </Dialog>
  );
}
