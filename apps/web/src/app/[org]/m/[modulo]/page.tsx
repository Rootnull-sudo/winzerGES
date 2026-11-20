import { AREAS, moduleById } from '@winzer/domain';
import { Hourglass } from 'lucide-react';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/no-access';
import { EmptyState, PageHeader } from '@/components/ui/page';
import { orgWith } from '@/lib/session';

/** Módulos aún no migrados a v2: se explica y se apunta a la versión de escritorio. */
export default async function Pendiente({ params }: { params: Promise<{ org: string; modulo: string }> }) {
  const { org, modulo } = await params;
  const m = moduleById(modulo);
  if (!m) notFound();
  const { allowed, fueraDePlan } = await orgWith(org, m.id);
  if (!allowed) return <NoAccess modulo={m.name} plan={fueraDePlan} />;
  const area = AREAS.find((a) => a.id === m.area)!;
  return (
    <>
      <PageHeader area={area.name} title={m.name} />
      <EmptyState
        icon={<Hourglass size={28} />}
        title="Este módulo aún no está en la nube"
        text={
          <>
            Sigue disponible en Winzer de escritorio (v1). Cuando se migre, podrás importar tus datos desde un respaldo en Configuración.
            {area.offline && ' Funcionará también sin conexión.'}
          </>
        }
      />
    </>
  );
}
