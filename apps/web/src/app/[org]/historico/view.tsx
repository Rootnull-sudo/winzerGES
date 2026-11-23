'use client';
import {
  historicoLotes,
  historicoPorTemporada,
  type Cosecha,
  type Cuartel,
  type FilaHistorico,
  type Lote,
  type MovBodega,
  type TotalTemporada
} from '@winzer/domain';
import { History } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCan, useOrg } from '@/components/shell/org-context';
import { Codigo, TipoUva } from '@/components/ui/badge';
import { BarrasAgrupadas, BarrasH, ChartCard } from '@/components/ui/chart';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Select } from '@/components/ui/field';
import { EmptyState, PageHeader } from '@/components/ui/page';
import { cn } from '@/lib/cn';
import { useEntity } from '@/lib/offline/hooks';

// `|| 0` evita mostrar "-0" (las salidas sin movimientos dan cero negativo).
const int = (v: number) => (Math.round(v) || 0).toLocaleString('es-CL');
const dec = (v: number, d = 2) => v.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v: number) => `${dec(v * 100, 1)} %`;
type Fila = FilaHistorico & { cuarteles: string };
type Total = TotalTemporada & { id: string };

export function HistoricoView() {
  const can = useCan();
  const { temporadas } = useOrg();
  const lotes = useEntity<Lote>('lote');
  const cosechas = useEntity<Cosecha>('cosecha');
  const movs = useEntity<MovBodega>('mov_bodega');
  const cuarteles = useEntity<Cuartel>('cuartel');
  const [f, setF] = useState({ anio: '', tipo: '', variedad: '', cuartel: '' });

  const { filas, totales } = useMemo(() => {
    const anioDe = new Map(temporadas.map((t) => [t.id, t.anio]));
    const codigo = new Map((cuarteles ?? []).map((c) => [c.id, c.codigo]));
    const filas: Fila[] = historicoLotes(lotes ?? [], cosechas ?? [], movs ?? [], (id) => (id ? (anioDe.get(id) ?? null) : null)).map((r) => ({
      ...r,
      cuarteles: r.cuartelIds
        .map((id) => codigo.get(id))
        .filter(Boolean)
        .join(', ')
    }));
    return { filas, totales: historicoPorTemporada(filas).map((t): Total => ({ ...t, id: String(t.anio) })) };
  }, [lotes, cosechas, movs, cuarteles, temporadas]);

  const cargando = !lotes || !cosechas || !movs;
  const variedades = [...new Set(filas.map((r) => r.variedad).filter(Boolean))].sort();
  const codigosCuartel = [...new Set(filas.flatMap((r) => r.cuarteles.split(', ').filter(Boolean)))].sort();
  const vista = filas
    .filter(
      (r) =>
        (!f.anio || String(r.anio) === f.anio) &&
        (!f.tipo || r.tipo === f.tipo) &&
        (!f.variedad || r.variedad === f.variedad) &&
        (!f.cuartel || r.cuarteles.split(', ').includes(f.cuartel))
    )
    .sort((a, b) => b.anio - a.anio || a.lote.localeCompare(b.lote));
  const suma = (fn: (r: Fila) => number) => vista.reduce((s, r) => s + fn(r), 0);

  const colsT: Column<Total>[] = [
    { key: 'anio', label: 'Temporada', render: (t) => <b>{t.anio}</b> },
    { key: 'kg', label: 'Kg uva', num: true, render: (t) => int(t.kg) },
    { key: 'litros', label: 'Litros', num: true, render: (t) => int(t.litros) },
    { key: 'blanco', label: 'Blanco L', num: true, render: (t) => int(t.blanco) },
    { key: 'tinto', label: 'Tinto L', num: true, render: (t) => int(t.tinto) },
    { key: 'rendimiento', label: 'L/kg', num: true, value: (t) => t.rendimiento ?? 0, render: (t) => (t.rendimiento != null ? dec(t.rendimiento) : '—') },
    { key: 'envasado', label: 'Envasado L', num: true, render: (t) => int(t.envasado) },
    { key: 'granel', label: 'Granel L', num: true, render: (t) => int(t.granel) },
    { key: 'merma', label: 'Mermas L', num: true, render: (t) => int(t.merma) },
    {
      key: 'variacion',
      label: 'Var. litros',
      num: true,
      value: (t) => t.variacion ?? '',
      render: (t) =>
        t.variacion == null ? (
          <span className="text-ink-4">—</span>
        ) : (
          <span className={cn('font-semibold', t.variacion >= 0 ? 'text-ok' : 'text-bad')}>
            {t.variacion >= 0 ? '↑' : '↓'} {pct(Math.abs(t.variacion))}
          </span>
        )
    }
  ];
  const colsL: Column<Fila>[] = [
    { key: 'anio', label: 'Temp.', num: true },
    { key: 'lote', label: 'Lote', render: (r) => <Codigo codigo={r.lote} /> },
    { key: 'variedad', label: 'Variedad' },
    { key: 'tipo', label: 'Tipo', render: (r) => <TipoUva tipo={r.tipo} /> },
    { key: 'cuarteles', label: 'Cuarteles', render: (r) => <span className="text-ink-2">{r.cuarteles || '—'}</span> },
    { key: 'kg', label: 'Kg uva', num: true, render: (r) => int(r.kg) },
    { key: 'litros', label: 'Litros', num: true, render: (r) => int(r.litros) },
    { key: 'rendimiento', label: 'L/kg', num: true, render: (r) => dec(r.rendimiento) },
    { key: 'envasado', label: 'Envasado L', num: true, render: (r) => int(r.envasado) },
    { key: 'granel', label: 'Granel L', num: true, render: (r) => int(r.granel) },
    { key: 'vinagre', label: 'Vinagre L', num: true, render: (r) => int(r.vinagre) },
    {
      key: 'merma',
      label: 'Merma L',
      num: true,
      render: (r) => (
        <>
          {int(r.merma)} <span className="text-[12px] text-ink-3">{pct(r.mermaPct)}</span>
        </>
      )
    },
    { key: 'stock', label: 'Stock L', num: true, render: (r) => <b>{int(r.stock)}</b> }
  ];

  const filtro = (k: keyof typeof f, label: string, todas: string, opciones: [string, string][]) => (
    <div className="w-52">
      <Select aria-label={label} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="h-9 text-[14px]">
        <option value="">{todas}</option>
        {opciones.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
    </div>
  );

  return (
    <>
      <PageHeader
        area="Vinificación y bodega"
        title="Histórico de kilos y litros"
        description="Trazabilidad por lote de todas las temporadas: uva cosechada → litros ingresados → envasado, granel, vinagre y mermas. Se calcula con las cosechas y los movimientos de bodega; funciona sin señal."
      />
      {cargando ? (
        <div className="h-64 animate-pulse rounded-card bg-sunken" aria-label="Cargando histórico" />
      ) : filas.length === 0 ? (
        <EmptyState
          icon={<History size={28} strokeWidth={1.5} />}
          title="Sin historial"
          text="Registra cosechas asociadas a un lote y entradas a bodega para construir el histórico."
        />
      ) : (
        <>
          <div className="mb-6 grid items-start gap-4 lg:grid-cols-2">
            <ChartCard titulo="Kg de uva por temporada" nota="Cosechas asociadas a un lote, con el rendimiento en litros por kg.">
              <BarrasH
                items={totales.toReversed().map((t) => ({
                  id: t.id,
                  etiqueta: String(t.anio),
                  detalle: t.rendimiento != null ? `${dec(t.rendimiento)} L/kg` : undefined,
                  valor: t.kg
                }))}
                formato={(v) => `${int(v)} kg`}
              />
            </ChartCard>
            <ChartCard titulo="Litros ingresados por tipo" nota="Blanco y tinto por temporada.">
              <BarrasAgrupadas
                categorias={totales.map((t) => String(t.anio))}
                series={[
                  { id: 'blanco', nombre: 'Blanco', color: 'blanco', valores: totales.map((t) => t.blanco) },
                  { id: 'tinto', nombre: 'Tinto', color: 'tinto', valores: totales.map((t) => t.tinto) }
                ]}
                formato={int}
                unidad="L"
              />
            </ChartCard>
          </div>
          <section aria-label="Comparativa entre temporadas" className="mb-6">
            <h2 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Comparativa entre temporadas</h2>
            <DataTable rows={totales.toReversed()} columns={colsT} exportName="historico-temporadas" canExport={can('historico', 'x')} />
          </section>
          <section aria-label="Detalle por lote">
            <h2 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Detalle por lote</h2>
            <div role="group" aria-label="Filtros" className="mb-3 flex flex-wrap gap-2">
              {filtro(
                'anio',
                'Temporada',
                'Todas las temporadas',
                totales.toReversed().map((t) => [t.id, String(t.anio)])
              )}
              {filtro('tipo', 'Tipo', 'Blanco y tinto', [
                ['blanco', 'Blanco'],
                ['tinto', 'Tinto']
              ])}
              {filtro(
                'variedad',
                'Variedad',
                'Todas las variedades',
                variedades.map((v) => [v, v])
              )}
              {filtro(
                'cuartel',
                'Cuartel',
                'Todos los cuarteles',
                codigosCuartel.map((c) => [c, c])
              )}
            </div>
            <DataTable
              rows={vista}
              columns={colsL}
              exportName="historico-kg-litros"
              canExport={can('historico', 'x')}
              empty={<EmptyState icon={<History size={28} strokeWidth={1.5} />} title="Sin lotes con esos filtros" text="Cambia o quita los filtros." />}
            />
            <p aria-label="Totales del detalle" className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-2">
              <span>
                Kg <b className="text-ink tabular">{int(suma((r) => r.kg))}</b>
              </span>
              <span>
                Litros <b className="text-ink tabular">{int(suma((r) => r.litros))}</b>
              </span>
              <span>
                Envasado <b className="text-ink tabular">{int(suma((r) => r.envasado))} L</b>
              </span>
              <span>
                Granel <b className="text-ink tabular">{int(suma((r) => r.granel))} L</b>
              </span>
              <span>
                Vinagre <b className="text-ink tabular">{int(suma((r) => r.vinagre))} L</b>
              </span>
              <span>
                Mermas <b className="text-ink tabular">{int(suma((r) => r.merma))} L</b>
              </span>
              <span>
                Stock <b className="text-ink tabular">{int(suma((r) => r.stock))} L</b>
              </span>
            </p>
          </section>
        </>
      )}
    </>
  );
}
