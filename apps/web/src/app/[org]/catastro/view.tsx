'use client';
import { CONDUCCIONES, dec2, ESTADOS_SANITARIOS, int, PATRONES, tipoUvaDe, VALLES, VARIEDADES, type Cuartel } from '@winzer/domain';
import { CloudUpload, Map as MapIcon, Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useCan } from '@/components/shell/org-context';
import { Badge, TipoUva } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { EmptyState, Stat } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { useEntity, useSync } from '@/lib/offline/hooks';

type Row = Cuartel & { _pending: boolean; _version: number };

const estadoTone = (e: string | null) => (!e ? 'neutral' : /malo/i.test(e) ? 'bad' : /regular|recuper/i.test(e) ? 'warn' : 'ok');

export function CatastroView() {
  const can = useCan();
  const rows = useEntity<Cuartel>('cuartel') as Row[] | undefined;
  const params = useSearchParams();
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  useEffect(() => {
    if (params.get('nuevo') === '1' && can('catastro', 'c')) setEditing('new');
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => (rows ?? []).slice().sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })), [rows]);
  const totals = useMemo(() => {
    const ha = sorted.reduce((a, c) => a + Number(c.superficie || 0), 0);
    const tinto = sorted.filter((c) => c.tipo === 'tinto').reduce((a, c) => a + Number(c.superficie || 0), 0);
    return { ha, tinto, blanco: ha - tinto, plantas: sorted.reduce((a, c) => a + Number(c.plantas || 0), 0) };
  }, [sorted]);

  if (!rows) return <div className="h-64 animate-pulse rounded-card bg-sunken" aria-label="Cargando cuarteles" />;

  const cols: Column<Row>[] = [
    {
      key: 'codigo',
      label: 'Cuartel',
      render: (c) => (
        <span className="inline-flex items-center gap-2 font-semibold">
          {c.codigo}
          {c._pending && <CloudUpload size={13} className="text-info" aria-label="Pendiente de sincronizar" />}
        </span>
      )
    },
    { key: 'variedad', label: 'Variedad' },
    { key: 'tipo', label: 'Uva', render: (c) => <TipoUva tipo={c.tipo} /> },
    { key: 'valle', label: 'Valle', value: (c) => c.valle ?? '', render: (c) => c.valle ?? <span className="text-ink-4">—</span> },
    { key: 'superficie', label: 'Sup. (ha)', num: true, value: (c) => Number(c.superficie), render: (c) => dec2(c.superficie) },
    { key: 'plantas', label: 'Plantas', num: true, value: (c) => c.plantas ?? 0, render: (c) => (c.plantas ? int(c.plantas) : '—') },
    { key: 'anioPlantacion', label: 'Plantación', num: true, value: (c) => c.anioPlantacion ?? 0, render: (c) => c.anioPlantacion ?? '—' },
    { key: 'conduccion', label: 'Conducción', value: (c) => c.conduccion ?? '', render: (c) => c.conduccion ?? <span className="text-ink-4">—</span> },
    {
      key: 'estadoSanitario',
      label: 'Estado sanitario',
      value: (c) => c.estadoSanitario ?? '',
      render: (c) => (c.estadoSanitario ? <Badge tone={estadoTone(c.estadoSanitario)}>{c.estadoSanitario}</Badge> : <span className="text-ink-4">—</span>)
    }
  ];

  return (
    <>
      {sorted.length > 0 && (
        <section className="mb-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-rule py-5 sm:grid-cols-4">
          <Stat
            label="Superficie"
            value={
              <>
                {dec2(totals.ha)} <span className="text-[14px] font-medium text-ink-3">ha</span>
              </>
            }
            sub={sorted.length === 1 ? '1 cuartel' : `${sorted.length} cuarteles`}
          />
          <Stat
            label="Tintas"
            value={
              <>
                {dec2(totals.tinto)} <span className="text-[14px] font-medium text-ink-3">ha</span>
              </>
            }
            sub={<Bar part={totals.tinto} total={totals.ha} className="bg-tinto" />}
          />
          <Stat
            label="Blancas"
            value={
              <>
                {dec2(totals.blanco)} <span className="text-[14px] font-medium text-ink-3">ha</span>
              </>
            }
            sub={<Bar part={totals.blanco} total={totals.ha} className="bg-blanco" />}
          />
          <Stat label="Plantas" value={int(totals.plantas)} sub={totals.ha ? `${int(totals.plantas / totals.ha)} pl/ha promedio` : undefined} />
        </section>
      )}

      {/* Móvil (en el viñedo): tarjetas grandes y tocables. Escritorio: tabla densa. */}
      <div className="sm:hidden">
        {can('catastro', 'c') && (
          <Button variant="primary" className="mb-4 h-11 w-full" onClick={() => setEditing('new')}>
            <Plus size={16} /> Nuevo cuartel
          </Button>
        )}
        {sorted.length === 0 ? (
          <Empty />
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => can('catastro', 'e') && setEditing(c)}
                  className="flex w-full items-center gap-3 rounded-card border border-rule bg-raised p-3.5 text-left active:bg-sunken"
                >
                  <span aria-hidden className={`h-10 w-1 rounded-full ${c.tipo === 'tinto' ? 'bg-tinto' : 'bg-blanco'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-semibold">
                      {c.codigo}
                      {c._pending && <CloudUpload size={13} className="text-info" aria-label="Pendiente de sincronizar" />}
                    </span>
                    <span className="block truncate text-[13px] text-ink-3">
                      {c.variedad}
                      {c.sector ? ` · ${c.sector}` : ''}
                    </span>
                  </span>
                  <span className="tabular text-right text-[15px] font-semibold">
                    {dec2(c.superficie)}
                    <span className="block text-[11px] font-normal text-ink-3">ha</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="hidden sm:block">
        <DataTable
          rows={sorted}
          columns={cols}
          onRowClick={can('catastro', 'e') ? (c) => setEditing(c) : undefined}
          exportName="cuarteles"
          canExport={can('catastro', 'x')}
          toolbar={
            can('catastro', 'c') && (
              <Button variant="primary" onClick={() => setEditing('new')}>
                <Plus size={16} /> Nuevo cuartel
              </Button>
            )
          }
          empty={<Empty />}
        />
      </div>
      {editing && <CuartelDialog cuartel={editing === 'new' ? null : editing} existing={sorted} onClose={() => setEditing(null)} />}
    </>
  );
}

function Bar({ part, total, className }: { part: number; total: number; className: string }) {
  return (
    <span
      className="mt-2 block h-1 overflow-hidden rounded-full bg-sunken"
      role="img"
      aria-label={`${Math.round((part / (total || 1)) * 100)}% de la superficie`}
    >
      <span className={`block h-full rounded-full ${className}`} style={{ width: `${(part / (total || 1)) * 100}%` }} />
    </span>
  );
}

function Empty() {
  return (
    <EmptyState
      icon={<MapIcon size={28} />}
      title="Aún no hay cuarteles"
      text="Registra cada cuartel con su variedad y superficie. Funciona sin señal: se sincroniza al volver la conexión."
    />
  );
}

function CuartelDialog({ cuartel, existing, onClose }: { cuartel: Row | null; existing: Row[]; onClose: () => void }) {
  const engine = useSync();
  const can = useCan();
  const toast = useToast();
  const c = cuartel;
  const [variedad, setVariedad] = useState(c?.variedad ?? '');
  const [tipo, setTipo] = useState<string>(c?.tipo ?? 'tinto');
  const [sup, setSup] = useState(c?.superficie != null ? String(c.superficie).replace('.', ',') : '');
  const [densidad, setDensidad] = useState(c?.densidad != null ? String(c.densidad) : '');
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const plantasCalc = Number(densidad) && sup ? Math.round(Number(densidad) * Number(sup.replace(',', '.'))) : null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!engine) return;
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const codigo = data.codigo?.trim().toLowerCase();
    if (existing.some((x) => x.id !== c?.id && x.codigo.toLowerCase() === codigo))
      return setError({ field: 'codigo', message: 'Ya existe un cuartel con ese código.' });
    try {
      await engine.write('cuartel', 'upsert', c?.id ?? null, data);
      toast(
        navigator.onLine ? (c ? 'Cuartel actualizado.' : 'Cuartel creado.') : 'Guardado en este equipo. Se enviará al volver la conexión.',
        navigator.onLine ? 'ok' : 'info'
      );
      onClose();
    } catch (err) {
      const x = err as Error & { issues?: { path: PropertyKey[] }[]; field?: string };
      setError({ field: x.field ?? String(x.issues?.[0]?.path[0] ?? ''), message: x.message });
    }
  }
  async function remove() {
    if (!engine || !c || !confirm(`¿Eliminar el cuartel ${c.codigo}?`)) return;
    await engine.write('cuartel', 'delete', c.id);
    toast('Cuartel eliminado.');
    onClose();
  }
  const err = (f: string) => (error?.field === f ? error.message : null);
  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      title={c ? `Cuartel ${c.codigo}` : 'Nuevo cuartel'}
      description={c?._pending ? 'Tiene cambios sin sincronizar.' : undefined}
      footer={
        <>
          {c && can('catastro', 'd') && (
            <Button type="button" variant="danger" className="mr-auto" onClick={remove}>
              Eliminar
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="cuartel-form" variant="primary">
            Guardar
          </Button>
        </>
      }
    >
      <form id="cuartel-form" onSubmit={submit} className="grid gap-x-4 gap-y-5 sm:grid-cols-3">
        <Section title="Identificación" />
        <Field label="Código" required error={err('codigo')}>
          {(id, d) => (
            <Input id={id} name="codigo" defaultValue={c?.codigo} placeholder="C-04" aria-invalid={!!err('codigo')} aria-describedby={d} required autoFocus />
          )}
        </Field>
        <Field label="Variedad" required error={err('variedad')}>
          {(id) => (
            <>
              <Input
                id={id}
                name="variedad"
                list="variedades"
                value={variedad}
                required
                onChange={(e) => {
                  setVariedad(e.target.value);
                  setTipo(tipoUvaDe(e.target.value, tipo));
                }}
              />
              <datalist id="variedades">
                {VARIEDADES.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Tipo de uva" required>
          {(id) => (
            <Select id={id} name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="tinto">Tinta</option>
              <option value="blanco">Blanca</option>
            </Select>
          )}
        </Field>
        <Field label="Valle">
          {(id) => (
            <Select id={id} name="valle" defaultValue={c?.valle ?? ''}>
              <option value="">—</option>
              {VALLES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Sector / ubicación" className="sm:col-span-2">
          {(id) => <Input id={id} name="sector" defaultValue={c?.sector ?? ''} />}
        </Field>

        <Section title="Plantación" />
        <Field label="Superficie" unit="ha" required error={err('superficie')}>
          {(id, d) => (
            <Input
              id={id}
              name="superficie"
              inputMode="decimal"
              value={sup}
              onChange={(e) => setSup(e.target.value)}
              placeholder="2,5"
              aria-invalid={!!err('superficie')}
              aria-describedby={d}
              className="tabular"
              required
            />
          )}
        </Field>
        <Field label="Año de plantación" error={err('anioPlantacion')}>
          {(id) => (
            <Input
              id={id}
              name="anioPlantacion"
              type="number"
              min={1850}
              max={new Date().getFullYear()}
              defaultValue={c?.anioPlantacion ?? ''}
              className="tabular"
            />
          )}
        </Field>
        <Field label="Densidad" unit="pl/ha">
          {(id) => <Input id={id} name="densidad" type="number" min={0} value={densidad} onChange={(e) => setDensidad(e.target.value)} className="tabular" />}
        </Field>
        <Field label="Plantas" hint={plantasCalc ? `Si lo dejas vacío: ${int(plantasCalc)} (densidad × superficie)` : undefined}>
          {(id, d) => <Input id={id} name="plantas" type="number" min={0} defaultValue={c?.plantas ?? ''} aria-describedby={d} className="tabular" />}
        </Field>
        <Field label="Patrón / portainjerto">
          {(id) => (
            <>
              <Input id={id} name="patron" list="patrones" defaultValue={c?.patron ?? ''} />
              <datalist id="patrones">
                {PATRONES.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Conducción">
          {(id) => (
            <Select id={id} name="conduccion" defaultValue={c?.conduccion ?? ''}>
              <option value="">—</option>
              {CONDUCCIONES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          )}
        </Field>

        <Section title="Estado y costos" />
        <Field label="Estado sanitario">
          {(id) => (
            <>
              <Input id={id} name="estadoSanitario" list="estados" defaultValue={c?.estadoSanitario ?? ''} />
              <datalist id="estados">
                {ESTADOS_SANITARIOS.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Cajones estimados" unit="por temporada">
          {(id) => <Input id={id} name="cajonesEstimados" type="number" min={0} defaultValue={c?.cajonesEstimados ?? ''} className="tabular" />}
        </Field>
        <Field label="Costo de plantación" unit="CLP">
          {(id) => <Input id={id} name="costoPlantacion" type="number" min={0} step={1} defaultValue={c?.costoPlantacion ?? ''} className="tabular" />}
        </Field>
        <Field label="Observaciones" className="sm:col-span-3">
          {(id) => <Textarea id={id} name="observaciones" defaultValue={c?.observaciones ?? ''} />}
        </Field>
        {error && !error.field && (
          <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad sm:col-span-3">
            {error.message}
          </p>
        )}
      </form>
    </Dialog>
  );
}

function Section({ title }: { title: string }) {
  return <p className="-mb-2 border-b border-rule pb-1.5 text-[11px] font-medium tracking-[0.08em] text-ink-3 uppercase sm:col-span-3">{title}</p>;
}
