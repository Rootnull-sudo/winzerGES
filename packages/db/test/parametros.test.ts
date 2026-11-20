/** Parámetros con vigencia e indicadores (F0-2) con Postgres real. */
import { DEFAULT_CONFIG } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb, db } from '../src/client';
import type { Actor } from '../src/repo';
import { indicador, organization } from '../src/schema';
import { cargarIndicadores, configVigente, eliminarParametro, guardarParametro, listarParametros } from '../src/services/parametros';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_pa_${run}`,
  B = `test_pb_${run}`;
const IND = `test_ind_${run}`;
const actor = (orgId: string, role = 'admin'): Actor => ({ orgId, userId: 'u', userName: 'Test', role });

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
  await adminDb()
    .delete(indicador)
    .where(sql`clave = ${IND} or fuente = ${IND}`);
});

describe('parámetros con vigencia', () => {
  it('un cambio agrega historia y configVigente respeta la fecha', async () => {
    await withOrg(A, (tx) => guardarParametro(tx, actor(A), { clave: 'tributario.tasaPPM', valor: 0.004, vigenteDesde: '2026-03-01' }));
    await withOrg(A, (tx) => guardarParametro(tx, actor(A), { clave: 'tributario.tasaPPM', valor: 0.005, vigenteDesde: '2026-09-01' }));
    expect((await withOrg(A, (tx) => configVigente(tx, '2026-02-28'))).tributario.tasaPPM).toBe(DEFAULT_CONFIG.tributario.tasaPPM);
    expect((await withOrg(A, (tx) => configVigente(tx, '2026-05-01'))).tributario.tasaPPM).toBe(0.004);
    expect((await withOrg(A, (tx) => configVigente(tx, '2026-10-01'))).tributario.tasaPPM).toBe(0.005);
  });

  it('misma fecha corrige en vez de duplicar; borrar vuelve al valor anterior', async () => {
    await withOrg(A, (tx) => guardarParametro(tx, actor(A), { clave: 'tributario.tasaPPM', valor: 0.006, vigenteDesde: '2026-09-01' }));
    const filas = (await withOrg(A, listarParametros)).filter((p) => p.clave === 'tributario.tasaPPM');
    expect(filas.map((f) => f.valor)).toEqual([0.004, 0.006]);
    await withOrg(A, (tx) => eliminarParametro(tx, actor(A), filas[1]!.id));
    expect((await withOrg(A, (tx) => configVigente(tx, '2026-10-01'))).tributario.tasaPPM).toBe(0.004);
  });

  it('cada viña tiene sus parámetros y solo configuración los cambia', async () => {
    expect((await withOrg(B, (tx) => configVigente(tx, '2026-10-01'))).tributario.tasaPPM).toBe(DEFAULT_CONFIG.tributario.tasaPPM);
    await expect(
      withOrg(B, (tx) => guardarParametro(tx, actor(B, 'enologo'), { clave: 'enologia.kgCajonMax', valor: 21, vigenteDesde: '2026-01-01' }))
    ).rejects.toThrow(/permiso/i);
  });

  it('los indicadores son globales y la app no puede escribirlos', async () => {
    await cargarIndicadores(adminDb(), [{ clave: 'utm', fecha: '1990-01-01', valor: 1234, fuente: IND }]);
    expect((await withOrg(A, (tx) => configVigente(tx, '1990-06-01'))).remuneraciones.utm).toBe(1234);
    expect((await withOrg(B, (tx) => configVigente(tx, '1990-06-01'))).remuneraciones.utm).toBe(1234);
    const err = await db()
      .insert(indicador)
      .values({ clave: IND, fecha: '2026-01-01', valor: 1 })
      .catch((e: Error) => e);
    expect(String((err as Error).cause)).toMatch(/permission denied/i);
  });
});
