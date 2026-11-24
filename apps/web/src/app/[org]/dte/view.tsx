'use client';
/**
 * DTE (F6-1; v1: modules/dte). Emitidos y recibidos con su estado, notas de crédito y débito, libros de compras y
 * ventas (filas y totales con el mismo filtro), folios autorizados y datos del emisor.
 */
import {
  AMBIENTES_DTE,
  clp,
  docsLibro,
  ESTADO_DTE_LABEL,
  fechaHoy,
  nombreDte,
  rutFormat,
  tax,
  transicionesDte,
  usoFolios,
  type EstadoDte
} from '@winzer/domain';
import { Download, FileText, Plus, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCan, useOrg } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState, Stat, StatGrid } from '@/components/ui/page';
import { Tabs, useTab } from '@/components/ui/tabs';
import { cn } from '@/lib/cn';
import { ErrorForm, fecha, useSubmit } from '../proveedores/comun';
import { cambiarEstadoAction, deleteCaf, emitirNotaAction, saveCaf, saveEmisor } from './actions';

export interface DocDte {
  id: string;
  direccion: string;
  tipo: number;
  folio: string;
  fecha: string;
  estado: string;
  fechasEstado: Record<string, string>;
  contraparteRut: string | null;
  contraparte: string | null;
  neto: number;
  exento: number;
  iva: number;
  ila: number;
  total: number;
  vencimiento: string | null;
  referencia: { tipo: number; folio: string; fecha: string; codigo: number; razon: string } | null;
  dteRefId: string | null;
  origen: 'venta' | 'compra' | 'gasto' | null;
}
export interface DatosDte {
  documentos: DocDte[];
  lineas: { dteId: string; nombre: string; cantidad: number; unidad: string | null; precio: number; monto: number }[];
  cafs: { id: string; tipo: number; desde: number; hasta: number; fechaAutorizacion: string; vence: string | null }[];
  emisor: {
    rut: string | null;
    razonSocial: string | null;
    giro: string | null;
    acteco: string | null;
    direccion: string | null;
    comuna: string | null;
    resolucionNumero: string | null;
    resolucionFecha: string | null;
    ambiente: string;
    certificadoVence: string | null;
  };
}

const TABS = [
  { id: 'emitidos', label: 'Emitidos' },
  { id: 'recibidos', label: 'Recibidos' },
  { id: 'libros', label: 'Libros' },
  { id: 'folios', label: 'Folios (CAF)' },
  { id: 'emisor', label: 'Emisor' }
] as const;
const CORTO: Record<number, string> = { 33: 'Factura', 34: 'Factura exenta', 39: 'Boleta', 52: 'Guía', 56: 'Nota de débito', 61: 'Nota de crédito' };
const TONO: Record<string, 'neutral' | 'ok' | 'warn' | 'bad' | 'info'> = {
  borrador: 'neutral',
  generado: 'info',
  enviado: 'info',
  aceptado: 'ok',
  rechazado: 'bad',
  anulado: 'neutral'
};
const ACCION: Record<string, string> = {
  generado: 'Generar',
  enviado: 'Marcar enviado',
  aceptado: 'Marcar aceptado',
  rechazado: 'Marcar rechazado',
  anulado: 'Anular'
};
/** Σ de notas de crédito vigentes por documento referenciado. */
function acreditadoPor(docs: readonly DocDte[]) {
  const m = new Map<string, number>();
  for (const d of docs) if (d.tipo === 61 && d.dteRefId && !['anulado', 'rechazado'].includes(d.estado)) m.set(d.dteRefId, (m.get(d.dteRefId) ?? 0) + d.total);
  return m;
}
const diasHasta = (d: string, hoy: string) => Math.round((Date.parse(d) - Date.parse(hoy)) / 86_400_000);

