import { configVigente, withOrg } from '@winzer/db';
import { NoAccess } from '@/components/no-access';
import { orgWith } from '@/lib/session';
import { FermentacionView } from './view';

export const metadata = { title: 'Fermentación' };

/** Módulo OFFLINE: fichas, seguimiento y SO₂ vienen de IndexedDB; el servidor entrega los rangos de enología vigentes. */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { allowed, fueraDePlan, actor } = await orgWith(org, 'fermentacion');
  if (!allowed) return <NoAccess modulo="la fermentación" plan={fueraDePlan} />;
  const cfg = await withOrg(actor.orgId, (tx) => configVigente(tx));
  return <FermentacionView enologia={cfg.enologia} />;
}
