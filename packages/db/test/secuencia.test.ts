/** Secuencias (F0-3) con Postgres real: números únicos bajo concurrencia, sin huecos al revertir y por viña. */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb } from '../src/client';
import { organization } from '../src/schema';
import { ajustarSecuencia, siguienteCodigo, siguienteNumero } from '../src/services/secuencias';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_sa_${run}`,
  B = `test_sb_${run}`;

beforeAll(async () => {
  await adminDb()
    .insert(organization)
    .values([
      { id: A, slug: A, nombre: 'A' },
      { id: B, slug: B, nombre: 'B' }
    ]);
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id in (${A}, ${B})`);
});

describe('secuencias', () => {
  it('20 transacciones simultáneas reciben 1..20 sin repetir', async () => {
    const ns = await Promise.all(Array.from({ length: 20 }, () => withOrg(A, (tx) => siguienteNumero(tx, 'venta'))));
    expect([...ns].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('una transacción revertida no consume el número', async () => {
    await expect(
      withOrg(A, async (tx) => {
        await siguienteNumero(tx, 'venta');
        throw new Error('falla');
      })
    ).rejects.toThrow('falla');
    expect(await withOrg(A, (tx) => siguienteNumero(tx, 'venta'))).toBe(21);
  });

  it('cada viña y cada clave cuentan por separado', async () => {
    expect(await withOrg(B, (tx) => siguienteCodigo(tx, 'venta', 'V-'))).toBe('V-0001');
    expect(await withOrg(A, (tx) => siguienteCodigo(tx, 'orden_envasado:2026', 'OE-2026-'))).toBe('OE-2026-0001');
    const filas = await withOrg(B, (tx) => tx.execute<{ clave: string }>(sql`select clave from secuencia`));
    expect(filas.map((f) => f.clave)).toEqual(['venta']);
  });

  it('ajustarSecuencia avanza pero nunca retrocede', async () => {
    await withOrg(B, (tx) => ajustarSecuencia(tx, 'venta', 150));
    expect(await withOrg(B, (tx) => siguienteNumero(tx, 'venta'))).toBe(150);
    await withOrg(B, (tx) => ajustarSecuencia(tx, 'venta', 10));
    expect(await withOrg(B, (tx) => siguienteNumero(tx, 'venta'))).toBe(151);
    await withOrg(B, (tx) => ajustarSecuencia(tx, 'dte:33', 500));
    expect(await withOrg(B, (tx) => siguienteNumero(tx, 'dte:33'))).toBe(500);
  });

  it('rechaza claves con formato inválido', async () => {
    await expect(withOrg(A, (tx) => siguienteNumero(tx, "venta'; drop"))).rejects.toThrow(/inválida/);
  });
});
