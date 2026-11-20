/**
 * Worker de tareas en segundo plano (ADR 0012). Proceso Node aparte de la web: `npm run worker`.
 *
 *  - pg-boss guarda la cola en el esquema `pgboss` del mismo Postgres (sin infraestructura nueva). Ese esquema
 *    queda fuera del RLS y se accede con DATABASE_URL_ADMIN, solo desde aquí.
 *  - Los jobs que tocan datos de una viña usan withOrg() con la conexión de la app (rol winzer_app, con RLS).
 *
 * Jobs:
 *  - `alertas.programar` (cron cada hora): encola un `alertas.calcular` por viña.
 *  - `alertas.calcular` { orgId }: evalúa las reglas (motor.ts) para esa viña.
 *  - `correo.resumen` (diario 7:00): resumen de avisos nuevos a quien lo activó.
 *  - `adjuntos.purgar` (domingos 3:00): borra del almacenamiento los adjuntos eliminados hace más de 30 días.
 */
import 'dotenv/config';
import PgBoss from 'pg-boss';
import { calcularAlertas } from '../alertas/motor';
import { REGLAS } from '../alertas/reglas';
import { db } from '../client';
import { enviarResumenes } from '../correo/envios';
import { purgarAdjuntos } from '../services/adjuntos';
import { organization } from '../schema';

export const COLAS = { programar: 'alertas.programar', calcular: 'alertas.calcular', purgar: 'adjuntos.purgar', resumen: 'correo.resumen' } as const;

export async function iniciarWorker() {
  const url = process.env.DATABASE_URL_ADMIN;
  if (!url) throw new Error('Falta DATABASE_URL_ADMIN para el worker.');
  const boss = new PgBoss({ connectionString: url, schema: 'pgboss' });
  boss.on('error', (e) => console.error('[worker]', e));
  await boss.start();
  for (const q of Object.values(COLAS)) await boss.createQueue(q);

  await boss.work(COLAS.programar, async () => {
    const orgs = await db().select({ id: organization.id }).from(organization);
    // singletonKey: si la viña ya tiene un cálculo en cola, no se encola otro.
    for (const o of orgs) await boss.send(COLAS.calcular, { orgId: o.id }, { singletonKey: o.id });
  });
  await boss.work<{ orgId: string }>(COLAS.calcular, { batchSize: 5 }, async (jobs) => {
    for (const j of jobs) {
      const r = await calcularAlertas(j.data.orgId, REGLAS);
      if (r.nuevas || r.resueltas || r.errores.length) console.log(`[alertas] ${j.data.orgId}`, r);
    }
  });
  await boss.work(COLAS.purgar, async () => {
    const orgs = await db().select({ id: organization.id }).from(organization);
    for (const o of orgs) {
      const n = await purgarAdjuntos(o.id);
      if (n) console.log(`[adjuntos] ${o.id}: ${n} archivos eliminados`);
    }
  });
  await boss.schedule(COLAS.programar, '0 * * * *', {}, { tz: 'America/Santiago' });
  await boss.work(COLAS.resumen, async () => {
    const r = await enviarResumenes(new Date(Date.now() - 24 * 3_600_000));
    if (r.enviados || r.fallidos) console.log('[correo] resumen diario', r);
  });
  // Todos los días 7:00: resumen de avisos nuevos a quien lo activó (F0-8).
  await boss.schedule(COLAS.resumen, '0 7 * * *', {}, { tz: 'America/Santiago' });
  // Domingo 3:00: archivos de adjuntos borrados hace más de 30 días (ADR 0013).
  await boss.schedule(COLAS.purgar, '0 3 * * 0', {}, { tz: 'America/Santiago' });
  // Al partir, un cálculo inmediato para no esperar a la próxima hora.
  await boss.send(COLAS.programar, {});
  console.log('✓ Worker listo: alertas cada hora (America/Santiago)');
  return boss;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const boss = await iniciarWorker();
  const salir = async () => {
    await boss.stop({ graceful: true, timeout: 10_000 });
    process.exit(0);
  };
  process.on('SIGINT', salir);
  process.on('SIGTERM', salir);
}
