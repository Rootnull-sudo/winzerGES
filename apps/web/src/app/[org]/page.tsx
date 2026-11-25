import {
  bodegaHoy,
  configVigente,
  datosPeriodo,
  datosRentabilidad,
  f29Periodos,
  listarTemporadas,
  movimientosCaja,
  operacionPorTemporada,
  ordenesConCosto,
  participacionEnvase,
  rentaDelAnio,
  schema,
  withOrg
} from '@winzer/db';
import {
  AREAS,
  can,
  clp,
  costoPorFormato,
  costosIndirectos,
  elegirTemporada,
  estadoResultados,
  fechaHoy,
  flujoCaja,
  MODULES,
  nombrePeriodoCorto,
  porFormato,
  puntoEquilibrio,
  rangoPorDefecto,
  rentabilidadCuarteles,
  tax
} from '@winzer/domain';
import { isNull, sql } from 'drizzle-orm';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChartCard } from '@/components/ui/chart';
import { BarrasAgrupadasF, BarrasHF, LineasF } from './graficos';
import { PageHeader, Stat, StatGrid } from '@/components/ui/page';
import { moduleHref } from '@/lib/routes';
import { requireOrg } from '@/lib/session';
import { cn } from '@/lib/cn';
import { PanelAlertas } from './alertas-panel';
import { BotonImprimir } from './imprimir-boton';

