import { ROLES } from '@winzer/domain';
import { AppShell } from '@/components/shell/app-shell';
import { getMemberships, requireOrg } from '@/lib/session';

export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { user, actor, org } = await requireOrg(slug);
  const memberships = await getMemberships(user.id);
  const roleName = ROLES[actor.role]?.nombre ?? actor.customRoles?.find((r) => r.id === actor.role)?.nombre ?? actor.role;
  return (
    <AppShell
      ctx={{
        org: { id: org.id, slug: org.slug, nombre: org.nombre },
        user: { id: user.id, name: user.name, email: user.email },
        role: actor.role,
        roleName,
        customRoles: actor.customRoles ?? []
      }}
      memberships={memberships.map((m) => ({ slug: m.slug, nombre: m.nombre }))}
    >
      {children}
    </AppShell>
  );
}
