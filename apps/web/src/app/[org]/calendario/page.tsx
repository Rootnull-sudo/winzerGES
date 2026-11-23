import { configVigente, withOrg } from '@winzer/db';
import { NoAccess } from '@/components/no-access';
import { orgWith } from '@/lib/session';
import { CalendarioView } from './view';

export const metadata = { title: 'Calendario de vendimia' };

/** Módulo OFFLINE: lotes y ventanas vienen de IndexedDB; el servidor entrega el umbral de desviación vigente. */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { allowed, fueraDePlan, actor } = await orgWith(org, 'calendario');
  if (!allowed) return <NoAccess modulo="el calendario de vendimia" plan={fueraDePlan} />;
  const cfg = await withOrg(actor.orgId, (tx) => configVigente(tx));
  return <CalendarioView desviacionDias={cfg.enologia.desviacionDias} />;
}
