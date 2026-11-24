import { schema, withOrg } from '@winzer/db';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page';
import { orgWith } from '@/lib/session';
import { MarcaView, type EtiquetaFila, type MarcaFila } from './view';

export const metadata = { title: 'Marca y etiquetas' };

/** Módulo ONLINE: marcas (INAPI) y versiones de etiqueta con sus costos. */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { allowed, fueraDePlan, actor } = await orgWith(org, 'marca');
  if (!allowed) return <NoAccess modulo="marca y etiquetas" plan={fueraDePlan} />;
  const { marca, etiqueta, proveedor, ordenEnvasado } = schema;
  const [marcas, etiquetas, proveedores, ordenes] = await withOrg(actor.orgId, (tx) =>
    Promise.all([
      tx.select().from(marca).where(isNull(marca.deletedAt)).orderBy(asc(marca.nombre)),
      tx.select().from(etiqueta).where(isNull(etiqueta.deletedAt)).orderBy(asc(etiqueta.nombre)),
      tx.select({ id: proveedor.id, nombre: proveedor.nombre }).from(proveedor).where(isNull(proveedor.deletedAt)).orderBy(asc(proveedor.nombre)),
      tx
        .select({ etiquetaId: ordenEnvasado.etiquetaId, unidades: ordenEnvasado.unidades })
        .from(ordenEnvasado)
        .where(and(eq(ordenEnvasado.estado, 'confirmada'), isNull(ordenEnvasado.deletedAt)))
    ])
  );
  const sin = <T extends Record<string, unknown>>({
    orgId: _o,
    createdAt: _c,
    updatedAt: _u,
    createdBy: _cb,
    updatedBy: _ub,
    deletedAt: _d,
    demo: _dm,
    ...r
  }: T) => r;
  return (
    <>
      <PageHeader
        area="Comercial"
        title="Marca y etiquetas"
        description="Marcas registradas en INAPI (se renuevan cada 10 años) y versiones de etiqueta. Los costos únicos de diseño se prorratean entre las botellas producidas con cada versión."
      />
      <MarcaView
        marcas={marcas.map((m) => sin(m) as MarcaFila)}
        etiquetas={etiquetas.map((e) => ({
          ...(sin(e) as EtiquetaFila),
          costoImpresion: Number(e.costoImpresion),
          graduacion: e.graduacion == null ? null : Number(e.graduacion),
          producidas: ordenes.filter((o) => o.etiquetaId === e.id).reduce((t, o) => t + o.unidades, 0)
        }))}
        proveedores={proveedores}
      />
    </>
  );
}
