import { NoAccess } from '@/components/no-access';
import { orgWith } from '@/lib/session';
import { HistoricoView } from './view';

export const metadata = { title: 'Histórico kg y litros' };

/** Solo lectura y OFFLINE: se deriva de lotes, cosechas y movimientos de bodega en IndexedDB. */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { allowed, fueraDePlan } = await orgWith(org, 'historico');
  if (!allowed) return <NoAccess modulo="el histórico de kilos y litros" plan={fueraDePlan} />;
  return <HistoricoView />;
}
