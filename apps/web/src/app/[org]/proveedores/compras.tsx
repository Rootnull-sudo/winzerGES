'use client';
/** Pestaña Compras: documentos con varias líneas; el servidor recalcula totales, stock y precios (registrarCompra). */
import {
  ALZA_PRECIO_DESTACADA,
  clp,
  docGeneraDeuda,
  DOCUMENTOS_COMPRA,
  ESTADO_PAGO_LABEL,
  estadoPagoDoc,
  fechaHoy,
  netoLinea,
  totalesCompra,
  variacionPrecio,
  vencimientoSugerido,
  type EstadoPagoDoc
} from '@winzer/domain';
import { Plus, ReceiptText, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Adjuntos } from '@/components/adjuntos';
import { useCan, useOrg, useTemporadaElegida } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/page';
import { cn } from '@/lib/cn';
import { anularCompraAction, saveCompra } from './actions';
import { ErrorForm, fecha, useSubmit, type CompraRow, type InsumoOpt, type ProveedorRow } from './comun';

export const DOC = Object.fromEntries(DOCUMENTOS_COMPRA) as Record<string, string>;
const TONO: Record<EstadoPagoDoc, 'ok' | 'warn' | 'bad' | 'info' | 'neutral'> = {
  anulada: 'neutral',
  sin_deuda: 'neutral',
  pagada: 'ok',
  parcial: 'info',
  vencida: 'bad',
  pendiente: 'warn'
};
/** Monto con signo legible: −$5.355 (clp daría "$-5.355"). */
const monto = (v: number) => (v < 0 ? `−${clp(-v)}` : clp(v));
const nf = (v: number, d = 2) => v.toLocaleString('es-CL', { maximumFractionDigits: d });

export function EstadoPago({ c }: { c: Pick<CompraRow, 'documento' | 'estado' | 'total' | 'saldo' | 'vencimiento'> }) {
  const e = estadoPagoDoc(c, fechaHoy());
  return <Badge tone={TONO[e]}>{ESTADO_PAGO_LABEL[e]}</Badge>;
}

