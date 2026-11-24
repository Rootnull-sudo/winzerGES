/** Personas (F4): trabajadores; remuneraciones y honorarios se agregan en F4-2 y F4-3. */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb } from '../src/client';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import { guardarTrabajador } from '../src/services/personas';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_pe_${run}`;
const adm: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'administrativo' };
export const fichaBase = { nombre: 'Persona Test', rut: '15.111.222-6', cargo: 'Bodeguero', sueldoBase: 900_000, ingreso: '2025-01-01' };

beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'A' });
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('trabajadores', () => {
  it('RUT único por viña y auditado como dato sensible', async () => {
    const t = await withOrg(A, (tx) => guardarTrabajador(tx, adm, fichaBase));
    await expect(withOrg(A, (tx) => guardarTrabajador(tx, adm, { ...fichaBase, nombre: 'Otra' }))).rejects.toThrow(/ya está registrado/);
    const [a] = await withOrg(A, (tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int n from audit_log where entidad = 'trabajador' and registro_id = ${t.id}`)
    );
    expect(a!.n).toBe(1);
  });
  it('limpia la gratificación fija y el plan Isapre cuando no aplican', async () => {
    const t = await withOrg(A, (tx) =>
      guardarTrabajador(tx, adm, { ...fichaBase, rut: '16.333.444-5', gratificacion: 'art50', gratificacionMonto: 50_000, salud: 'Fonasa', planSalud: 90_000 })
    );
    expect([t.gratificacionMonto, t.planSalud]).toEqual([0, 0]);
  });
  it('el enólogo no ve ni registra trabajadores', async () => {
    await expect(withOrg(A, (tx) => guardarTrabajador(tx, { ...adm, role: 'enologo' }, { ...fichaBase, rut: '17.555.666-4' }))).rejects.toThrow();
  });
});
