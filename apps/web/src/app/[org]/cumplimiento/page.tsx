import { configVigente, controlesCumplimiento, existenciasDb, schema, withOrg } from '@winzer/db';
import { calendarioTributario, estadoObligacion, fechaHoy } from '@winzer/domain';
import { isNull, sql } from 'drizzle-orm';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page';
import { orgWith } from '@/lib/session';
import { CumplimientoView, type DatosCumplimiento } from './view';

export const metadata = { title: 'Cumplimiento normativo' };

/** Módulo ONLINE (F6-4): obligaciones con vencimiento, declaraciones SAG, verificaciones y libro de existencias. */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { allowed, fueraDePlan, actor } = await orgWith(org, 'cumplimiento');
  if (!allowed) return <NoAccess modulo="cumplimiento normativo" plan={fueraDePlan} />;
  const hoy = fechaHoy();
  const d = await withOrg(actor.orgId, async (tx) => {
    const [registros, controles, existencias, obligaciones, cfg, kg] = await Promise.all([
      tx.select().from(schema.cumplimiento).where(isNull(schema.cumplimiento.deletedAt)),
      controlesCumplimiento(tx, hoy),
      existenciasDb(tx),
      tx.select().from(schema.obligacion).where(isNull(schema.obligacion.deletedAt)),
      configVigente(tx),
      // Temporada vigente (la que contiene hoy) y sus kg cosechados, aunque aún no tenga cosechas.
      tx.execute<{ kg: string; anio: number | null }>(sql`
        select coalesce((select sum(c.kg) from cosecha c where c.temporada_id = t.id and c.deleted_at is null), 0) as kg, t.anio
        from temporada t where t.deleted_at is null and ${hoy} between t.inicio and t.fin limit 1`)
    ]);
    return { registros, controles, existencias, obligaciones, cfg, kg: kg[0] };
  });
  const reg = new Map(d.obligaciones.map((o) => [o.clave, o]));
  const anio = Number(hoy.slice(0, 4));
  const datos: DatosCumplimiento = {
    hoy,
    registros: d.registros.map((r) => ({
      id: r.id,
      version: r.version,
      demo: r.demo,
      nombre: r.nombre,
      tipo: r.tipo,
      numero: r.numero,
      estado: r.estado,
      fecha: r.fecha,
      vencimiento: r.vencimiento,
      avisoDias: r.avisoDias,
      responsable: r.responsable,
      notas: r.notas
    })),
    controles: d.controles,
    existencias: d.existencias,
    kgTemporada: Number(d.kg?.kg ?? 0),
    temporada: d.kg?.anio ?? null,
    calendario: [...calendarioTributario(anio, d.cfg.tributario), ...calendarioTributario(anio + 1, d.cfg.tributario)]
      // Las declaraciones SAG ya tienen su aviso fijo arriba: del calendario quedan las patentes.
      .filter((i) => i.modulo === 'cumplimiento' && i.tipo !== 'SAG')
      .map((i) => ({ ...i, ...estadoObligacion(i.fecha, reg.get(i.clave), hoy) }))
      .filter((i) => i.estado !== 'cumplida' && i.dias >= -30 && i.dias <= 60)
  };
  return (
    <>
      <PageHeader
        area="Tributario"
        title="Cumplimiento normativo"
        description="Obligaciones regulatorias con sus vencimientos. Referencias: Ley 18.455 y Decreto 78 (SAG), Ley 19.925 (patentes de alcoholes), INAPI (marcas) y SII."
      />
      <CumplimientoView datos={datos} />
    </>
  );
}
