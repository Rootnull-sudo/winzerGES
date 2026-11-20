'use client';
/**
 * Gráficos livianos en SVG/HTML con los tokens del diseño (sin librería). Reglas (skill dataviz):
 *  - marcas delgadas, extremos de 4 px redondeados anclados a la base, 2 px de separación entre barras;
 *  - líneas de 2 px, marcadores de 8 px; grilla y ejes discretos (`rule`, texto `ink-3`);
 *  - el texto usa tokens de texto, nunca el color de la serie; con ≥ 2 series hay leyenda;
 *  - un dato faltante (null) no se dibuja (v1 lo pintaba como 0);
 *  - tooltip al pasar el cursor o el dedo; la tabla de la página es la vista accesible de los datos.
 * Colores por temporada: escala ordinal de un tono (`serie-t0` = elegida, t1 anterior, t2 dos atrás).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ColorSerie = 't0' | 't1' | 't2' | 'tinto';
const FILL: Record<ColorSerie, string> = { t0: 'fill-serie-t0', t1: 'fill-serie-t1', t2: 'fill-serie-t2', tinto: 'fill-tinto' };
const STROKE: Record<ColorSerie, string> = { t0: 'stroke-serie-t0', t1: 'stroke-serie-t1', t2: 'stroke-serie-t2', tinto: 'stroke-tinto' };
const BG: Record<ColorSerie, string> = { t0: 'bg-serie-t0', t1: 'bg-serie-t1', t2: 'bg-serie-t2', tinto: 'bg-tinto' };

export interface Serie {
  id: string;
  nombre: string;
  color: ColorSerie;
  valores: (number | null)[];
}

const nf = (v: number) => v.toLocaleString('es-CL', { maximumFractionDigits: 1 });

/** Ancho real del contenedor (para no deformar el texto escalando un viewBox). */
function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}

/** Escala "linda" para el eje: máximo redondeado y 4 marcas. */
function escala(max: number) {
  if (max <= 0) return { tope: 1, marcas: [0, 1] };
  const paso0 = max / 4;
  const pot = 10 ** Math.floor(Math.log10(paso0));
  // Pasos 1-2-5 (sin 2,5: al formatear sin decimales mostraría marcas desiguales).
  const paso = [1, 2, 5, 10].map((m) => m * pot).find((p) => p >= paso0)!;
  const tope = Math.ceil(max / paso) * paso;
  return { tope, marcas: Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso) };
}

export function Leyenda({ series }: { series: Pick<Serie, 'id' | 'nombre' | 'color'>[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2" aria-label="Leyenda">
      {series.map((s) => (
        <li key={s.id} className="flex items-center gap-1.5">
          <span className={cn('size-2.5 rounded-[3px]', BG[s.color])} aria-hidden />
          {s.nombre}
        </li>
      ))}
    </ul>
  );
}

function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-32 -translate-x-1/2 -translate-y-full rounded-control border border-rule-strong bg-raised px-2.5 py-1.5 text-[12px] text-ink shadow-sm"
      style={{ left: x, top: y - 8 }}
    >
      {children}
    </div>
  );
}

