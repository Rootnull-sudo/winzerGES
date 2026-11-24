'use client';
/**
 * Cumplimiento normativo (F6-4; v1: modules/cumplimiento). Estado de cada obligación según su vencimiento y días de
 * aviso, declaraciones SAG del año, verificaciones automáticas y libro de existencias en CSV.
 */
import { csvExistencias, estadoCumplimiento, recordatoriosSag, TIPOS_CUMPLIMIENTO, type EstadoCumplimiento, type FilaExistencias } from '@winzer/domain';
import { Download, Plus, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Adjuntos } from '@/components/adjuntos';
import { useCan, useOrg } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState, Stat, StatGrid } from '@/components/ui/page';
import { cn } from '@/lib/cn';
import { ErrorForm, fecha, useSubmit } from '../proveedores/comun';
import { deleteCumplimiento, saveCumplimiento } from './actions';

interface Registro {
  id: string;
  version: number;
  demo: boolean;
  nombre: string;
  tipo: string;
  numero: string | null;
  estado: string;
  fecha: string | null;
  vencimiento: string | null;
  avisoDias: number;
  responsable: string | null;
  notas: string | null;
}
export interface DatosCumplimiento {
  hoy: string;
  registros: Registro[];
  controles: { lotesSinAnalisis: string[]; ordenesDoSinRespaldo: string[]; faltaInscripcion: boolean };
  existencias: FilaExistencias[];
  kgTemporada: number;
  temporada: number | null;
  calendario: { clave: string; nombre: string; fecha: string; estado: string; dias: number }[];
}

const TONO: Record<EstadoCumplimiento, 'ok' | 'warn' | 'bad' | 'info'> = { vigente: 'ok', 'por vencer': 'warn', vencido: 'bad', pendiente: 'info' };
const ETIQUETA: Record<EstadoCumplimiento, string> = { vigente: 'Vigente', 'por vencer': 'Por vencer', vencido: 'Vencido', pendiente: 'Pendiente' };
const nf = (v: number) => v.toLocaleString('es-CL', { maximumFractionDigits: 0 });
const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

