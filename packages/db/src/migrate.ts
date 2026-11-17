import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import { adminDb } from './client';
import { ensureTenancy } from './ensure';

const folder = fileURLToPath(new URL('../drizzle', import.meta.url));
await migrate(adminDb(), { migrationsFolder: folder });
const r = await ensureTenancy(adminDb());
console.log(`✓ Migraciones aplicadas · RLS en ${r.tenant.length} tablas · sync en: ${r.sync.join(', ')}`);
process.exit(0);
