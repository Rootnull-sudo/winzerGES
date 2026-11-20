'use client';
import {
  aplicaCampo,
  CATEGORIAS_INSUMO,
  clp,
  diasParaVencer,
  fechaHoy,
  MOTIVOS_AJUSTE,
  QUIMICOS_SO2,
  stockInsumo,
  TIPOS_INSUMO,
  UNIDADES_INSUMO,
  valorInventario,
  type Insumo,
  type MovInsumo
} from '@winzer/domain';
import { AlertTriangle, Boxes, CalendarClock, Package, Plus, Scale, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useCan } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState, PageHeader, Stat, StatGrid } from '@/components/ui/page';
import { Tabs, useTab } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { useOrg } from '@/components/shell/org-context';
import { useEntity, useSync, useSyncState } from '@/lib/offline/hooks';
import { ajustarStockAction, deleteInsumo, preciosDe, saveInsumo, type Result } from './actions';

type InsumoRow = Insumo & { _pending: boolean; _version: number };
type MovRow = MovInsumo & { _pending: boolean };

export const CATEGORIA = Object.fromEntries(CATEGORIAS_INSUMO) as Record<string, string>;
const TONO_CATEGORIA: Record<string, 'ok' | 'info' | 'neutral'> = { agricola: 'ok', enologico: 'info' };
export const TIPO_MOV: Record<string, string> = {
  compra: 'Compra',
  aplicacion: 'Aplicación',
  aditivo: 'Aditivo',
  so2: 'SO₂',
  consumo_envasado: 'Envasado',
  ajuste: 'Ajuste',
  nota_credito: 'Nota de crédito'
};
const nf = (v: number) => v.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const fecha = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });

const TABS = [
  { id: 'insumos', label: 'Insumos' },
  { id: 'aplicaciones', label: 'Aplicaciones' },
  { id: 'labores', label: 'Labores' }
] as const;

export function InsumosView({ diasAvisoVencimiento }: { diasAvisoVencimiento: number }) {
  const [tab, setTab] = useTab(TABS);
  return (
    <>
      <PageHeader
        area="Operación"
        title="Insumos y labores"
        description="Maestro de insumos con su stock, aplicaciones en el cuartel y labores de campo. Aplicaciones y labores funcionan sin señal; el maestro se consulta sin señal y se edita con conexión."
      />
      {tab === 'insumos' && <InsumosTab tabs={<Tabs tabs={TABS} actual={tab} onChange={setTab} />} diasAviso={diasAvisoVencimiento} />}
      {tab !== 'insumos' && (
        <>
          <Tabs tabs={TABS} actual={tab} onChange={setTab} />
          <EmptyState title="Disponible pronto" text="Esta pestaña se habilita en el siguiente paso de la migración." />
        </>
      )}
    </>
  );
}

/** Stock de cada insumo calculado con los movimientos locales (funciona sin señal). */
export function useStock() {
  const insumos = useEntity<Insumo>('insumo') as InsumoRow[] | undefined;
  const movs = useEntity<MovInsumo>('mov_insumo') as MovRow[] | undefined;
  const stock = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of insumos ?? []) m.set(i.id, stockInsumo(i, movs ?? []));
    return m;
  }, [insumos, movs]);
  return { insumos, movs, stock };
}

