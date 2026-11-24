'use client';
import { CANALES, clp } from '@winzer/domain';
import { Plus, Users } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useCan, useOrg } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Adjuntos } from '@/components/adjuntos';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/page';
import { Tabs, useTab } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { deleteCliente, saveCliente, type Result } from './actions';
import { CobroDialog, Cobros, nombreVenta, PorCobrar } from './cobranza';

export interface ClienteRow {
  id: string;
  version: number;
  demo: boolean;
  nombre: string;
  rut: string;
  tipo: string;
  giro: string | null;
  canal: string | null;
  contacto: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  comuna: string | null;
  condiciones: string | null;
  plazo: number;
}
export interface CobroRow {
  id: string;
  fecha: string;
  clienteId: string;
  monto: number;
  medio: string;
  glosa: string | null;
  aplicaciones: { ventaId: string; monto: number }[];
}
/** Venta confirmada con su saldo (v_por_cobrar). */
export interface VentaCxc {
  id: string;
  clienteId: string;
  codigo: string | null;
  documento: string;
  folio: number | null;
  fecha: string;
  vencimiento: string | null;
  total: number;
  cobrado: number;
  saldo: number;
}

const canalLabel = (k: string | null) => CANALES.find((c) => c[0] === k)?.[1] ?? '—';
const TABS = [
  { id: 'clientes', label: 'Clientes' },
  { id: 'por-cobrar', label: 'Por cobrar' },
  { id: 'cobros', label: 'Cobros' }
] as const;

export function ClientesView({ clientes, cobros, ventas }: { clientes: ClienteRow[]; cobros: CobroRow[]; ventas: VentaCxc[] }) {
  const can = useCan();
  const params = useSearchParams();
  const [tab, setTab] = useTab(TABS);
  const [editing, setEditing] = useState<ClienteRow | 'new' | null>(null);
  const [cobro, setCobro] = useState<{ clienteId?: string; ventaId?: string } | null>(null);
  useEffect(() => {
    if (params.get('nuevo') === '1' && can('clientes', 'c')) setEditing('new');
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const saldoPor = useMemo(() => {
    const m = new Map<string, number>();
    ventas.forEach((v) => m.set(v.clienteId, (m.get(v.clienteId) ?? 0) + v.saldo));
    return m;
  }, [ventas]);
  const compradoPor = useMemo(() => {
    const m = new Map<string, number>();
    ventas.forEach((v) => m.set(v.clienteId, (m.get(v.clienteId) ?? 0) + v.total));
    return m;
  }, [ventas]);

  const cols: Column<ClienteRow>[] = [
    {
      key: 'nombre',
      label: 'Cliente',
      render: (c) => (
        <span className="font-medium">
          {c.nombre}
          {c.demo && <Badge className="ml-2">demo</Badge>}
        </span>
      )
    },
    { key: 'rut', label: 'RUT', render: (c) => <span className="text-ink-2 tabular">{c.rut}</span> },
    { key: 'canal', label: 'Canal', value: (c) => canalLabel(c.canal) },
    { key: 'comuna', label: 'Comuna', value: (c) => c.comuna ?? '', render: (c) => c.comuna ?? <span className="text-ink-4">—</span> },
    { key: 'comprado', label: 'Compras', num: true, value: (c) => compradoPor.get(c.id) ?? 0, render: (c) => clp(compradoPor.get(c.id) ?? 0) },
    {
      key: 'saldo',
      label: 'Saldo',
      num: true,
      value: (c) => saldoPor.get(c.id) ?? 0,
      render: (c) => ((saldoPor.get(c.id) ?? 0) > 0 ? <b>{clp(saldoPor.get(c.id) ?? 0)}</b> : <span className="text-ink-4">—</span>)
    }
  ];

  return (
    <>
      <Tabs tabs={TABS} actual={tab} onChange={setTab} />
      {tab === 'clientes' && (
        <DataTable
          rows={clientes}
          columns={cols}
          onRowClick={can('clientes', 'e') ? (c) => setEditing(c) : undefined}
          exportName="clientes"
          canExport={can('clientes', 'x')}
          toolbar={
            can('clientes', 'c') && (
              <Button variant="primary" onClick={() => setEditing('new')}>
                <Plus size={16} /> Nuevo cliente
              </Button>
            )
          }
          empty={
            <EmptyState
              icon={<Users size={28} />}
              title="Aún no hay clientes"
              text="Registra a tus distribuidores, restaurantes y clientes directos. También puedes importar los de tu respaldo de v1 en Configuración."
            />
          }
        />
      )}
      {tab === 'por-cobrar' && <PorCobrar ventas={ventas} clientes={clientes} onCobrar={(clienteId, ventaId) => setCobro({ clienteId, ventaId })} />}
      {tab === 'cobros' && <Cobros cobros={cobros} clientes={clientes} ventas={ventas} onCobrar={() => setCobro({})} />}

      {editing && (
        <ClienteDialog
          cliente={editing === 'new' ? null : editing}
          ventas={editing === 'new' ? [] : ventas.filter((v) => v.clienteId === editing.id)}
          onClose={() => setEditing(null)}
          onCobro={(id) => {
            setEditing(null);
            setCobro({ clienteId: id });
          }}
        />
      )}
      {cobro && <CobroDialog clientes={clientes} ventas={ventas} inicial={cobro} onClose={() => setCobro(null)} />}
    </>
  );
}

function useSubmit(onDone: () => void) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  function run(fn: () => Promise<Result>, ok: string) {
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast(ok);
        onDone();
        router.refresh();
      } else {
        setError(r.error);
        setErrors(r.fieldErrors ?? {});
      }
    });
  }
  return { pending, errors, error, run };
}

