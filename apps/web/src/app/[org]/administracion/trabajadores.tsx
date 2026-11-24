'use client';
/** Pestaña Trabajadores: ficha con la liquidación estimada en vivo con los indicadores vigentes hoy. */
import { AFPS, AREAS_TRABAJADOR, clp, CONTRATOS, fechaHoy, GRATIFICACIONES, tax, type OrgConfig } from '@winzer/domain';
import { Plus, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Adjuntos } from '@/components/adjuntos';
import { useCan, useOrg } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { EmptyState, Stat, StatGrid } from '@/components/ui/page';
import { ErrorForm, useSubmit } from '../proveedores/comun';
import { deleteTrabajador, saveTrabajador } from './actions';
import type { TrabajadorFila } from './view';

type Remu = OrgConfig['remuneraciones'];
export const AREA = Object.fromEntries(AREAS_TRABAJADOR) as Record<string, string>;
export const CONTRATO = Object.fromEntries(CONTRATOS) as Record<string, string>;
const vigente = (t: TrabajadorFila, hoy: string) => !t.termino || t.termino >= hoy;

export function Trabajadores({ trabajadores, remuneraciones }: { trabajadores: TrabajadorFila[]; remuneraciones: Remu }) {
  const can = useCan();
  const hoy = fechaHoy();
  const [editing, setEditing] = useState<TrabajadorFila | 'nuevo' | null>(null);
  const [todos, setTodos] = useState(false);
  const rows = useMemo(
    () => trabajadores.filter((t) => todos || vigente(t, hoy)).map((t) => ({ ...t, liq: tax.liquidacion(t, remuneraciones) })),
    [trabajadores, todos, hoy, remuneraciones]
  );
  type Fila = (typeof rows)[number];
  const suma = (fn: (f: Fila) => number) => rows.reduce((s, f) => s + fn(f), 0);
  const cols: Column<Fila>[] = [
    { key: 'nombre', label: 'Nombre', render: (t) => <b>{t.nombre}</b> },
    { key: 'rut', label: 'RUT', className: 'tabular' },
    { key: 'cargo', label: 'Cargo' },
    { key: 'area', label: 'Área', value: (t) => AREA[t.area] ?? t.area },
    {
      key: 'contrato',
      label: 'Contrato',
      value: (t) => CONTRATO[t.contrato] ?? t.contrato,
      render: (t) => (t.termino && t.termino < hoy ? <Badge tone="neutral">Terminó</Badge> : (CONTRATO[t.contrato] ?? t.contrato))
    },
    { key: 'sueldoBase', label: 'Sueldo base', num: true, render: (t) => clp(t.sueldoBase) },
    { key: 'liquido', label: 'Líquido est.', num: true, value: (t) => t.liq.liquido, render: (t) => clp(t.liq.liquido) },
    { key: 'costo', label: 'Costo empresa', num: true, value: (t) => t.liq.costoEmpresa, render: (t) => <b>{clp(t.liq.costoEmpresa)}</b> },
    { key: 'vacaciones', label: 'Vacaciones', num: true, value: (t) => t.vacacionesPendientes, render: (t) => `${t.vacacionesPendientes} d` }
  ];
  return (
    <>
      <StatGrid>
        <Stat
          label="Trabajadores"
          value={rows.length}
          sub={todos ? 'Incluye a quienes terminaron' : 'Con contrato vigente'}
          icon={<UserRound size={16} strokeWidth={1.6} />}
        />
        <Stat label="Líquido estimado" value={clp(suma((f) => f.liq.liquido))} sub="Mes completo, sin extras" />
        <Stat label="Costo empresa" value={clp(suma((f) => f.liq.costoEmpresa))} sub={`Con UF ${clp(remuneraciones.uf)} y UTM ${clp(remuneraciones.utm)}`} />
      </StatGrid>
      <DataTable
        rows={rows}
        columns={cols}
        onRowClick={(t) => setEditing(t)}
        exportName="trabajadores"
        canExport={can('administracion', 'x')}
        toolbar={
          <>
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} className="size-4 accent-ink" />
              Mostrar terminados
            </label>
            {can('administracion', 'c') && (
              <Button variant="primary" onClick={() => setEditing('nuevo')}>
                <Plus size={16} /> Nuevo trabajador
              </Button>
            )}
          </>
        }
        empty={
          <EmptyState
            icon={<UserRound size={28} strokeWidth={1.5} />}
            title="Sin trabajadores"
            text="Registra a cada trabajador con su contrato, sueldo y previsión para calcular las remuneraciones del mes."
          />
        }
      />
      {editing && <TrabajadorDialog trabajador={editing === 'nuevo' ? null : editing} remuneraciones={remuneraciones} onClose={() => setEditing(null)} />}
    </>
  );
}