const nf = (v: number) => (Math.round(v) || 0).toLocaleString('es-CL');
const pct = (v: number) => `${(Math.round(v * 1000) / 10 || 0).toLocaleString('es-CL')} %`;
const compacto = (v: number) => (Math.abs(v) >= 1e6 ? '$' + (v / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' M' : clp(Math.round(v) || 0));
const ESTADO_F29: Record<string, string> = { borrador: 'Borrador', revisado: 'Revisado', declarado: 'Declarado', pagado: 'Pagado' };

/** Variación contra la temporada anterior (v1: dashboard d(a, b)). */
function Delta({ a, b, invertir = false }: { a: number; b: number; invertir?: boolean }) {
  if (!b) return <span className="text-ink-4">sin temporada anterior</span>;
  const d = (a - b) / Math.abs(b);
  const bueno = invertir ? d < 0 : d > 0;
  return (
    <span className={cn('font-semibold', d === 0 ? 'text-ink-3' : bueno ? 'text-ok' : 'text-bad')}>
      {d > 0 ? '↑' : d < 0 ? '↓' : '='} {pct(Math.abs(d))} vs anterior
    </span>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="mb-8">
      <h2 className="mb-3 font-label text-[22px]">{titulo}</h2>
      {children}
    </section>
  );
}

/**
 * Dashboard (F7-3; v1: modules/dashboard). Indicadores de la temporada elegida en la barra superior comparados con
 * la anterior; cada bloque aparece solo si el rol ve su módulo.
 */
export default async function Inicio({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ t?: string }> }) {
  const { org: slug } = await params;
  const q = await searchParams;
  const { actor, org, user } = await requireOrg(slug);
  const ok = (m: string) => can(actor.role, m, 'v', actor.customRoles, actor.acceso);
  const verOp = ok('catastro') || ok('bodega') || ok('cosecha');
  const verCom = ok('ventas') || ok('financiero');
  const verFin = ok('financiero');
  const verTrib = ok('tributario');
  const hoy = fechaHoy();

  const d = await withOrg(actor.orgId, async (tx) => {
    const temporadas = await listarTemporadas(tx);
    const t = elegirTemporada(temporadas, q.t, hoy);
    const prev = temporadas.find((x) => x.anio === t.anio - 1) ?? rangoPorDefecto(t.anio - 1);
    const p = { desde: t.inicio, hasta: t.fin };
    const pAnt = { desde: prev.inicio, hasta: prev.fin };
    const cfg = await configVigente(tx);
    const op = verOp ? await operacionPorTemporada(tx) : [];
    const bod = verOp ? await bodegaHoy(tx) : null;
    const com = verCom ? { actual: await datosPeriodo(tx, p), anterior: await datosPeriodo(tx, pAnt) } : null;
    const formatos = verCom ? await tx.select().from(schema.formato).where(isNull(schema.formato.deletedAt)) : [];
    const stock = verCom
      ? await tx.execute<{ formato_id: string; stock: string }>(sql`select formato_id, sum(stock) as stock from v_stock_producto group by formato_id`)
      : [];
    const anioCaja = Number(hoy.slice(0, 4));
    const fin = verFin
      ? {
          part: await participacionEnvase(tx),
          ordenes: await ordenesConCosto(tx),
          movs: await movimientosCaja(tx, anioCaja, cfg.tributario.diaF29),
          rent: 'id' in t ? await datosRentabilidad(tx, String(t.id)) : null
        }
      : null;
    const mesAnt = tax.periodoAnterior(hoy.slice(0, 7));
    const trib = verTrib
      ? {
          f29: await f29Periodos(tx, `${hoy.slice(0, 4)}-01` < mesAnt ? `${hoy.slice(0, 4)}-01` : mesAnt, mesAnt),
          renta: await rentaDelAnio(tx, anioCaja - 1),
          dte: await tx.execute<{ mes: string; emitidos: string; recibidos: string }>(sql`
            select left(fecha, 7) as mes,
              coalesce(sum(total) filter (where direccion = 'emitido' and estado not in ('borrador', 'rechazado', 'anulado')), 0) as emitidos,
              coalesce(sum(total) filter (where direccion = 'recibido' and estado not in ('rechazado', 'anulado')), 0) as recibidos
            from dte where deleted_at is null and tipo <> 52 and left(fecha, 4) = ${hoy.slice(0, 4)} group by 1 order by 1`)
        }
      : null;
    return { t, prev, p, pAnt, cfg, op, bod, com, formatos, stock, fin, trib, anioCaja, mesAnt };
  });

  const { t, cfg } = d;
  const opAct = d.op.find((x) => x.anio === t.anio);
  const opAnt = d.op.find((x) => x.anio === t.anio - 1);
  const er = d.com ? estadoResultados(d.com.actual, d.p, cfg.tributario) : null;
  const erAnt = d.com ? estadoResultados(d.com.anterior, d.pAnt, cfg.tributario) : null;
  const ids = d.formatos.map((f) => f.id);
  const pf = d.com ? porFormato(d.com.actual.lineas, ids) : null;
  const migrated = MODULES.filter((m) => m.status === 'v2').length;
  const visibles = MODULES.filter((m) => m.id !== 'dashboard' && ok(m.id));
  const hora = new Date().getHours();

  return (
    <>
      <PageHeader
        title={`${hora < 12 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'}, ${user.name.split(' ')[0]}`}
        description={
          <>
            Resumen de <strong className="text-ink">{org.nombre}</strong> · Temporada {t.anio}, comparada con la {t.anio - 1}.
          </>
        }
        actions={<BotonImprimir />}
      />

      <div className="mb-8">
        <PanelAlertas />
      </div>

      {verOp && (
        <Bloque titulo="Operación y bodega">
          <StatGrid>
            <Stat label="Kg cosechados" value={nf(opAct?.kg ?? 0)} sub={<Delta a={opAct?.kg ?? 0} b={opAnt?.kg ?? 0} />} />
            <Stat
              label="Litros producidos"
              value={`${nf(opAct?.litros ?? 0)} L`}
              sub={
                opAct?.kg ? (
                  `${(opAct.litros / opAct.kg || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 })} L/kg`
                ) : (
                  <Delta a={opAct?.litros ?? 0} b={opAnt?.litros ?? 0} />
                )
              }
            />
            <Stat label="Litros envasados" value={`${nf(opAct?.envasado ?? 0)} L`} sub={`Granel vendido ${nf(opAct?.granelVendido ?? 0)} L`} />
            <Stat
              label="Mermas y vinagre"
              value={
                <span className={cn(!!opAct?.litros && opAct.mermas / opAct.litros > 0.03 && 'text-warn')}>
                  {pct(opAct?.litros ? opAct.mermas / opAct.litros : 0)}
                </span>
              }
              sub={`${nf(opAct?.mermas ?? 0)} L`}
            />
          </StatGrid>
          {d.bod && (
            <StatGrid>
              {(() => {
                const cap = d.bod.estanques.reduce((s, e) => s + e.capacidad, 0);
                const lit = d.bod.estanques.reduce((s, e) => s + e.litros, 0);
                return (
                  <Stat
                    label="Ocupación de bodega"
                    value={<span className={cn(cap > 0 && lit / cap > 0.9 && 'text-warn')}>{pct(cap ? lit / cap : 0)}</span>}
                    sub={`${nf(lit)} de ${nf(cap)} L`}
                  />
                );
              })()}
              <Stat label="Lotes en fermentación" value={opAct?.enFermentacion ?? 0} sub="Fermentando, macerando o en FML" />
              <Stat
                label="Granel en stock"
                value={`${nf(Object.values(d.bod.granelPorTipo).reduce((s, v) => s + v, 0))} L`}
                sub={`Blanco ${nf(d.bod.granelPorTipo.blanco ?? 0)} · Tinto ${nf(d.bod.granelPorTipo.tinto ?? 0)}`}
              />
            </StatGrid>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard titulo="Kg y litros por temporada">
              <BarrasAgrupadasF
                categorias={d.op.slice(-5).map((x) => String(x.anio))}
                series={[
                  { id: 'kg', nombre: 'Kg de uva', color: 't1', valores: d.op.slice(-5).map((x) => x.kg) },
                  { id: 'l', nombre: 'Litros', color: 't0', valores: d.op.slice(-5).map((x) => x.litros) }
                ]}
              />
            </ChartCard>
            {d.bod && (
              <ChartCard titulo="Ocupación por estanque">
                <BarrasHF
                  items={d.bod.estanques.map((e) => ({
                    id: e.codigo,
                    etiqueta: e.codigo,
                    detalle: `${nf(e.capacidad)} L`,
                    valor: e.capacidad ? Math.round((e.litros / e.capacidad) * 100) : 0
                  }))}
                  fmt="pct"
                  vacio="Sin estanques."
                />
              </ChartCard>
            )}
          </div>
        </Bloque>
      )}

      {er && erAnt && pf && (
        <Bloque titulo="Comercial">
          <StatGrid>
            <Stat label="Ingresos netos" value={clp(er.ingresos)} sub={<Delta a={er.ingresos} b={erAnt.ingresos} />} />
            <Stat label="Unidades vendidas" value={nf(er.unidades)} sub={<Delta a={er.unidades} b={erAnt.unidades} />} />
            <Stat label="Litros a granel vendidos" value={`${nf(pf.granel?.litros ?? 0)} L`} />
            <Stat label="Ticket promedio" value={clp(er.ventasN ? Math.round(er.ingresos / er.ventasN) : 0)} sub={`${er.ventasN} ventas`} />
          </StatGrid>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard titulo="Unidades vendidas y en stock por formato">
              <BarrasAgrupadasF
                categorias={d.formatos.map((f) => f.nombre)}
                series={[
                  { id: 'v', nombre: 'Vendidas', color: 't0', valores: d.formatos.map((f) => pf[f.id]?.unidades ?? 0) },
                  { id: 's', nombre: 'En stock', color: 't1', valores: d.formatos.map((f) => Number(d.stock.find((s) => s.formato_id === f.id)?.stock ?? 0)) }
                ]}
              />
            </ChartCard>
            <ChartCard titulo="Ingresos por canal">
              <BarrasHF
                items={Object.entries(er.porCanal)
                  .map(([k, v]) => ({ id: k, etiqueta: k === 'granel' ? 'Granel' : k.charAt(0).toUpperCase() + k.slice(1), valor: v }))
                  .sort((a, b) => b.valor - a.valor)}
                fmt="compacto"
                vacio="Sin ventas en la temporada."
              />
            </ChartCard>
          </div>
        </Bloque>
      )}

      {er && erAnt && pf && d.fin && (
        <Bloque titulo="Finanzas">
          {(() => {
            const fmts = d.formatos.map((f) => ({ id: f.id, nombre: f.nombre, litros: Number(f.litros) }));
            const pe = puntoEquilibrio(er, pf, fmts, d.fin.part, cfg.tributario.tasaIDPC);
            const mb = er.ingresos ? er.mb / er.ingresos : 0;
            const f75 = fmts.find((f) => Math.abs(f.litros - 0.75) < 0.001);
            const c75 = f75 ? costoPorFormato(f75, d.fin.ordenes, er.litros ? costosIndirectos(er) / er.litros : 0) : null;
            const fc = flujoCaja(d.anioCaja, d.fin.movs, cfg.finanzas.saldoInicialCaja, hoy.slice(0, 7));
            const cuarteles = d.fin.rent
              ? rentabilidadCuarteles(d.fin.rent.cuarteles, d.fin.rent.cosechas, d.fin.rent.costosCampo, d.fin.rent.ingresosLote, d.fin.rent.kgLote)
              : [];
            return (
              <>
                <StatGrid>
                  <Stat
                    label="Margen bruto"
                    value={<span className={cn(mb < cfg.finanzas.margenMinimo ? 'text-warn' : 'text-ok')}>{pct(mb)}</span>}
                    sub={`Mínimo ${pct(cfg.finanzas.margenMinimo)}`}
                  />
                  <Stat label="EBITDA" value={compacto(er.ebitda)} sub={<Delta a={er.ebitda} b={erAnt.ebitda} />} />
                  <Stat
                    label="Utilidad neta"
                    value={<span className={cn(er.un < 0 && 'text-bad')}>{compacto(er.un)}</span>}
                    sub={<Delta a={er.un} b={erAnt.un} />}
                  />
                  <Stat
                    label="Punto de equilibrio"
                    value={Number.isFinite(pe.pePesos) ? compacto(pe.pePesos) : '∞'}
                    sub={pe.alcanzado ? 'Alcanzado' : 'Aún no alcanzado'}
                  />
                </StatGrid>
                <StatGrid>
                  <Stat label="ROS" value={pct(er.ingresos ? er.un / er.ingresos : 0)} sub="Utilidad neta / ventas" />
                  <Stat
                    label="Costo botella 0,75 L"
                    value={c75 && c75.unidades ? clp(Math.round(c75.total)) : '—'}
                    sub={c75 && c75.unidades ? `Directo ${clp(Math.round(c75.directo))}` : 'Sin envasado'}
                  />
                  <Stat
                    label={`Caja proyectada a diciembre ${d.anioCaja}`}
                    value={<span className={cn(fc.saldoFinal < 0 && 'text-bad')}>{compacto(fc.saldoFinal)}</span>}
                    sub={fc.negativo ? `Negativa en ${nombrePeriodoCorto(fc.negativo.mes)}` : 'Sin meses negativos'}
                  />
                </StatGrid>
                <div className="grid gap-4 lg:grid-cols-2">
                  <ChartCard titulo={`Flujo de caja ${d.anioCaja}`}>
                    <LineasF
                      etiquetasX={fc.rows.map((r) => nombrePeriodoCorto(r.mes))}
                      series={[{ id: 's', nombre: 'Saldo', color: 't0', valores: fc.rows.map((r) => r.saldo) }]}
                      fmt="compacto"
                      referencia={{ valor: 0, etiqueta: 'Saldo cero' }}
                    />
                  </ChartCard>
                  <ChartCard titulo="Margen por cuartel">
                    <BarrasHF
                      items={cuarteles
                        .filter((c) => c.kg || c.costo)
                        .map((c) => ({ id: c.id, etiqueta: c.nombre, valor: c.margen }))
                        .sort((a, b) => b.valor - a.valor)}
                      fmt="compacto"
                      vacio="Sin cosechas en la temporada."
                    />
                  </ChartCard>
                </div>
              </>
            );
          })()}
        </Bloque>
      )}

      {d.trib && (
        <Bloque titulo="Tributario">
          {(() => {
            const f = d.trib.f29.find((x) => x.periodo === d.mesAnt);
            const anio = hoy.slice(0, 4);
            const ppm = d.trib.f29.filter((x) => x.periodo.startsWith(anio)).reduce((s, x) => s + x.calculo.ppm, 0);
            const r = d.trib.renta;
            return (
              <>
                <StatGrid>
                  <Stat label={`IVA débito ${nombrePeriodoCorto(d.mesAnt)}`} value={clp(f?.calculo.ivaDebito ?? 0)} />
                  <Stat label="F29 a pagar" value={clp(f?.calculo.total ?? 0)} sub={f?.registro ? ESTADO_F29[f.registro.estado] : 'Sin guardar'} />
                  <Stat label={`PPM acumulado ${anio}`} value={clp(ppm)} />
                  <Stat
                    label={`Renta AT${d.anioCaja}`}
                    value={r.registro ? ESTADO_F29[r.registro.estado] : 'Sin guardar'}
                    sub={r.calculo.aPagar ? `A pagar ${clp(r.calculo.aPagar)}` : `Devolución ${clp(r.calculo.devolucion)}`}
                  />
                </StatGrid>
                <ChartCard titulo={`Documentos emitidos y recibidos ${anio}`}>
                  <BarrasAgrupadasF
                    categorias={d.trib.dte.map((x) => nombrePeriodoCorto(x.mes))}
                    series={[
                      { id: 'e', nombre: 'Emitidos', color: 't0', valores: d.trib.dte.map((x) => Number(x.emitidos)) },
                      { id: 'r', nombre: 'Recibidos', color: 't1', valores: d.trib.dte.map((x) => Number(x.recibidos)) }
                    ]}
                    fmt="compacto"
                  />
                </ChartCard>
              </>
            );
          })()}
        </Bloque>
      )}

      <section aria-label="Tus módulos" className="print:hidden">
        <h2 className="mb-2.5 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">
          Tus módulos{' '}
          <span className="font-normal normal-case">
            · {migrated} de {MODULES.length} en v2
          </span>
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {AREAS.filter((a) => visibles.some((m) => m.area === a.id)).map((a) => (
            <section key={a.id} className="rounded-card border border-rule bg-raised px-4.5 pt-4 pb-1.5">
              <p className="mb-1 flex items-baseline justify-between gap-2">
                <span className="font-label text-[20px]">{a.name}</span>
                {a.offline && (
                  <Badge tone="ok" className="shrink-0 whitespace-nowrap">
                    funciona sin señal
                  </Badge>
                )}
              </p>
              <ul className="divide-y divide-rule">
                {visibles
                  .filter((m) => m.area === a.id)
                  .map((m) => (
                    <li key={m.id}>
                      <Link href={moduleHref(slug, m)} className="group flex h-11 items-center justify-between gap-3 text-[14px] hover:text-ink">
                        <span className={m.status === 'v2' ? 'font-medium' : 'text-ink-3'}>{m.name}</span>
                        {m.status === 'v2' ? (
                          <ArrowUpRight
                            size={15}
                            className="text-ink-4 transition-transform duration-150 group-hover:-translate-y-px group-hover:translate-x-px group-hover:text-ink"
                          />
                        ) : (
                          <span className="text-[11px] text-ink-4">pendiente</span>
                        )}
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </>
  );
}
