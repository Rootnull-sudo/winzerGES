'use client';
/**
 * Inventarios (F5-5; v1: modules/inventarios). Producto terminado por orden y formato, vino a granel por estanque y
 * lote, insumos y movimientos de producto. Todo se deriva de los libros; corregir es registrar un ajuste
 * (quiebre, muestra o conteo físico), nunca editar el stock.
 */
import { CATEGORIAS_INSUMO, clp, deltaAjusteProducto, fechaHoy, stockPorFormato, TIPOS_MOV_PRODUCTO } from '@winzer/domain';
import { Boxes, Package, Plus, Wine } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCan, useOrg } from '@/components/shell/org-context';
import { Badge, TipoUva } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BarrasH, ChartCard } from '@/components/ui/chart';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState, Stat, StatGrid } from '@/components/ui/page';
import { Tabs, useTab } from '@/components/ui/tabs';
import { cn } from '@/lib/cn';
import { AjusteDialog } from '../insumos/view';
import { ErrorForm, fecha, useSubmit } from '../proveedores/comun';
import { ajustarProductoAction } from './actions';

export interface ProductoFila {
  id: string;
  codigo: string | null;
  formatoId: string;
  lote: string | null;
  variedad: string | null;
  anada: number | null;
  fecha: string;
  producidas: number;
  stock: number;
  /** null si el rol no ve costos. */
  costoUnitario: number | null;
}
export interface DatosInventario {
  verCostos: boolean;
  formatos: { id: string; nombre: string; stockMinimo: number }[];
  producto: ProductoFila[];
  granel: {
    id: string;
    estanque: string;
    lote: string;
    variedad: string | null;
    tipo: string | null;
    anada: number | null;
    litros: number;
    costoLitro: number | null;
  }[];
  insumos: {
    id: string;
    nombre: string;
    tipo: string | null;
    categoria: string;
    unidad: string;
    vencimiento: string | null;
    minimo: number | null;
    stock: number;
    precio: number | null;
  }[];
  movimientos: {
    id: string;
    fecha: string;
    ordenEnvasadoId: string;
    codigo: string | null;
    formatoId: string;
    unidades: number;
    tipo: string;
    motivo: string | null;
  }[];
}

const TABS = [
  { id: 'producto', label: 'Producto terminado' },
  { id: 'granel', label: 'Vino a granel' },
  { id: 'envasado', label: 'Insumos de envasado' },
  { id: 'agricola', label: 'Insumos agrícolas y enológicos' },
  { id: 'movimientos', label: 'Movimientos de producto' }
] as const;
const nf = (v: number, d = 0) => v.toLocaleString('es-CL', { maximumFractionDigits: d });
const TIPO_MOV = Object.fromEntries(TIPOS_MOV_PRODUCTO) as Record<string, string>;
const CATEGORIA = Object.fromEntries(CATEGORIAS_INSUMO) as Record<string, string>;
const millones = (v: number) => (Math.abs(v) >= 1e6 ? `$${nf(v / 1e6, 1)} M` : clp(Math.round(v)));

