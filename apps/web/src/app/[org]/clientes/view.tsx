'use client';
import { CANALES, clp, MEDIOS_COBRO, today } from '@winzer/domain';
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
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { deleteCliente, saveCliente, saveCobro, type Result } from './actions';

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
}

const canalLabel = (k: string | null) => CANALES.find((c) => c[0] === k)?.[1] ?? '—';
const fmtDate = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });

export function ClientesView({ clientes, cobros }: { clientes: ClienteRow[]; cobros: CobroRow[] }) {
  const can = useCan();
  const params = useSearchParams();
  const [tab, setTab] = useState<'clientes' | 'cobros'>('clientes');
  const [editing, setEditing] = useState<ClienteRow | 'new' | null>(null);
  const [cobro, setCobro] = useState<{ clienteId?: string } | null>(null);
  useEffect(() => {
    if (params.get('nuevo') === '1' && can('clientes', 'c')) setEditing('new');
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const cobradoPor = useMemo(() => {
    const m = new Map<string, number>();
    cobros.forEach((c) => m.set(c.clienteId, (m.get(c.clienteId) ?? 0) + c.monto));
    return m;
  }, [cobros]);
  const totalMes = cobros.filter((c) => c.fecha.slice(0, 7) === today().slice(0, 7)).reduce((a, c) => a + c.monto, 0);

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
    { key: 'rut', label: 'RUT', render: (c) => <span className="tabular text-ink-2">{c.rut}</span> },
    { key: 'canal', label: 'Canal', value: (c) => canalLabel(c.canal) },
    { key: 'comuna', label: 'Comuna', value: (c) => c.comuna ?? '', render: (c) => c.comuna ?? <span className="text-ink-4">—</span> },
    { key: 'condiciones', label: 'Condiciones', value: (c) => c.condiciones ?? '', render: (c) => c.condiciones ?? <span className="text-ink-4">—</span> },
    { key: 'cobrado', label: 'Cobrado', num: true, value: (c) => cobradoPor.get(c.id) ?? 0, render: (c) => clp(cobradoPor.get(c.id) ?? 0) }
  ];
  const nombreCliente = (id: string) => clientes.find((c) => c.id === id)?.nombre ?? 'Cliente eliminado';
  const colsCobro: Column<CobroRow>[] = [
    { key: 'fecha', label: 'Fecha', render: (c) => fmtDate(c.fecha) },
    { key: 'cliente', label: 'Cliente', value: (c) => nombreCliente(c.clienteId) },
    { key: 'medio', label: 'Medio', render: (c) => <span className="capitalize">{c.medio}</span> },
    { key: 'glosa', label: 'Glosa', value: (c) => c.glosa ?? '', render: (c) => c.glosa ?? <span className="text-ink-4">—</span> },
    { key: 'monto', label: 'Monto', num: true, value: (c) => c.monto, render: (c) => <span className="font-medium">{clp(c.monto)}</span> }
  ];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-rule">
        <div role="tablist" className="-mb-px flex gap-5">
          {(['clientes', 'cobros'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                'h-10 border-b-2 text-[14px] font-medium capitalize',
                tab === t ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink'
              )}
            >
              {t} <span className="tabular ml-1 text-ink-4">{t === 'clientes' ? clientes.length : cobros.length}</span>
            </button>
          ))}
        </div>
        <div className="mb-2 flex gap-2">
          {can('clientes', 'c') && tab === 'cobros' && clientes.length > 0 && (
            <Button variant="primary" onClick={() => setCobro({})}>
              <Plus size={16} /> Registrar cobro
            </Button>
          )}
          {can('clientes', 'c') && tab === 'clientes' && (
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus size={16} /> Nuevo cliente
            </Button>
          )}
        </div>
      </div>

      {tab === 'clientes' ? (
        <DataTable
          rows={clientes}
          columns={cols}
          onRowClick={can('clientes', 'e') ? (c) => setEditing(c) : undefined}
          exportName="clientes"
          canExport={can('clientes', 'x')}
          empty={
            <EmptyState
              icon={<Users size={28} />}
              title="Aún no hay clientes"
              text="Registra a tus distribuidores, restaurantes y clientes directos. También puedes importar los de tu respaldo de v1 en Configuración."
            />
          }
        />
      ) : (
        <>
          <p className="mb-4 text-[13px] text-ink-3">
            Cobrado este mes: <span className="tabular font-semibold text-ink">{clp(totalMes)}</span>
          </p>
          <DataTable
            rows={cobros}
            columns={colsCobro}
            exportName="cobros"
            canExport={can('clientes', 'x')}
            empty={<EmptyState title="Sin cobros registrados" />}
          />
        </>
      )}

      {editing && (
        <ClienteDialog
          cliente={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onCobro={(id) => {
            setEditing(null);
            setCobro({ clienteId: id });
          }}
        />
      )}
      {cobro && <CobroDialog clientes={clientes} clienteId={cobro.clienteId} onClose={() => setCobro(null)} />}
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

function ClienteDialog({ cliente, onClose, onCobro }: { cliente: ClienteRow | null; onClose: () => void; onCobro: (id: string) => void }) {
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
      {c && <Adjuntos entidad="cliente" registroId={c.id} />}
    </Dialog>
  );
}

function CobroDialog({ clientes, clienteId, onClose }: { clientes: ClienteRow[]; clienteId?: string; onClose: () => void }) {
  const { org } = useOrg();
  const { pending, errors, error, run } = useSubmit(onClose);
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    run(() => saveCobro(org.slug, data), 'Cobro registrado.');
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Registrar cobro"
      description="Queda disponible para la conciliación con la cartola bancaria."
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="cobro-form" variant="primary" disabled={pending}>
            {pending ? 'Guardando…' : 'Registrar'}
          </Button>
        </>
      }
    >
      <form id="cobro-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Cliente" required error={errors.clienteId} className="sm:col-span-2">
          {(id) => (
            <Select id={id} name="clienteId" defaultValue={clienteId ?? ''} required>
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
          {(id) => <Input id={id} name="fecha" type="date" defaultValue={today()} required />}
        </Field>
        <Field label="Monto" unit="CLP" required error={errors.monto}>
          {(id, d) => <Input id={id} name="monto" type="number" min={1} step={1} inputMode="numeric" aria-describedby={d} className="tabular" required />}
        </Field>
        <Field label="Medio">
          {(id) => (
            <Select id={id} name="medio" defaultValue="transferencia">
              {MEDIOS_COBRO.map((m) => (
                <option key={m} value={m} className="capitalize">
                  {m}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Glosa">{(id) => <Input id={id} name="glosa" placeholder="Factura 1234" />}</Field>
        {error && (
          <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad sm:col-span-2">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
