import { configVigente, schema, withOrg } from '@winzer/db';
import { asc, isNull } from 'drizzle-orm';
import { NoAccess } from '@/components/no-access';
import { orgWith } from '@/lib/session';
import { InsumosView } from './view';

export const metadata = { title: 'Insumos y labores' };

/**
 * Módulo OFFLINE de lectura (el maestro y los movimientos vienen de IndexedDB). Escribir el maestro y los
 * ajustes exige conexión; aplicaciones y labores se registran sin señal.
 */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { allowed, fueraDePlan, actor } = await orgWith(org, 'insumos');
  if (!allowed) return <NoAccess modulo="insumos y labores" plan={fueraDePlan} />;
  const [cfg, proveedores] = await withOrg(actor.orgId, (tx) =>
    Promise.all([
      configVigente(tx),
      tx
        .select({ id: schema.proveedor.id, nombre: schema.proveedor.nombre })
        .from(schema.proveedor)
        .where(isNull(schema.proveedor.deletedAt))
        .orderBy(asc(schema.proveedor.nombre))
    ])
  );
  return <InsumosView diasAvisoVencimiento={cfg.alertas.stockMinimoDiasVencimiento} valorJornada={cfg.remuneraciones.valorJornada} proveedores={proveedores} />;
}