export function Compras({
  compras,
  proveedores,
  insumos,
  tasaIVA
}: {
  compras: CompraRow[];
  proveedores: ProveedorRow[];
  insumos: InsumoOpt[];
  tasaIVA: number;
}) {
  const can = useCan();
  const elegida = useTemporadaElegida();
  const [editing, setEditing] = useState<CompraRow | 'nueva' | null>(null);
  const [prov, setProv] = useState('');
  const provById = useMemo(() => new Map(proveedores.map((p) => [p.id, p])), [proveedores]);
  const rows = compras
    .filter((c) => (!elegida || (c.fecha >= elegida.inicio && c.fecha <= elegida.fin)) && (!prov || c.proveedorId === prov))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.folio.localeCompare(a.folio));
  const vigentes = rows.filter((c) => c.estado !== 'anulada' && c.documento !== 'guia');
  const signo = (c: CompraRow) => (c.documento === 'nota_credito' ? -1 : 1);
  const suma = (k: 'neto' | 'iva' | 'total') => vigentes.reduce((s, c) => s + signo(c) * c[k], 0);

  const cols: Column<CompraRow>[] = [
    { key: 'fecha', label: 'Fecha', render: (c) => fecha(c.fecha) },
    {
      key: 'documento',
      label: 'Documento',
      value: (c) => `${DOC[c.documento]} ${c.folio}`,
      render: (c) => (
        <span className={cn(c.estado === 'anulada' && 'text-ink-3 line-through')}>
          {DOC[c.documento]} <b>{c.folio}</b>
        </span>
      )
    },
    { key: 'proveedor', label: 'Proveedor', value: (c) => provById.get(c.proveedorId)?.nombre ?? '' },
    { key: 'neto', label: 'Neto', num: true, value: (c) => signo(c) * c.neto, render: (c) => monto(signo(c) * c.neto) },
    { key: 'iva', label: 'IVA', num: true, value: (c) => signo(c) * c.iva, render: (c) => monto(signo(c) * c.iva) },
    { key: 'total', label: 'Total', num: true, value: (c) => signo(c) * c.total, render: (c) => <b>{monto(signo(c) * c.total)}</b> },
    {
      key: 'saldo',
      label: 'Saldo',
      num: true,
      value: (c) => c.saldo ?? 0,
      render: (c) => (c.saldo != null ? clp(c.saldo) : <span className="text-ink-4">—</span>)
    },
    { key: 'estado', label: 'Pago', value: (c) => ESTADO_PAGO_LABEL[estadoPagoDoc(c, fechaHoy())], render: (c) => <EstadoPago c={c} /> }
  ];

  return (
    <>
      <DataTable
        rows={rows}
        columns={cols}
        onRowClick={(c) => setEditing(c)}
        exportName={`compras-${elegida?.anio ?? ''}`}
        canExport={can('proveedores', 'x')}
        toolbar={
          <>
            <div className="w-56">
              <Select aria-label="Proveedor" value={prov} onChange={(e) => setProv(e.target.value)} className="h-9 text-[14px]">
                <option value="">Todos los proveedores</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </Select>
            </div>
            {can('proveedores', 'c') && (
              <Button variant="primary" onClick={() => setEditing('nueva')} disabled={!proveedores.length}>
                <Plus size={16} /> Nueva compra
              </Button>
            )}
          </>
        }
        empty={
          <EmptyState
            icon={<ReceiptText size={28} strokeWidth={1.5} />}
            title={`Sin compras en la temporada ${elegida?.anio ?? ''}`}
            text={
              proveedores.length ? 'Registra cada factura con sus líneas: suma el stock de los insumos y actualiza su precio.' : 'Primero crea un proveedor.'
            }
          />
        }
      />
      {vigentes.length > 0 && (
        <p aria-label="Totales de compras" className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-2">
          <span>
            Neto <b className="text-ink tabular">{monto(suma('neto'))}</b>
          </span>
          <span>
            IVA crédito <b className="text-ink tabular">{monto(suma('iva'))}</b>
          </span>
          <span>
            Total <b className="text-ink tabular">{monto(suma('total'))}</b>
          </span>
          <span className="text-ink-3">Las notas de crédito restan; las guías y anuladas no suman.</span>
        </p>
      )}
      {editing && (
        <CompraDialog
          compra={editing === 'nueva' ? null : editing}
          compras={compras}
          proveedores={proveedores}
          insumos={insumos}
          tasaIVA={tasaIVA}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

type LineaForm = { key: string; id?: string; insumoId: string; descripcion: string; cantidad: string; precioUnitario: string; exenta: boolean };
const lineaVacia = (): LineaForm => ({ key: crypto.randomUUID(), insumoId: '', descripcion: '', cantidad: '1', precioUnitario: '', exenta: false });

function CompraDialog({
  compra,
  compras,
  proveedores,
  insumos,
  tasaIVA,
  onClose
}: {
  compra: CompraRow | null;
  compras: CompraRow[];
  proveedores: ProveedorRow[];
  insumos: InsumoOpt[];
  tasaIVA: number;
  onClose: () => void;
}) {
  const { org } = useOrg();
  const can = useCan();
  const { pending, errors, error, run } = useSubmit(onClose);
  const c = compra;
  const anulada = c?.estado === 'anulada';
  const editable = !anulada && (c ? can('proveedores', 'e') : can('proveedores', 'c'));
  const [f, setF] = useState({
    fecha: c?.fecha ?? fechaHoy(),
    proveedorId: c?.proveedorId ?? '',
    documento: c?.documento ?? 'factura',
    folio: c?.folio ?? '',
    referenciaCompraId: c?.referenciaCompraId ?? '',
    vencimiento: c?.vencimiento ?? '',
    observaciones: c?.observaciones ?? ''
  });
  const [lineas, setLineas] = useState<LineaForm[]>(
    c?.lineas.length
      ? c.lineas.map((l) => ({
          key: l.id,
          id: l.id,
          insumoId: l.insumoId ?? '',
          descripcion: l.descripcion,
          cantidad: String(l.cantidad),
          precioUnitario: String(l.precioUnitario),
          exenta: l.exenta
        }))
      : [lineaVacia()]
  );
  const insById = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos]);
  const prov = proveedores.find((p) => p.id === f.proveedorId);
  const deuda = docGeneraDeuda(f.documento);
  const conExenta = f.documento === 'factura' || f.documento === 'nota_credito';
  const tot = totalesCompra(lineas, f.documento, tasaIVA);
  // Referencias posibles: la NC corrige una factura o boleta; la factura puede facturar una guía.
  const referencias = compras.filter(
    (x) =>
      x.id !== c?.id &&
      x.proveedorId === f.proveedorId &&
      x.estado !== 'anulada' &&
      (f.documento === 'nota_credito' ? docGeneraDeuda(x.documento) : f.documento === 'factura' && x.documento === 'guia')
  );

  function cambiar(k: keyof typeof f, v: string) {
    const nf2 = { ...f, [k]: v };
    // El vencimiento se propone con el plazo del proveedor al cambiar proveedor, fecha o documento.
    if ((k === 'proveedorId' || k === 'fecha' || k === 'documento') && docGeneraDeuda(nf2.documento)) {
      const p = proveedores.find((x) => x.id === nf2.proveedorId);
      if (p && nf2.fecha) nf2.vencimiento = vencimientoSugerido(nf2.fecha, p.plazo);
    }
    if (k === 'proveedorId' || k === 'documento') nf2.referenciaCompraId = '';
    setF(nf2);
  }
  function linea(i: number, cambio: Partial<LineaForm>) {
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambio } : l)));
  }
  function elegirInsumo(i: number, id: string) {
    const ins = insById.get(id);
    const l = lineas[i]!;
    linea(i, {
      insumoId: id,
      descripcion: ins && !l.descripcion ? ins.nombre : l.descripcion,
      precioUnitario: ins && !l.precioUnitario ? String(ins.precio) : l.precioUnitario
    });
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = {
      ...f,
      id: c?.id,
      lineas: lineas.map((l) => ({
        id: l.id,
        insumoId: l.insumoId || null,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        exenta: l.exenta
      }))
    };
    run(() => saveCompra(org.slug, input, c?.version), c ? 'Compra actualizada.' : 'Compra registrada.');
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={c ? `${DOC[c.documento]} ${c.folio}` : 'Nueva compra'}
      description={
        anulada
          ? 'Compra anulada: su stock y precios se revirtieron.'
          : 'Montos netos por línea. El IVA solo va en facturas y notas de crédito; la guía mueve stock sin generar deuda.'
      }
      footer={
        <>
          {c && !anulada && can('proveedores', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() =>
                confirm('¿Anular esta compra? Se revierten su stock y sus precios. El folio queda libre.') &&
                run(() => anularCompraAction(org.slug, c.id), 'Compra anulada.')
              }
            >
              Anular
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            {editable ? 'Cancelar' : 'Cerrar'}
          </Button>
          {editable && (
            <Button type="submit" form="compra-form" variant="primary" disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar'}
            </Button>
          )}
        </>
      }
    >
      <form id="compra-form" onSubmit={submit} className="grid gap-x-6 gap-y-5 lg:grid-cols-[1fr_16rem]">
        <fieldset disabled={!editable} className="grid content-start gap-4 sm:grid-cols-3">
          <legend className="sr-only">Documento</legend>
          <Field label="Fecha" required error={errors.fecha}>
            {(id, d) => <Input id={id} type="date" value={f.fecha} onChange={(e) => cambiar('fecha', e.target.value)} aria-describedby={d} required />}
          </Field>
          <Field label="Proveedor" required error={errors.proveedorId} className="sm:col-span-2">
            {(id, d) => (
              <Select id={id} value={f.proveedorId} onChange={(e) => cambiar('proveedorId', e.target.value)} aria-describedby={d} required>
                <option value="" disabled>
                  Elige…
                </option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Documento" required>
            {(id) => (
              <Select id={id} value={f.documento} onChange={(e) => cambiar('documento', e.target.value)}>
                {DOCUMENTOS_COMPRA.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Folio" required error={errors.folio}>
            {(id, d) => <Input id={id} value={f.folio} onChange={(e) => cambiar('folio', e.target.value)} aria-describedby={d} className="tabular" required />}
          </Field>
          {deuda ? (
            <Field label="Vencimiento" error={errors.vencimiento} hint={prov ? (prov.plazo === 0 ? 'Contado.' : `Plazo ${prov.plazo} días.`) : undefined}>
              {(id, d) => <Input id={id} type="date" value={f.vencimiento} onChange={(e) => cambiar('vencimiento', e.target.value)} aria-describedby={d} />}
            </Field>
          ) : (
            <span />
          )}
          {(f.documento === 'nota_credito' || (f.documento === 'factura' && referencias.length > 0)) && (
            <Field
              label={f.documento === 'nota_credito' ? 'Documento que corrige' : 'Guía que factura'}
              required={f.documento === 'nota_credito'}
              error={errors.referenciaCompraId}
              className="sm:col-span-3"
              hint={f.documento === 'factura' ? 'Si la factura cubre una guía ya recibida, no vuelve a sumar stock.' : undefined}
            >
              {(id, d) => (
                <Select
                  id={id}
                  value={f.referenciaCompraId}
                  onChange={(e) => cambiar('referenciaCompraId', e.target.value)}
                  aria-describedby={d}
                  required={f.documento === 'nota_credito'}
                >
                  <option value="">{f.documento === 'nota_credito' ? 'Elige…' : 'Ninguna'}</option>
                  {referencias.map((x) => (
                    <option key={x.id} value={x.id}>
                      {DOC[x.documento]} {x.folio} · {fecha(x.fecha)} · {clp(x.total)}
                      {x.saldo != null ? ` · saldo ${clp(x.saldo)}` : ''}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}

          <div className="sm:col-span-3">
            <h3 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Líneas</h3>
            {errors.lineas && (
              <p role="alert" className="mb-2 text-[13px] text-bad">
                {errors.lineas}
              </p>
            )}
            <ol className="flex flex-col gap-2">
              {lineas.map((l, i) => {
                const ins = insById.get(l.insumoId);
                const err = (k: string) => errors[`lineas.${i}.${k}`];
                return (
                  <li key={l.key} aria-label={`Línea ${i + 1}`} className="grid gap-2 rounded-control bg-sunken/60 p-2">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_1fr]">
                      <Select
                        aria-label={`Línea ${i + 1} · Insumo`}
                        value={l.insumoId}
                        onChange={(e) => elegirInsumo(i, e.target.value)}
                        className="h-9 text-[14px]"
                      >
                        <option value="">Sin insumo</option>
                        {insumos.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.nombre} ({x.unidad})
                          </option>
                        ))}
                      </Select>
                      <Input
                        aria-label={`Línea ${i + 1} · Descripción`}
                        aria-invalid={!!err('descripcion')}
                        placeholder="Descripción"
                        value={l.descripcion}
                        onChange={(e) => linea(i, { descripcion: e.target.value })}
                        className="h-9 text-[14px]"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-[5.5rem_minmax(0,8rem)_auto_1fr_auto] items-center gap-2">
                      <Input
                        aria-label={`Línea ${i + 1} · Cantidad`}
                        aria-invalid={!!err('cantidad')}
                        type="number"
                        min={0}
                        step="any"
                        value={l.cantidad}
                        onChange={(e) => linea(i, { cantidad: e.target.value })}
                        className="h-9 text-[14px] tabular"
                        required
                      />
                      <Input
                        aria-label={`Línea ${i + 1} · Precio unitario`}
                        aria-invalid={!!err('precioUnitario')}
                        type="number"
                        min={0}
                        step="any"
                        placeholder={ins ? `Último ${clp(ins.precio)}` : 'Precio neto'}
                        value={l.precioUnitario}
                        onChange={(e) => linea(i, { precioUnitario: e.target.value })}
                        className="h-9 text-[14px] tabular"
                        required
                      />
                      {conExenta ? (
                        <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
                          <input type="checkbox" checked={l.exenta} onChange={(e) => linea(i, { exenta: e.target.checked })} className="size-4 accent-ink" />
                          Exenta
                        </label>
                      ) : (
                        <span />
                      )}
                      <span className="text-right text-[14px] font-semibold tabular" aria-label={`Línea ${i + 1} · Neto`}>
                        {clp(netoLinea(l))}
                      </span>
                      <button
                        type="button"
                        aria-label={`Quitar línea ${i + 1}`}
                        disabled={lineas.length === 1}
                        onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}
                        className="grid size-9 place-items-center rounded-control text-ink-3 hover:bg-sunken hover:text-bad disabled:opacity-40"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {(err('descripcion') || err('cantidad') || err('precioUnitario')) && (
                      <p className="text-[12px] text-bad">{err('descripcion') ?? err('cantidad') ?? err('precioUnitario')}</p>
                    )}
                  </li>
                );
              })}
            </ol>
            <Button type="button" variant="ghost" className="mt-2" onClick={() => setLineas((ls) => [...ls, lineaVacia()])}>
              <Plus size={15} /> Agregar línea
            </Button>
          </div>
          <Field label="Observaciones" className="sm:col-span-3">
            {(id) => <Textarea id={id} value={f.observaciones} onChange={(e) => cambiar('observaciones', e.target.value)} />}
          </Field>
        </fieldset>

        <aside aria-label="Cálculo" className="self-start rounded-card bg-sunken px-4 py-3 text-[13px]">
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
            <dt className="text-ink-3">Neto afecto</dt>
            <dd className="text-right tabular">{clp(tot.neto)}</dd>
            <dt className="text-ink-3">Exento</dt>
            <dd className="text-right tabular">{clp(tot.exento)}</dd>
            <dt className="text-ink-3">IVA {f.documento === 'factura' || f.documento === 'nota_credito' ? `(${nf(tasaIVA * 100, 1)} %)` : ''}</dt>
            <dd className="text-right tabular">{clp(tot.iva)}</dd>
            <dt className="font-semibold text-ink">Total</dt>
            <dd className="text-right text-[15px] font-bold tabular">{clp(tot.total)}</dd>
          </dl>
          {c && c.saldo != null && (
            <p className="mt-2 border-t border-rule pt-2 text-ink-2">
              Saldo por pagar <b className="tabular">{clp(c.saldo)}</b>
              {c.notasCredito > 0 && <span className="block text-[12px] text-ink-3">Incluye notas de crédito por {clp(c.notasCredito)}.</span>}
            </p>
          )}
          {lineas.some((l) => insById.get(l.insumoId)) && (
            <ul className="mt-3 flex flex-col gap-2 border-t border-rule pt-2" aria-label="Insumos de la compra">
              {lineas.map((l, i) => {
                const ins = insById.get(l.insumoId);
                if (!ins) return null;
                const v = l.precioUnitario && f.documento !== 'nota_credito' ? variacionPrecio(l.precioUnitario, ins.precio) : null;
                return (
                  <li key={l.key}>
                    <span className="block font-semibold text-ink">{ins.nombre}</span>
                    <span className="block text-ink-3">
                      Stock {nf(ins.stock)} {ins.unidad} · precio {clp(ins.precio)}
                    </span>
                    {v != null && Math.abs(v) > 0.0005 && (
                      <span
                        className={cn('block font-semibold', v > ALZA_PRECIO_DESTACADA ? 'text-bad' : v < 0 ? 'text-ok' : 'text-ink-2')}
                        aria-label={`Línea ${i + 1} · Variación`}
                      >
                        {v > 0 ? '↑' : '↓'} {nf(Math.abs(v) * 100, 1)} % vs. último precio
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
        <ErrorForm error={error} className="lg:col-span-2" />
      </form>
      {c && <Adjuntos entidad="compra" registroId={c.id} />}
    </Dialog>
  );
}