function Aviso({
  tono,
  titulo,
  children,
  enlace
}: {
  tono: 'ok' | 'warn' | 'bad' | 'info';
  titulo: string;
  children?: React.ReactNode;
  enlace?: React.ReactNode;
}) {
  const c = { ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', info: 'bg-info-soft text-info' }[tono];
  return (
    <div className={cn('rounded-control px-3 py-2 text-[13px]', c)}>
      <b>{titulo}</b>
      {children && <span className="block text-ink-2">{children}</span>}
      {enlace}
    </div>
  );
}

export function CumplimientoView({ datos }: { datos: DatosCumplimiento }) {
  const can = useCan();
  const [editando, setEditando] = useState<Registro | 'nuevo' | null>(null);
  const [tipo, setTipo] = useState('');
  const estados = datos.registros.map((r) => estadoCumplimiento(r, datos.hoy));
  const cuenta = (e: EstadoCumplimiento) => estados.filter((x) => x === e).length;
  const sag = recordatoriosSag(datos.hoy);
  const litros = datos.existencias.reduce((s, f) => s + f.litros, 0);
  const c = datos.controles;
  function descargar() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csvExistencias(datos.existencias)], { type: 'text/csv;charset=utf-8' }));
    a.download = `libro-existencias-${datos.hoy}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const filas = [...datos.registros].filter((r) => !tipo || r.tipo === tipo).sort((a, b) => (a.vencimiento ?? '9999').localeCompare(b.vencimiento ?? '9999'));
  const cols: Column<Registro>[] = [
    {
      key: 'nombre',
      label: 'Obligación',
      render: (r) => (
        <span className="font-medium">
          {r.nombre}
          {r.demo && <Badge className="ml-2">demo</Badge>}
        </span>
      )
    },
    { key: 'tipo', label: 'Tipo', render: (r) => <Badge>{r.tipo}</Badge> },
    { key: 'numero', label: 'N°', value: (r) => r.numero ?? '' },
    { key: 'fecha', label: 'Obtención', value: (r) => r.fecha ?? '', render: (r) => (r.fecha ? fecha(r.fecha) : '—') },
    {
      key: 'vencimiento',
      label: 'Vencimiento',
      value: (r) => r.vencimiento ?? '9999',
      render: (r) =>
        r.vencimiento ? (
          <span>
            {fecha(r.vencimiento)} <span className="text-[12px] text-ink-3">({dias(datos.hoy, r.vencimiento)} d)</span>
          </span>
        ) : (
          <span className="text-ink-3">No vence</span>
        )
    },
    {
      key: 'estado',
      label: 'Estado',
      value: (r) => estadoCumplimiento(r, datos.hoy),
      render: (r) => {
        const e = estadoCumplimiento(r, datos.hoy);
        return <Badge tone={TONO[e]}>{ETIQUETA[e]}</Badge>;
      }
    },
    { key: 'responsable', label: 'Responsable', value: (r) => r.responsable ?? '' }
  ];
  return (
    <>
      <StatGrid>
        <Stat label="Vigentes" value={cuenta('vigente')} icon={<ShieldCheck size={16} strokeWidth={1.6} />} />
        <Stat label="Por vencer" value={<span className={cn(cuenta('por vencer') > 0 && 'text-warn')}>{cuenta('por vencer')}</span>} />
        <Stat label="Vencidos" value={<span className={cn(cuenta('vencido') > 0 && 'text-bad')}>{cuenta('vencido')}</span>} />
        <Stat label="Pendientes de trámite" value={cuenta('pendiente')} />
      </StatGrid>
      <div className="mb-6 grid items-start gap-6 lg:grid-cols-2">
        <section aria-label="Declaraciones SAG" className="grid gap-2 rounded-card border border-rule bg-raised p-5">
          <h2 className="mb-1 font-label text-[18px]">Declaraciones SAG</h2>
          <Aviso tono={sag.cosecha.activa ? 'warn' : 'info'} titulo="Declaración de cosecha">
            {sag.cosecha.texto} {datos.temporada ? `Kg de la temporada ${datos.temporada}` : 'Kg de la temporada'}: <b>{nf(datos.kgTemporada)}</b>.
          </Aviso>
          <Aviso tono={sag.existencias.activa ? 'warn' : 'info'} titulo="Declaración de existencias">
            {sag.existencias.texto} Existencias actuales: <b>{nf(litros)} L</b> (granel + envasado).
          </Aviso>
          {datos.calendario.map((i) => (
            <Aviso key={i.clave} tono={i.dias < 0 ? 'bad' : i.dias <= 10 ? 'warn' : 'info'} titulo={i.nombre}>
              {i.dias < 0 ? `Venció el ${fecha(i.fecha)}.` : `Vence el ${fecha(i.fecha)} (en ${i.dias} días).`}
            </Aviso>
          ))}
        </section>
        <section aria-label="Verificaciones automáticas" className="grid gap-2 rounded-card border border-rule bg-raised p-5">
          <h2 className="mb-1 font-label text-[18px]">Verificaciones automáticas</h2>
          {c.lotesSinAnalisis.length ? (
            <Aviso
              tono="warn"
              titulo="Lotes sin análisis de laboratorio autorizado SAG"
              enlace={
                <Link href="laboratorio" className="mt-1 block font-semibold underline">
                  Ir a laboratorio
                </Link>
              }
            >
              {c.lotesSinAnalisis.join(', ')}
            </Aviso>
          ) : (
            <Aviso tono="ok" titulo="Todos los lotes de la temporada tienen análisis autorizado" />
          )}
          {c.ordenesDoSinRespaldo.length ? (
            <Aviso
              tono="bad"
              titulo="Etiquetas con D.O. sin respaldo"
              enlace={
                <Link href="envasado" className="mt-1 block font-semibold underline">
                  Ir a envasado
                </Link>
              }
            >
              {c.ordenesDoSinRespaldo.join(', ')}: requieren 75 % de uva de la zona y certificado de entidad autorizada.
            </Aviso>
          ) : (
            <Aviso tono="ok" titulo="Denominaciones de origen respaldadas">
              75 % o más de uva de la zona y certificado de entidad autorizada.
            </Aviso>
          )}
          {c.faltaInscripcion && (
            <Aviso tono="warn" titulo="Registra la inscripción de productos en el SAG">
              Todo vino debe inscribirse antes de comercializarse.
            </Aviso>
          )}
        </section>
      </div>
      <DataTable
        rows={filas}
        columns={cols}
        onRowClick={can('cumplimiento', 'e') ? (r) => setEditando(r) : undefined}
        exportName="cumplimiento"
        canExport={can('cumplimiento', 'x')}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <Select aria-label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-9 text-[13px]">
                <option value="">Todos los tipos</option>
                {TIPOS_CUMPLIMIENTO.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </div>
            {can('cumplimiento', 'x') && (
              <Button onClick={descargar}>
                <Download size={15} /> Libro de existencias (CSV)
              </Button>
            )}
            {can('cumplimiento', 'c') && (
              <Button variant="primary" onClick={() => setEditando('nuevo')}>
                <Plus size={16} /> Nueva obligación
              </Button>
            )}
          </div>
        }
        empty={
          <EmptyState
            icon={<ShieldCheck size={28} strokeWidth={1.5} />}
            title="Sin obligaciones registradas"
            text="Registra patentes, inscripciones SAG, marcas y certificaciones con su vencimiento."
          />
        }
      />
      {editando && <RegistroDialog registro={editando === 'nuevo' ? null : editando} onClose={() => setEditando(null)} />}
    </>
  );
}

function RegistroDialog({ registro, onClose }: { registro: Registro | null; onClose: () => void }) {
  const can = useCan();
  const { org } = useOrg();
  const { pending, errors, error, run } = useSubmit(onClose);
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run(
      () => saveCumplimiento(org.slug, { ...Object.fromEntries(new FormData(e.currentTarget)), id: registro?.id }, registro?.version),
      'Obligación guardada.'
    );
  }
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={registro ? registro.nombre : 'Nueva obligación'}
      footer={
        <>
          {registro && can('cumplimiento', 'd') && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={pending}
              onClick={() => confirm('¿Eliminar esta obligación?') && run(() => deleteCumplimiento(org.slug, registro.id), 'Obligación eliminada.')}
            >
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="cumplimiento-form" variant="primary" disabled={pending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="cumplimiento-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Obligación o registro" required error={errors.nombre} className="sm:col-span-2">
          {(id) => <Input id={id} name="nombre" defaultValue={registro?.nombre} required />}
        </Field>
        <Field label="Tipo">
          {(id) => (
            <Select id={id} name="tipo" defaultValue={registro?.tipo ?? 'SAG'}>
              {TIPOS_CUMPLIMIENTO.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="N° o resolución" error={errors.numero}>
          {(id) => <Input id={id} name="numero" defaultValue={registro?.numero ?? ''} />}
        </Field>
        <Field label="Estado">
          {(id) => (
            <Select id={id} name="estado" defaultValue={registro?.estado ?? 'vigente'}>
              <option value="vigente">Vigente / cumplida</option>
              <option value="pendiente">Pendiente de trámite</option>
            </Select>
          )}
        </Field>
        <Field label="Fecha de obtención" error={errors.fecha}>
          {(id) => <Input id={id} name="fecha" type="date" defaultValue={registro?.fecha ?? ''} />}
        </Field>
        <Field label="Vencimiento" error={errors.vencimiento} hint="Vacío si no vence.">
          {(id, d) => <Input id={id} name="vencimiento" type="date" defaultValue={registro?.vencimiento ?? ''} aria-describedby={d} />}
        </Field>
        <Field label="Avisar con anticipación" unit="días" error={errors.avisoDias}>
          {(id) => <Input id={id} name="avisoDias" type="number" min={0} step={1} defaultValue={registro?.avisoDias ?? 30} className="tabular" />}
        </Field>
        <Field label="Responsable" error={errors.responsable}>
          {(id) => <Input id={id} name="responsable" defaultValue={registro?.responsable ?? ''} />}
        </Field>
        <Field label="Notas" error={errors.notas} className="sm:col-span-2">
          {(id) => <Input id={id} name="notas" defaultValue={registro?.notas ?? ''} />}
        </Field>
        <ErrorForm error={error} className="sm:col-span-2" />
      </form>
      {registro && <Adjuntos entidad="cumplimiento" registroId={registro.id} />}
    </Dialog>
  );
}
