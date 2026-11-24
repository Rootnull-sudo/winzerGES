import { configVigente, costosPorLote, datosPeriodo, ordenesConCosto, schema, withOrg } from '@winzer/db';
import { costoPorFormato, costosIndirectos, estadoResultados, porFormato } from '@winzer/domain';
import { isNull } from 'drizzle-orm';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page';
import { orgWith } from '@/lib/session';
import { periodoDeVista } from '../periodo';
import { CostosView, type DatosCostos } from './view';

export const metadata = { title: 'Costos por botella/litro' };

/**
 * Módulo ONLINE (F7-1; v1: modules/costos). Costo directo por lote y por formato (partes congeladas al confirmar
 * cada orden) y los indirectos del período prorrateados por litro vendido.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ t?: string; mes?: string }> }) {
  const { org } = await params;
  const q = await searchParams;
  const { allowed, fueraDePlan, actor } = await orgWith(org, 'costos');
  if (!allowed) return <NoAccess modulo="costos" plan={fueraDePlan} />;
  const d = await withOrg(actor.orgId, async (tx) => {
    const pv = await periodoDeVista(tx, q);
    const [datos, ordenes, lotes, formatos, cfg] = await Promise.all([
      datosPeriodo(tx, pv.periodo),
      ordenesConCosto(tx),
      costosPorLote(tx),
      tx.select().from(schema.formato).where(isNull(schema.formato.deletedAt)),
      configVigente(tx, pv.periodo.hasta)
    ]);
    return { pv, datos, ordenes, lotes, formatos, cfg };
  });
  const er = estadoResultados(d.datos, d.pv.periodo, d.cfg.tributario);
  const indirectos = costosIndirectos(er);
  const porLitro = er.litros ? indirectos / er.litros : 0;
  const pf = porFormato(
    d.datos.lineas,
    d.formatos.map((f) => f.id)
  );
  const totLitros = d.lotes.reduce((s, l) => s + l.litros, 0);
  const datos: DatosCostos = {
    etiqueta: d.pv.etiqueta,
    costoLitroPromedio: totLitros ? d.lotes.reduce((s, l) => s + l.total, 0) / totLitros : 0,
    indirectos,
    indirectoPorLitro: porLitro,
    litrosVendidos: er.litros,
    cogs: er.cogs,
    formatos: d.formatos
      .map((f) => ({
        id: f.id,
        nombre: f.nombre,
        litros: Number(f.litros),
        ...costoPorFormato({ id: f.id, litros: Number(f.litros) }, d.ordenes, porLitro, pf[f.id]?.precioProm ?? 0)
      }))
      .filter((f) => f.unidades > 0)
      .sort((a, b) => a.litros - b.litros),
    lotes: d.lotes
      .map((l) => ({ id: l.id, codigo: l.codigo, tipo: l.tipo, variedad: l.variedad, litros: l.litros, total: l.total, costoLitro: l.costoLitro, ...l.partes }))
      .sort((a, b) => b.codigo.localeCompare(a.codigo))
  };
  return (
    <>
      <PageHeader
        area="Finanzas"
        title="Costos por botella/litro"
        description="Costo directo de cada lote y costo unitario por formato. Los costos indirectos (sueldos, gastos generales, depreciación) se muestran aparte y se prorratean por litro vendido."
      />
      <CostosView datos={datos} />
    </>
  );
}
