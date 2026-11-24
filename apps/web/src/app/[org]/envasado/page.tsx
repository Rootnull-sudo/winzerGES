import { schema, withOrg } from '@winzer/db';
import { asc, isNull } from 'drizzle-orm';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page';
import { orgWith } from '@/lib/session';
import { EnvasadoView, type FormatoFila } from './view';

export const metadata = { title: 'Envasado y etiquetado' };

/** Módulo ONLINE: formatos (F5-1) y órdenes de envasado (F5-2). */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { allowed, fueraDePlan, actor } = await orgWith(org, 'envasado');
  if (!allowed) return <NoAccess modulo="envasado y etiquetado" plan={fueraDePlan} />;
  const formatos = await withOrg(actor.orgId, (tx) =>
    tx.select().from(schema.formato).where(isNull(schema.formato.deletedAt)).orderBy(asc(schema.formato.litros))
  );
  return (
    <>
      <PageHeader
        area="Comercial"
        title="Envasado y etiquetado"
        description="Órdenes de envasado con su costo por botella, formatos y validación de la etiqueta. Confirmar una orden descuenta los litros de bodega y los insumos en una sola operación."
      />
      <EnvasadoView
        formatos={formatos.map((f) => ({
          id: f.id,
          version: f.version,
          nombre: f.nombre,
          litros: Number(f.litros),
          envase: f.envase,
          unidadesCaja: f.unidadesCaja,
          stockMinimo: f.stockMinimo,
          stock: 0
        }))}
      />
    </>
  );
}
