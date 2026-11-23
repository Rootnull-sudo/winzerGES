import { NoAccess } from '@/components/no-access';
import { orgWith } from '@/lib/session';
import { VinificacionView } from './view';

export const metadata = { title: 'Vinificación y aditivos' };

/** Módulo OFFLINE: aditivos vienen de IndexedDB; el descuento de insumos lo hace el servidor al sincronizar. */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { allowed, fueraDePlan } = await orgWith(org, 'vinificacion');
  if (!allowed) return <NoAccess modulo="vinificación y aditivos" plan={fueraDePlan} />;
  return <VinificacionView />;
}
