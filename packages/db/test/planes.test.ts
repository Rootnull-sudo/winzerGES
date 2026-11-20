/** Planes y acceso (F0-7, ADR 0014) con Postgres real. */
import { accesoDe, fechaHoy } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb, db } from '../src/client';
import { actorFor, createInvitation, createOrganization } from '../src/orgs';
import { asignarPlan } from '../src/plan-cli';
import { upsert } from '../src/repo';
import { cliente, organization, plan, user } from '../src/schema';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const U = `test_pu_${run}`;
let org = { id: '', slug: '' };
const metaCli = { entity: 'cliente', module: 'clientes', label: 'clientes' };
const nuevoCliente = () => ({ id: randomUUID(), nombre: 'Cliente de prueba', rut: '66.666.666-6', tipo: 'Persona' });

beforeAll(async () => {
  await adminDb()
    .insert(user)
    .values({ id: U, name: 'Test', email: `${U}@test.local` });
  org = await createOrganization(U, { nombre: `Planes ${run}` });
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${org.id}`);
  await adminDb()
    .delete(user)
    .where(sql`id = ${U}`);
});

describe('planes y acceso', () => {
  it('una viña nueva parte en prueba del plan completo', async () => {
    const ctx = await actorFor(U, 'Test', org.slug);
    expect(ctx!.actor.acceso).toMatchObject({ planId: 'completo', estado: 'prueba', diasRestantes: 30, soloLectura: false });
  });

  it('el catálogo de planes existe y la app no puede modificarlo', async () => {
    expect((await db().select({ id: plan.id }).from(plan)).map((p) => p.id).sort()).toEqual(['completo', 'esencial', 'piloto']);
    const err = await db()
      .update(plan)
      .set({ maxUsuarios: 999 })
      .catch((e: Error) => e);
    expect(String((err as Error).cause)).toMatch(/permission denied/i);
  });

  it('fuera del plan o en solo lectura, el servidor rechaza escribir', async () => {
    await asignarPlan(org.slug, 'esencial');
    let { actor } = (await actorFor(U, 'Test', org.slug))!;
    await expect(withOrg(org.id, (tx) => upsert(tx, cliente, actor, metaCli, nuevoCliente()))).resolves.toBeTruthy();
    await expect(
      withOrg(org.id, (tx) => upsert(tx, cliente, actor, { entity: 'gasto', module: 'administracion', label: 'gastos' }, nuevoCliente()))
    ).rejects.toThrow(/disponible en el plan Completo/);

    await asignarPlan(org.slug, 'completo', 'cancelada');
    ({ actor } = (await actorFor(U, 'Test', org.slug))!);
    expect(actor.acceso!.soloLectura).toBe(true);
    await expect(withOrg(org.id, (tx) => upsert(tx, cliente, actor, metaCli, nuevoCliente()))).rejects.toThrow(/solo lectura/);
  });

  it('invitar respeta el límite de usuarios del plan', async () => {
    await asignarPlan(org.slug, 'completo', 'activa');
    const { actor } = (await actorFor(U, 'Test', org.slug))!;
    const limitado = {
      ...actor,
      acceso: { ...accesoDe({ planId: 'esencial', estado: 'activa', periodoInicio: fechaHoy(), periodoFin: null }, fechaHoy()), maxUsuarios: 2 }
    };
    await createInvitation(limitado, `a_${run}@test.local`, 'ventas');
    await expect(createInvitation(limitado, `b_${run}@test.local`, 'ventas')).rejects.toThrow(/permite 2 usuarios y ya hay 2/);
  });
});