export function InventariosView({ datos }: { datos: DatosInventario }) {
  const can = useCan();
  const [tab, setTab] = useTab(TABS);
  const [ajuste, setAjuste] = useState<{ ordenId?: string } | null>(null);
  const [ajusteInsumo, setAjusteInsumo] = useState<DatosInventario['insumos'][number] | null>(null);
  const costos = datos.verCostos;
  const fmt = useMemo(() => new Map(datos.formatos.map((f) => [f.id, f])), [datos.formatos]);
  const porFormato = useMemo(
    () => stockPorFormato(datos.producto.map((p) => ({ formatoId: p.formatoId, stock: p.stock, costoUnitario: p.costoUnitario }))),
    [datos.producto]
  );
  const bajoMinimo = datos.formatos.filter((f) => f.stockMinimo > 0 && (porFormato[f.id]?.unidades ?? 0) < f.stockMinimo);
  const unidades = Object.values(porFormato).reduce((s, g) => s + g.unidades, 0);
  const valorProducto = Object.values(porFormato).reduce((s, g) => s + g.valor, 0);
  const litros = datos.granel.reduce((s, g) => s + g.litros, 0);
  const valorGranel = datos.granel.reduce((s, g) => s + g.litros * (g.costoLitro ?? 0), 0);
  const valorInsumos = datos.insumos.reduce((s, i) => s + Math.max(0, i.stock) * (i.precio ?? 0), 0);

  return (
    <>
      <StatGrid>
        <Stat
          label="Producto terminado"
          value={`${nf(unidades)} un`}
          sub={costos ? `Valorizado ${millones(valorProducto)}` : 'Todas las presentaciones'}
          icon={<Wine size={16} strokeWidth={1.6} />}
        />
        <Stat
          label="Vino a granel"
          value={`${nf(litros)} L`}
          sub={costos ? `Valorizado ${millones(valorGranel)}` : 'En estanques'}
          icon={<Boxes size={16} strokeWidth={1.6} />}
        />
        <Stat
          label="Insumos"
          value={`${nf(datos.insumos.length)} ítems`}
          sub={costos ? `Valorizado ${millones(valorInsumos)}` : undefined}
          icon={<Package size={16} strokeWidth={1.6} />}
        />
        <Stat
          label="Formatos bajo el mínimo"
          value={<span className={cn(bajoMinimo.length > 0 && 'text-warn')}>{bajoMinimo.length}</span>}
          sub={bajoMinimo.length ? bajoMinimo.map((f) => f.nombre).join(', ') : 'Todos sobre su mínimo'}
        />
      </StatGrid>
      <Tabs tabs={TABS} actual={tab} onChange={setTab} />

      {tab === 'producto' && (
        <Producto datos={datos} porFormato={porFormato} fmt={fmt} onAjustar={can('inventarios', 'c') ? (ordenId) => setAjuste({ ordenId }) : undefined} />
      )}
      {tab === 'granel' && <Granel datos={datos} />}
      {(tab === 'envasado' || tab === 'agricola') && (
        <Insumos
          filas={datos.insumos.filter((i) => (tab === 'envasado' ? ['envasado', 'etiquetado'] : ['agricola', 'enologico']).includes(i.categoria))}
          costos={costos}
          nombre={`inventario-insumos-${tab}`}
          onAjustar={can('insumos', 'c') ? setAjusteInsumo : undefined}
        />
      )}
      {tab === 'movimientos' && <Movimientos datos={datos} fmt={fmt} />}

      {ajuste && <AjusteProducto productos={datos.producto} fmt={fmt} inicial={ajuste.ordenId} onClose={() => setAjuste(null)} />}
      {ajusteInsumo && <AjusteDialog insumo={ajusteInsumo} stock={ajusteInsumo.stock} onClose={() => setAjusteInsumo(null)} />}
    </>
  );
}

function Producto({
  datos,
  porFormato,
  fmt,
  onAjustar
}: {
  datos: DatosInventario;
  porFormato: Record<string, { unidades: number; valor: number }>;
  fmt: Map<string, DatosInventario['formatos'][number]>;
  onAjustar?: (ordenId?: string) => void;
}) {
  const can = useCan();
  const costos = datos.verCostos;
  const cols: Column<ProductoFila>[] = [
    { key: 'formato', label: 'Formato', value: (p) => fmt.get(p.formatoId)?.nombre ?? '' },
    { key: 'variedad', label: 'Vino', value: (p) => p.variedad ?? '' },
    { key: 'anada', label: 'Añada', num: true, value: (p) => p.anada ?? '' },
    { key: 'lote', label: 'Lote', value: (p) => p.lote ?? '' },
    { key: 'codigo', label: 'Orden', value: (p) => p.codigo ?? '' },
    { key: 'producidas', label: 'Producidas', num: true, render: (p) => nf(p.producidas) },
    { key: 'stock', label: 'Stock', num: true, render: (p) => <b className={cn(p.stock <= 0 && 'text-ink-4')}>{nf(p.stock)}</b> },
    ...(costos
      ? ([
          { key: 'costo', label: 'Costo unit.', num: true, value: (p) => p.costoUnitario ?? 0, render: (p) => clp(Math.round(p.costoUnitario ?? 0)) },
          {
            key: 'valor',
            label: 'Valor',
            num: true,
            value: (p) => p.stock * (p.costoUnitario ?? 0),
            render: (p) => clp(Math.round(p.stock * (p.costoUnitario ?? 0)))
          }
        ] satisfies Column<ProductoFila>[])
      : [])
  ];
  return (
    <>
      <ChartCard titulo="Stock por formato" nota="Unidades disponibles; la línea de detalle indica el mínimo del formato." className="mb-4">
        <BarrasH
          items={datos.formatos.map((f) => ({
            id: f.id,
            etiqueta: f.nombre,
            detalle: f.stockMinimo ? `mín. ${nf(f.stockMinimo)}` : undefined,
            valor: porFormato[f.id]?.unidades ?? 0
          }))}
          formato={(v) => `${nf(v)} un`}
          vacio="Sin producto terminado."
        />
      </ChartCard>
      <DataTable
        rows={[...datos.producto].sort((a, b) => b.stock - a.stock)}
        columns={cols}
        onRowClick={onAjustar ? (p) => onAjustar(p.id) : undefined}
        exportName="inventario-producto-terminado"
        canExport={can('inventarios', 'x')}
        toolbar={
          onAjustar && (
            <Button variant="primary" onClick={() => onAjustar()} disabled={!datos.producto.some((p) => p.stock > 0)}>
              <Plus size={16} /> Ajuste de producto
            </Button>
          )
        }
        empty={
          <EmptyState icon={<Wine size={28} strokeWidth={1.5} />} title="Sin producto terminado" text="Confirma órdenes de envasado para generar stock." />
        }
      />
    </>
  );
}

