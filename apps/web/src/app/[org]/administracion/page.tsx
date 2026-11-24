import { configVigente, schema, withOrg } from '@winzer/db';
import { asc, isNull, sql } from 'drizzle-orm';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page';
import { orgWith } from '@/lib/session';
import { AdministracionView, type GastoRow, type PresupuestoRow } from './view';

export const metadata = { title: 'Sueldos y gastos' };

/** Módulo ONLINE. Gastos y presupuesto (F3-4); trabajadores, remuneraciones y honorarios llegan en F4. */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { allowed, fueraDePlan, actor } = await orgWith(org, 'administracion');
  if (!allowed) return <NoAccess modulo="sueldos y gastos" plan={fueraDePlan} />;
  const { gasto, presupuesto, proveedor } = schema;
  const [gastos, presupuestos, proveedores, saldos, cfg] = await withOrg(actor.orgId, (tx) =>
    Promise.all([
      tx.select().from(gasto).where(isNull(gasto.deletedAt)),
      tx.select().from(presupuesto).where(isNull(presupuesto.deletedAt)),
      tx.select({ id: proveedor.id, nombre: proveedor.nombre }).from(proveedor).where(isNull(proveedor.deletedAt)).orderBy(asc(proveedor.nombre)),
      tx.execute<{ documento_id: string; saldo: string }>(sql`select documento_id, saldo from v_por_pagar where origen = 'gasto'`),
      configVigente(tx)
    ])
  );
  const saldo = new Map(saldos.map((s) => [s.documento_id, Number(s.saldo)]));
  const gs: GastoRow[] = gastos.map((g) => ({
    id: g.id,
    version: g.version,
    fecha: g.fecha,
    categoria: g.categoria,
    descripcion: g.descripcion,
    proveedorId: g.proveedorId,
    monto: g.monto,
    documento: g.documento,
    folio: g.folio,
    afectoIVA: g.afectoIVA,
    iva: g.iva,
    total: g.total,
    medioPago: g.medioPago,
    estado: g.estado,
    tipoCosto: g.tipoCosto,
    area: g.area,
    noDeducible: g.noDeducible,
    observaciones: g.observaciones,
    saldo: saldo.get(g.id) ?? null
  }));
  const ps: PresupuestoRow[] = presupuestos.map((p) => ({ anio: p.anio, categoria: p.categoria, monto: p.monto }));
  return (
    <>
      <PageHeader
        area="Finanzas"
        title="Sueldos y gastos"
        description="Gastos de administración, ventas y producción con su IVA, y presupuesto contra real. Trabajadores, remuneraciones y honorarios se migran en la fase de personas."
      />
      <AdministracionView gastos={gs} presupuestos={ps} proveedores={proveedores} tasaIVA={cfg.tributario.tasaIVA} />
    </>
  );
}