function InsumosTab({ tabs, diasAviso }: { tabs: React.ReactNode; diasAviso: number }) {
  const can = useCan();
  const online = useSyncState()?.online ?? true;
  const { insumos, movs, stock } = useStock();
  const [categoria, setCategoria] = useState('');
  const [editing, setEditing] = useState<InsumoRow | 'new' | null>(null);
  const [ajuste, setAjuste] = useState<InsumoRow | null>(null);
  const hoy = fechaHoy();

  const rows = useMemo(
    () => (insumos ?? []).filter((i) => !categoria || i.categoria === categoria).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [insumos, categoria]
  );
  const k = useMemo(() => {
    const todos = insumos ?? [];
    const bajo = todos.filter((i) => i.stockMinimo != null && (stock.get(i.id) ?? 0) < Number(i.stockMinimo));
    const porVencer = todos.filter((i) => {
      const d = diasParaVencer(i.vencimiento, hoy);
      return d != null && d <= diasAviso && (stock.get(i.id) ?? 0) > 0;
    });
    return { total: todos.length, valor: valorInventario(todos, movs ?? []), bajo: bajo.length, porVencer: porVencer.length };
  }, [insumos, movs, stock, hoy, diasAviso]);

  if (!insumos) return <div className="h-64 animate-pulse rounded-card bg-sunken" aria-label="Cargando insumos" />;

  const editable = can('insumos', 'e') && online;
  const cols: Column<InsumoRow>[] = [
    { key: 'nombre', label: 'Insumo', render: (i) => <span className="font-semibold">{i.nombre}</span> },
    {
      key: 'categoria',
      label: 'Categoría',
      value: (i) => CATEGORIA[i.categoria] ?? i.categoria,
      render: (i) => <Badge tone={TONO_CATEGORIA[i.categoria] ?? 'neutral'}>{CATEGORIA[i.categoria]}</Badge>
    },
    { key: 'tipo', label: 'Tipo', value: (i) => i.tipo ?? '', render: (i) => i.tipo ?? <span className="text-ink-4">—</span> },
    { key: 'precio', label: 'Precio', num: true, value: (i) => i.precio, render: (i) => `${clp(i.precio)} / ${i.unidad}` },
    {
      key: 'stock',
      label: 'Stock',
      num: true,
      value: (i) => stock.get(i.id) ?? 0,
      render: (i) => {
        const s = stock.get(i.id) ?? 0;
        const bajo = i.stockMinimo != null && s < Number(i.stockMinimo);
        return (
          <span className={bajo ? 'font-semibold text-bad' : 'font-semibold'} title={bajo ? `Bajo el mínimo (${nf(Number(i.stockMinimo))})` : undefined}>
            {nf(s)} <span className="font-normal text-ink-3">{i.unidad}</span>
          </span>
        );
      }
    },
    { key: 'carencia', label: 'Carencia', num: true, value: (i) => i.carencia ?? 0, render: (i) => (i.carencia ? `${i.carencia} d` : '—') },
    {
      key: 'vencimiento',
      label: 'Vence',
      value: (i) => i.vencimiento ?? '',
      render: (i) => {
        const d = diasParaVencer(i.vencimiento, hoy);
        if (d == null) return <span className="text-ink-4">—</span>;
        return <span className={d < 0 ? 'font-semibold text-bad' : d <= diasAviso ? 'font-semibold text-warn' : ''}>{fecha(i.vencimiento!)}</span>;
      }
    }
  ];

  return (
    <>
      {tabs}
      {!online && (
        <p className="mb-4 flex items-center gap-2 rounded-control bg-sunken px-3 py-2 text-[13px] text-ink-2">
          <WifiOff size={14} aria-hidden /> Sin conexión: puedes consultar el maestro y el stock, pero crear, editar o ajustar insumos requiere señal.
        </p>
      )}
      {k.total > 0 && (
        <StatGrid>
          <Stat label="Insumos" value={k.total} icon={<Package size={16} strokeWidth={1.6} />} />
          <Stat label="Valor del inventario" value={clp(k.valor)} sub="stock × precio actual" icon={<Boxes size={16} strokeWidth={1.6} />} />
          <Stat label="Bajo el mínimo" value={k.bajo} icon={<AlertTriangle size={16} strokeWidth={1.6} />} />
          <Stat label="Por vencer" value={k.porVencer} sub={`en ${diasAviso} días o menos`} icon={<CalendarClock size={16} strokeWidth={1.6} />} />
        </StatGrid>
      )}
      <DataTable
        rows={rows}
        columns={cols}
        onRowClick={(i) => setEditing(i)}
        exportName="insumos"
        canExport={can('insumos', 'x')}
        rowClassName={(i) => (i._pending ? 'opacity-70' : undefined)}
        toolbar={
          <>
            <Select aria-label="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)} className="h-9 w-auto text-[14px]">
              <option value="">Todas las categorías</option>
              {CATEGORIAS_INSUMO.map(([id, l]) => (
                <option key={id} value={id}>
                  {l}
                </option>
              ))}
            </Select>
            {can('insumos', 'c') && (
              <Button size="sm" variant="primary" disabled={!online} onClick={() => setEditing('new')} className="ml-auto">
                <Plus size={14} aria-hidden /> Nuevo insumo
              </Button>
            )}
          </>
        }
        empty={
          <EmptyState
            icon={<Package size={28} strokeWidth={1.5} />}
            title="Aún no hay insumos"
            text="Registra fertilizantes, fitosanitarios, insumos enológicos y de envasado con su unidad, precio y stock inicial."
            action={
              can('insumos', 'c') && (
                <Button variant="primary" disabled={!online} onClick={() => setEditing('new')}>
                  <Plus size={16} /> Nuevo insumo
                </Button>
              )
            }
          />
        }
      />
      {editing && (
        <InsumoDialog
          insumo={editing === 'new' ? null : editing}
          movs={(movs ?? []).filter((m) => editing !== 'new' && m.insumoId === editing.id)}
          stock={editing === 'new' ? 0 : (stock.get(editing.id) ?? 0)}
          editable={editing === 'new' ? can('insumos', 'c') && online : editable}
          online={online}
          onAjustar={
            editing !== 'new' && can('insumos', 'c') && online
              ? () => {
                  setAjuste(editing);
                  setEditing(null);
                }
              : undefined
          }
          onClose={() => setEditing(null)}
        />
      )}
      {ajuste && <AjusteDialog insumo={ajuste} stock={stock.get(ajuste.id) ?? 0} onClose={() => setAjuste(null)} />}
    </>
  );
}

