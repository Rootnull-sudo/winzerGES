/**
 * Borra TODA la base local y la recrea desde las migraciones. Solo para desarrollo:
 * se niega a correr si DATABASE_URL_ADMIN no apunta a localhost.
 * Uso típico: después de rehacer migraciones al integrar main (ver docs/v2/colaboracion.md).
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { adminDb } from './client';

const url = process.env.DATABASE_URL_ADMIN ?? '';
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
  console.error('✗ db:reset solo funciona contra una base local (localhost). Abortado.');
  process.exit(1);
}
await adminDb().execute(sql`drop schema if exists public cascade`);
await adminDb().execute(sql`drop schema if exists drizzle cascade`);
await adminDb().execute(sql`create schema public`);
console.log('✓ Base local vaciada. Ahora: npm run db:migrate && (con la app corriendo) npm run db:seed');
process.exit(0);
