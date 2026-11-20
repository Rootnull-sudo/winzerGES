import { membersOf, pendingInvitationsOf } from '@winzer/db';
import { ROLES } from '@winzer/domain';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page';
import { orgWith } from '@/lib/session';
import { UsuariosView } from './view';

export const metadata = { title: 'Usuarios y permisos' };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { actor, allowed, fueraDePlan } = await orgWith(org, 'usuarios');
  if (!allowed) return <NoAccess modulo="usuarios y permisos" plan={fueraDePlan} />;
  const [members, invitations] = await Promise.all([membersOf(actor.orgId), pendingInvitationsOf(actor.orgId)]);
  const roles = [...Object.values(ROLES), ...(actor.customRoles ?? [])].map((r) => ({ id: r.id, nombre: r.nombre, descripcion: r.descripcion }));
  return (
    <>
      <PageHeader
        area="Administración"
        title="Usuarios y permisos"
        description="Quién trabaja en esta viña y con qué rol. Una misma persona puede tener otro rol en otra viña (por ejemplo, tu contador)."
      />
      <UsuariosView
        members={members.map((m) => ({ ...m, desde: m.desde.toISOString() }))}
        invitations={invitations.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() }))}
        roles={roles}
        me={actor.userId}
      />
    </>
  );
}
