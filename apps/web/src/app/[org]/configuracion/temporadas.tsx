'use client';
import { anioDeFecha, fechaHoy, rangoPorDefecto } from '@winzer/domain';
import { Lock, LockOpen, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useCan, useOrg } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { saveTemporada, type Result } from './actions';

export interface TemporadaRow {
  id: string;
  version: number;
  anio: number;
  inicio: string;
  fin: string;
  estado: 'abierta' | 'cerrada';
}

const fecha = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });

/** Temporadas de la viña: crear, cambiar fechas y cerrar (una temporada cerrada queda de solo lectura). */
export function Temporadas({ rows }: { rows: TemporadaRow[] }) {
  const { org, temporadaActual } = useOrg();
  const can = useCan();
  const editable = can('configuracion', 'e');
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<TemporadaRow | 'nueva' | null>(null);

  function alternar(t: TemporadaRow) {
    const estado = t.estado === 'abierta' ? 'cerrada' : 'abierta';
    start(async () => {
      const r = await saveTemporada(org.slug, { ...t, estado }, t.version);
      if (r.ok) {
        toast(estado === 'cerrada' ? `Temporada ${t.anio} cerrada.` : `Temporada ${t.anio} reabierta.`);
        router.refresh();
      } else toast(r.error);
    });
  }

  const columns: Column<TemporadaRow>[] = [
    {
      key: 'anio',
      label: 'Temporada',
      render: (t) => (
        <span className="flex items-center gap-2">
          <b className="tabular">{t.anio}</b>
          {t.anio === temporadaActual && <Badge tone="info">Actual</Badge>}
        </span>
      )
    },
    { key: 'inicio', label: 'Desde', render: (t) => <span className="tabular">{fecha(t.inicio)}</span> },
    { key: 'fin', label: 'Hasta', render: (t) => <span className="tabular">{fecha(t.fin)}</span> },
    {
      key: 'estado',
      label: 'Estado',
      render: (t) =>
        t.estado === 'cerrada' ? (
          <Badge>
            <Lock size={11} aria-hidden /> Cerrada
          </Badge>
        ) : (
          <Badge tone="ok">Abierta</Badge>
        )
    }
  ];
  if (editable) {
    columns.push({
      key: 'accion',
      label: '',
      value: () => '',
      className: 'text-right',
      render: (t) => (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={(e) => {
            e.stopPropagation();
            alternar(t);
          }}
        >
          {t.estado === 'abierta' ? <Lock size={13} aria-hidden /> : <LockOpen size={13} aria-hidden />}
          {t.estado === 'abierta' ? 'Cerrar' : 'Reabrir'}
        </Button>
      )
    });
  }

  return (
    <>
      <DataTable
        rows={[...rows].reverse()}
        columns={columns}
        onRowClick={editable ? (t) => setEditing(t) : undefined}
        toolbar={
          editable && (
            <Button size="sm" variant="primary" onClick={() => setEditing('nueva')}>
              <Plus size={14} aria-hidden /> Nueva temporada
            </Button>
          )
        }
      />
      {editing && <TemporadaDialog temporada={editing === 'nueva' ? null : editing} rows={rows} onClose={() => setEditing(null)} />}
    </>
  );
}

function TemporadaDialog({ temporada, rows, onClose }: { temporada: TemporadaRow | null; rows: TemporadaRow[]; onClose: () => void }) {
  const { org } = useOrg();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // Nueva: la siguiente a la última registrada, o la de hoy si no hay ninguna.
  const sugerida = rangoPorDefecto(rows.length ? Math.max(...rows.map((r) => r.anio)) + 1 : anioDeFecha(fechaHoy()));
  const [anio, setAnio] = useState(String(temporada?.anio ?? sugerida.anio));
  const [inicio, setInicio] = useState(temporada?.inicio ?? sugerida.inicio);
  const [fin, setFin] = useState(temporada?.fin ?? sugerida.fin);

  function cambiarAnio(v: string) {
    setAnio(v);
    // En una temporada nueva, las fechas siguen al año mientras el usuario no las toque.
    const n = Number(v);
    if (!temporada && Number.isInteger(n) && n > 1990) {
      const r = rangoPorDefecto(n);
      setInicio(r.inicio);
      setFin(r.fin);
    }
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    start(async () => {
      const r: Result = await saveTemporada(org.slug, { id: temporada?.id, anio, inicio, fin, estado: temporada?.estado ?? 'abierta' }, temporada?.version);
      if (r.ok) {
        toast(temporada ? 'Temporada actualizada.' : `Temporada ${anio} creada.`);
        onClose();
        router.refresh();
      } else {
        setError(r.error);
        setErrors(r.fieldErrors ?? {});
      }
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={temporada ? `Temporada ${temporada.anio}` : 'Nueva temporada'}
      description="Se nombra por el año de la vendimia. Por defecto va del 1 de julio al 30 de junio, sin cruzarse con otra."
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="temporada-form" variant="primary" disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <form id="temporada-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
        <Field label="Año de vendimia" required error={errors.anio}>
          {(id, d) => (
            <Input
              id={id}
              name="anio"
              type="number"
              inputMode="numeric"
              min={1990}
              max={2100}
              value={anio}
              onChange={(e) => cambiarAnio(e.target.value)}
              aria-describedby={d}
              className="tabular"
              required
            />
          )}
        </Field>
        <Field label="Desde" required error={errors.inicio}>
          {(id, d) => <Input id={id} name="inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} aria-describedby={d} required />}
        </Field>
        <Field label="Hasta" required error={errors.fin}>
          {(id, d) => <Input id={id} name="fin" type="date" value={fin} onChange={(e) => setFin(e.target.value)} aria-describedby={d} required />}
        </Field>
        {error && (
          <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad sm:col-span-3">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
