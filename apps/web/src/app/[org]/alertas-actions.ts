'use server';
/** Campana de avisos: marcar alertas como vistas por el usuario (ADR 0012). */
import { marcarAlertasVistas, withOrg } from '@winzer/db';
import { revalidatePath } from 'next/cache';
import { requireOrg } from '@/lib/session';

export async function marcarVistas(slug: string, ids: string[]): Promise<void> {
  const { actor } = await requireOrg(slug);
  await withOrg(actor.orgId, (tx) => marcarAlertasVistas(tx, actor, ids.slice(0, 200)));
  revalidatePath(`/${slug}`, 'layout');
}
