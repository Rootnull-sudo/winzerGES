'use server';
import { createInvitation, enviarInvitacion, setMemberRole } from '@winzer/db';
import { ROLES } from '@winzer/domain';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireOrg } from '@/lib/session';

/** `correo`: enviado por Resend, solo registrado en la consola (sin RESEND_API_KEY) o fallido (el enlace sirve igual). */
export async function inviteAction(
  slug: string,
  email: string,
  role: string
): Promise<{ link?: string; correo?: 'enviado' | 'consola' | 'fallido'; error?: string }> {
  const { actor } = await requireOrg(slug);
  if (!z.email().safeParse(email.trim()).success) return { error: 'Correo inválido.' };
  if (!ROLES[role] && !actor.customRoles?.some((r) => r.id === role)) return { error: 'Rol inválido.' };
  try {
    const token = await createInvitation(actor, email, role);
    const r = await enviarInvitacion(actor, email.trim().toLowerCase(), role, token);
    revalidatePath(`/${slug}/usuarios`);
    return { link: r.enlace, correo: !r.enviado ? 'fallido' : r.via === 'resend' ? 'enviado' : 'consola' };
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
