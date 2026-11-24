'use client';
/**
 * Conciliación bancaria (F6-3; v1: modules/conciliacion). Libro de banco con saldo y antigüedad, conciliación
 * automática y manual con sugerencias (±1 peso, ±7 días), diferencias (gasto financiero) e importación de cartolas CSV
 * con mapeo de columnas, vista previa con duplicados marcados y el archivo adjunto a la cartola.
 */
import {
  clp,
  huellaMov,
  MOTIVOS_DIFERENCIA,
  ORIGENES_CONCILIACION,
  parseCartola,
  parseCsv,
  resumenCuenta,
  sugerencias,
  TIPOS_CUENTA,
  type Candidato
} from '@winzer/domain';
import { Landmark, Plus, Upload, Wand2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Adjuntos } from '@/components/adjuntos';
import { useCan, useOrg } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState, Stat, StatGrid } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { confirmarAdjunto, prepararAdjunto } from '../adjuntos-actions';
import { ErrorForm, fecha, useSubmit } from '../proveedores/comun';
import {
  autoConciliarAction,
  conciliarAction,
  desconciliarAction,
  diferenciaAction,
  importarCartolaAction,
  movimientoManualAction,
  saveCuenta
} from './actions';

interface Cuenta {
  id: string;
  version: number;
  banco: string;
  tipo: string;
  numero: string;
  moneda: string;
  fechaInicio: string;
  saldoInicial: number;
}
interface Mov {
  id: string;
  fecha: string;
  glosa: string;
  monto: number;
  estado: string;
  nota: string | null;
  huella: string;
  diferencia: number | null;
  match: { tipo: string; descripcion: string; automatico: boolean }[];
}
export interface DatosConciliacion {
  cuentas: Cuenta[];
  cuentaId: string | null;
  movs: Mov[];
  libres: Candidato[];
  cartolas: { id: string; archivo: string | null; importadaEn: string; filas: number; duplicadas: number }[];
}

const TONO: Record<string, 'neutral' | 'ok' | 'warn'> = { pendiente: 'neutral', conciliado: 'ok', diferencia: 'warn' };
const ESTADO: Record<string, string> = { pendiente: 'Pendiente', conciliado: 'Conciliado', diferencia: 'Diferencia' };
const hoyISO = () => new Date().toISOString().slice(0, 10);
/** Ajuste con su signo explícito: +$1.000 / −$1.000. */
const signo = (v: number) => `${v < 0 ? '−' : '+'}${clp(Math.abs(v))}`;
const diasDesde = (f: string) => Math.round((Date.now() - Date.parse(f)) / 86_400_000);

