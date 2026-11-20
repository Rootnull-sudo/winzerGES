/** Envíos de la plataforma: invitaciones y resumen diario de avisos (F0-8). */
import { ROLES } from '@winzer/domain';
import { and, eq } from 'drizzle-orm';
import { alertasPara } from '../alertas/motor';
import { db } from '../client';
import { actorFor, customRolesOf } from '../orgs';
import type { Actor } from '../repo';
import { member, organization, user } from '../schema';
import { withOrg } from '../tenancy';
import { enviarCorreo, urlApp, type ResultadoCorreo } from './index';
import { correoInvitacion, correoResumenAlertas } from './plantillas';

/** Envía el correo de una invitación recién creada. El enlace se arma con BETTER_AUTH_URL. */
export async function enviarInvitacion(actor: Actor, email: string, role: string, token: string): Promise<ResultadoCorreo & { enlace: string }> {
  const enlace = `${urlApp()}/invitacion/${token}`;
  const [o] = await db().select({ nombre: organization.nombre }).from(organization).where(eq(organization.id, actor.orgId));
  const rol = ROLES[role]?.nombre ?? (await customRolesOf(actor.orgId)).find((r) => r.id === role)?.nombre ?? role;
  const r = await enviarCorreo(correoInvitacion({ para: email, vina: o?.nombre ?? 'Winzer', rol, invitadoPor: actor.userName, enlace, diasVigencia: 7 }));
  return { ...r, enlace };
}

/** Activa o desactiva el resumen diario de avisos para el usuario en su viña. */
export async function setResumenAlertas(actor: Actor, activo: boolean) {
  await db()
    .update(member)
    .set({ resumenAlertas: activo })
    .where(and(eq(member.orgId, actor.orgId), eq(member.userId, actor.userId)));
}

export async function resumenAlertasActivo(actor: Actor): Promise<boolean> {
  const [m] = await db()
    .select({ r: member.resumenAlertas })
    .from(member)
    .where(and(eq(member.orgId, actor.orgId), eq(member.userId, actor.userId)));
  return !!m?.r;
}

/**
 * Job diario: a cada miembro que lo pidió, los avisos de su viña detectados desde `desde`, que puede ver y aún no
 * ha visto. Sin avisos nuevos no se envía nada.
 */
export async function enviarResumenes(desde: Date): Promise<{ enviados: number; fallidos: number }> {
  const filas = await db()
    .select({ slug: organization.slug, vina: organization.nombre, userId: user.id, nombre: user.name, email: user.email })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.orgId))
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.resumenAlertas, true), eq(member.estado, 'activo')));
  let enviados = 0,
    fallidos = 0;
  for (const f of filas) {
    const ctx = await actorFor(f.userId, f.nombre, f.slug);
    if (!ctx) continue;
    const nuevas = (await withOrg(ctx.actor.orgId, (tx) => alertasPara(tx, ctx.actor))).filter((a) => !a.vista && a.detectadaEn >= desde);
    if (!nuevas.length) continue;
    const r = await enviarCorreo(
      correoResumenAlertas({ para: f.email, nombre: f.nombre.split(' ')[0] ?? f.nombre, vina: f.vina, enlace: `${urlApp()}/${f.slug}`, alertas: nuevas })
    );
    if (r.enviado) enviados++;
    else fallidos++;
  }
  return { enviados, fallidos };
}
