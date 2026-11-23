'use server';
/** Campana de avisos: marcar alertas como vistas por el usuario (ADR 0012). */
import { marcarAlertasVistas, marcarTarea, setResumenAlertas, withOrg } from '@winzer/db';
import { revalidatePath } from 'next/cache';
import { requireOrg } from '@/lib/session';

export async function marcarVistas(slug: string, ids: string[]): Promise<void> {
  const { actor } = await requireOrg(slug);
  await withOrg(actor.orgId, (tx) => marcarAlertasVistas(tx, actor, ids.slice(0, 200)));
  revalidatePath(`/${slug}`, 'layout');
}

/** Activa o desactiva el resumen diario de avisos por correo para el usuario en esta viña (F0-8). */
export async function cambiarResumen(slug: string, activo: boolean): Promise<void> {
  const { actor } = await requireOrg(slug);
  await setResumenAlertas(actor, activo);
  revalidatePath(`/${slug}`, 'layout');
}

/** Marca una tarea de la bandeja como hecha (F2-3). */
export async function marcarTareaHecha(slug: string, id: string): Promise<void> {
  const { actor } = await requireOrg(slug);
  await withOrg(actor.orgId, (tx) => marcarTarea(tx, actor, id, true));
  revalidatePath(`/${slug}`, 'layout');
}
