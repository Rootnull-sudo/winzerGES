'use client';
/**
 * Pestaña Remuneraciones: el mes se calcula con SUS indicadores (UF, UTM, IMM y topes al último día del periodo) y
 * cada liquidación guarda esa foto. Las pagadas no se recalculan; las novedades del mes se ingresan por trabajador.
 */
import { clp, fechaHoy, nombrePeriodo, rangoPeriodo, type OrgConfig } from '@winzer/domain';
import { Calculator, FileText, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useCan, useOrg } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { EmptyState, Stat, StatGrid } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { ErrorForm, fecha, useSubmit } from '../proveedores/comun';
import { calcularMesAction, deleteRemuneracion, pagarRemuneracion, revertirRemuneracion, saveNovedades } from './actions';
import type { RemuneracionFila } from './view';

type Remu = OrgConfig['remuneraciones'];
const nf = (v: number) => v.toLocaleString('es-CL', { maximumFractionDigits: 2 });

export function Remuneraciones({ periodo, filas, indicadores }: { periodo: string; filas: RemuneracionFila[]; indicadores: Remu }) {
  const { org } = useOrg();
  const can = useCan();
  const toast = useToast();
  const router = useRouter();
  const [calculando, start] = useTransition();
  const [abierta, setAbierta] = useState<RemuneracionFila | null>(null);
  const rows = [...filas].sort((a, b) => a.trabajadorFoto.nombre.localeCompare(b.trabajadorFoto.nombre));
  const suma = (k: keyof RemuneracionFila) => rows.reduce((s, r) => s + Number(r[k]), 0);
  const pagadas = rows.filter((r) => r.estado === 'pagada').length;

  function irA(p: string) {
    const u = new URL(window.location.href);
    u.searchParams.set('tab', 'remuneraciones');
    u.searchParams.set('periodo', p);
    router.push(`${u.pathname}${u.search}`);
  }
  function calcular() {
    if (rows.length && !confirm(`¿Recalcular ${nombrePeriodo(periodo)}? Las pagadas no se modifican; las calculadas conservan sus novedades.`)) return;
    start(async () => {
      const r = await calcularMesAction(org.slug, periodo);
      if (!r.ok) return toast(r.error);
      toast(`${r.calculadas} remuneraciones calculadas${r.omitidasPagadas ? ` (${r.omitidasPagadas} pagadas sin cambios)` : ''}.`);
      router.refresh();
    });
  }

  const cols: Column<RemuneracionFila>[] = [
    { key: 'nombre', label: 'Trabajador', value: (r) => r.trabajadorFoto.nombre, render: (r) => <b>{r.trabajadorFoto.nombre}</b> },
    { key: 'dias', label: 'Días', num: true, value: (r) => r.diasTrabajados },
    { key: 'imponible', label: 'Imponible', num: true, render: (r) => clp(r.imponible) },
    { key: 'afp', label: 'AFP', num: true, render: (r) => clp(r.afp) },
    { key: 'salud', label: 'Salud', num: true, render: (r) => clp(r.salud) },
    { key: 'cesantia', label: 'Cesantía', num: true, render: (r) => clp(r.cesantia) },
    { key: 'impuestoUnico', label: 'Imp. único', num: true, render: (r) => clp(r.impuestoUnico) },
    { key: 'liquido', label: 'Líquido', num: true, render: (r) => <b>{clp(r.liquido)}</b> },
    { key: 'costoEmpresa', label: 'Costo empresa', num: true, render: (r) => clp(r.costoEmpresa) },
    {
      key: 'estado',
      label: 'Estado',
      value: (r) => r.estado,
      render: (r) => (r.estado === 'pagada' ? <Badge tone="ok">Pagada {r.fechaPago ? fecha(r.fechaPago) : ''}</Badge> : <Badge tone="warn">Por pagar</Badge>)
    }
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="w-48">
          <Field label="Mes">{(id) => <Input id={id} type="month" value={periodo} onChange={(e) => e.target.value && irA(e.target.value)} />}</Field>
        </div>
        <p aria-label="Indicadores del mes" className="text-[13px] text-ink-2">
          Indicadores al {fecha(rangoPeriodo(periodo).hasta)}: UF <b className="tabular">{clp(indicadores.uf)}</b> · UTM{' '}
          <b className="tabular">{clp(indicadores.utm)}</b> · IMM <b className="tabular">{clp(indicadores.imm)}</b> · tope {nf(indicadores.topeImponibleUF)} UF
        </p>
        {can('administracion', 'c') && (
          <Button variant="primary" onClick={calcular} disabled={calculando}>
            <Calculator size={16} /> {calculando ? 'Calculando…' : rows.length ? 'Recalcular mes' : 'Calcular mes'}
          </Button>
        )}
      </div>
      <StatGrid>
        <Stat label="Total imponible" value={clp(suma('imponible'))} sub={nombrePeriodo(periodo)} icon={<Wallet size={16} strokeWidth={1.6} />} />
        <Stat label="Total líquido" value={clp(suma('liquido'))} sub={`${pagadas} de ${rows.length} pagadas`} />
        <Stat label="Impuesto único" value={clp(suma('impuestoUnico'))} sub="Va al F29 del mes" />
        <Stat label="Costo empresa" value={clp(suma('costoEmpresa'))} />
      </StatGrid>
      <DataTable
        rows={rows}
        columns={cols}
        onRowClick={(r) => setAbierta(r)}
        exportName={`remuneraciones-${periodo}`}
        canExport={can('administracion', 'x')}
        empty={
          <EmptyState
            icon={<Calculator size={28} strokeWidth={1.5} />}
            title={`Sin remuneraciones de ${nombrePeriodo(periodo)}`}
            text="Calcula el mes: se genera una liquidación por cada trabajador vigente, con los indicadores de ese mes."
          />
        }
      />
      {abierta && <RemuneracionDialog r={abierta} onClose={() => setAbierta(null)} />}
    </>
  );
}