function ClienteDialog({
  cliente,
  ventas,
  onClose,
  onCobro
}: {
  cliente: ClienteRow | null;
  ventas: VentaCxc[];
  onClose: () => void;
  onCobro: (id: string) => void;
}) {
  const { org } = useOrg();
  const can = useCan();
  const { pending, errors, error, run } = useSubmit(onClose);
  const [tipo, setTipo] = useState(cliente?.tipo ?? 'Empresa');
  const c = cliente;
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    run(() => saveCliente(org.slug, { ...data, id: c?.id }, c?.version), c ? 'Cliente actualizado.' : 'Cliente creado.');
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={c ? c.nombre : 'Nuevo cliente'}
      description={c ? `RUT ${c.rut}` : 'El RUT se valida con su dígito verificador. Para boletas a consumidor final usa 66.666.666-6.'}
      footer={
        <>
          {c && can('clientes', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() => confirm(`¿Eliminar a ${c.nombre}?`) && run(() => deleteCliente(org.slug, c.id), 'Cliente eliminado.')}
            >
              Eliminar
            </Button>
          )}
          {c && can('clientes', 'c') && (
            <Button type="button" variant="ghost" onClick={() => onCobro(c.id)}>
              Registrar cobro
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="cliente-form" variant="primary" disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <form id="cliente-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre o razón social" required error={errors.nombre} className="sm:col-span-2">
          {(id, d) => <Input id={id} name="nombre" defaultValue={c?.nombre} aria-invalid={!!errors.nombre} aria-describedby={d} required autoFocus />}
        </Field>
        <Field label="RUT" required error={errors.rut}>
          {(id, d) => <Input id={id} name="rut" defaultValue={c?.rut} placeholder="76.123.456-0" aria-invalid={!!errors.rut} aria-describedby={d} required />}
        </Field>
        <Field label="Tipo" required>
          {(id) => (
            <Select id={id} name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option>Empresa</option>
              <option>Persona</option>
            </Select>
          )}
        </Field>
        {tipo === 'Empresa' && (
          <Field label="Giro" className="sm:col-span-2">
            {(id) => <Input id={id} name="giro" defaultValue={c?.giro ?? ''} />}
          </Field>
        )}
        <Field label="Canal habitual">
          {(id) => (
            <Select id={id} name="canal" defaultValue={c?.canal ?? 'distribuidor'}>
              {CANALES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Contacto">{(id) => <Input id={id} name="contacto" defaultValue={c?.contacto ?? ''} />}</Field>
        <Field label="Correo" error={errors.email}>
          {(id, d) => <Input id={id} name="email" type="email" defaultValue={c?.email ?? ''} aria-describedby={d} />}
        </Field>
        <Field label="Teléfono">{(id) => <Input id={id} name="telefono" type="tel" defaultValue={c?.telefono ?? ''} />}</Field>
        <Field label="Dirección">{(id) => <Input id={id} name="direccion" defaultValue={c?.direccion ?? ''} />}</Field>
        <Field label="Comuna">{(id) => <Input id={id} name="comuna" defaultValue={c?.comuna ?? ''} />}</Field>
        <Field label="Condiciones comerciales">
          {(id) => (
            <>
              <Input id={id} name="condiciones" list="condiciones" defaultValue={c?.condiciones ?? '30 días'} />
              <datalist id="condiciones">
                {['Contado', '15 días', '30 días', '45 días', '60 días'].map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Plazo de pago" unit="días" error={errors.plazo}>
          {(id) => <Input id={id} name="plazo" type="number" min={0} max={365} step={1} defaultValue={c?.plazo ?? 30} className="tabular" />}
        </Field>
        {error && (
          <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad sm:col-span-2">
            {error}
          </p>
        )}
      </form>
      {c && ventas.length > 0 && (
        <section aria-label="Historial de compras" className="mt-6 border-t border-rule pt-4">
          <h3 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Historial de compras</h3>
          <ul className="divide-y divide-rule rounded-card border border-rule text-[13px]">
            {[...ventas]
              .sort((a, b) => b.fecha.localeCompare(a.fecha))
              .map((v) => (
                <li key={v.id} className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2">
                  <span>
                    <b>{nombreVenta(v)}</b> <span className="text-ink-3">· {new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-CL')}</span>
                  </span>
                  <span className="tabular">{clp(v.total)}</span>
                  <span className="text-right tabular">{v.saldo > 0 ? <b>saldo {clp(v.saldo)}</b> : <span className="text-ok">Pagada</span>}</span>
                </li>
              ))}
          </ul>
        </section>
      )}
      {c && <Adjuntos entidad="cliente" registroId={c.id} />}
    </Dialog>
  );
}
