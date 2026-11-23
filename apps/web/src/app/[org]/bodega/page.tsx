import { NoAccess } from '@/components/no-access';
import { orgWith } from '@/lib/session';
import { BodegaView } from './view';

export const metadata = { title: 'Control de bodega' };

/** Módulo OFFLINE: estanques y movimientos vienen de IndexedDB; capacidad y stock se validan también en el servidor. */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { allowed, fueraDePlan } = await orgWith(org, 'bodega');
  if (!allowed) return <NoAccess modulo="el control de bodega" plan={fueraDePlan} />;
  return <BodegaView />;
}
