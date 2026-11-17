'use client';
import { CONDUCCIONES, dec2, ESTADOS_SANITARIOS, int, PATRONES, tipoUvaDe, VALLES, VARIEDADES, type Cuartel } from '@winzer/domain';
import { Map as MapIcon, Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useCan } from '@/components/shell/org-context';
import { Badge, Sello, TipoUva, UvaDot } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { EmptyState, PageHeader, SectionTitle } from '@/components/ui/page';
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

  const nuevo = can('catastro', 'c') && (
    <Button variant="primary" onClick={() => setEditing('new')}>
      <Plus size={16} /> Nuevo cuartel
    </Button>
  );
  const header = (
    <PageHeader
      title="Catastro vitícola"
      description={
        !rows ? (
          'Cargando cuarteles…'
        ) : sorted.length === 0 ? (
          'Cuarteles del viñedo: variedad, superficie, plantación y estado sanitario. Funciona sin señal.'
        ) : (
          <>
            <strong className="tabular font-semibold text-ink">{dec2(totals.ha)} ha</strong> en{' '}
            {sorted.length === 1 ? '1 cuartel' : `${sorted.length} cuarteles`} · <span className="tabular">{int(totals.plantas)}</span> plantas · Tinta{' '}
            <span className="tabular">{dec2(totals.tinto)}</span> ha · Blanca <span className="tabular">{dec2(totals.blanco)}</span> ha
          </>
        )
      }
      actions={nuevo}
      actionsDesktopOnly
    />
  );

  if (!rows)
    return (
      <>
        {header}
        <div className="h-64 animate-pulse bg-sunken" aria-label="Cargando cuarteles" />
      </>
    );

  const cols: Column<Row>[] = [
    { key: 'codigo', label: 'Código', render: (c) => <Sello codigo={c.codigo} pending={c._pending} /> },
    {
      key: 'variedad',
      label: 'Variedad',
      render: (c) => (
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold">{c.variedad}</span>
          <TipoUva tipo={c.tipo} />
        </span>
      )
    },
    {
      key: 'valle',
      label: 'Valle · sector',
      value: (c) => [c.valle, c.sector].filter(Boolean).join(' · '),
      render: (c) =>
        c.valle || c.sector ? (
          <span className="flex flex-col gap-0.5">
            <span>{c.valle ?? '—'}</span>
            {c.sector && <span className="text-[13px] text-ink-3">{c.sector}</span>}
          </span>
        ) : (
          <span className="text-ink-4">—</span>
        )
    },
    {
      key: 'superficie',
      label: 'Superficie',
      num: true,
      value: (c) => Number(c.superficie),
      render: (c) => (
        <span className="font-semibold">
          {dec2(c.superficie)} <span className="font-normal text-ink-3">ha</span>
        </span>
      )
    },
    { key: 'plantas', label: 'Plantas', num: true, value: (c) => c.plantas ?? 0, render: (c) => (c.plantas ? int(c.plantas) : '—') },
    { key: 'anioPlantacion', label: 'Plantación', num: true, value: (c) => c.anioPlantacion ?? 0, render: (c) => c.anioPlantacion ?? '—' },
    {
      key: 'estadoSanitario',
      label: 'Estado sanitario',
      className: 'min-w-[140px] whitespace-normal',
      value: (c) => c.estadoSanitario ?? '',
      render: (c) => (c.estadoSanitario ? <Badge tone={estadoTone(c.estadoSanitario)}>{c.estadoSanitario}</Badge> : <span className="text-ink-4">—</span>)
    }
  ];

  return (
    <>
      {header}

      {/* Móvil (en el viñedo): filas grandes y tocables con el sello. Escritorio: tabla densa + composición. */}
      <div className="sm:hidden">
        {nuevo && (
          <Button variant="primary" className="mb-5 h-13 w-full text-[16px]" onClick={() => setEditing('new')}>
            <Plus size={18} /> Nuevo cuartel
          </Button>
        )}
        {sorted.length === 0 ? (
          <Empty />
        ) : (
          <ul className="border-b border-rule">
            {sorted.map((c) => (
              <li key={c.id} className="border-t border-rule">
                <button onClick={() => can('catastro', 'e') && setEditing(c)} className="flex w-full items-center gap-4 py-3.5 text-left active:bg-sunken">
                  <Sello codigo={c.codigo} pending={c._pending} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold">{c.variedad}</span>
                    <span className="block truncate text-[14px] text-ink-2">
                      {c.tipo === 'tinto' ? 'Tinta' : 'Blanca'}
                      {c.valle ? ` · ${c.valle}` : ''}
                    </span>
                  </span>
                  <span className="tabular text-[16px] font-semibold">
                    {dec2(c.superficie)} <span className="font-normal text-ink-3">ha</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {sorted.length > 0 && <Composicion rows={sorted} totalHa={totals.ha} className="mt-10" />}
      </div>

      <div className="hidden gap-12 sm:grid xl:grid-cols-[minmax(0,1fr)_280px]">
        <DataTable
          rows={sorted}
          columns={cols}
          onRowClick={can('catastro', 'e') ? (c) => setEditing(c) : undefined}
          exportName="cuarteles"
          canExport={can('catastro', 'x')}
          empty={<Empty />}
        />
        {sorted.length > 0 && <Composicion rows={sorted} totalHa={totals.ha} />}
      </div>
      {editing && <CuartelDialog cuartel={editing === 'new' ? null : editing} existing={sorted} onClose={() => setEditing(null)} />}
    </>
  );
}

/**
 * Composición del viñedo (columna lateral en escritorio, al final en móvil): reparto de la superficie por
 * variedad y por valle con barras de 1 línea, edad y densidad del viñedo, y la leyenda de las marcas.
 */
function Composicion({ rows, totalHa, className }: { rows: Row[]; totalHa: number; className?: string }) {
  const grupos = (key: (c: Row) => string, tipo?: (c: Row) => string) => {
    const m = new Map<string, { ha: number; tipo?: string }>();
    rows.forEach((c) => {
      const k = key(c) || 'Sin dato';
      const g = m.get(k) ?? { ha: 0, tipo: tipo?.(c) };
      g.ha += Number(c.superficie || 0);
      m.set(k, g);
    });
    return [...m.entries()].sort((a, b) => b[1].ha - a[1].ha);
  };
  const porVariedad = grupos(
    (c) => c.variedad,
    (c) => c.tipo
  );
  const porValle = grupos((c) => c.valle ?? '');
  const anio = new Date().getFullYear();
  // Edad media ponderada por superficie: Σ(edad × ha) / Σ ha, solo cuarteles con año de plantación.
  const conAnio = rows.filter((c) => c.anioPlantacion);
  const haConAnio = conAnio.reduce((a, c) => a + Number(c.superficie || 0), 0);
  const edad = haConAnio ? conAnio.reduce((a, c) => a + (anio - c.anioPlantacion!) * Number(c.superficie || 0), 0) / haConAnio : null;
  const masAntiguo = conAnio.slice().sort((a, b) => a.anioPlantacion! - b.anioPlantacion!)[0];
  const plantas = rows.reduce((a, c) => a + Number(c.plantas || 0), 0);

  return (
    <aside aria-label="Composición del viñedo" className={`grid content-start gap-10 sm:grid-cols-2 xl:grid-cols-1 ${className ?? ''}`}>
      <Reparto titulo="Por variedad" items={porVariedad} total={totalHa} />
      <Reparto titulo="Por valle" items={porValle} total={totalHa} />
      <section>
        <SectionTitle className="border-b border-ink pb-2">El viñedo</SectionTitle>
        <dl className="mt-1 text-[14px]">
          {edad != null && <Dato label="Edad media" value={`${Math.round(edad)} años`} />}
          {masAntiguo && <Dato label="Más antiguo" value={`${masAntiguo.codigo} · ${masAntiguo.anioPlantacion}`} />}
          {totalHa > 0 && plantas > 0 && <Dato label="Densidad media" value={`${int(plantas / totalHa)} pl/ha`} />}
        </dl>
      </section>
      <section className="flex flex-col gap-2.5 text-[13px] text-ink-3">
        <span className="flex items-center gap-2.5">
          <span aria-hidden className="w-[22px] border-t border-ink" />
          Sincronizado
        </span>
        <span className="flex items-center gap-2.5">
          <span aria-hidden className="w-[22px] border-t border-dashed border-ink" />
          Pendiente de sincronizar
        </span>
        <span className="flex items-center gap-2.5">
          <UvaDot tipo="tinto" className="mx-[7px]" /> Tinta
          <UvaDot tipo="blanco" className="mr-0 ml-4" /> Blanca
        </span>
      </section>
    </aside>
  );
}

function Reparto({ titulo, items, total }: { titulo: string; items: [string, { ha: number; tipo?: string }][]; total: number }) {
  return (
    <section>
      <SectionTitle className="border-b border-ink pb-2">{titulo}</SectionTitle>
      <ul className="mt-1">
        {items.map(([nombre, g]) => {
          const pct = total ? (g.ha / total) * 100 : 0;
          return (
            <li key={nombre} className="border-b border-rule py-2.5">
              <span className="flex items-baseline gap-2 text-[14px]">
                {g.tipo && <UvaDot tipo={g.tipo} className="self-center" />}
                <span className="min-w-0 flex-1 truncate">{nombre}</span>
                <span className="tabular font-semibold">{dec2(g.ha)}</span>
                <span className="tabular w-10 text-right text-[12px] text-ink-3">{Math.round(pct)}%</span>
              </span>
              <span className="mt-2 block h-[3px] bg-rule" role="img" aria-label={`${Math.round(pct)}% de la superficie`}>
                <span className="block h-full bg-ink" style={{ width: `${pct}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rule py-2.5">
      <dt className="text-ink-3">{label}</dt>
      <dd className="tabular font-semibold">{value}</dd>
    </div>
  );
}

function Empty() {
  return (
    <EmptyState
      icon={<MapIcon size={28} strokeWidth={1.5} />}
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
          <p role="alert" className="bg-bad-soft px-3 py-2 text-[13px] text-bad sm:col-span-3">
            {error.message}
          </p>
        )}
      </form>
    </Dialog>
  );
}

function Section({ title }: { title: string }) {
  return <p className="-mb-1 border-b border-ink pb-2 font-label text-[18px] sm:col-span-3">{title}</p>;
}