function Granel({ datos }: { datos: DatosInventario }) {
  const can = useCan();
  type Fila = DatosInventario['granel'][number];
  const cols: Column<Fila>[] = [
    { key: 'estanque', label: 'Estanque', render: (g) => <b>{g.estanque}</b> },
    { key: 'lote', label: 'Lote' },
    { key: 'variedad', label: 'Variedad', value: (g) => g.variedad ?? '' },
    { key: 'tipo', label: 'Tipo', value: (g) => g.tipo ?? '', render: (g) => <TipoUva tipo={g.tipo} /> },
    { key: 'anada', label: 'Añada', num: true, value: (g) => g.anada ?? '' },
    { key: 'litros', label: 'Litros', num: true, render: (g) => <b>{nf(g.litros)}</b> },
    ...(datos.verCostos
      ? ([
          { key: 'costoLitro', label: '$/L', num: true, value: (g) => g.costoLitro ?? 0, render: (g) => clp(Math.round(g.costoLitro ?? 0)) },
          {
            key: 'valor',
            label: 'Valor',
            num: true,
            value: (g) => g.litros * (g.costoLitro ?? 0),
            render: (g) => clp(Math.round(g.litros * (g.costoLitro ?? 0)))
          }
        ] satisfies Column<Fila>[])
      : [])
  ];
  return (
    <DataTable
      rows={datos.granel}
      columns={cols}
      exportName="inventario-granel"
      canExport={can('inventarios', 'x')}
      empty={<EmptyState title="Sin vino a granel" text="Los litros por estanque y lote vienen de los movimientos de bodega." />}
    />
  );
}

type InsumoFila = DatosInventario['insumos'][number];
function Insumos({ filas, costos, nombre, onAjustar }: { filas: InsumoFila[]; costos: boolean; nombre: string; onAjustar?: (i: InsumoFila) => void }) {
  const can = useCan();
  const hoy = fechaHoy();
  const cols: Column<InsumoFila>[] = [
    { key: 'nombre', label: 'Insumo', render: (i) => <b>{i.nombre}</b> },
    { key: 'tipo', label: 'Tipo', value: (i) => i.tipo ?? '' },
    { key: 'categoria', label: 'Categoría', value: (i) => CATEGORIA[i.categoria] ?? i.categoria },
    {
      key: 'stock',
      label: 'Stock',
      num: true,
      value: (i) => i.stock,
      render: (i) =>
        i.minimo != null && i.stock < i.minimo ? (
          <Badge tone="warn">
            {nf(i.stock, 2)} {i.unidad}
          </Badge>
        ) : (
          `${nf(i.stock, 2)} ${i.unidad}`
        )
    },
    { key: 'minimo', label: 'Mínimo', num: true, value: (i) => i.minimo ?? '', render: (i) => (i.minimo != null ? nf(i.minimo, 2) : '—') },
    ...(costos
      ? ([
          { key: 'precio', label: 'Precio', num: true, value: (i) => i.precio ?? 0, render: (i) => clp(i.precio ?? 0) },
          {
            key: 'valor',
            label: 'Valor',
            num: true,
            value: (i) => Math.max(0, i.stock) * (i.precio ?? 0),
            render: (i) => clp(Math.round(Math.max(0, i.stock) * (i.precio ?? 0)))
          }
        ] satisfies Column<InsumoFila>[])
      : []),
    {
      key: 'vencimiento',
      label: 'Vence',
      value: (i) => i.vencimiento ?? '',
      render: (i) =>
        i.vencimiento ? (
          <span className={cn(i.vencimiento < hoy ? 'text-bad' : i.vencimiento <= sumarDias(hoy, 30) && 'text-warn')}>{fecha(i.vencimiento)}</span>
        ) : (
          '—'
        )
    }
  ];
  return (
    <DataTable
      rows={filas}
      columns={cols}
      onRowClick={onAjustar}
      exportName={nombre}
      canExport={can('inventarios', 'x')}
      empty={<EmptyState title="Sin insumos en esta categoría" />}
    />
  );
}

