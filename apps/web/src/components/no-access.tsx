import { Lock } from 'lucide-react';
import { EmptyState } from './ui/page';

/** Sin acceso por rol, o porque el módulo no está en el plan de la viña (`plan` = plan que lo incluye). */
export function NoAccess({ modulo, plan }: { modulo: string; plan?: string | null }) {
  if (plan)
    return (
      <EmptyState
        icon={<Lock size={28} />}
        title={`Disponible en el plan ${plan}`}
        text={`El plan de esta viña no incluye ${modulo}. Un administrador puede cambiar de plan escribiéndonos.`}
      />
    );
  return <EmptyState icon={<Lock size={28} />} title="Sin acceso" text={`Tu rol en esta viña no incluye ${modulo}. Pide acceso a un administrador.`} />;
}
