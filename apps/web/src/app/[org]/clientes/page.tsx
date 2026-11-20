import { schema, withOrg } from '@winzer/db';
import { desc, isNull } from 'drizzle-orm';
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
  const [clientes, cobros] = await withOrg(actor.orgId, (tx) =>
    Promise.all([
      tx.select().from(schema.cliente).where(isNull(schema.cliente.deletedAt)).orderBy(schema.cliente.nombre),
      tx.select().from(schema.cobro).where(isNull(schema.cobro.deletedAt)).orderBy(desc(schema.cobro.fecha))
    ])
  );
  return (
    <>
      <PageHeader
        area="Comercial"
        title="Clientes y cobranza"
        description="Maestro de clientes con RUT validado y registro de cobros para la conciliación bancaria."
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
        cobros={cobros.map((c) => ({ id: c.id, fecha: c.fecha, clienteId: c.clienteId, monto: c.monto, medio: c.medio, glosa: c.glosa }))}
      />
    </>
  );
}
