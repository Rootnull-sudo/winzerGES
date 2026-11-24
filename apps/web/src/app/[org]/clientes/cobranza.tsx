'use client';
/**
 * Cuentas por cobrar (antigüedad) y cobros aplicados a ventas (F5-4). El saldo de cada venta viene de v_por_cobrar
 * (total − Σ cobros aplicados); un cobro se reparte entre las ventas abiertas del cliente, primero las que vencen antes.
 * Lo no aplicado queda como anticipo. v1: "marcar pagada" ignoraba cobros anteriores y no había cobros parciales.
 */
import { ANTIGUEDAD, antiguedad, aplicarEnOrden, clp, diasAlVencimiento, fechaHoy, MEDIOS_COBRO, type Antiguedad } from '@winzer/domain';
import { Plus, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCan, useOrg } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState, Stat, StatGrid } from '@/components/ui/page';
import { cn } from '@/lib/cn';
import { ErrorForm, fecha, useSubmit } from '../proveedores/comun';
import { deleteCobro, saveCobro } from './actions';
import type { ClienteRow, CobroRow, VentaCxc } from './view';

const TRAMO = Object.fromEntries(ANTIGUEDAD) as Record<Antiguedad, string>;
const TONO: Record<Antiguedad, 'neutral' | 'warn' | 'bad'> = { por_vencer: 'neutral', d1_30: 'warn', d31_60: 'bad', d60: 'bad' };
export const nombreVenta = (v: Pick<VentaCxc, 'codigo' | 'documento' | 'folio'>) =>
  `${v.codigo ?? 'Venta'}${v.folio ? ` · ${v.documento === 'boleta' ? 'Boleta' : 'Factura'} N° ${v.folio}` : ''}`;

export function PorCobrar({
  ventas,
  clientes,
  onCobrar
}: {
  ventas: VentaCxc[];
  clientes: ClienteRow[];
  onCobrar: (clienteId?: string, ventaId?: string) => void;
}) {
  const can = useCan();
  const hoy = fechaHoy();
  const nombre = useMemo(() => new Map(clientes.map((c) => [c.id, c.nombre])), [clientes]);
  const abiertas = ventas
    .filter((v) => v.saldo > 0)
    .map((v) => ({ ...v, vencidoDias: v.vencimiento ? -diasAlVencimiento(v.vencimiento, hoy) : 0 }))
    .sort((a, b) => b.vencidoDias - a.vencidoDias);
  const porTramo = (t: Antiguedad) => abiertas.filter((v) => antiguedad(v.vencidoDias) === t).reduce((s, v) => s + v.saldo, 0);
  type Fila = (typeof abiertas)[number];
  const cols: Column<Fila>[] = [
    { key: 'cliente', label: 'Cliente', value: (v) => nombre.get(v.clienteId) ?? '', render: (v) => <b>{nombre.get(v.clienteId)}</b> },
    { key: 'venta', label: 'Venta', value: (v) => nombreVenta(v) },
    { key: 'fecha', label: 'Fecha', render: (v) => fecha(v.fecha) },
    { key: 'vencimiento', label: 'Vencimiento', value: (v) => v.vencimiento ?? '', render: (v) => (v.vencimiento ? fecha(v.vencimiento) : '—') },
    {
      key: 'tramo',
      label: 'Antigüedad',
      value: (v) => v.vencidoDias,
      render: (v) => {
        const t = antiguedad(v.vencidoDias);
        return <Badge tone={TONO[t]}>{t === 'por_vencer' ? 'Por vencer' : `${TRAMO[t]} (${v.vencidoDias} d)`}</Badge>;
      }
    },
    { key: 'total', label: 'Total', num: true, render: (v) => clp(v.total) },
    { key: 'cobrado', label: 'Cobrado', num: true, render: (v) => clp(v.cobrado) },
    { key: 'saldo', label: 'Saldo', num: true, render: (v) => <b>{clp(v.saldo)}</b> }
  ];
  return (
    <>
      <StatGrid>
        <Stat
          label="Por cobrar"
          value={clp(abiertas.reduce((s, v) => s + v.saldo, 0))}
          sub={`${abiertas.length} ventas`}
          icon={<Wallet size={16} strokeWidth={1.6} />}
        />
        <Stat label="Por vencer" value={clp(porTramo('por_vencer'))} />
        <Stat label="Vencido 1–30 días" value={<span className={cn(porTramo('d1_30') > 0 && 'text-warn')}>{clp(porTramo('d1_30'))}</span>} />
        <Stat
          label="Vencido más de 30 días"
          value={<span className={cn(porTramo('d31_60') + porTramo('d60') > 0 && 'text-bad')}>{clp(porTramo('d31_60') + porTramo('d60'))}</span>}
        />
      </StatGrid>
      <DataTable
        rows={abiertas.map((v) => ({ ...v, id: v.id }))}
        columns={cols}
        onRowClick={can('clientes', 'c') ? (v) => onCobrar(v.clienteId, v.id) : undefined}
        exportName="cuentas-por-cobrar"
        canExport={can('clientes', 'x')}
        toolbar={
          can('clientes', 'c') && (
            <Button variant="primary" onClick={() => onCobrar()} disabled={!clientes.length}>
              <Plus size={16} /> Registrar cobro
            </Button>
          )
        }
        empty={
          <EmptyState
            icon={<Wallet size={28} strokeWidth={1.5} />}
            title="Nada por cobrar"
            text="Las ventas confirmadas con saldo aparecen aquí con su antigüedad."
          />
        }
      />
    </>
  );
}