/** Tras escribir en línea, sincroniza para traer el cambio a IndexedDB. */
function useEnLinea(onDone: () => void) {
  const engine = useSync();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  function run(fn: () => Promise<Result>, ok: string) {
    start(async () => {
      const r = await fn();
      if (r.ok) {
        await engine?.sync();
        toast(ok);
        onDone();
      } else {
        setError(r.error);
        setErrors(r.fieldErrors ?? {});
      }
    });
  }
  return { pending, errors, error, run };
}

function InsumoDialog({
  insumo,
  movs,
  stock,
  editable,
  online,
  onAjustar,
  onClose
}: {
  insumo: InsumoRow | null;
  movs: MovRow[];
  stock: number;
  editable: boolean;
  online: boolean;
  onAjustar?: () => void;
  onClose: () => void;
}) {
  const { org } = useOrg();
  const can = useCan();
  const i = insumo;
  const { pending, errors, error, run } = useEnLinea(onClose);
  const [categoria, setCategoria] = useState<string>(i?.categoria ?? 'agricola');
  const [tipo, setTipo] = useState<string>(i?.tipo ?? '');
  const [precios, setPrecios] = useState<{ fecha: string; precio: number; origen: string }[] | null>(null);
  useEffect(() => {
    if (i && online) void preciosDe(org.slug, i.id).then(setPrecios);
  }, [i, online, org.slug]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    run(() => saveInsumo(org.slug, { ...data, id: i?.id }, i?._version), i ? 'Insumo actualizado.' : 'Insumo creado.');
  }
  const ro = !editable;
  const historial = [...movs].sort((a, b) => b.fecha.localeCompare(a.fecha));

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={i ? i.nombre : 'Nuevo insumo'}
      description={
        i ? (
          <>
            Stock actual{' '}
            <b className="text-ink tabular">
              {nf(stock)} {i.unidad}
            </b>
            {!online && ' · sin conexión: solo lectura'}
          </>
        ) : (
          'El precio se actualiza solo con cada compra (F3); el cambio queda en el historial de precios.'
        )
      }
      footer={
        <>
          {i && can('insumos', 'd') && online && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() => confirm(`¿Eliminar ${i.nombre}?`) && run(() => deleteInsumo(org.slug, i.id), 'Insumo eliminado.')}
            >
              Eliminar
            </Button>
          )}
          {onAjustar && (
            <Button type="button" variant="ghost" onClick={onAjustar}>
              <Scale size={14} aria-hidden /> Ajustar stock
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            {ro ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!ro && (
            <Button type="submit" form="insumo-form" variant="primary" disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar'}
            </Button>
          )}
        </>
      }
    >
      <form id="insumo-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
        <fieldset disabled={ro} className="contents">
          <Field label="Nombre" required error={errors.nombre} className="sm:col-span-2">
            {(id, d) => <Input id={id} name="nombre" defaultValue={i?.nombre} aria-describedby={d} required autoFocus={!ro} />}
          </Field>
          <Field label="Categoría" required>
            {(id) => (
              <Select id={id} name="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {CATEGORIAS_INSUMO.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Tipo">
            {(id) => (
              <Select id={id} name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="">—</option>
                {TIPOS_INSUMO.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Unidad" required>
            {(id) => (
              <Select id={id} name="unidad" defaultValue={i?.unidad ?? 'kg'}>
                {UNIDADES_INSUMO.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Precio por unidad" unit="CLP" required error={errors.precio}>
            {(id, d) => (
              <Input id={id} name="precio" type="number" min={0} step={1} defaultValue={i?.precio ?? ''} className="tabular" aria-describedby={d} required />
            )}
          </Field>
          <Field label="Stock inicial" error={errors.stockInicial}>
            {(id, d) => (
              <Input
                id={id}
                name="stockInicial"
                type="number"
                min={0}
                step="any"
                defaultValue={i?.stockInicial ?? ''}
                className="tabular"
                aria-describedby={d}
              />
            )}
          </Field>
          <Field label="Stock mínimo" error={errors.stockMinimo}>
            {(id, d) => (
              <Input id={id} name="stockMinimo" type="number" min={0} step="any" defaultValue={i?.stockMinimo ?? ''} className="tabular" aria-describedby={d} />
            )}
          </Field>
          <Field label="Vencimiento" error={errors.vencimiento}>
            {(id, d) => <Input id={id} name="vencimiento" type="date" defaultValue={i?.vencimiento ?? ''} aria-describedby={d} />}
          </Field>
          {aplicaCampo.npk(categoria) && <Field label="N-P-K">{(id) => <Input id={id} name="npk" placeholder="12-12-17" defaultValue={i?.npk ?? ''} />}</Field>}
          {aplicaCampo.carencia(categoria) && (
            <Field label="Carencia" unit="días" hint="Días entre la aplicación y la cosecha." error={errors.carencia}>
              {(id, d) => (
                <Input id={id} name="carencia" type="number" min={0} step={1} defaultValue={i?.carencia ?? ''} className="tabular" aria-describedby={d} />
              )}
            </Field>
          )}
          {aplicaCampo.so2(categoria, tipo) && (
            <>
              <Field label="Químico">
                {(id) => (
                  <Select id={id} name="quimico" defaultValue={i?.quimico ?? 'K2S2O5'}>
                    {QUIMICOS_SO2.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="SO₂ aportado" unit="%" error={errors.so2Pct}>
                {(id, d) => (
                  <Input
                    id={id}
                    name="so2Pct"
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    defaultValue={i?.so2Pct ?? ''}
                    className="tabular"
                    aria-describedby={d}
                  />
                )}
              </Field>
            </>
          )}
          {aplicaCampo.plazoEntrega(categoria) && (
            <>
              <Field label="Plazo de entrega" unit="días">
                {(id) => <Input id={id} name="plazoEntrega" type="number" min={0} step={1} defaultValue={i?.plazoEntrega ?? ''} className="tabular" />}
              </Field>
              <Field label="Condiciones" className="sm:col-span-2">
                {(id) => <Input id={id} name="condiciones" defaultValue={i?.condiciones ?? ''} />}
              </Field>
            </>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad sm:col-span-3">
            {error}
          </p>
        )}
      </form>

      {i && (
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <section aria-label="Movimientos">
            <h3 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Movimientos</h3>
            {historial.length === 0 ? (
              <p className="text-[13px] text-ink-3">Sin movimientos. El stock es el inicial.</p>
            ) : (
              <ul className="max-h-56 divide-y divide-rule overflow-y-auto rounded-card border border-rule text-[13px]">
                {historial.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-24 text-ink-3 tabular">{fecha(m.fecha)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {TIPO_MOV[m.tipo] ?? m.tipo}
                      {m.motivo && <span className="text-ink-3"> · {m.motivo}</span>}
                    </span>
                    <span className={Number(m.cantidad) < 0 ? 'font-semibold tabular' : 'font-semibold text-ok tabular'}>
                      {Number(m.cantidad) > 0 ? '+' : ''}
                      {nf(Number(m.cantidad))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="Historial de precios">
            <h3 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Historial de precios</h3>
            {!online ? (
              <p className="text-[13px] text-ink-3">Disponible con conexión.</p>
            ) : !precios ? (
              <div className="h-16 animate-pulse rounded-card bg-sunken" />
            ) : (
              <ul className="max-h-56 divide-y divide-rule overflow-y-auto rounded-card border border-rule text-[13px]">
                {precios.map((p, k) => (
                  <li key={k} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-24 text-ink-3 tabular">{fecha(p.fecha)}</span>
                    <span className="flex-1 text-ink-3">{p.origen === 'compra' ? 'Compra' : 'Manual'}</span>
                    <span className="font-semibold tabular">{clp(p.precio)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}

function AjusteDialog({ insumo, stock, onClose }: { insumo: InsumoRow; stock: number; onClose: () => void }) {
  const { org } = useOrg();
  const { pending, errors, error, run } = useEnLinea(onClose);
  const [modo, setModo] = useState<'conteo' | 'diferencia'>('conteo');
  const [cantidad, setCantidad] = useState('');
  const delta = cantidad === '' ? null : modo === 'conteo' ? Number(cantidad) - stock : Number(cantidad);
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    run(() => ajustarStockAction(org.slug, { ...data, insumoId: insumo.id, modo }), 'Ajuste registrado.');
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Ajustar stock · ${insumo.nombre}`}
      description={`Stock actual: ${nf(stock)} ${insumo.unidad}. El ajuste queda en el historial de movimientos con su motivo.`}
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="ajuste-form" variant="primary" disabled={pending}>
            {pending ? 'Guardando…' : 'Registrar ajuste'}
          </Button>
        </>
      }
    >
      <form id="ajuste-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Cómo ajustar" className="sm:col-span-2">
          {(id) => (
            <Select id={id} value={modo} onChange={(e) => setModo(e.target.value as 'conteo' | 'diferencia')}>
              <option value="conteo">Indicar la cantidad contada</option>
              <option value="diferencia">Indicar la diferencia (+ entra, − sale)</option>
            </Select>
          )}
        </Field>
        <Field
          label={modo === 'conteo' ? 'Cantidad contada' : 'Diferencia'}
          unit={insumo.unidad}
          required
          error={errors.cantidad}
          hint={delta != null && !Number.isNaN(delta) ? `Movimiento: ${delta > 0 ? '+' : ''}${nf(delta)} ${insumo.unidad}` : undefined}
        >
          {(id, d) => (
            <Input
              id={id}
              name="cantidad"
              type="number"
              step="any"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="tabular"
              aria-describedby={d}
              required
            />
          )}
        </Field>
        <Field label="Fecha" required error={errors.fecha}>
          {(id) => <Input id={id} name="fecha" type="date" defaultValue={fechaHoy()} required />}
        </Field>
        <Field label="Motivo" required error={errors.motivo} className="sm:col-span-2">
          {(id, d) => (
            <>
              <Input id={id} name="motivo" list="motivos-ajuste" aria-describedby={d} required />
              <datalist id="motivos-ajuste">
                {MOTIVOS_AJUSTE.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        {error && (
          <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad sm:col-span-2">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
