/**
 * Temporadas (ADR 0011) con Postgres real: alta automática al crear la viña, aislamiento por viña,
 * validación de año y solapes, y sincronización a todos los roles (maestro transversal).
 */
import { anioDeFecha, fechaHoy } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb } from '../src/client';
import { createOrganization } from '../src/orgs';
import type { Actor } from '../src/repo';
import { member, organization, user } from '../src/schema';
import { guardarTemporada, listarTemporadas, TemporadaError } from '../src/services/temporadas';
import * as sync from '../src/sync';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const U = `test_tu_${run}`;
let A = '';
let B = '';
const actor = (orgId: string, role = 'admin'): Actor => ({ orgId, userId: U, userName: 'Test', role });

beforeAll(async () => {
  await adminDb()
    .insert(user)
    .values({ id: U, name: 'Test', email: `${U}@test.local` });
  A = (await createOrganization(U, { nombre: `Temporadas A ${run}` })).id;
  B = (await createOrganization(U, { nombre: `Temporadas B ${run}` })).id;
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id in (${A}, ${B})`);
  await adminDb()
    .delete(user)
    .where(sql`id = ${U}`);
});

describe('temporadas', () => {
  it('crear una viña abre su temporada actual', async () => {
    const ts = await withOrg(A, listarTemporadas);
    expect(ts.map((t) => t.anio)).toEqual([anioDeFecha(fechaHoy())]);
    expect(ts[0]!.estado).toBe('abierta');
  });

  it('cada viña ve solo sus temporadas', async () => {
    await withOrg(A, (tx) => guardarTemporada(tx, actor(A), { anio: 2001, inicio: '2000-07-01', fin: '2001-06-30' }));
    const enB = await withOrg(B, listarTemporadas);
    expect(enB.some((t) => t.anio === 2001)).toBe(false);
  });

  it('rechaza año repetido y fechas que se cruzan', async () => {
    await expect(withOrg(A, (tx) => guardarTemporada(tx, actor(A), { anio: 2001, inicio: '2000-08-01', fin: '2001-07-31' }))).rejects.toThrow(TemporadaError);
    await expect(withOrg(A, (tx) => guardarTemporada(tx, actor(A), { anio: 2002, inicio: '2001-06-01', fin: '2002-05-31' }))).rejects.toThrow(
      /se cruzan con la temporada 2001/
    );
  });

  it('solo configuración puede crearlas, pero todos los roles las reciben offline', async () => {
    await expect(withOrg(A, (tx) => guardarTemporada(tx, actor(A, 'agronomo'), { anio: 2003, inicio: '2002-07-01', fin: '2003-06-30' }))).rejects.toThrow(
      /permiso/i
    );
    await adminDb()
      .insert(member)
      .values({ orgId: A, userId: `${U}`, role: 'agronomo' })
      .onConflictDoNothing();
    const res = await sync.pull(actor(A, 'agronomo'), null);
    expect(res.records.filter((r) => r.entity === 'temporada').map((r) => r.data.anio)).toContain(2001);
  });

  it('el push offline valida el año único con columna numérica', async () => {
    const [r] = await sync.push(actor(A), [
      {
        mutationId: randomUUID(),
        entity: 'temporada',
        op: 'upsert',
        id: randomUUID(),
        baseVersion: null,
        data: { anio: 2001, inicio: '2001-01-01', fin: '2001-02-01' },
        createdAt: new Date().toISOString()
      }
    ]);
    expect(r).toMatchObject({ status: 'rejected', message: expect.stringMatching(/anio "2001"/) });
  });
});
