import { configVigente, withOrg } from '@winzer/db';
import { NoAccess } from '@/components/no-access';
import { orgWith } from '@/lib/session';
import { FenologiaView } from './view';

export const metadata = { title: 'Desborre y fenología' };

/** Módulo OFFLINE: los registros vienen de IndexedDB; el servidor solo verifica acceso y entrega la Tbase vigente. */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { allowed, fueraDePlan, actor } = await orgWith(org, 'fenologia');
  if (!allowed) return <NoAccess modulo="desborre y fenología" plan={fueraDePlan} />;
  const cfg = await withOrg(actor.orgId, (tx) => configVigente(tx));
  return <FenologiaView tbase={cfg.enologia.tempBaseGD} />;
}
