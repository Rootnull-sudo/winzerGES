import {
  configVigente,
  datosPeriodo,
  datosRentabilidad,
  inventarioValorizado,
  listarTemporadas,
  movimientosCaja,
  participacionEnvase,
  saldosCxcCxp,
  schema,
  withOrg
} from '@winzer/db';
import {
  bcg,
  escenarios,
  estadoResultados,
  fechaHoy,
  flujoCaja,
  periodoMes,
  porFormato,
  puntoEquilibrio,
  ratios,
  recomendaciones,
  rentabilidadCuarteles
} from '@winzer/domain';
import { isNull } from 'drizzle-orm';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page';
import { orgWith } from '@/lib/session';
import { periodoDeVista } from '../periodo';
import { FinancieroView, type DatosFinanciero } from './view';

export const metadata = { title: 'Financiero' };

/**
 * Módulo ONLINE (F7-2; v1: modules/financiero). Todo se calcula con las funciones de `@winzer/domain/financiero`
 * (paridad con financial.js) sobre los datos del período (temporada de la barra superior o `?mes=`).
 */
export default async function Page({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ t?: string; mes?: string }> }) {
  const { org } = await params;
  const q = await searchParams;
  const { allowed, fueraDePlan, actor } = await orgWith(org, 'financiero');
  if (!allowed) return <NoAccess modulo="financiero" plan={fueraDePlan} />;
  const hoy = fechaHoy();
  const d = await withOrg(actor.orgId, async (tx) => {
    const pv = await periodoDeVista(tx, q);
    const cfg = await configVigente(tx, pv.periodo.hasta < hoy ? pv.periodo.hasta : hoy);
    const anioCaja = pv.anio ?? Number(pv.periodo.hasta.slice(0, 4));
    const temporadas = await listarTemporadas(tx);
    const temporada = pv.anio ? temporadas.find((t) => t.anio === pv.anio) : temporadas.find((t) => t.inicio <= pv.periodo.desde && t.fin >= pv.periodo.desde);
    // Meses del período (12 en una temporada) para el resultado mensual.
    const meses: string[] = [];
    for (let m = pv.periodo.desde.slice(0, 7); m <= pv.periodo.hasta.slice(0, 7);) {
      meses.push(m);
      const [y, mm] = m.split('-').map(Number) as [number, number];
      m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`;
    }
    const [actual, anterior, formatos, part, inv, movs, saldos, rent] = await Promise.all([
      datosPeriodo(tx, pv.periodo),
      datosPeriodo(tx, pv.anterior),
      tx.select().from(schema.formato).where(isNull(schema.formato.deletedAt)),
      participacionEnvase(tx),
      inventarioValorizado(tx),
      movimientosCaja(tx, anioCaja, cfg.tributario.diaF29),
      saldosCxcCxp(tx),
      temporada ? datosRentabilidad(tx, temporada.id) : Promise.resolve(null)
    ]);
    const mensual = [];
    for (const m of meses) mensual.push({ mes: m, datos: await datosPeriodo(tx, periodoMes(m)) });
    return { pv, cfg, anioCaja, actual, anterior, formatos, part, inv, movs, saldos, rent, mensual };
  });
  const t = d.cfg.tributario;
  const er = estadoResultados(d.actual, d.pv.periodo, t);
  const erAnt = estadoResultados(d.anterior, d.pv.anterior, t);
  const ids = d.formatos.map((f) => f.id);
  const pf = porFormato(d.actual.lineas, ids);
  const pfAnt = porFormato(d.anterior.lineas, ids);
  const fmts = d.formatos.map((f) => ({ id: f.id, nombre: f.nombre, litros: Number(f.litros) }));
  const nombre = (id: string) => (id === 'granel' ? 'Granel' : (fmts.find((f) => f.id === id)?.nombre ?? id));
  const pe = (aj = {}) => puntoEquilibrio(er, pf, fmts, d.part, t.tasaIDPC, aj);
  const rs = ratios(er, d.actual, d.inv, d.cfg);
  const fc = flujoCaja(d.anioCaja, d.movs, d.cfg.finanzas.saldoInicialCaja, fechaHoy().slice(0, 7));
  const conVentas = Object.values(pf).filter((x) => x.unidades > 0);
  const canales: Record<string, { ingresos: number; contribucion: number }> = {};
  for (const l of d.actual.lineas) {
    const k = l.tipo === 'granel' ? 'granel' : l.canal || 'directa';
    const c = (canales[k] ??= { ingresos: 0, contribucion: 0 });
    c.ingresos += l.neto;
    c.contribucion += l.neto - l.cantidad * l.costoUnitario;
  }
  const datos: DatosFinanciero = {
    etiqueta: d.pv.etiqueta,
    etiquetaAnterior: d.pv.etiquetaAnterior,
    mes: d.pv.mes,
    er,
    erAnterior: erAnt,
    mensual: d.mensual.map((m) => {
      const x = estadoResultados(m.datos, periodoMes(m.mes), t);
      return { mes: m.mes, ingresos: x.ingresos, costos: x.ingresos - x.uai, uai: x.uai };
    }),
    ratios: rs.list,
    inventario: d.inv,
    pf: Object.fromEntries(Object.entries(pf).map(([k, v]) => [k, { ...v, nombre: nombre(k) }])),
    formatos: fmts,
    participacion: d.part,
    tasaIDPC: t.tasaIDPC,
    escenarios: escenarios(pe),
    flujo: { anio: d.anioCaja, ...fc, ...d.saldos, saldoInicial: d.cfg.finanzas.saldoInicialCaja },
    canales: Object.entries(canales).map(([k, v]) => ({ id: k, ...v })),
    cuarteles: d.rent ? rentabilidadCuarteles(d.rent.cuarteles, d.rent.cosechas, d.rent.costosCampo, d.rent.ingresosLote, d.rent.kgLote) : [],
    bcg: bcg(
      conVentas.map((x) => ({ id: x.id, nombre: nombre(x.id), ingresos: x.ingresos })),
      Object.fromEntries(Object.values(pfAnt).map((x) => [x.id, x.ingresos]))
    ),
    recomendaciones: recomendaciones(er, rs, pe(), fc, d.cfg.finanzas.margenMinimo, d.saldos.cxc),
    margenMinimo: d.cfg.finanzas.margenMinimo
  };
  return (
    <>
      <PageHeader
        area="Finanzas"
        title="Financiero"
        description="Estado de resultados, ratios, punto de equilibrio, simulador, flujo de caja y rankings. Montos netos (sin IVA ni ILA); el impuesto es una provisión: el cálculo tributario está en Tributario › Renta."
      />
      <FinancieroView datos={datos} />
    </>
  );
}
