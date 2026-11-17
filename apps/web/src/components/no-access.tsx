import { Lock } from 'lucide-react';
import { EmptyState } from './ui/page';

export function NoAccess({ modulo }: { modulo: string }) {
  return <EmptyState icon={<Lock size={28} />} title="Sin acceso" text={`Tu rol en esta viña no incluye ${modulo}. Pide acceso a un administrador.`} />;
}
