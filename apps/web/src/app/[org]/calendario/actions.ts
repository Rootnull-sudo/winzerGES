'use server';
/** Calendario: cargar las ventanas de vendimia referenciales (en línea; luego el cliente sincroniza). */
import { cargarVentanasBase, withOrg } from '@winzer/db';
import { can } from '@winzer/domain';
import { requireOrg } from '@/lib/session';

export async function cargarVentanasAction(slug: string): Promise<{ ok: boolean; cargadas?: number; error?: string }> {
  const { actor } = await requireOrg(slug);
  if (!can(actor.role, 'calendario', 'c', actor.customRoles, actor.acceso)) return { ok: false, error: 'Tu rol no puede crear ventanas de vendimia.' };
  const cargadas = await withOrg(actor.orgId, (tx) => cargarVentanasBase(tx, actor.orgId, actor.userId));
  return { ok: true, cargadas };
}
