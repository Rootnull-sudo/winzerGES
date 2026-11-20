/** Motor de alertas (F0-5, ADR 0012) con Postgres real. */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb } from '../src/client';
import { alertasPara, calcularAlertas, marcarAlertasVistas, type Regla } from '../src/alertas/motor';
import { REGLAS } from '../src/alertas/reglas';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import { guardarTemporada, listarTemporadas } from '../src/services/temporadas';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_al_${run}`,
  B = `test_bl_${run}`;
const admin: Actor = { orgId: A, userId: `u_${run}`, userName: 'Test', role: 'admin' };
const HOY = '2026-11-20';

beforeAll(async () => {
  await adminDb()
    .insert(organization)
    .values([
      { id: A, slug: A, nombre: 'A' },
      { id: B, slug: B, nombre: 'B' }
    ]);
  // 2025 terminó el 30-06-2025 y sigue abierta → alerta. 2027 es la actual → sin alerta.
  for (const anio of [2025, 2027]) await withOrg(A, (tx) => guardarTemporada(tx, admin, { anio, inicio: `${anio - 1}-07-01`, fin: `${anio}-06-30` }));
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id in (${A}, ${B})`);
});

describe('motor de alertas', () => {
  it('abre una alerta por hallazgo y no la duplica al recalcular', async () => {
    expect(await calcularAlertas(A, REGLAS, HOY)).toMatchObject({ abiertas: 1, nuevas: 1, resueltas: 0, errores: [] });
    expect(await calcularAlertas(A, REGLAS, HOY)).toMatchObject({ abiertas: 1, nuevas: 0, resueltas: 0 });
    const [a] = await withOrg(A, (tx) => alertasPara(tx, admin));
    expect(a).toMatchObject({ titulo: 'Cierra la temporada 2025', severidad: 'info', ruta: 'configuracion#temporadas', vista: false });
  });

  it('cada viña ve solo sus alertas y cada rol solo las de sus módulos', async () => {
    expect(await withOrg(B, (tx) => alertasPara(tx, { ...admin, orgId: B }))).toEqual([]);
    expect(await withOrg(A, (tx) => alertasPara(tx, { ...admin, role: 'agronomo' }))).toEqual([]);
  });

  it('marcar como vista es por usuario', async () => {
    const [a] = await withOrg(A, (tx) => alertasPara(tx, admin));
    await withOrg(A, (tx) => marcarAlertasVistas(tx, admin, [a!.id, a!.id]));
    expect((await withOrg(A, (tx) => alertasPara(tx, admin)))[0]!.vista).toBe(true);
    expect((await withOrg(A, (tx) => alertasPara(tx, { ...admin, userId: 'otro' })))[0]!.vista).toBe(false);
  });

  it('se resuelve cuando deja de cumplirse', async () => {
    const t = (await withOrg(A, listarTemporadas)).find((x) => x.anio === 2025)!;
    await withOrg(A, (tx) => guardarTemporada(tx, admin, { ...t, estado: 'cerrada' }, t.version));
    expect(await calcularAlertas(A, REGLAS, HOY)).toMatchObject({ abiertas: 0, resueltas: 1 });
    expect(await withOrg(A, (tx) => alertasPara(tx, admin))).toEqual([]);
  });

  it('una regla que falla no impide aplicar las demás', async () => {
    const rota: Regla = {
      id: 'test.rota',
      modulo: 'configuracion',
      severidad: 'bad',
      evaluar: async (tx) => {
        await tx.execute(sql`select * from tabla_que_no_existe`);
        return [];
      }
    };
    const fija: Regla = { id: 'test.fija', modulo: 'configuracion', severidad: 'warn', evaluar: async () => [{ titulo: 'Aviso general' }] };
    const r = await calcularAlertas(A, [rota, fija], HOY);
    expect(r.errores.map((e) => e.regla)).toEqual(['test.rota']);
    expect(r).toMatchObject({ abiertas: 1, nuevas: 1 });
    expect((await withOrg(A, (tx) => alertasPara(tx, admin))).map((a) => a.titulo)).toEqual(['Aviso general']);
  });
});