export function DteView({ datos }: { datos: DatosDte }) {
  const [tab, setTab] = useTab(TABS);
  const [viendo, setViendo] = useState<DocDte | null>(null);
  const hoy = fechaHoy();
  const mes = hoy.slice(0, 7);
  const emitidosMes = docsLibro(datos.documentos, 'emitido', mes);
  const recibidosMes = docsLibro(datos.documentos, 'recibido', mes);
  const rechazados = datos.documentos.filter((d) => d.direccion === 'emitido' && d.estado === 'rechazado').length;
  const usos = [...new Set(datos.cafs.map((c) => c.tipo))].map((tipo) => ({
    tipo,
    ...usoFolios(
      datos.cafs.filter((c) => c.tipo === tipo),
      datos.documentos.filter((d) => d.direccion === 'emitido' && d.tipo === tipo).map((d) => Number(d.folio))
    )
  }));
  const peor = usos.sort((a, b) => b.pct - a.pct)[0];
  const cert = datos.emisor.certificadoVence ? diasHasta(datos.emisor.certificadoVence, hoy) : null;

  return (
    <>
      {cert != null && cert <= 60 && (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-card bg-warn-soft px-4 py-3 text-[14px] text-warn">
          <ShieldAlert size={16} aria-hidden />
          {cert < 0 ? `El certificado digital venció hace ${-cert} días.` : `El certificado digital vence en ${cert} días.`} Renuévalo con tu proveedor.
        </p>
      )}
      <StatGrid>
        <Stat
          label="Emitidos este mes"
          value={clp(tax.resumenLibro(emitidosMes).total)}
          sub={`${emitidosMes.length} documentos`}
          icon={<FileText size={16} strokeWidth={1.6} />}
        />
        <Stat label="Recibidos este mes" value={clp(tax.resumenLibro(recibidosMes).total)} sub={`${recibidosMes.length} documentos`} />
        <Stat
          label="Folios"
          value={peor ? `${Math.round(peor.pct * 100)} %` : 'Sin CAF'}
          sub={peor ? `${CORTO[peor.tipo]}: quedan ${peor.disponibles}` : 'Modo simulado: folios por secuencia'}
        />
        <Stat label="Rechazados" value={<span className={cn(rechazados > 0 && 'text-bad')}>{rechazados}</span>} sub="Requieren corrección" />
      </StatGrid>
      <Tabs tabs={TABS} actual={tab} onChange={setTab} />
      {(tab === 'emitidos' || tab === 'recibidos') && (
        <Documentos
          docs={datos.documentos.filter((d) => d.direccion === (tab === 'emitidos' ? 'emitido' : 'recibido'))}
          onVer={setViendo}
          recibidos={tab === 'recibidos'}
        />
      )}
      {tab === 'libros' && <Libros docs={datos.documentos} />}
      {tab === 'folios' && <Folios datos={datos} />}
      {tab === 'emisor' && <EmisorForm emisor={datos.emisor} />}
      {viendo && <DocDialog doc={viendo} datos={datos} onClose={() => setViendo(null)} />}
    </>
  );
}

