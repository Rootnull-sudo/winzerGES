/**
 * Seed de desarrollo: dos viñas y tres usuarios para probar multi-viña, roles y RLS.
 *   - admin@winzer.test      → admin en "Viña Demo" y "Viña Los Robles" (contraseña: winzer1234)
 *   - agronomo@winzer.test   → agrónomo en "Viña Demo"
 *   - ventas@winzer.test     → ventas en "Viña Demo"
 * Los datos de negocio de "Viña Demo" se cargan importando el demo de v1 (mismo flujo que usará un cliente real).
 * Uso: npm run db:seed  (requiere que la app NO esté corriendo con otros usuarios; es idempotente)
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { adminDb } from './client';
import { importV1, type V1Dump } from './import-v1';
import { member, organization, user } from './schema';

const BASE = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

export const SEED_USERS = [
  { email: 'admin@winzer.test', name: 'Carolina Muñoz', password: 'winzer1234' },
  { email: 'agronomo@winzer.test', name: 'Diego Pérez', password: 'winzer1234' },
  { email: 'ventas@winzer.test', name: 'Valentina Rojas', password: 'winzer1234' }
];

/** Los usuarios se crean vía la API de Better Auth (hash de contraseña correcto). La app debe estar corriendo. */
async function ensureUser(u: (typeof SEED_USERS)[number]) {
  const [found] = await adminDb().select().from(user).where(eq(user.email, u.email));
  if (found) return found.id;
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify(u)
  });
  if (!res.ok) throw new Error(`No se pudo crear ${u.email}: ${res.status} ${await res.text()}`);
  const [created] = await adminDb().select().from(user).where(eq(user.email, u.email));
  return created!.id;
}

async function ensureOrg(id: string, slug: string, nombre: string, rut: string) {
  await adminDb()
    .insert(organization)
    .values({ id, slug, nombre, rut, razonSocial: nombre + ' SpA' })
    .onConflictDoNothing();
}

async function main() {
  const [admin, agro, ventas] = await Promise.all(SEED_USERS.map(ensureUser));
  await ensureOrg('org_demo', 'vina-demo', 'Viña Demo', '76.123.456-0');
  await ensureOrg('org_robles', 'los-robles', 'Viña Los Robles', '77.555.444-3');
  const add = (orgId: string, userId: string, role: string) => adminDb().insert(member).values({ orgId, userId, role }).onConflictDoNothing();
  await add('org_demo', admin!, 'admin');
  await add('org_robles', admin!, 'admin');
  await add('org_demo', agro!, 'agronomo');
  await add('org_demo', ventas!, 'ventas');

  const { demoDump } = await import('./seed-data');
  const actor = { orgId: 'org_demo', userId: admin!, userName: 'Carolina Muñoz', role: 'admin' };
  const rep = await importV1(actor, demoDump as V1Dump);
  // Los Robles: un cuartel propio para ver que los datos no se mezclan
  await importV1(
    { ...actor, orgId: 'org_robles' },
    {
      app: 'vina-gestion',
      data: {
        cuartel: [
          { id: 'r1', codigo: 'R-01', variedad: 'País', tipo: 'tinto', superficie: 4.2, valle: 'Itata', conduccion: 'Cabeza (gobelet)', anioPlantacion: 1945 }
        ]
      }
    }
  );
  console.log('✓ Seed listo', rep.importados);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
