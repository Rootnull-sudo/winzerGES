import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type DB = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

const g = globalThis as unknown as { __winzerDb?: { app?: DB; admin?: DB } };
g.__winzerDb ??= {};

function connect(url: string | undefined, name: string): DB {
  if (!url) throw new Error(`Falta la variable de entorno ${name}. Copia .env.example a .env.`);
  return drizzle(postgres(url, { max: 10, prepare: false, onnotice: () => {} }), { schema });
}

/** Conexión de la app (rol winzer_app, sujeto a RLS). Reutilizada entre recargas en desarrollo. */
export function db(): DB {
  return (g.__winzerDb!.app ??= connect(process.env.DATABASE_URL, 'DATABASE_URL'));
}

/** Conexión de administración (dueño del esquema). Solo migraciones, seed y tests. */
export function adminDb(): DB {
  return (g.__winzerDb!.admin ??= connect(process.env.DATABASE_URL_ADMIN, 'DATABASE_URL_ADMIN'));
}