export function ConciliacionView({ datos }: { datos: DatosConciliacion }) {
  const can = useCan();
  const { org } = useOrg();
  const router = useRouter();
  const toast = useToast();
  const [pendiente, start] = useTransition();
  const [dialogo, setDialogo] = useState<'cuenta' | 'editar' | 'manual' | 'importar' | null>(null);
  const [viendo, setViendo] = useState<Mov | null>(null);
  const cuenta = datos.cuentas.find((c) => c.id === datos.cuentaId) ?? null;

  if (!cuenta)
    return (
      <>
        <EmptyState
          icon={<Landmark size={28} strokeWidth={1.5} />}
          title="Aún no tienes cuentas bancarias"
          text="Crea una cuenta para importar cartolas y conciliar."
          action={
            can('conciliacion', 'c') && (
              <Button variant="primary" onClick={() => setDialogo('cuenta')}>
                <Plus size={16} /> Crear cuenta
              </Button>
            )
          }
        />
        {dialogo === 'cuenta' && <CuentaDialog onClose={() => setDialogo(null)} />}
      </>
    );

  // Las partidas en tránsito solo cuadran por cuenta cuando hay una sola (cobros y pagos no dicen la cuenta).
  const unica = datos.cuentas.length === 1;
  const transito = datos.libres.filter((c) => c.fecha >= cuenta.fechaInicio);
  const r = resumenCuenta(cuenta.saldoInicial, datos.movs, unica ? transito : []);
  let saldo = cuenta.saldoInicial;
  const libro = datos.movs.map((m) => ({ ...m, saldo: (saldo += m.monto) }));
  const cols: Column<(typeof libro)[number]>[] = [
    { key: 'fecha', label: 'Fecha', render: (m) => fecha(m.fecha) },
    { key: 'glosa', label: 'Glosa', render: (m) => <span className="font-medium">{m.glosa}</span> },
    { key: 'cargo', label: 'Cargo', num: true, value: (m) => (m.monto < 0 ? -m.monto : 0), render: (m) => (m.monto < 0 ? clp(-m.monto) : '') },
    { key: 'abono', label: 'Abono', num: true, value: (m) => (m.monto > 0 ? m.monto : 0), render: (m) => (m.monto > 0 ? clp(m.monto) : '') },
    { key: 'saldo', label: 'Saldo', num: true, render: (m) => <span className="text-ink-2">{clp(m.saldo)}</span> },
    {
      key: 'estado',
      label: 'Estado',
      value: (m) => m.estado,
      render: (m) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          <Badge tone={TONO[m.estado]}>{ESTADO[m.estado] ?? m.estado}</Badge>
          {m.estado === 'pendiente' && diasDesde(m.fecha) > 30 && <span className="text-[12px] text-bad">{diasDesde(m.fecha)} días</span>}
        </span>
      )
    },
    {
      key: 'match',
      label: 'Conciliado con',
      value: (m) => m.match.map((x) => x.descripcion).join(', ') || m.nota || '',
      render: (m) => <span className="text-[13px] text-ink-2">{m.match.map((x) => x.descripcion).join(', ') || m.nota || '—'}</span>
    }
  ];
  const auto = () =>
    start(async () => {
      const x = await autoConciliarAction(org.slug, cuenta.id);
      if (!x.ok) toast(x.error, 'bad');
      else toast(x.n ? `${x.n} movimientos conciliados automáticamente.` : 'No se encontraron coincidencias únicas nuevas.');
      router.refresh();
    });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Cuenta">
          {(id) => (
            <Select id={id} value={cuenta.id} onChange={(e) => router.push(`?cuenta=${e.target.value}`)} className="w-72">
              {datos.cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.banco} · {c.tipo} {c.numero}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {can('conciliacion', 'e') && <Button onClick={() => setDialogo('editar')}>Editar cuenta</Button>}
        {can('conciliacion', 'c') && (
          <Button onClick={() => setDialogo('cuenta')}>
            <Plus size={15} /> Nueva cuenta
          </Button>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {can('conciliacion', 'c') && (
            <>
              <Button onClick={() => setDialogo('manual')}>Movimiento manual</Button>
              <Button onClick={() => setDialogo('importar')}>
                <Upload size={15} /> Importar cartola
              </Button>
            </>
          )}
          {can('conciliacion', 'e') && (
            <Button variant="primary" onClick={auto} disabled={pendiente}>
              <Wand2 size={15} /> Conciliar automáticamente
            </Button>
          )}
        </div>
      </div>
      <StatGrid>
        <Stat label="Saldo según extracto" value={clp(r.extracto)} sub={`Inicial ${clp(cuenta.saldoInicial)} al ${fecha(cuenta.fechaInicio)}`} />
        <Stat label="Saldo según libros" value={clp(r.libros)} sub={unica ? 'Con partidas en tránsito' : 'Sin partidas en tránsito (varias cuentas)'} />
        <Stat label="Conciliados" value={`${r.conciliados} / ${r.total}`} sub={`${r.nPendientes} pendientes`} />
        <Stat label="Diferencias" value={<span className={cn(r.nDiferencias > 0 && 'text-warn')}>{r.nDiferencias}</span>} sub={clp(r.ajustes)} />
      </StatGrid>
      <div className="mb-6 grid items-start gap-6 lg:grid-cols-2">
        <section aria-label="Conciliación" className="rounded-card border border-rule bg-raised p-5 text-[14px]">
          <h2 className="mb-3 font-label text-[18px]">Conciliación</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1.5">
            <dt>Saldo según extracto bancario</dt>
            <dd className="text-right tabular">{clp(r.extracto)}</dd>
            <dt className="pl-4 text-ink-2">Movimientos del banco sin conciliar</dt>
            <dd className="text-right tabular">{signo(-r.pendientes)}</dd>
            <dt className="pl-4 text-ink-2">Diferencias registradas</dt>
            <dd className="text-right tabular">{signo(-r.ajustes)}</dd>
            <dt className="pl-4 text-ink-2">Depósitos en tránsito</dt>
            <dd className="text-right tabular">{signo(r.depositos)}</dd>
            <dt className="pl-4 text-ink-2">Pagos girados no cobrados</dt>
            <dd className="text-right tabular">{signo(r.girados)}</dd>
            <dt className="border-t border-rule pt-1.5 font-semibold">Saldo según libros</dt>
            <dd className="border-t border-rule pt-1.5 text-right font-semibold tabular">{clp(r.libros)}</dd>
          </dl>
        </section>
        <section aria-label="Partidas en libros no presentes en el banco">
          <h2 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Partidas en libros no presentes en el banco</h2>
          <DataTable
            rows={transito.map((c) => ({ ...c, id: `${c.origenTipo}:${c.origenId}` }))}
            columns={[
              { key: 'fecha', label: 'Fecha', render: (c) => fecha(c.fecha) },
              { key: 'descripcion', label: 'Detalle' },
              { key: 'monto', label: 'Monto', num: true, render: (c) => <span className={cn(c.monto < 0 && 'text-bad')}>{clp(c.monto)}</span> }
            ]}
            empty={<EmptyState title="Todo lo de los libros está en el banco" />}
          />
        </section>
      </div>
      <h2 className="mb-2 font-label text-[20px]">Libro de banco</h2>
      <DataTable
        rows={libro}
        columns={cols}
        onRowClick={can('conciliacion', 'e') ? (m) => setViendo(m) : undefined}
        exportName={`libro-banco-${cuenta.numero}`}
        canExport={can('conciliacion', 'x')}
        empty={
          <EmptyState icon={<Landmark size={28} strokeWidth={1.5} />} title="Sin movimientos" text="Importa una cartola CSV o registra movimientos manuales." />
        }
      />
      {datos.cartolas.length > 0 && (
        <section aria-label="Cartolas importadas" className="mt-6">
          <h2 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Cartolas importadas</h2>
          <ul className="divide-y divide-rule rounded-card border border-rule bg-raised text-[13px]">
            {datos.cartolas.map((c) => (
              <li key={c.id} className="px-4 py-2">
                <b>{c.archivo ?? 'Cartola'}</b> · {new Date(c.importadaEn).toLocaleString('es-CL')} · {c.filas} movimientos
                {c.duplicadas > 0 && ` · ${c.duplicadas} duplicados omitidos`}
                <Adjuntos entidad="cartola" registroId={c.id} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {(dialogo === 'cuenta' || dialogo === 'editar') && <CuentaDialog cuenta={dialogo === 'editar' ? cuenta : undefined} onClose={() => setDialogo(null)} />}
      {dialogo === 'manual' && <ManualDialog cuentaId={cuenta.id} onClose={() => setDialogo(null)} />}
      {dialogo === 'importar' && <ImportarDialog cuenta={cuenta} huellas={new Set(datos.movs.map((m) => m.huella))} onClose={() => setDialogo(null)} />}
      {viendo && <MovDialog mov={viendo} libres={datos.libres} onClose={() => setViendo(null)} />}
    </>
  );
}

function CuentaDialog({ cuenta, onClose }: { cuenta?: Cuenta; onClose: () => void }) {
  const { org } = useOrg();
  const router = useRouter();
  const { pending, errors, error, run } = useSubmit(onClose);
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = { ...Object.fromEntries(new FormData(e.currentTarget)), id: cuenta?.id };
    run(async () => {
      const r = await saveCuenta(org.slug, f, cuenta?.version);
      if (r.ok && !cuenta && r.id) router.push(`?cuenta=${r.id}`);
      return r;
    }, 'Cuenta guardada.');
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={cuenta ? 'Editar cuenta' : 'Nueva cuenta bancaria'}
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="cuenta-form" variant="primary" disabled={pending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="cuenta-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Banco" required error={errors.banco}>
          {(id) => <Input id={id} name="banco" defaultValue={cuenta?.banco} required />}
        </Field>
        <Field label="Tipo">
          {(id) => (
            <Select id={id} name="tipo" defaultValue={cuenta?.tipo ?? 'Cuenta corriente'}>
              {TIPOS_CUENTA.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Número" required error={errors.numero}>
          {(id) => <Input id={id} name="numero" defaultValue={cuenta?.numero} required />}
        </Field>
        <Field label="Moneda">
          {(id) => (
            <Select id={id} name="moneda" defaultValue={cuenta?.moneda ?? 'CLP'}>
              <option>CLP</option>
              <option>USD</option>
              <option>EUR</option>
            </Select>
          )}
        </Field>
        <Field label="Fecha de inicio" required error={errors.fechaInicio}>
          {(id) => <Input id={id} name="fechaInicio" type="date" defaultValue={cuenta?.fechaInicio ?? hoyISO()} required />}
        </Field>
        <Field label="Saldo inicial" unit="CLP" required error={errors.saldoInicial}>
          {(id) => <Input id={id} name="saldoInicial" type="number" step={1} defaultValue={cuenta?.saldoInicial ?? 0} className="tabular" required />}
        </Field>
        <ErrorForm error={error} className="sm:col-span-2" />
      </form>
    </Dialog>
  );
}

function ManualDialog({ cuentaId, onClose }: { cuentaId: string; onClose: () => void }) {
  const { org } = useOrg();
  const { pending, errors, error, run } = useSubmit(onClose);
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run(() => movimientoManualAction(org.slug, { ...Object.fromEntries(new FormData(e.currentTarget)), cuentaId }), 'Movimiento registrado.');
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Movimiento bancario manual"
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="manual-form" variant="primary" disabled={pending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="manual-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha" required error={errors.fecha}>
          {(id) => <Input id={id} name="fecha" type="date" defaultValue={hoyISO()} required />}
        </Field>
        <Field label="Tipo">
          {(id) => (
            <Select id={id} name="sentido" defaultValue="cargo">
              <option value="cargo">Cargo (sale)</option>
              <option value="abono">Abono (entra)</option>
            </Select>
          )}
        </Field>
        <Field label="Glosa" required error={errors.glosa} className="sm:col-span-2">
          {(id) => <Input id={id} name="glosa" required />}
        </Field>
        <Field label="Monto" unit="CLP" required error={errors.monto}>
          {(id) => <Input id={id} name="monto" type="number" min={1} step={1} className="tabular" required />}
        </Field>
        <ErrorForm error={error} className="sm:col-span-2" />
      </form>
    </Dialog>
  );
}

function ImportarDialog({ cuenta, huellas, onClose }: { cuenta: Cuenta; huellas: Set<string>; onClose: () => void }) {
  const { org } = useOrg();
  const router = useRouter();
  const toast = useToast();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [texto, setTexto] = useState('');
  const [map, setMap] = useState({ fecha: 1, glosa: 2, cargo: 3, abono: 4, monto: 0, saltar: 1 });
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  const crudas = useMemo(() => (texto ? parseCsv(texto).slice(0, 4) : []), [texto]);
  const ncols = Math.max(0, ...crudas.map((r) => r.length));
  const mapeo = {
    fecha: map.fecha - 1,
    glosa: map.glosa - 1,
    cargo: map.monto ? null : map.cargo ? map.cargo - 1 : null,
    abono: map.monto ? null : map.abono ? map.abono - 1 : null,
    monto: map.monto ? map.monto - 1 : null,
    saltar: map.saltar
  };
  const filas = useMemo(() => (texto ? parseCartola(texto, mapeo) : []), [texto, JSON.stringify(mapeo)]); // eslint-disable-line react-hooks/exhaustive-deps
  const vistas = new Set<string>();
  const previa = filas.map((f) => {
    const h = huellaMov(f.fecha, f.monto, f.glosa);
    const dup = huellas.has(h) || vistas.has(h);
    vistas.add(h);
    return { ...f, dup };
  });
  const nuevas = previa.filter((f) => !f.dup).length;
  async function leer(f: File | undefined) {
    setError(null);
    if (!f) return;
    setArchivo(f);
    setTexto(await f.text());
  }
  function importar() {
    if (!archivo) return;
    start(async () => {
      const r = await importarCartolaAction(org.slug, {
        cuentaId: cuenta.id,
        archivo: archivo.name,
        mapeo,
        filas: filas.map(({ fecha: f, glosa, monto }) => ({ fecha: f, glosa, monto }))
      });
      if (!r.ok) return setError(r.error);
      // La cartola queda adjunta (trazabilidad): mismo flujo que el componente Adjuntos.
      const mime = archivo.type || 'text/csv';
      const p = await prepararAdjunto(org.slug, { entidad: 'cartola', registroId: r.cartolaId, nombre: archivo.name, mime, bytes: archivo.size });
      if (p.ok) {
        const put = await fetch(p.url, { method: 'PUT', body: archivo, headers: { 'Content-Type': mime } }).catch(() => null);
        if (put?.ok) await confirmarAdjunto(org.slug, { id: p.id, clave: p.clave, entidad: 'cartola', registroId: r.cartolaId, nombre: archivo.name });
      }
      toast(
        `${r.importados} movimientos importados${r.duplicadas ? `, ${r.duplicadas} duplicados omitidos` : ''}. ${r.conciliados} conciliados automáticamente.`
      );
      onClose();
      router.refresh();
    });
  }
  const col = (k: keyof typeof map, label: string, opcional = false) => (
    <Field label={label}>
      {(id) => (
        <Select id={id} value={map[k]} onChange={(e) => setMap({ ...map, [k]: Number(e.target.value) })}>
          {opcional && <option value={0}>—</option>}
          {Array.from({ length: Math.max(ncols, 4) }, (_, i) => (
            <option key={i} value={i + 1}>
              Columna {i + 1}
              {crudas[0]?.[i] ? ` · ${crudas[0][i]!.slice(0, 18)}` : ''}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={`Importar cartola · ${cuenta.banco} ${cuenta.numero}`}
      description="CSV separado por ; o ,. Indica qué columna trae cada dato; los movimientos ya registrados en la cuenta se omiten."
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" onClick={importar} disabled={pendiente || !nuevas}>
            {pendiente ? 'Importando…' : `Importar ${nuevas} movimientos`}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Archivo CSV">{(id) => <Input id={id} type="file" accept=".csv,text/csv,text/plain" onChange={(e) => leer(e.target.files?.[0])} />}</Field>
        {texto && (
          <>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {col('fecha', 'Fecha')}
              {col('glosa', 'Glosa')}
              {col('cargo', 'Cargo', true)}
              {col('abono', 'Abono', true)}
              {col('monto', 'Monto único (±)', true)}
              <Field label="Filas a saltar">
                {(id) => <Input id={id} type="number" min={0} value={map.saltar} onChange={(e) => setMap({ ...map, saltar: Number(e.target.value) || 0 })} />}
              </Field>
            </div>
            <p className="text-[13px] text-ink-2" aria-live="polite">
              {filas.length} movimientos leídos · {nuevas} nuevos · {filas.length - nuevas} duplicados
            </p>
            <div className="max-h-72 overflow-auto rounded-card border border-rule">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-sunken text-left">
                  <tr>
                    <th className="px-3 py-1.5">Fecha</th>
                    <th className="px-3 py-1.5">Glosa</th>
                    <th className="px-3 py-1.5 text-right">Monto</th>
                    <th className="px-3 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {previa.slice(0, 200).map((f, i) => (
                    <tr key={i} className={cn('border-t border-rule', f.dup && 'text-ink-4')}>
                      <td className="px-3 py-1.5 tabular">{fecha(f.fecha)}</td>
                      <td className="px-3 py-1.5">{f.glosa}</td>
                      <td className={cn('px-3 py-1.5 text-right tabular', f.monto < 0 && !f.dup && 'text-bad')}>{clp(f.monto)}</td>
                      <td className="px-3 py-1.5">{f.dup && <Badge>Duplicado</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <ErrorForm error={error} />
      </div>
    </Dialog>
  );
}

function MovDialog({ mov, libres, onClose }: { mov: Mov; libres: Candidato[]; onClose: () => void }) {
  const { org } = useOrg();
  const { pending, errors, error, run } = useSubmit(onClose);
  const conciliado = mov.estado === 'conciliado' || mov.match.length > 0;
  const sug = sugerencias(mov, libres);
  // v1: además de las sugerencias, los 12 montos más cercanos del mismo signo.
  const cercanos = libres
    .filter((c) => Math.sign(c.monto) === Math.sign(mov.monto) && !sug.some((s) => s.origenId === c.origenId && s.origenTipo === c.origenTipo))
    .sort((a, b) => Math.abs(a.monto - mov.monto) - Math.abs(b.monto - mov.monto))
    .slice(0, 12);
  const fila = (c: Candidato, score?: number) => (
    <li key={`${c.origenTipo}:${c.origenId}`} className="flex items-center gap-3 px-3 py-2 text-[14px]">
      <span className="min-w-0 flex-1">
        <b>{c.descripcion}</b>
        <span className="block text-[12px] text-ink-3">
          {ORIGENES_CONCILIACION[c.origenTipo] ?? c.origenTipo} · {fecha(c.fecha)}
          {score != null && ` · coincidencia ${Math.round(score * 100)} %`}
        </span>
      </span>
      <span className="tabular">{clp(c.monto)}</span>
      <Button
        className="h-8 px-3 text-[13px]"
        disabled={pending}
        aria-label={`Conciliar con ${c.descripcion}`}
        onClick={() => run(() => conciliarAction(org.slug, { movId: mov.id, origenTipo: c.origenTipo, origenId: c.origenId }), 'Movimiento conciliado.')}
      >
        Conciliar
      </Button>
    </li>
  );
  function diferencia(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run(() => diferenciaAction(org.slug, { ...Object.fromEntries(new FormData(e.currentTarget)), movId: mov.id }), 'Diferencia registrada.');
  }
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={mov.glosa}
      description={`${fecha(mov.fecha)} · ${mov.monto < 0 ? 'Cargo' : 'Abono'} ${clp(Math.abs(mov.monto))} · ${ESTADO[mov.estado] ?? mov.estado}`}
      footer={
        <>
          {conciliado || mov.estado === 'diferencia' ? (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() => run(() => desconciliarAction(org.slug, mov.id), 'Conciliación deshecha.')}
            >
              Deshacer conciliación
            </Button>
          ) : null}
          <Button type="button" onClick={onClose}>
            Cerrar
          </Button>
        </>
      }
    >
      {conciliado || mov.estado === 'diferencia' ? (
        <div className="text-[14px]">
          {mov.match.map((x, i) => (
            <p key={i}>
              Conciliado con <b>{x.descripcion}</b>
              {x.automatico && <span className="text-ink-3"> (automático)</span>}
            </p>
          ))}
          {mov.nota && <p className="mt-2 text-ink-2">{mov.nota}</p>}
        </div>
      ) : (
        <>
          <h3 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Sugerencias (±1 peso, ±7 días)</h3>
          {sug.length ? (
            <ul className="mb-4 divide-y divide-rule rounded-card border border-rule">{sug.map((s) => fila(s, s.score))}</ul>
          ) : (
            <p className="mb-4 text-[13px] text-ink-3">Sin coincidencias exactas.</p>
          )}
          {cercanos.length > 0 && (
            <>
              <h3 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Montos más cercanos</h3>
              <ul className="mb-4 max-h-56 divide-y divide-rule overflow-auto rounded-card border border-rule">{cercanos.map((c) => fila(c))}</ul>
            </>
          )}
          <form onSubmit={diferencia} className="grid gap-3 rounded-card border border-rule p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Field label="Registrar como diferencia" error={errors.motivo}>
              {(id) => (
                <Select id={id} name="motivo" defaultValue={MOTIVOS_DIFERENCIA[0]}>
                  {MOTIVOS_DIFERENCIA.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </Select>
              )}
            </Field>
            {mov.monto < 0 && (
              <label className="flex h-10 items-center gap-2 text-[14px]">
                <input type="checkbox" name="crearGasto" defaultChecked className="size-4" /> Crear gasto financiero
              </label>
            )}
            <Button type="submit" disabled={pending}>
              Registrar
            </Button>
          </form>
        </>
      )}
      <ErrorForm error={error} className="mt-3" />
    </Dialog>
  );
}
