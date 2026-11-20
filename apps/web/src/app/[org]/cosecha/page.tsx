import { configVigente, withOrg } from '@winzer/db';
import { NoAccess } from '@/components/no-access';
import { orgWith } from '@/lib/session';
import { CosechaView } from './view';

export const metadata = { title: 'Cosecha' };

/** Módulo OFFLINE: cosechas y jornales vienen de IndexedDB; el servidor entrega el rango de kg por cajón vigente. */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { allowed, fueraDePlan, actor } = await orgWith(org, 'cosecha');
  if (!allowed) return <NoAccess modulo="la cosecha" plan={fueraDePlan} />;
  const cfg = await withOrg(actor.orgId, (tx) => configVigente(tx));
  return <CosechaView kgCajon={{ min: cfg.enologia.kgCajonMin, max: cfg.enologia.kgCajonMax }} />;
}