function Documentos({ docs, onVer, recibidos }: { docs: DocDte[]; onVer: (d: DocDte) => void; recibidos: boolean }) {
  const can = useCan();
  const { org } = useOrg();
  const [tipo, setTipo] = useState('');
  const [periodo, setPeriodo] = useState('');
  const acreditado = useMemo(() => acreditadoPor(docs), [docs]);
  const filas = docs.filter((d) => (!tipo || String(d.tipo) === tipo) && (!periodo || d.fecha.startsWith(periodo)));
  const cols: Column<DocDte>[] = [
    { key: 'fecha', label: 'Fecha', render: (d) => fecha(d.fecha) },
    { key: 'tipo', label: 'Documento', value: (d) => CORTO[d.tipo] ?? d.tipo },
    { key: 'folio', label: 'Folio', value: (d) => Number(d.folio) || d.folio, render: (d) => <b className="tabular">{d.folio}</b> },
    {
      key: 'contraparte',
      label: recibidos ? 'Proveedor' : 'Receptor',
      value: (d) => d.contraparte ?? '',
      render: (d) => (
        <span>
          {d.contraparte ?? '—'}
          {d.contraparteRut && <span className="block text-[12px] text-ink-3 tabular">{rutFormat(d.contraparteRut)}</span>}
        </span>
      )
    },
    {
      key: 'ref',
      label: 'Referencia',
      value: (d) => (d.referencia ? `${CORTO[d.referencia.tipo] ?? d.referencia.tipo} ${d.referencia.folio}` : ''),
      render: (d) => (d.referencia ? `${CORTO[d.referencia.tipo] ?? d.referencia.tipo} N° ${d.referencia.folio}` : <span className="text-ink-4">—</span>)
    },
    {
      key: 'total',
      label: 'Total',
      num: true,
      render: (d) => <span className={cn(d.tipo === 61 && 'text-bad')}>{clp(d.tipo === 61 ? -d.total : d.total)}</span>
    },
    {
      key: 'estado',
      label: 'Estado',
      value: (d) => d.estado,
      render: (d) => (
        <span className="inline-flex flex-wrap gap-1">
          <Badge tone={TONO[d.estado]}>{ESTADO_DTE_LABEL[d.estado as EstadoDte] ?? d.estado}</Badge>
          {(acreditado.get(d.id) ?? 0) >= d.total && d.total > 0 && <Badge>Anulada con NC</Badge>}
        </span>
      )
    }
  ];
  return (
    <DataTable
      rows={filas}
      columns={cols}
      onRowClick={onVer}
      exportName={recibidos ? 'dte-recibidos' : 'dte-emitidos'}
      canExport={can('dte', 'x')}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-40">
            <Select aria-label="Tipo de documento" value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-9 text-[13px]">
              <option value="">Todos los tipos</option>
              {Object.entries(CORTO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Input aria-label="Período" type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="h-9 text-[13px]" />
          </div>
          {periodo && filas.length > 0 && can('dte', 'x') && (
            <a
              className="inline-flex h-9 items-center gap-1.5 rounded-control border border-rule px-3 text-[13px] font-semibold hover:bg-sunken"
              href={`/api/${org.slug}/dte/xml?periodo=${periodo}&direccion=${recibidos ? 'recibido' : 'emitido'}`}
            >
              <Download size={14} aria-hidden /> XML del período
            </a>
          )}
        </div>
      }
      empty={
        <EmptyState
          icon={<FileText size={28} strokeWidth={1.5} />}
          title={recibidos ? 'Sin documentos recibidos' : 'Sin documentos emitidos'}
          text={recibidos ? 'Las facturas de compras y gastos aparecen aquí al registrarlas.' : 'Al confirmar una venta con DTE se emite su documento.'}
        />
      }
    />
  );
}

function DocDialog({ doc, datos, onClose }: { doc: DocDte; datos: DatosDte; onClose: () => void }) {
  const can = useCan();
  const { org } = useOrg();
  const { pending, error, run } = useSubmit(onClose);
  const [nota, setNota] = useState(false);
  const lineas = datos.lineas.filter((l) => l.dteId === doc.id);
  const notas = datos.documentos.filter((d) => d.dteRefId === doc.id);
  const ref = doc.dteRefId ? datos.documentos.find((d) => d.id === doc.dteRefId) : null;
  const pasos = can('dte', 'e') ? transicionesDte(doc.direccion, doc.estado) : [];
  // Con notas de crédito que ya cubren el total, no queda nada que acreditar.
  const porAcreditar = doc.total - (acreditadoPor(datos.documentos).get(doc.id) ?? 0);
  const admiteNota =
    doc.direccion === 'emitido' &&
    [33, 34, 56].includes(doc.tipo) &&
    !['borrador', 'anulado', 'rechazado'].includes(doc.estado) &&
    porAcreditar > 0 &&
    can('dte', 'c');
  if (nota) return <NotaDialog doc={doc} onClose={onClose} />;
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`${nombreDte(doc.tipo)} N° ${doc.folio}`}
      description={`${doc.direccion === 'emitido' ? 'Emitido a' : 'Recibido de'} ${doc.contraparte ?? '—'}${doc.contraparteRut ? ` (${rutFormat(doc.contraparteRut)})` : ''} · ${fecha(doc.fecha)}`}
      footer={
        <>
          <a
            className="mr-auto inline-flex h-10 items-center gap-1.5 rounded-control border border-rule px-3 text-[14px] font-semibold hover:bg-sunken"
            href={`/api/${org.slug}/dte/xml?id=${doc.id}`}
          >
            <Download size={15} aria-hidden /> XML
          </a>
          {admiteNota && (
            <Button type="button" onClick={() => setNota(true)}>
              Emitir nota
            </Button>
          )}
          {pasos.map((p) => (
            <Button
              key={p}
              type="button"
              variant={p === 'anulado' || p === 'rechazado' ? 'danger' : 'primary'}
              disabled={pending}
              onClick={() =>
                (p !== 'anulado' || confirm('¿Anular este documento?')) && run(() => cambiarEstadoAction(org.slug, doc.id, p), 'Estado actualizado.')
              }
            >
              {ACCION[p] ?? p}
            </Button>
          ))}
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px]">
        <Badge tone={TONO[doc.estado]}>{ESTADO_DTE_LABEL[doc.estado as EstadoDte] ?? doc.estado}</Badge>
        {Object.entries(doc.fechasEstado).map(([e, f]) => (
          <span key={e} className="text-ink-3">
            {ESTADO_DTE_LABEL[e as EstadoDte] ?? e} {new Date(f).toLocaleDateString('es-CL')}
          </span>
        ))}
        {doc.origen && <span className="text-ink-3">· Origen: {doc.origen}</span>}
      </div>
      {doc.referencia && (
        <p className="mb-3 text-[13px] text-ink-2">
          Referencia: {nombreDte(doc.referencia.tipo)} N° {doc.referencia.folio} del {fecha(doc.referencia.fecha)} — {doc.referencia.razon}
          {ref && ` (${ESTADO_DTE_LABEL[ref.estado as EstadoDte]})`}
        </p>
      )}
      <table className="w-full text-[14px]">
        <thead>
          <tr className="border-b border-rule text-left text-[12px] text-ink-3">
            <th className="py-1.5 font-semibold">Detalle</th>
            <th className="py-1.5 text-right font-semibold">Cant.</th>
            <th className="py-1.5 text-right font-semibold">Precio</th>
            <th className="py-1.5 text-right font-semibold">Monto</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l, i) => (
            <tr key={i} className="border-b border-rule">
              <td className="py-1.5">{l.nombre}</td>
              <td className="py-1.5 text-right tabular">
                {l.cantidad.toLocaleString('es-CL')} {l.unidad}
              </td>
              <td className="py-1.5 text-right tabular">{clp(Math.round(l.precio))}</td>
              <td className="py-1.5 text-right tabular">{clp(l.monto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="mt-3 ml-auto grid max-w-64 grid-cols-2 gap-x-4 gap-y-1 text-[14px]">
        {doc.neto > 0 && (
          <>
            <dt className="text-ink-3">Neto</dt>
            <dd className="text-right tabular">{clp(doc.neto)}</dd>
          </>
        )}
        {doc.exento > 0 && (
          <>
            <dt className="text-ink-3">Exento</dt>
            <dd className="text-right tabular">{clp(doc.exento)}</dd>
          </>
        )}
        <dt className="text-ink-3">IVA</dt>
        <dd className="text-right tabular">{clp(doc.iva)}</dd>
        {doc.ila > 0 && (
          <>
            <dt className="text-ink-3">ILA</dt>
            <dd className="text-right tabular">{clp(doc.ila)}</dd>
          </>
        )}
        <dt className="font-semibold">Total</dt>
        <dd className="text-right font-semibold tabular">{clp(doc.total)}</dd>
      </dl>
      {notas.length > 0 && (
        <p className="mt-4 text-[13px] text-ink-2">Notas: {notas.map((n) => `${CORTO[n.tipo]} N° ${n.folio} (${clp(n.total)})`).join(', ')}</p>
      )}
      <ErrorForm error={error} className="mt-3" />
    </Dialog>
  );
}

function NotaDialog({ doc, onClose }: { doc: DocDte; onClose: () => void }) {
  const { org } = useOrg();
  const { pending, errors, error, run } = useSubmit(onClose);
  const [tipo, setTipo] = useState<'61' | '56'>('61');
  const [alcance, setAlcance] = useState<'total' | 'parcial'>('total');
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    run(
      () => emitirNotaAction(org.slug, { ...f, dteId: doc.id, tipo, neto: tipo === '56' || alcance === 'parcial' ? f.neto : '' }),
      tipo === '61' ? 'Nota de crédito emitida.' : 'Nota de débito emitida.'
    );
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Nota sobre ${CORTO[doc.tipo]} N° ${doc.folio}`}
      description={`Total del documento ${clp(doc.total)}. La nota toma el siguiente folio autorizado.`}
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="nota-form" variant="primary" disabled={pending}>
            {pending ? 'Emitiendo…' : 'Emitir nota'}
          </Button>
        </>
      }
    >
      <form id="nota-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo">
          {(id) => (
            <Select id={id} value={tipo} onChange={(e) => setTipo(e.target.value as '61' | '56')}>
              <option value="61">Nota de crédito (61)</option>
              <option value="56">Nota de débito (56)</option>
            </Select>
          )}
        </Field>
        {tipo === '61' ? (
          <Field label="Alcance">
            {(id) => (
              <Select id={id} value={alcance} onChange={(e) => setAlcance(e.target.value as 'total' | 'parcial')}>
                <option value="total">Total (anula el documento)</option>
                <option value="parcial">Parcial (corrige el monto)</option>
              </Select>
            )}
          </Field>
        ) : (
          <div />
        )}
        {(tipo === '56' || alcance === 'parcial') && (
          <Field label="Neto de la nota" unit="CLP" required error={errors.neto} hint="IVA e ILA se calculan en la proporción del documento.">
            {(id, d) => <Input id={id} name="neto" type="number" min={1} step={1} className="tabular" aria-describedby={d} required />}
          </Field>
        )}
        <Field label="Fecha" required error={errors.fecha}>
          {(id) => <Input id={id} name="fecha" type="date" defaultValue={fechaHoy()} required />}
        </Field>
        <Field label="Razón" required error={errors.razon} className="sm:col-span-2">
          {(id, d) => <Input id={id} name="razon" maxLength={90} placeholder="Devolución de 2 cajas" aria-describedby={d} required />}
        </Field>
        <ErrorForm error={error} className="sm:col-span-2" />
      </form>
    </Dialog>
  );
}

function Libros({ docs }: { docs: DocDte[] }) {
  const can = useCan();
  const [periodo, setPeriodo] = useState(fechaHoy().slice(0, 7));
  const [dir, setDir] = useState<'emitido' | 'recibido'>('emitido');
  const filas = useMemo(() => docsLibro(docs, dir, periodo), [docs, dir, periodo]);
  const r = tax.resumenLibro(filas);
  const cols: Column<DocDte>[] = [
    { key: 'fecha', label: 'Fecha', render: (d) => fecha(d.fecha) },
    { key: 'tipo', label: 'Tipo', value: (d) => d.tipo },
    { key: 'folio', label: 'Folio', value: (d) => Number(d.folio) || d.folio },
    { key: 'rut', label: 'RUT', value: (d) => (d.contraparteRut ? rutFormat(d.contraparteRut) : '') },
    { key: 'contraparte', label: 'Razón social', value: (d) => d.contraparte ?? '' },
    { key: 'exento', label: 'Exento', num: true, render: (d) => clp(d.exento) },
    { key: 'neto', label: 'Neto', num: true, render: (d) => clp(d.neto) },
    { key: 'iva', label: 'IVA', num: true, render: (d) => clp(d.iva) },
    { key: 'ila', label: 'ILA', num: true, render: (d) => clp(d.ila) },
    { key: 'total', label: 'Total', num: true, render: (d) => clp(d.total) }
  ];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Período">{(id) => <Input id={id} type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="w-44" />}</Field>
        <Field label="Libro">
          {(id) => (
            <Select id={id} value={dir} onChange={(e) => setDir(e.target.value as 'emitido' | 'recibido')} className="w-44">
              <option value="emitido">Ventas</option>
              <option value="recibido">Compras</option>
            </Select>
          )}
        </Field>
      </div>
      <StatGrid>
        <Stat label="Neto" value={clp(r.neto)} sub={`${r.documentos} documentos · exento ${clp(r.exento)}`} />
        <Stat label={dir === 'emitido' ? 'IVA débito' : 'IVA crédito'} value={clp(r.iva)} />
        <Stat label="ILA" value={clp(r.ila)} />
        <Stat label="Total" value={clp(r.total)} sub="Notas de crédito restan; guías no cuentan" />
      </StatGrid>
      <DataTable
        rows={filas}
        columns={cols}
        exportName={`libro-${dir === 'emitido' ? 'ventas' : 'compras'}-${periodo}`}
        canExport={can('dte', 'x')}
        empty={<EmptyState title="Sin documentos en el período" />}
      />
    </>
  );
}

function Folios({ datos }: { datos: DatosDte }) {
  const can = useCan();
  const { org } = useOrg();
  const [editando, setEditando] = useState<DatosDte['cafs'][number] | 'nuevo' | null>(null);
  type Fila = DatosDte['cafs'][number] & { usados: number; pct: number };
  const filas: Fila[] = datos.cafs.map((c) => {
    const u = usoFolios(
      [c],
      datos.documentos.filter((d) => d.direccion === 'emitido' && d.tipo === c.tipo).map((d) => Number(d.folio))
    );
    return { ...c, usados: u.usados, pct: u.pct };
  });
  const cols: Column<Fila>[] = [
    { key: 'tipo', label: 'Documento', value: (c) => CORTO[c.tipo] ?? c.tipo },
    { key: 'rango', label: 'Rango', value: (c) => c.desde, render: (c) => <span className="tabular">{`${c.desde} – ${c.hasta}`}</span> },
    { key: 'fechaAutorizacion', label: 'Autorizado', render: (c) => fecha(c.fechaAutorizacion) },
    {
      key: 'uso',
      label: 'Usados',
      num: true,
      value: (c) => c.pct,
      render: (c) => (
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-sunken" aria-hidden>
            <span className={cn('block h-full', c.pct >= 0.8 ? 'bg-warn' : 'bg-ok')} style={{ width: `${Math.min(100, c.pct * 100)}%` }} />
          </span>
          {c.usados} de {c.hasta - c.desde + 1}
        </span>
      )
    }
  ];
  return (
    <>
      <p className="mb-4 text-[13px] text-ink-3">
        Los folios se toman en orden y nunca se reutilizan. Sin CAF cargados, el ambiente simulado numera por secuencia.
      </p>
      <DataTable
        rows={filas}
        columns={cols}
        onRowClick={can('dte', 'e') ? (c) => setEditando(c) : undefined}
        toolbar={
          can('dte', 'c') && (
            <Button variant="primary" onClick={() => setEditando('nuevo')}>
              <Plus size={16} /> Cargar CAF
            </Button>
          )
        }
        empty={<EmptyState title="Sin folios autorizados" text="Carga los rangos CAF que te entregó el SII para cada tipo de documento." />}
      />
      {editando && <CafDialog caf={editando === 'nuevo' ? null : editando} slug={org.slug} onClose={() => setEditando(null)} />}
    </>
  );
}

function CafDialog({ caf, slug, onClose }: { caf: DatosDte['cafs'][number] | null; slug: string; onClose: () => void }) {
  const can = useCan();
  const { pending, errors, error, run } = useSubmit(onClose);
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run(() => saveCaf(slug, { ...Object.fromEntries(new FormData(e.currentTarget)), id: caf?.id }), 'Folios guardados.');
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={caf ? 'Editar CAF' : 'Cargar CAF'}
      footer={
        <>
          {caf && can('dte', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() => confirm('¿Eliminar este rango de folios?') && run(() => deleteCaf(slug, caf.id), 'CAF eliminado.')}
            >
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="caf-form" variant="primary" disabled={pending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="caf-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Documento" required error={errors.tipo} className="sm:col-span-2">
          {(id) => (
            <Select id={id} name="tipo" defaultValue={caf?.tipo ?? 33}>
              {Object.entries(CORTO).map(([k, v]) => (
                <option key={k} value={k}>
                  {k} · {v}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Desde" required error={errors.desde}>
          {(id) => <Input id={id} name="desde" type="number" min={1} defaultValue={caf?.desde} className="tabular" required />}
        </Field>
        <Field label="Hasta" required error={errors.hasta}>
          {(id) => <Input id={id} name="hasta" type="number" min={1} defaultValue={caf?.hasta} className="tabular" required />}
        </Field>
        <Field label="Fecha de autorización" required error={errors.fechaAutorizacion}>
          {(id) => <Input id={id} name="fechaAutorizacion" type="date" defaultValue={caf?.fechaAutorizacion ?? fechaHoy()} required />}
        </Field>
        <Field label="Vence" error={errors.vence}>
          {(id) => <Input id={id} name="vence" type="date" defaultValue={caf?.vence ?? ''} />}
        </Field>
        <ErrorForm error={error} className="sm:col-span-2" />
      </form>
    </Dialog>
  );
}

function EmisorForm({ emisor }: { emisor: DatosDte['emisor'] }) {
  const can = useCan();
  const { org } = useOrg();
  const { pending, errors, error, run } = useSubmit(() => {});
  const editable = can('dte', 'e');
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run(() => saveEmisor(org.slug, Object.fromEntries(new FormData(e.currentTarget))), 'Datos del emisor guardados.');
  }
  return (
    <form onSubmit={submit} className="grid max-w-3xl gap-4 rounded-card border border-rule bg-raised p-5 sm:grid-cols-2">
      <p className="text-[13px] text-ink-3 sm:col-span-2">
        RUT y razón social: <b className="text-ink">{emisor.rut ? rutFormat(emisor.rut) : 'sin RUT'}</b> · {emisor.razonSocial ?? '—'} (se editan en
        Configuración).
      </p>
      <Field label="Giro" error={errors.giro} className="sm:col-span-2">
        {(id) => <Input id={id} name="giro" defaultValue={emisor.giro ?? ''} maxLength={80} disabled={!editable} />}
      </Field>
      <Field label="Actividad económica (código)" error={errors.acteco}>
        {(id) => <Input id={id} name="acteco" defaultValue={emisor.acteco ?? ''} maxLength={6} inputMode="numeric" disabled={!editable} />}
      </Field>
      <Field label="Ambiente">
        {(id) => (
          <Select id={id} name="ambiente" defaultValue={emisor.ambiente} disabled={!editable}>
            {AMBIENTES_DTE.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Dirección" error={errors.direccion}>
        {(id) => <Input id={id} name="direccion" defaultValue={emisor.direccion ?? ''} maxLength={70} disabled={!editable} />}
      </Field>
      <Field label="Comuna" error={errors.comuna}>
        {(id) => <Input id={id} name="comuna" defaultValue={emisor.comuna ?? ''} maxLength={20} disabled={!editable} />}
      </Field>
      <Field label="Resolución SII N°" error={errors.resolucionNumero}>
        {(id) => <Input id={id} name="resolucionNumero" defaultValue={emisor.resolucionNumero ?? ''} maxLength={10} disabled={!editable} />}
      </Field>
      <Field label="Fecha de resolución" error={errors.resolucionFecha}>
        {(id) => <Input id={id} name="resolucionFecha" type="date" defaultValue={emisor.resolucionFecha ?? ''} disabled={!editable} />}
      </Field>
      <Field label="Certificado digital vence" error={errors.certificadoVence}>
        {(id) => <Input id={id} name="certificadoVence" type="date" defaultValue={emisor.certificadoVence ?? ''} disabled={!editable} />}
      </Field>
      <ErrorForm error={error} className="sm:col-span-2" />
      {editable && (
        <div className="sm:col-span-2">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar datos del emisor'}
          </Button>
        </div>
      )}
    </form>
  );
}