function TrabajadorDialog({ trabajador, remuneraciones, onClose }: { trabajador: TrabajadorFila | null; remuneraciones: Remu; onClose: () => void }) {
  const { org } = useOrg();
  const can = useCan();
  const { pending, errors, error, run } = useSubmit(onClose);
  const t = trabajador;
  const editable = t ? can('administracion', 'e') : can('administracion', 'c');
  const s = (v: number | null | undefined) => (v ? String(v) : '');
  const [f, setF] = useState({
    nombre: t?.nombre ?? '',
    rut: t?.rut ?? '',
    cargo: t?.cargo ?? '',
    area: t?.area ?? 'produccion',
    contrato: t?.contrato ?? 'indefinido',
    ingreso: t?.ingreso ?? fechaHoy(),
    termino: t?.termino ?? '',
    sueldoBase: s(t?.sueldoBase),
    gratificacion: t?.gratificacion ?? 'art50',
    gratificacionMonto: s(t?.gratificacionMonto),
    bonos: s(t?.bonos),
    comisiones: s(t?.comisiones),
    colacion: s(t?.colacion),
    movilizacion: s(t?.movilizacion),
    afp: t?.afp ?? 'Modelo',
    tasaAfp: t?.tasaAfp ? String(t.tasaAfp) : '',
    salud: t?.salud ?? 'Fonasa',
    planSalud: s(t?.planSalud),
    vacacionesPendientes: s(t?.vacacionesPendientes),
    observaciones: t?.observaciones ?? ''
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const liq = tax.liquidacion({ ...f, tasaAfp: Number(f.tasaAfp) || null }, remuneraciones);
  const bajoIMM = Number(f.sueldoBase) > 0 && Number(f.sueldoBase) < remuneraciones.imm;
  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(() => saveTrabajador(org.slug, { ...f, id: t?.id }, t?.version), t ? 'Trabajador actualizado.' : 'Trabajador registrado.');
  }
  const num = (k: keyof typeof f, label: string, extra: { unit?: string; hint?: string } = {}) => (
    <Field label={label} unit={extra.unit ?? 'CLP'} error={errors[k]} hint={extra.hint}>
      {(id, d) => <Input id={id} type="number" min={0} step={1} value={f[k]} onChange={set(k)} aria-describedby={d} className="tabular" />}
    </Field>
  );
  const fila = (l: string, v: number, fuerte = false) => (
    <>
      <dt className={fuerte ? 'font-semibold text-ink' : 'text-ink-3'}>{l}</dt>
      <dd className={`text-right tabular ${fuerte ? 'font-bold text-ink' : ''}`}>{clp(v)}</dd>
    </>
  );
  const seccion = (titulo: string) => <h3 className="mt-1 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase sm:col-span-2">{titulo}</h3>;
  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={t ? t.nombre : 'Nuevo trabajador'}
      description="La liquidación se estima con los indicadores vigentes hoy; la de cada mes usa los de ese mes."
      footer={
        <>
          {t && can('administracion', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() =>
                confirm(`¿Eliminar a ${t.nombre}? Si ya tiene remuneraciones, registra su fecha de término.`) &&
                run(() => deleteTrabajador(org.slug, t.id), 'Trabajador eliminado.')
              }
            >
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            {editable ? 'Cancelar' : 'Cerrar'}
          </Button>
          {editable && (
            <Button type="submit" form="trabajador-form" variant="primary" disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar'}
            </Button>
          )}
        </>
      }
    >
      <form id="trabajador-form" onSubmit={submit} className="grid gap-x-6 gap-y-4 lg:grid-cols-[1fr_17rem]">
        <fieldset disabled={!editable} className="grid content-start gap-4 sm:grid-cols-2">
          <legend className="sr-only">Ficha del trabajador</legend>
          {seccion('Datos personales')}
          <Field label="Nombre" required error={errors.nombre}>
            {(id, d) => <Input id={id} value={f.nombre} onChange={set('nombre')} aria-describedby={d} required />}
          </Field>
          <Field label="RUT" required error={errors.rut}>
            {(id, d) => <Input id={id} value={f.rut} onChange={set('rut')} aria-describedby={d} placeholder="12.345.678-5" required />}
          </Field>
          {seccion('Contrato')}
          <Field label="Cargo" required error={errors.cargo}>
            {(id, d) => <Input id={id} value={f.cargo} onChange={set('cargo')} aria-describedby={d} required />}
          </Field>
          <Field label="Área">
            {(id) => (
              <Select id={id} value={f.area} onChange={set('area')}>
                {AREAS_TRABAJADOR.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Tipo de contrato">
            {(id) => (
              <Select id={id} value={f.contrato} onChange={set('contrato')}>
                {CONTRATOS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Ingreso" error={errors.ingreso}>
            {(id, d) => <Input id={id} type="date" value={f.ingreso} onChange={set('ingreso')} aria-describedby={d} />}
          </Field>
          <Field label="Término" error={errors.termino} hint="Desde el mes siguiente ya no se calcula.">
            {(id, d) => <Input id={id} type="date" value={f.termino} onChange={set('termino')} aria-describedby={d} />}
          </Field>
          {seccion('Remuneración')}
          <Field
            label="Sueldo base"
            unit="CLP"
            required
            error={errors.sueldoBase}
            hint={bajoIMM ? `Bajo el ingreso mínimo (${clp(remuneraciones.imm)}): verifica si es jornada parcial.` : undefined}
          >
            {(id, d) => (
              <Input
                id={id}
                type="number"
                min={1}
                step={1}
                value={f.sueldoBase}
                onChange={set('sueldoBase')}
                aria-describedby={d}
                className="tabular"
                required
              />
            )}
          </Field>
          <Field label="Gratificación">
            {(id) => (
              <Select id={id} value={f.gratificacion} onChange={set('gratificacion')}>
                {GRATIFICACIONES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {f.gratificacion === 'fija' && num('gratificacionMonto', 'Gratificación mensual')}
          {num('bonos', 'Bonos fijos')}
          {num('comisiones', 'Comisiones habituales')}
          {num('colacion', 'Colación', { hint: 'No imponible.' })}
          {num('movilizacion', 'Movilización', { hint: 'No imponible.' })}
          {seccion('Previsión')}
          <Field label="AFP">
            {(id) => (
              <Select id={id} value={f.afp} onChange={set('afp')}>
                {AFPS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Tasa AFP" error={errors.tasaAfp} hint={`Fracción (ej. 0,1127). Vacía = ${(remuneraciones.afp * 100).toLocaleString('es-CL')} %.`}>
            {(id, d) => (
              <Input
                id={id}
                type="number"
                min={0.1}
                max={0.13}
                step={0.0001}
                value={f.tasaAfp}
                onChange={set('tasaAfp')}
                aria-describedby={d}
                className="tabular"
              />
            )}
          </Field>
          <Field label="Salud">
            {(id) => (
              <Select id={id} value={f.salud} onChange={set('salud')}>
                <option>Fonasa</option>
                <option>Isapre</option>
              </Select>
            )}
          </Field>
          {f.salud === 'Isapre' ? num('planSalud', 'Plan Isapre', { hint: 'Mensual en pesos.' }) : <span />}
          {seccion('Otros')}
          {num('vacacionesPendientes', 'Vacaciones pendientes', { unit: 'días' })}
          <Field label="Observaciones" className="sm:col-span-2">
            {(id) => <Textarea id={id} value={f.observaciones} onChange={set('observaciones')} placeholder="Licencias, permisos, acuerdos…" />}
          </Field>
        </fieldset>
        <aside aria-label="Liquidación estimada" className="self-start rounded-card bg-sunken px-4 py-3 text-[13px] lg:sticky lg:top-0">
          <p className="mb-2 font-semibold text-ink-2">Liquidación estimada</p>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
            {fila('Imponible', liq.imponible)}
            {fila('AFP', liq.afp)}
            {fila('Salud', liq.salud)}
            {fila('Seguro de cesantía', liq.cesantia)}
            {fila('Impuesto único', liq.impuestoUnico)}
            {fila('No imponibles', liq.noImponible)}
            {fila('Líquido', liq.liquido, true)}
            {fila('Aportes del empleador', liq.cesantiaEmpleador + liq.sis + liq.aporteEmpleador)}
            {fila('Costo empresa', liq.costoEmpresa, true)}
          </dl>
        </aside>
        <ErrorForm error={error} className="lg:col-span-2" />
      </form>
      {t && <Adjuntos entidad="trabajador" registroId={t.id} />}
    </Dialog>
  );
}
