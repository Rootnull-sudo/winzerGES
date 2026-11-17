import 'server-only';
import { actorFor } from '@winzer/db';
import { NextResponse } from 'next/server';
import { getSession } from './session';

/** Para Route Handlers: resuelve el actor o responde 401/404 en JSON. */
export async function apiActor(slug: string) {
  const s = await getSession();
  if (!s) return { error: NextResponse.json({ error: 'Sesión expirada. Vuelve a iniciar sesión.' }, { status: 401 }) } as const;
  const ctx = await actorFor(s.user.id, s.user.name, slug);
  if (!ctx) return { error: NextResponse.json({ error: 'No perteneces a esta viña.' }, { status: 404 }) } as const;
  return { actor: ctx.actor, org: ctx.org } as const;
}

export function errorResponse(e: unknown) {
  const err = e as Error & { status?: number };
  if (!err.status) console.error(e);
  return NextResponse.json({ error: err.status ? err.message : 'Error interno.' }, { status: err.status ?? 500 });
}
