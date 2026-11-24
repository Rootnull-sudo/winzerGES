import { schema, withOrg } from '@winzer/db';
import { asc, isNull } from 'drizzle-orm';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page';
import { orgWith } from '@/lib/session';
import { ProveedoresView } from './view';

export const metadata = { title: 'Proveedores y compras' };

/** Módulo ONLINE: lee de Postgres en el servidor y escribe con Server Actions. */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { allowed, fueraDePlan, actor } = await orgWith(org, 'proveedores');
  if (!allowed) return <NoAccess modulo="proveedores y compras" plan={fueraDePlan} />;
  const proveedores = await withOrg(actor.orgId, (tx) =>
    tx.select().from(schema.proveedor).where(isNull(schema.proveedor.deletedAt)).orderBy(asc(schema.proveedor.nombre))
  );
  return (
    <>
      <PageHeader
        area="Finanzas"
        title="Proveedores y compras"
        description="Compras con sus líneas, cuentas por pagar, pagos y evolución de precios. Cada compra suma el stock del insumo y actualiza su precio."
      />
      <ProveedoresView
        proveedores={proveedores.map((p) => ({
          id: p.id,
          version: p.version,
          demo: p.demo,
          nombre: p.nombre,
          rut: p.rut,
          categoria: p.categoria,
          contacto: p.contacto,
          email: p.email,
          telefono: p.telefono,
          condiciones: p.condiciones,
          plazo: p.plazo
        }))}
      />
    </>
  );
}