function RemuneracionDialog({ r, onClose }: { r: RemuneracionFila; onClose: () => void }) {
  const { org } = useOrg();
  const can = useCan();
  const { pending, errors, error, run } = useSubmit(onClose);
  const pagada = r.estado === 'pagada';
  const editable = !pagada && can('administracion', 'e');
  const [nov, setNov] = useState({
    diasTrabajados: String(r.diasTrabajados),
    horasExtra: r.horasExtraCantidad ? String(r.horasExtraCantidad) : '',
    bonos: r.bonos ? String(r.bonos) : '',
    comisiones: r.comisiones ? String(r.comisiones) : '',
    anticipos: r.anticipos ? String(r.anticipos) : ''
  });
  const [fechaPago, setFechaPago] = useState(fechaHoy());
  const set = (k: keyof typeof nov) => (e: React.ChangeEvent<HTMLInputElement>) => setNov({ ...nov, [k]: e.target.value });
  const campo = (k: keyof typeof nov, label: string, unit?: string) => (
    <Field label={label} unit={unit} error={errors[k]}>
      {(id, d) => (
        <Input id={id} type="number" min={0} step={k === 'horasExtra' ? 0.5 : 1} value={nov[k]} onChange={set(k)} aria-describedby={d} className="tabular" />
      )}
    </Field>
  );
  const fila = (l: string, v: number, fuerte = false) => (
    <>
      <dt className={fuerte ? 'font-semibold text-ink' : 'text-ink-3'}>{l}</dt>
      <dd className={`text-right tabular ${fuerte ? 'font-bold text-ink' : ''}`}>{clp(v)}</dd>
    </>
  );
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`${r.trabajadorFoto.nombre} · ${nombrePeriodo(r.periodo)}`}
      description={
        pagada
          ? `Pagada el ${r.fechaPago ? fecha(r.fechaPago) : '—'}: no se recalcula.`
          : 'Ingresa las novedades del mes: la liquidación se recalcula con los indicadores de este mes.'
      }
      footer={
        <>
          {!pagada && can('administracion', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() => confirm('¿Eliminar esta remuneración?') && run(() => deleteRemuneracion(org.slug, r.id), 'Remuneración eliminada.')}
            >
              Eliminar
            </Button>
          )}
          <Link
            href={`/${org.slug}/administracion/liquidacion/${r.id}`}
            className="inline-flex h-10 items-center gap-1.5 rounded-control px-4 text-[14px] font-medium text-ink-2 hover:bg-sunken hover:text-ink"
          >
            <FileText size={16} /> Ver liquidación
          </Link>
          {pagada && can('administracion', 'e') && (
            <Button type="button" disabled={pending} onClick={() => run(() => revertirRemuneracion(org.slug, r.id), 'Pago revertido.')}>
              Revertir pago
            </Button>
          )}
          {editable && (
            <Button type="submit" form="novedades-form" variant="primary" disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar novedades'}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-[1fr_15rem]">
        <div className="grid content-start gap-4">
          <form id="novedades-form" onSubmit={(e) => (e.preventDefault(), run(() => saveNovedades(org.slug, r.id, nov), 'Novedades guardadas.'))}>
            <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-1 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Novedades del mes</legend>
              {campo('diasTrabajados', 'Días trabajados', 'de 30')}
              {campo('horasExtra', 'Horas extra', 'h')}
              {campo('bonos', 'Bonos', 'CLP')}
              {campo('comisiones', 'Comisiones', 'CLP')}
              {campo('anticipos', 'Anticipos', 'CLP')}
            </fieldset>
          </form>
          {!pagada && can('administracion', 'e') && (
            <div className="flex flex-wrap items-end gap-3 border-t border-rule pt-4">
              <Field label="Fecha de pago">{(id) => <Input id={id} type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />}</Field>
              <Button type="button" disabled={pending} onClick={() => run(() => pagarRemuneracion(org.slug, r.id, fechaPago), 'Remuneración pagada.')}>
                Marcar pagada
              </Button>
            </div>
          )}
          <ErrorForm error={error} />
        </div>
        <aside aria-label="Liquidación del mes" className="self-start rounded-card bg-sunken px-4 py-3 text-[13px]">
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
            {fila('Imponible', r.imponible)}
            {r.horasExtra > 0 && fila('Horas extra', r.horasExtra)}
            {fila('Descuentos', r.descuentos)}
            {r.anticipos > 0 && fila('Anticipos', r.anticipos)}
            {fila('Líquido', r.liquido, true)}
            {fila('Costo empresa', r.costoEmpresa)}
          </dl>
        </aside>
      </div>
    </Dialog>
  );
}
