'use server';
import { createInvitation, setMemberRole } from '@winzer/db';
import { ROLES } from '@winzer/domain';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireOrg } from '@/lib/session';

export async function inviteAction(slug: string, email: string, role: string): Promise<{ link?: string; error?: string }> {
  const { actor } = await requireOrg(slug);
  if (!z.email().safeParse(email.trim()).success) return { error: 'Correo inválido.' };
  if (!ROLES[role] && !actor.customRoles?.some((r) => r.id === role)) return { error: 'Rol inválido.' };
  try {
    const token = await createInvitation(actor, email, role);
    const h = await headers();
    const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
    revalidatePath(`/${slug}/usuarios`);
    return { link: `${origin}/invitacion/${token}` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function setRoleAction(slug: string, userId: string, role: string): Promise<{ error?: string }> {
  const { actor } = await requireOrg(slug);
  try {
    await setMemberRole(actor, userId, role);
    revalidatePath(`/${slug}/usuarios`);
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}
