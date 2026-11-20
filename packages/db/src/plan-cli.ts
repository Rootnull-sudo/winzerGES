/**
 * Asigna el plan de una viña a mano, mientras no exista el cobro real (ADR 0014, F8-1).
 * Uso: npm run plan -- <slug> <piloto|esencial|completo> [prueba|activa|morosa|cancelada] [hasta yyyy-mm-dd]
 *   npm run plan -- vina-demo completo activa 2027-01-31
 * Usa la conexión de administración: es una herramienta de operación, no de la app.
 */
import 'dotenv/config';
import { accesoDe, fechaHoy, PLANES } from '@winzer/domain';
import { eq } from 'drizzle-orm';
import { adminDb } from './client';
import { organization, suscripcion } from './schema';

export async function asignarPlan(slug: string, planId: string, estado = 'activa', hasta: string | null = null) {
  if (!(planId in PLANES)) throw new Error(`Plan desconocido: ${planId}. Opciones: ${Object.keys(PLANES).join(', ')}.`);
  if (!['prueba', 'activa', 'morosa', 'cancelada'].includes(estado)) throw new Error(`Estado inválido: ${estado}.`);
  if (hasta && !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) throw new Error('La fecha va como yyyy-mm-dd.');
  const [org] = await adminDb().select({ id: organization.id }).from(organization).where(eq(organization.slug, slug));
  if (!org) throw new Error(`No existe la viña ${slug}.`);
  const fila = { orgId: org.id, planId, estado, periodoInicio: fechaHoy(), periodoFin: hasta, proveedor: 'manual', updatedAt: new Date() };
  await adminDb().insert(suscripcion).values(fila).onConflictDoUpdate({ target: suscripcion.orgId, set: fila });
  return accesoDe(fila, fechaHoy());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [slug, planId, estado, hasta] = process.argv.slice(2);
  if (!slug || !planId) {
    console.error('Uso: npm run plan -- <slug> <piloto|esencial|completo> [prueba|activa|morosa|cancelada] [hasta yyyy-mm-dd]');
    process.exit(1);
  }
  try {
    const a = await asignarPlan(slug, planId, estado, hasta ?? null);
    console.log(`✓ ${slug}: plan ${a.planNombre}, ${a.estado}${a.soloLectura ? ' (solo lectura)' : ''}${a.aviso ? ` · ${a.aviso}` : ''}`);
    process.exit(0);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
