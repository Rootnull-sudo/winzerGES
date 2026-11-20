/**
 * Secuencias de códigos y folios (F0-3). Corrige el bug de v1 que calculaba `count + 1` y reutilizaba números
 * después de borrar (docs/v2/dominio.md, bug 6). Siempre dentro de withOrg(): la fila es de la viña activa (RLS).
 *
 * Concurrencia: `INSERT … ON CONFLICT DO UPDATE` toma un bloqueo de fila hasta el fin de la transacción (equivale
 * a `SELECT … FOR UPDATE` + `UPDATE`, en una sola ida). Una segunda transacción que pide la misma clave espera.
 * Sin huecos: si la transacción que tomó el número se revierte, el incremento también.
 */
import { sql } from 'drizzle-orm';
import type { Tx } from '../client';

const CLAVE = /^[a-z0-9_]+(:[A-Za-z0-9_-]+)?$/;

function validar(clave: string) {
  if (!CLAVE.test(clave)) throw new Error(`Clave de secuencia inválida: ${clave}`);
}

/** Toma el siguiente número de `clave` (1, 2, 3…). */
export async function siguienteNumero(tx: Tx, clave: string): Promise<number> {
  validar(clave);
  const [r] = await tx.execute<{ n: string }>(sql`
    insert into secuencia (org_id, clave, siguiente)
    values (current_setting('app.org_id'), ${clave}, 2)
    on conflict (org_id, clave) do update set siguiente = secuencia.siguiente + 1, updated_at = now()
    returning siguiente - 1 as n`);
  return Number(r!.n);
}

/** Código con prefijo y relleno: `siguienteCodigo(tx, 'venta', 'V-')` → `V-0001`. */
export async function siguienteCodigo(tx: Tx, clave: string, prefijo: string, ancho = 4): Promise<string> {
  return prefijo + String(await siguienteNumero(tx, clave)).padStart(ancho, '0');
}

/**
 * Asegura que el próximo número de `clave` sea al menos `minimo` (nunca retrocede). Lo usa el importador de v1
 * para continuar después del último código importado, y el alta de un CAF para partir en su primer folio.
 */
export async function ajustarSecuencia(tx: Tx, clave: string, minimo: number): Promise<void> {
  validar(clave);
  await tx.execute(sql`
    insert into secuencia (org_id, clave, siguiente)
    values (current_setting('app.org_id'), ${clave}, ${minimo})
    on conflict (org_id, clave) do update set siguiente = greatest(secuencia.siguiente, excluded.siguiente), updated_at = now()`);
}
