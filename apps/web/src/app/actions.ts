'use server';
import { acceptInvitation, createOrganization } from '@winzer/db';
import { rutFormat, rutValid } from '@winzer/domain';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { requireUser } from '@/lib/session';

export type FormState = { error?: string } | undefined;

export async function createOrgAction(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const nombre = String(f.get('nombre') ?? '').trim();
  const rut = String(f.get('rut') ?? '').trim();
  if (nombre.length < 2) return { error: 'Escribe el nombre de la viña.' };
  if (rut && !rutValid(rut)) return { error: 'El RUT no es válido: revisa el dígito verificador.' };
  const { slug } = await createOrganization(u.id, { nombre, rut: rut ? rutFormat(rut) : null, razonSocial: String(f.get('razonSocial') ?? '').trim() || null });
  redirect(`/${slug}`);
}

export async function acceptInvitationAction(token: string): Promise<FormState> {
  const u = await requireUser();
  let slug: string;
  try {
    slug = await acceptInvitation(token, u.id);
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect(`/${slug}`);
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect('/login');
}
