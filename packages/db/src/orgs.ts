/**
 * Viñas, membresías e invitaciones. Estas tablas NO tienen RLS (son el mapa de quién accede a qué):
 * todas las funciones de aquí filtran explícitamente por usuario y se usan solo desde el servidor.
 */
import { accesoDe, can, fechaHoy, ROLES, suscripcionInicial, type RoleDef } from '@winzer/domain';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from './client';
import { invitation, member, organization, orgRole, suscripcion, user } from './schema';
import type { Actor } from './repo';
import { asegurarTemporada } from './services/temporadas';
import { withOrg } from './tenancy';

export interface Membership {
  orgId: string;
  slug: string;
  nombre: string;
  role: string;
}

export async function membershipsOf(userId: string): Promise<Membership[]> {
  return db()
    .select({ orgId: organization.id, slug: organization.slug, nombre: organization.nombre, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.orgId))
    .where(and(eq(member.userId, userId), eq(member.estado, 'activo')))
    .orderBy(organization.nombre);
}

/** Resuelve la viña por slug y verifica que el usuario sea miembro activo. Devuelve el actor para withOrg/repo. */
export async function actorFor(userId: string, userName: string, slug: string) {
  const [row] = await db()
    .select({ org: organization, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.orgId))
    .where(and(eq(member.userId, userId), eq(organization.slug, slug), eq(member.estado, 'activo')))
    .limit(1);
  if (!row) return null;
  const [customRoles, sus] = await Promise.all([ROLES[row.role] ? [] : customRolesOf(row.org.id), suscripcionDe(row.org.id)]);
  const actor: Actor = { orgId: row.org.id, userId, userName, role: row.role, customRoles, acceso: accesoDe(sus, fechaHoy()) };
  return { actor, org: row.org };
}

/** Suscripción vigente de la viña (null si se creó antes de F0-7: se trata como piloto). */
export async function suscripcionDe(orgId: string) {
  const [s] = await withOrg(orgId, (tx) => tx.select().from(suscripcion).limit(1));
  return s ?? null;
}

export async function customRolesOf(orgId: string): Promise<RoleDef[]> {
  const rows = await withOrg(orgId, (tx) => tx.select().from(orgRole));
  return rows.map((r) => ({ id: r.id, nombre: r.nombre, descripcion: r.descripcion, permisos: r.permisos }));
}

export function slugify(s: string) {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'vina'
  );
}

/** Crea una viña con el usuario como administrador. */
export async function createOrganization(userId: string, input: { nombre: string; rut?: string | null; razonSocial?: string | null; slug?: string }) {
  const baseSlug = slugify(input.slug || input.nombre);
  let slug = baseSlug;
  for (let i = 2; ; i++) {
    const [taken] = await db().select({ id: organization.id }).from(organization).where(eq(organization.slug, slug)).limit(1);
    if (!taken) break;
    slug = `${baseSlug}-${i}`;
  }
  const id = randomUUID();
  await db().transaction(async (tx) => {
    await tx.insert(organization).values({ id, slug, nombre: input.nombre, rut: input.rut ?? null, razonSocial: input.razonSocial ?? null });
    await tx.insert(member).values({ orgId: id, userId, role: 'admin' });
    // La viña parte con su temporada actual (ADR 0011). temporada tiene RLS: se fija la viña en esta transacción.
    await tx.execute(sql`select set_config('app.org_id', ${id}, true)`);
    await asegurarTemporada(tx, id, fechaHoy());
    // Prueba de 30 días del plan completo (ADR 0014).
    await tx.insert(suscripcion).values({ orgId: id, ...suscripcionInicial(fechaHoy()) });
  });
  return { id, slug };
}

/** Miembros activos + invitaciones vigentes sin aceptar: lo que cuenta para el límite de usuarios del plan. */
export async function usuariosUsados(orgId: string): Promise<number> {
  const [m] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(member)
    .where(and(eq(member.orgId, orgId), eq(member.estado, 'activo')));
  const [i] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(invitation)
    .where(and(eq(invitation.orgId, orgId), isNull(invitation.acceptedAt), gt(invitation.expiresAt, new Date())));
  return (m?.n ?? 0) + (i?.n ?? 0);
}

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

/** Crea una invitación y devuelve el token en claro (solo esta vez) para armar el enlace. */
export async function createInvitation(actor: Actor, email: string, role: string) {
  if (!can(actor.role, 'usuarios', 'c', actor.customRoles, actor.acceso)) throw Object.assign(new Error('Tu rol no puede invitar usuarios.'), { status: 403 });
  if (actor.acceso) {
    const usados = await usuariosUsados(actor.orgId);
    if (usados >= actor.acceso.maxUsuarios)
      throw Object.assign(
        new Error(`Tu plan ${actor.acceso.planNombre} permite ${actor.acceso.maxUsuarios} usuarios y ya hay ${usados} (incluye invitaciones pendientes).`),
        { status: 403 }
      );
  }
  const token = randomBytes(24).toString('base64url');
  await db()
    .insert(invitation)
    .values({
      id: randomUUID(),
      orgId: actor.orgId,
      email: email.trim().toLowerCase(),
      role,
      tokenHash: hash(token),
      invitedBy: actor.userId,
      expiresAt: new Date(Date.now() + 7 * 86_400_000)
    });
  return token;
}

export async function findInvitation(token: string) {
  const [row] = await db()
    .select({ inv: invitation, org: { nombre: organization.nombre, slug: organization.slug } })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.orgId))
    .where(and(eq(invitation.tokenHash, hash(token)), isNull(invitation.acceptedAt), gt(invitation.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

/** Acepta una invitación: el correo del usuario debe coincidir con el invitado. */
export async function acceptInvitation(token: string, userId: string) {
  const row = await findInvitation(token);
  if (!row) throw new Error('La invitación no existe, ya se usó o expiró.');
  const [u] = await db().select().from(user).where(eq(user.id, userId));
  if (!u || u.email.toLowerCase() !== row.inv.email) throw new Error(`Esta invitación es para ${row.inv.email}. Inicia sesión con ese correo.`);
  await db().transaction(async (tx) => {
    await tx
      .insert(member)
      .values({ orgId: row.inv.orgId, userId, role: row.inv.role })
      .onConflictDoUpdate({ target: [member.orgId, member.userId], set: { role: row.inv.role, estado: 'activo' } });
    await tx.update(invitation).set({ acceptedAt: new Date() }).where(eq(invitation.id, row.inv.id));
  });
  return row.org.slug;
}

export async function membersOf(orgId: string) {
  return db()
    .select({ userId: user.id, nombre: user.name, email: user.email, role: member.role, estado: member.estado, desde: member.createdAt })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.orgId, orgId))
    .orderBy(user.name);
}

export async function pendingInvitationsOf(orgId: string) {
  return db()
    .select({ id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt })
    .from(invitation)
    .where(and(eq(invitation.orgId, orgId), isNull(invitation.acceptedAt), gt(invitation.expiresAt, new Date())));
}

export async function setMemberRole(actor: Actor, userId: string, role: string) {
  if (!can(actor.role, 'usuarios', 'e', actor.customRoles, actor.acceso)) throw Object.assign(new Error('Tu rol no puede cambiar permisos.'), { status: 403 });
  if (userId === actor.userId && role !== 'admin') throw new Error('No puedes quitarte el rol de administrador a ti mismo.');
  await db()
    .update(member)
    .set({ role })
    .where(and(eq(member.orgId, actor.orgId), eq(member.userId, userId)));
}