export function Cobros({ cobros, clientes, ventas, onCobrar }: { cobros: CobroRow[]; clientes: ClienteRow[]; ventas: VentaCxc[]; onCobrar: () => void }) {
  const can = useCan();
  const { org } = useOrg();
  const nombre = useMemo(() => new Map(clientes.map((c) => [c.id, c.nombre])), [clientes]);
  const venta = useMemo(() => new Map(ventas.map((v) => [v.id, v])), [ventas]);
  const [viendo, setViendo] = useState<CobroRow | null>(null);
  const aplicado = (c: CobroRow) => c.aplicaciones.reduce((s, a) => s + a.monto, 0);
  const totalMes = cobros.filter((c) => c.fecha.slice(0, 7) === fechaHoy().slice(0, 7)).reduce((a, c) => a + c.monto, 0);
  const cols: Column<CobroRow>[] = [
    { key: 'fecha', label: 'Fecha', render: (c) => fecha(c.fecha) },
    { key: 'cliente', label: 'Cliente', value: (c) => nombre.get(c.clienteId) ?? 'Cliente eliminado' },
    { key: 'medio', label: 'Medio', render: (c) => <span className="capitalize">{c.medio}</span> },
    { key: 'glosa', label: 'Glosa', value: (c) => c.glosa ?? '', render: (c) => c.glosa ?? <span className="text-ink-4">—</span> },
    {
      key: 'aplicado',
      label: 'Aplicado a',
      value: (c) => c.aplicaciones.map((a) => (venta.get(a.ventaId) ? nombreVenta(venta.get(a.ventaId)!) : 'Venta')).join(', '),
      render: (c) => (
        <span className="text-ink-2">
          {c.aplicaciones.length ? c.aplicaciones.map((a) => (venta.get(a.ventaId) ? nombreVenta(venta.get(a.ventaId)!) : 'Venta')).join(', ') : '—'}
          {c.monto > aplicado(c) && <Badge className="ml-2">Anticipo {clp(c.monto - aplicado(c))}</Badge>}
        </span>
      )
    },
    { key: 'monto', label: 'Monto', num: true, value: (c) => c.monto, render: (c) => <span className="font-medium">{clp(c.monto)}</span> }
  ];
  return (
    <>
      <p className="mb-4 text-[13px] text-ink-3">
        Cobrado este mes: <span className="font-semibold text-ink tabular">{clp(totalMes)}</span>
      </p>
      <DataTable
        rows={cobros}
        columns={cols}
        onRowClick={(c) => setViendo(c)}
        exportName="cobros"
        canExport={can('clientes', 'x')}
        toolbar={
          can('clientes', 'c') && (
            <Button variant="primary" onClick={onCobrar} disabled={!clientes.length}>
              <Plus size={16} /> Registrar cobro
            </Button>
          )
        }
        empty={<EmptyState title="Sin cobros registrados" />}
      />
      {viendo && <CobroDetalle cobro={viendo} cliente={nombre.get(viendo.clienteId)} venta={venta} slug={org.slug} onClose={() => setViendo(null)} />}
    </>
  );
}

