/**
 * Contexto de viña (tenant) para cada operación de datos.
 *
 * `withOrg` abre una transacción y fija `app.org_id` con SET LOCAL (set_config(..., true)),
 * por lo que la política RLS `tenant_isolation` filtra todas las tablas de negocio a esa viña,
 * aunque una consulta olvide el `WHERE org_id = …`. Al terminar la transacción el valor se descarta,
 * así que es seguro con pool de conexiones.
 */
import { sql } from 'drizzle-orm';
import { db, type DB, type Tx } from './client';

export async function withOrg<T>(orgId: string, fn: (tx: Tx) => Promise<T>, conn: DB = db()): Promise<T> {
  if (!orgId) throw new Error('withOrg: falta orgId');
  return conn.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}
