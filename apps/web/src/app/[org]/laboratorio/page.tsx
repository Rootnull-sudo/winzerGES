import { configVigente, withOrg } from '@winzer/db';
import { NoAccess } from '@/components/no-access';
import { orgWith } from '@/lib/session';
import { LaboratorioView } from './view';

export const metadata = { title: 'Laboratorio' };

/** Módulo OFFLINE: análisis desde IndexedDB; el servidor entrega los rangos objetivo vigentes. El informe se adjunta con conexión. */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { allowed, fueraDePlan, actor } = await orgWith(org, 'laboratorio');
  if (!allowed) return <NoAccess modulo="el laboratorio" plan={fueraDePlan} />;
  const cfg = await withOrg(actor.orgId, (tx) => configVigente(tx));
  return <LaboratorioView enologia={cfg.enologia} />;
}