function CobroDetalle({
  cobro,
  cliente,
  venta,
  slug,
  onClose
}: {
  cobro: CobroRow;
  cliente?: string;
  venta: Map<string, VentaCxc>;
  slug: string;
  onClose: () => void;
}) {
  const can = useCan();
  const { pending, error, run } = useSubmit(onClose);
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Cobro de ${clp(cobro.monto)}`}
      description={`${cliente ?? 'Cliente'} · ${fecha(cobro.fecha)} · ${cobro.medio}${cobro.glosa ? ` · ${cobro.glosa}` : ''}`}
      footer={
        <>
          {can('clientes', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() =>
                confirm('¿Eliminar este cobro? Las ventas vuelven a quedar con su saldo.') && run(() => deleteCobro(slug, cobro.id), 'Cobro eliminado.')
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
        {cobro.aplicaciones.map((a, i) => (
          <li key={i} className="flex justify-between px-3 py-2">
            <span>{venta.get(a.ventaId) ? nombreVenta(venta.get(a.ventaId)!) : 'Venta'}</span>
            <b className="tabular">{clp(a.monto)}</b>
          </li>
        ))}
        {cobro.monto > cobro.aplicaciones.reduce((s, a) => s + a.monto, 0) && (
          <li className="flex justify-between px-3 py-2 text-ink-2">
            <span>Anticipo sin aplicar</span>
            <b className="tabular">{clp(cobro.monto - cobro.aplicaciones.reduce((s, a) => s + a.monto, 0))}</b>
          </li>
        )}
      </ul>
      <ErrorForm error={error} className="mt-3" />
    </Dialog>
  );
}

export function CobroDialog({
  clientes,
  ventas,
  inicial,
  onClose
}: {
  clientes: ClienteRow[];
  ventas: VentaCxc[];
  inicial: { clienteId?: string; ventaId?: string };
  onClose: () => void;
}) {
  const { org } = useOrg();
  const { pending, errors, error, run } = useSubmit(onClose);
  const [cli, setCli] = useState(inicial.clienteId ?? '');
  const abiertas = ventas.filter((v) => v.clienteId === cli && v.saldo > 0);
  const repartir = (ds: VentaCxc[], m: number, primero?: string) => {
    const orden = primero ? [...ds.filter((d) => d.id === primero), ...ds.filter((d) => d.id !== primero)] : ds;
    const r = primero
      ? (() => {
          let resto = m;
          return orden.flatMap((d) => {
            const x = Math.min(resto, d.saldo);
            resto -= x;
            return x > 0 ? [{ id: d.id, monto: x }] : [];
          });
        })()
      : aplicarEnOrden(ds, m);
    return Object.fromEntries(r.map((a) => [a.id, String(a.monto)]));
  };
  const saldoInicial = inicial.ventaId ? (ventas.find((v) => v.id === inicial.ventaId)?.saldo ?? 0) : abiertas.reduce((s, v) => s + v.saldo, 0);
  const [f, setF] = useState({ fecha: fechaHoy(), monto: saldoInicial ? String(saldoInicial) : '', medio: 'transferencia', glosa: '' });
  const [aplica, setAplica] = useState<Record<string, string>>(() => repartir(abiertas, saldoInicial, inicial.ventaId));
  const monto = Number(f.monto) || 0;
  const suma = Object.values(aplica).reduce((s, v) => s + (Number(v) || 0), 0);
  function elegirCliente(id: string) {
    setCli(id);
    const ds = ventas.filter((v) => v.clienteId === id && v.saldo > 0);
    const m = ds.reduce((s, v) => s + v.saldo, 0);
    setF({ ...f, monto: m ? String(m) : '' });
    setAplica(repartir(ds, m));
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const aplicaciones = abiertas.filter((v) => Number(aplica[v.id]) > 0).map((v) => ({ ventaId: v.id, monto: Number(aplica[v.id]) }));
    run(() => saveCobro(org.slug, { ...f, clienteId: cli, monto, aplicaciones }), 'Cobro registrado.');
  }
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Registrar cobro"
      description="Se aplica a las ventas abiertas del cliente, primero las que vencen antes. Lo que no se aplique queda como anticipo."
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="cobro-form" variant="primary" disabled={pending || suma > monto || monto <= 0}>
            {pending ? 'Guardando…' : 'Registrar cobro'}
          </Button>
        </>
      }
    >
      <form id="cobro-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Cliente" required error={errors.clienteId} className="sm:col-span-2">
          {(id) => (
            <Select id={id} value={cli} onChange={(e) => elegirCliente(e.target.value)} required>
              <option value="" disabled>
                Elige un cliente…
              </option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Fecha" required error={errors.fecha}>
          {(id) => <Input id={id} type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} required />}
        </Field>
        <Field label="Monto del cobro" unit="CLP" required error={errors.monto}>
          {(id, d) => (
            <Input
              id={id}
              type="number"
              min={1}
              step={1}
              value={f.monto}
              onChange={(e) => {
                setF({ ...f, monto: e.target.value });
                setAplica(repartir(abiertas, Number(e.target.value) || 0));
              }}
              aria-describedby={d}
              className="tabular"
              required
            />
          )}
        </Field>
        <Field label="Medio">
          {(id) => (
            <Select id={id} value={f.medio} onChange={(e) => setF({ ...f, medio: e.target.value })}>
              {MEDIOS_COBRO.map((m) => (
                <option key={m} value={m} className="capitalize">
                  {m}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Glosa">
          {(id) => <Input id={id} value={f.glosa} onChange={(e) => setF({ ...f, glosa: e.target.value })} placeholder="N° de transferencia" />}
        </Field>
        {abiertas.length > 0 && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Aplicar a</legend>
            <ul className="divide-y divide-rule rounded-card border border-rule">
              {abiertas.map((v) => (
                <li key={v.id} className="grid grid-cols-[1fr_8rem] items-center gap-3 px-3 py-2 text-[14px]">
                  <span>
                    <b>{nombreVenta(v)}</b>
                    <span className="block text-[12px] text-ink-3">
                      {v.vencimiento ? `Vence ${fecha(v.vencimiento)}` : fecha(v.fecha)} · saldo {clp(v.saldo)}
                    </span>
                  </span>
                  <Input
                    aria-label={`Aplicar a ${v.codigo ?? 'venta'}`}
                    type="number"
                    min={0}
                    max={v.saldo}
                    step={1}
                    value={aplica[v.id] ?? ''}
                    onChange={(e) => setAplica({ ...aplica, [v.id]: e.target.value })}
                    className="h-9 text-[14px] tabular"
                  />
                </li>
              ))}
            </ul>
            <p aria-live="polite" className={cn('mt-2 text-right text-[13px]', suma > monto ? 'font-semibold text-bad' : 'text-ink-2')}>
              Aplicado {clp(suma)} de {clp(monto)}
              {suma < monto && monto > 0 && ` · anticipo ${clp(monto - suma)}`}
              {suma > monto && ' · supera el monto del cobro'}
            </p>
          </fieldset>
        )}
        <ErrorForm error={error ?? errors.aplicaciones ?? null} className="sm:col-span-2" />
      </form>
    </Dialog>
  );
}
