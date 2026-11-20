import 'server-only';
import { actorFor, membershipsOf } from '@winzer/db';
import { can, enPlan, planQueIncluye, type Action } from '@winzer/domain';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { auth } from './auth';

/** Sesión del request (memoizada por render). */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export async function requireUser() {
  const s = await getSession();
  if (!s) redirect('/login');
  return s.user;
}

/** Usuario + viña del slug + rol. 404 si el usuario no es miembro (no revela que la viña existe). */
export const requireOrg = cache(async (slug: string) => {
  const u = await requireUser();
  const ctx = await actorFor(u.id, u.name, slug);
  if (!ctx) notFound();
  return { user: u, ...ctx };
});

export const getMemberships = cache(async (userId: string) => membershipsOf(userId));

/** Contexto + verificación de permiso para una página. `allowed=false` → mostrar <NoAccess/>. */
export async function orgWith(slug: string, moduleId: string, action: Action = 'v') {
  const ctx = await requireOrg(slug);
  const porRol = can(ctx.actor.role, moduleId, action, ctx.actor.customRoles);
  const allowed = porRol && can(ctx.actor.role, moduleId, action, ctx.actor.customRoles, ctx.actor.acceso);
  // Si el rol lo permite pero el plan no: nombre del plan que lo incluye, para explicarlo en <NoAccess>.
  const fueraDePlan = porRol && !allowed && !enPlan(ctx.actor.acceso, moduleId) ? planQueIncluye(moduleId).nombre : null;
  return { ...ctx, allowed, fueraDePlan };
}