/** Tarjeta de gráfico: título, nota opcional y contenido. */
export function ChartCard({ titulo, nota, children, className }: { titulo: string; nota?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-card border border-rule bg-raised p-4 sm:p-5', className)} aria-label={titulo}>
      <h3 className="text-[14px] font-semibold text-ink">{titulo}</h3>
      {nota && <p className="mt-0.5 text-[12px] text-ink-3">{nota}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * Barras horizontales de una serie (p. ej. kg por cuartel). Etiqueta a la izquierda, valor a la derecha:
 * se lee sin tooltip. `vacio` cuando todos los valores son 0.
 */
export function BarrasH({
  items,
  formato = nf,
  vacio = 'Sin datos en la temporada.'
}: {
  items: { id: string; etiqueta: string; detalle?: string; valor: number }[];
  formato?: (v: number) => string;
  vacio?: string;
}) {
  const max = Math.max(0, ...items.map((i) => i.valor));
  if (!items.length || max <= 0) return <p className="py-6 text-center text-[13px] text-ink-3">{vacio}</p>;
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((i) => (
        <li key={i.id} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded-control px-1 py-1 hover:bg-sunken">
          <span className="truncate text-[13px] text-ink-2" title={i.detalle ? `${i.etiqueta} · ${i.detalle}` : i.etiqueta}>
            {i.etiqueta}
            {i.detalle && <span className="text-ink-3"> · {i.detalle}</span>}
          </span>
          <span className="h-3 rounded-r-[4px] bg-tinto" style={{ width: `${(i.valor / max) * 100}%`, minWidth: i.valor > 0 ? 2 : 0 }} aria-hidden />
          <span className="text-right text-[13px] font-semibold text-ink tabular">{formato(i.valor)}</span>
        </li>
      ))}
    </ul>
  );
}

const ALTO = 220;
const M = { top: 8, right: 16, bottom: 26, left: 52 };

/** Barras verticales agrupadas (categoría × serie), p. ej. día de inicio de desborre por cuartel y temporada. */
export function BarrasAgrupadas({
  categorias,
  series,
  formato = nf,
  unidad
}: {
  categorias: string[];
  series: Serie[];
  formato?: (v: number) => string;
  unidad?: string;
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...series.flatMap((s) => s.valores.map((v) => v ?? 0)));
  const { tope, marcas } = escala(max);
  const w = Math.max(0, ancho - M.left - M.right);
  const h = ALTO - M.top - M.bottom;
  const grupo = categorias.length ? w / categorias.length : 0;
  const barra = Math.max(2, Math.min(18, (grupo * 0.7 - 2 * (series.length - 1)) / Math.max(1, series.length)));
  const y = (v: number) => M.top + h - (v / tope) * h;
  return (
    <div>
      <Leyenda series={series} />
      <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
        {ancho > 0 && (
          <svg width={ancho} height={ALTO} role="img" aria-label={`Gráfico de barras: ${series.map((s) => s.nombre).join(', ')}`}>
            {marcas.map((m) => (
              <g key={m}>
                <line x1={M.left} x2={M.left + w} y1={y(m)} y2={y(m)} className="stroke-rule" strokeWidth={1} />
                <text x={M.left - 6} y={y(m)} dy="0.32em" textAnchor="end" className="fill-ink-3 text-[11px] tabular">
                  {formato(m)}
                </text>
              </g>
            ))}
            {categorias.map((c, ci) => {
              const x0 = M.left + ci * grupo + (grupo - (barra * series.length + 2 * (series.length - 1))) / 2;
              return (
                <g key={c} onMouseEnter={() => setHover(ci)} onTouchStart={() => setHover(ci)}>
                  <rect x={M.left + ci * grupo} y={M.top} width={grupo} height={h} className={hover === ci ? 'fill-sunken' : 'fill-transparent'} />
                  {series.map((s, si) => {
                    const v = s.valores[ci];
                    if (v == null) return null;
                    const top = y(v);
                    const alto = M.top + h - top;
                    const r = Math.min(4, alto, barra / 2);
                    const bx = x0 + si * (barra + 2);
                    // Extremo superior redondeado, base recta.
                    return (
                      <path
                        key={s.id}
                        className={FILL[s.color]}
                        d={`M${bx},${M.top + h} V${top + r} Q${bx},${top} ${bx + r},${top} H${bx + barra - r} Q${bx + barra},${top} ${bx + barra},${top + r} V${M.top + h} Z`}
                      />
                    );
                  })}
                  <text x={M.left + ci * grupo + grupo / 2} y={ALTO - 8} textAnchor="middle" className="fill-ink-3 text-[11px]">
                    {c}
                  </text>
                </g>
              );
            })}
            <line x1={M.left} x2={M.left + w} y1={M.top + h} y2={M.top + h} className="stroke-rule-strong" strokeWidth={1} />
          </svg>
        )}
        {hover != null && ancho > 0 && (
          <Tooltip x={M.left + hover * grupo + grupo / 2} y={M.top + 12}>
            <p className="mb-0.5 font-semibold">{categorias[hover]}</p>
            {series.map((s) => (
              <p key={s.id} className="flex items-center gap-1.5 text-ink-2">
                <span className={cn('size-2 rounded-[2px]', BG[s.color])} aria-hidden />
                {s.nombre}:{' '}
                <b className="text-ink tabular">{s.valores[hover] == null ? 'sin dato' : `${formato(s.valores[hover]!)}${unidad ? ` ${unidad}` : ''}`}</b>
              </p>
            ))}
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/** Líneas (p. ej. grados-día acumulados por mes y temporada), con mira y tooltip por posición del eje X. */
export function Lineas({
  etiquetasX,
  series,
  formato = nf,
  unidad
}: {
  etiquetasX: string[];
  series: Serie[];
  formato?: (v: number) => string;
  unidad?: string;
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...series.flatMap((s) => s.valores.map((v) => v ?? 0)));
  const { tope, marcas } = escala(max);
  const w = Math.max(0, ancho - M.left - M.right);
  const h = ALTO - M.top - M.bottom;
  const paso = etiquetasX.length > 1 ? w / (etiquetasX.length - 1) : 0;
  const x = (i: number) => M.left + i * paso;
  const y = (v: number) => M.top + h - (v / tope) * h;
  function mover(e: React.PointerEvent<SVGSVGElement>) {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    setHover(Math.max(0, Math.min(etiquetasX.length - 1, Math.round((px - M.left) / (paso || 1)))));
  }
  return (
    <div>
      <Leyenda series={series} />
      <div ref={ref} className="relative">
        {ancho > 0 && (
          <svg
            width={ancho}
            height={ALTO}
            role="img"
            aria-label={`Gráfico de líneas: ${series.map((s) => s.nombre).join(', ')}`}
            onPointerMove={mover}
            onPointerLeave={() => setHover(null)}
          >
            {marcas.map((m) => (
              <g key={m}>
                <line x1={M.left} x2={M.left + w} y1={y(m)} y2={y(m)} className="stroke-rule" strokeWidth={1} />
                <text x={M.left - 6} y={y(m)} dy="0.32em" textAnchor="end" className="fill-ink-3 text-[11px] tabular">
                  {formato(m)}
                </text>
              </g>
            ))}
            {etiquetasX.map((e, i) => (
              <text key={e} x={x(i)} y={ALTO - 8} textAnchor="middle" className="fill-ink-3 text-[11px]">
                {e}
              </text>
            ))}
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + h} className="stroke-rule-strong" strokeWidth={1} />}
            {/* La serie elegida (t0) se dibuja al final, encima. */}
            {[...series].reverse().map((s) => {
              const pts = s.valores.map((v, i) => (v == null ? null : ([x(i), y(v)] as const)));
              // Cortes donde falta el dato: no se une a través del hueco.
              const d = pts.reduce((acc, p, i) => (p ? acc + `${pts[i - 1] ? 'L' : 'M'}${p[0]},${p[1]} ` : acc), '');
              return (
                <g key={s.id}>
                  <path d={d} fill="none" className={STROKE[s.color]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {/* Un punto sin vecinos no forma línea: se marca para que no desaparezca. */}
                  {pts.map((p, i) =>
                    p && !pts[i - 1] && !pts[i + 1] && hover !== i ? (
                      <circle key={i} cx={p[0]} cy={p[1]} r={4} className={cn(FILL[s.color], 'stroke-raised')} strokeWidth={2} />
                    ) : null
                  )}
                  {hover != null && pts[hover] && (
                    <circle cx={pts[hover]![0]} cy={pts[hover]![1]} r={4} className={cn(FILL[s.color], 'stroke-raised')} strokeWidth={2} />
                  )}
                </g>
              );
            })}
            <line x1={M.left} x2={M.left + w} y1={M.top + h} y2={M.top + h} className="stroke-rule-strong" strokeWidth={1} />
          </svg>
        )}
        {hover != null && ancho > 0 && (
          <Tooltip x={Math.min(Math.max(x(hover), 70), ancho - 70)} y={M.top + 12}>
            <p className="mb-0.5 font-semibold">{etiquetasX[hover]}</p>
            {series.map((s) => (
              <p key={s.id} className="flex items-center gap-1.5 text-ink-2">
                <span className={cn('size-2 rounded-[2px]', BG[s.color])} aria-hidden />
                {s.nombre}:{' '}
                <b className="text-ink tabular">{s.valores[hover] == null ? 'sin dato' : `${formato(s.valores[hover]!)}${unidad ? ` ${unidad}` : ''}`}</b>
              </p>
            ))}
          </Tooltip>
        )}
      </div>
    </div>
  );
}
