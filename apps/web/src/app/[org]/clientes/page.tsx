import { schema, withOrg } from '@winzer/db';
import { desc, isNull, sql } from 'drizzle-orm';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page';
import { orgWith } from '@/lib/session';
import { ClientesView } from './view';

export const metadata = { title: 'Clientes y cobranza' };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { actor, allowed, fueraDePlan } = await orgWith(slug, 'clientes');
  if (!allowed) return <NoAccess modulo="clientes" plan={fueraDePlan} />;
  // Sin WHERE org_id: la política RLS filtra por la viña activa.
  const [clientes, cobros, aplicaciones, porCobrar] = await withOrg(actor.orgId, (tx) =>
    Promise.all([
      tx.select().from(schema.cliente).where(isNull(schema.cliente.deletedAt)).orderBy(schema.cliente.nombre),
      tx.select().from(schema.cobro).where(isNull(schema.cobro.deletedAt)).orderBy(desc(schema.cobro.fecha)),
      tx.select().from(schema.cobroAplicacion).where(isNull(schema.cobroAplicacion.deletedAt)),
      tx.execute<{
        venta_id: string;
        cliente_id: string;
        codigo: string | null;
        documento: string;
        dte_folio: number | null;
        fecha: string;
        vencimiento: string | null;
        total: string;
        cobrado: string;
        saldo: string;
      }>(sql`select venta_id, cliente_id, codigo, documento, dte_folio, fecha, vencimiento, total, cobrado, saldo from v_por_cobrar`)
    ])
  );
  return (
    <>
      <PageHeader
        area="Comercial"
        title="Clientes y cobranza"
        description="Maestro de clientes con RUT validado, cuentas por cobrar con antigüedad y cobros aplicados a las ventas."
      />
      <ClientesView
        clientes={clientes.map((c) => ({
          id: c.id,
          version: c.version,
          demo: c.demo,
          nombre: c.nombre,
          rut: c.rut,
          tipo: c.tipo,
          giro: c.giro,
          canal: c.canal,
          contacto: c.contacto,
          email: c.email,
          telefono: c.telefono,
          direccion: c.direccion,
          comuna: c.comuna,
          condiciones: c.condiciones,
          plazo: c.plazo
        }))}
        cobros={cobros.map((c) => ({
          id: c.id,
          fecha: c.fecha,
          clienteId: c.clienteId,
          monto: c.monto,
          medio: c.medio,
          glosa: c.glosa,
          aplicaciones: aplicaciones.filter((a) => a.cobroId === c.id).map((a) => ({ ventaId: a.ventaId, monto: a.monto }))
        }))}
        ventas={porCobrar.map((v) => ({
          id: v.venta_id,
          clienteId: v.cliente_id,
          codigo: v.codigo,
          documento: v.documento,
          folio: v.dte_folio,
          fecha: v.fecha,
          vencimiento: v.vencimiento,
          total: Number(v.total),
          cobrado: Number(v.cobrado),
          saldo: Number(v.saldo)
        }))}
      />
    </>
  );
}