function sumarDias(d: string, n: number) {
  const x = new Date(`${d}T12:00:00`);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
}

function Movimientos({ datos, fmt }: { datos: DatosInventario; fmt: Map<string, DatosInventario['formatos'][number]> }) {
  const can = useCan();
  type Fila = DatosInventario['movimientos'][number];
  const cols: Column<Fila>[] = [
    { key: 'fecha', label: 'Fecha', render: (m) => fecha(m.fecha) },
    { key: 'codigo', label: 'Orden', value: (m) => m.codigo ?? '' },
    { key: 'formato', label: 'Formato', value: (m) => fmt.get(m.formatoId)?.nombre ?? '' },
    { key: 'tipo', label: 'Tipo', value: (m) => TIPO_MOV[m.tipo] ?? m.tipo },
    {
      key: 'unidades',
      label: 'Unidades',
      num: true,
      render: (m) => (
        <span className={cn('font-medium', m.unidades < 0 ? 'text-bad' : 'text-ok')}>
          {m.unidades > 0 ? '+' : ''}
          {nf(m.unidades)}
        </span>
      )
    },
    { key: 'motivo', label: 'Motivo', value: (m) => m.motivo ?? '' }
  ];
  return (
    <DataTable
      rows={datos.movimientos}
      columns={cols}
      exportName="movimientos-producto"
      canExport={can('inventarios', 'x')}
      empty={<EmptyState title="Sin movimientos de producto" />}
    />
  );
}

const MOTIVOS = ['Toma de inventario', 'Botella quebrada', 'Muestra a cliente', 'Degustación', 'Concurso', 'Error de registro'];

function AjusteProducto({
  productos,
  fmt,
  inicial,
  onClose
}: {
  productos: ProductoFila[];
  fmt: Map<string, DatosInventario['formatos'][number]>;
  inicial?: string;
  onClose: () => void;
}) {
  const { org } = useOrg();
  const { pending, errors, error, run } = useSubmit(onClose);
  const [ordenId, setOrdenId] = useState(inicial ?? productos.find((p) => p.stock > 0)?.id ?? '');
  const [tipo, setTipo] = useState<'quiebre' | 'muestra' | 'ajuste'>('quiebre');
  const [cantidad, setCantidad] = useState('');
  const p = productos.find((x) => x.id === ordenId);
  const stock = p?.stock ?? 0;
  const delta = cantidad === '' || Number.isNaN(Number(cantidad)) ? null : deltaAjusteProducto(tipo, Number(cantidad), stock);
  const nombre = (x: ProductoFila) => `${x.codigo ?? 'Orden'} · ${fmt.get(x.formatoId)?.nombre ?? ''}${x.variedad ? ` · ${x.variedad}` : ''}`;
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    run(() => ajustarProductoAction(org.slug, { ...data, ordenEnvasadoId: ordenId, tipo, cantidad }), 'Ajuste registrado.');
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Ajuste de producto terminado"
      description="Queda como un movimiento con su motivo; el stock se recalcula desde los movimientos."
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="ajuste-producto" variant="primary" disabled={pending || !ordenId}>
            {pending ? 'Guardando…' : 'Registrar ajuste'}
          </Button>
        </>
      }
    >
      <form id="ajuste-producto" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Producto" required error={errors.ordenEnvasadoId} className="sm:col-span-2">
          {(id) => (
            <Select id={id} value={ordenId} onChange={(e) => setOrdenId(e.target.value)} required>
              <option value="" disabled>
                Elige una orden…
              </option>
              {productos.map((x) => (
                <option key={x.id} value={x.id}>
                  {nombre(x)} ({nf(x.stock)} un)
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Tipo">
          {(id) => (
            <Select id={id} value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
              <option value="quiebre">Quiebre</option>
              <option value="muestra">Muestra</option>
              <option value="ajuste">Conteo físico</option>
            </Select>
          )}
        </Field>
        <Field
          label={tipo === 'ajuste' ? 'Unidades contadas' : 'Unidades que salen'}
          unit="un"
          required
          error={errors.cantidad}
          hint={delta != null ? `Stock ${nf(stock)} → ${nf(stock + delta)} (${delta > 0 ? '+' : ''}${nf(delta)})` : `Stock actual: ${nf(stock)} un`}
        >
          {(id, d) => (
            <Input
              id={id}
              type="number"
              min={0}
              step={1}
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
        <Field label="Motivo" error={errors.motivo}>
          {(id, d) => (
            <>
              <Input id={id} name="motivo" list="motivos-producto" aria-describedby={d} />
              <datalist id="motivos-producto">
                {MOTIVOS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <ErrorForm error={error} className="sm:col-span-2" />
      </form>
    </Dialog>
  );
}
