import { configVigente, withOrg } from '@winzer/db';
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
  const cfg = await withOrg(actor.orgId, (tx) => configVigente(tx));
  return <InsumosView diasAvisoVencimiento={cfg.alertas.stockMinimoDiasVencimiento} valorJornada={cfg.remuneraciones.valorJornada} />;
}
