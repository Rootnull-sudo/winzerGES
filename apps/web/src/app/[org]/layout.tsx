import { alertasPara, resumenAlertasActivo, withOrg } from '@winzer/db';
import { fechaHoy, ROLES, temporadaActual } from '@winzer/domain';
import { AppShell } from '@/components/shell/app-shell';
import { getMemberships, requireOrg } from '@/lib/session';
import { getTemporadas } from '@/lib/temporada';

export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { user, actor, org } = await requireOrg(slug);
  const [memberships, temporadas, alertas, resumenAlertas] = await Promise.all([
    getMemberships(user.id),
    getTemporadas(org.id),
    withOrg(org.id, (tx) => alertasPara(tx, actor)),
    resumenAlertasActivo(actor)
  ]);
  const roleName = ROLES[actor.role]?.nombre ?? actor.customRoles?.find((r) => r.id === actor.role)?.nombre ?? actor.role;
  return (
    <AppShell
      ctx={{
        org: { id: org.id, slug: org.slug, nombre: org.nombre },
        user: { id: user.id, name: user.name, email: user.email },
        role: actor.role,
        roleName,
        customRoles: actor.customRoles ?? [],
        acceso: actor.acceso!,
        resumenAlertas,
        temporadas: temporadas.map(({ id, anio, inicio, fin, estado }) => ({ id, anio, inicio, fin, estado })),
        temporadaActual: temporadaActual(temporadas, fechaHoy())?.anio ?? null,
        alertas: alertas.map(({ id, severidad, titulo, mensaje, ruta, detectadaEn, vista }) => ({
          id,
          severidad,
          titulo,
          mensaje,
          ruta,
          detectadaEn: detectadaEn.toISOString(),
          vista
        }))
      }}
      memberships={memberships.map((m) => ({ slug: m.slug, nombre: m.nombre }))}
    >
      {children}
    </AppShell>
  );
}
