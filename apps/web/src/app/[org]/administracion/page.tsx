import { configVigente, schema, withOrg } from '@winzer/db';
import { fechaHoy, periodoInput, rangoPeriodo } from '@winzer/domain';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page';
import { orgWith } from '@/lib/session';
import { AdministracionView, type ActivoRow, type GastoRow, type PresupuestoRow, type RemuneracionFila, type TrabajadorFila } from './view';

export const metadata = { title: 'Sueldos y gastos' };

/** Módulo ONLINE. Gastos y presupuesto (F3-4); trabajadores, remuneraciones y honorarios llegan en F4. */
export default async function Page({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ periodo?: string }> }) {
  const { org } = await params;
  const q = await searchParams;
  const periodo = q.periodo && periodoInput.safeParse(q.periodo).success ? q.periodo : fechaHoy().slice(0, 7);
  const { allowed, fueraDePlan, actor } = await orgWith(org, 'administracion');
  if (!allowed) return <NoAccess modulo="sueldos y gastos" plan={fueraDePlan} />;
  const { gasto, presupuesto, proveedor, activo, trabajador, remuneracion } = schema;
  const [gastos, presupuestos, proveedores, saldos, cfg, activos, trabajadores, rems, cfgMes] = await withOrg(actor.orgId, (tx) =>
    Promise.all([
      tx.select().from(gasto).where(isNull(gasto.deletedAt)),
      tx.select().from(presupuesto).where(isNull(presupuesto.deletedAt)),
      tx.select({ id: proveedor.id, nombre: proveedor.nombre }).from(proveedor).where(isNull(proveedor.deletedAt)).orderBy(asc(proveedor.nombre)),
      tx.execute<{ documento_id: string; saldo: string }>(sql`select documento_id, saldo from v_por_pagar where origen = 'gasto'`),
      configVigente(tx),
      tx.select().from(activo).where(isNull(activo.deletedAt)).orderBy(asc(activo.fechaCompra)),
      tx.select().from(trabajador).where(isNull(trabajador.deletedAt)).orderBy(asc(trabajador.nombre)),
      tx
        .select()
        .from(remuneracion)
        .where(and(eq(remuneracion.periodo, periodo), isNull(remuneracion.deletedAt))),
      configVigente(tx, rangoPeriodo(periodo).hasta)
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
  const as: ActivoRow[] = activos.map((a) => ({
    id: a.id,
    version: a.version,
    nombre: a.nombre,
    valor: a.valor,
    vidaUtilAnios: a.vidaUtilAnios,
    fechaCompra: a.fechaCompra,
    fechaBaja: a.fechaBaja,
    observaciones: a.observaciones
  }));
  const ts: TrabajadorFila[] = trabajadores.map(
    ({ orgId: _o, createdAt: _c, updatedAt: _u, createdBy: _cb, updatedBy: _ub, deletedAt: _d, demo: _dm, ...t }) => t
  );
  const rs: RemuneracionFila[] = rems.map(({ orgId: _o, createdAt: _c, updatedAt: _u, createdBy: _cb, updatedBy: _ub, deletedAt: _d, demo: _dm, ...r }) => ({
    ...r,
    horasExtraCantidad: Number(r.horasExtraCantidad),
    trabajadorFoto: r.trabajadorFoto as RemuneracionFila['trabajadorFoto'],
    parametros: r.parametros as RemuneracionFila['parametros']
  }));
  const ps: PresupuestoRow[] = presupuestos.map((p) => ({ anio: p.anio, categoria: p.categoria, monto: p.monto }));
  return (
    <>
      <PageHeader
        area="Finanzas"
        title="Sueldos y gastos"
        description="Gastos de administración, ventas y producción con su IVA, presupuesto contra real y activos fijos con su depreciación. Trabajadores, remuneraciones y honorarios se migran en la fase de personas."
      />
      <AdministracionView
        gastos={gs}
        presupuestos={ps}
        proveedores={proveedores}
        activos={as}
        trabajadores={ts}
        remuneraciones={cfg.remuneraciones}
        periodo={periodo}
        remuneracionesMes={rs}
        indicadoresMes={cfgMes.remuneraciones}
        tasaIVA={cfg.tributario.tasaIVA}
      />
    </>
  );
}
