/** Fenología y clima (F1-2) + piezas de F1-0: unicidad compuesta y guarda de temporada, con Postgres real. */
import type { Mutation } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb } from '../src/client';
import { importV1, mapId } from '../src/import-v1';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import { guardarTemporada, listarTemporadas } from '../src/services/temporadas';
import * as sync from '../src/sync';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_fe_${run}`;
const agro: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'agronomo' };
const admin: Actor = { ...agro, role: 'admin' };
const mut = (entity: string, data: Record<string, unknown>, id: string = randomUUID(), op: Mutation['op'] = 'upsert'): Mutation => ({
  mutationId: randomUUID(),
  entity,
  op,
  id,
  baseVersion: null,
  data,
  createdAt: new Date().toISOString()
});
let T2026 = '',
  T2027 = '',
  C1 = '';

beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'A' });
  for (const anio of [2026, 2027]) await withOrg(A, (tx) => guardarTemporada(tx, admin, { anio, inicio: `${anio - 1}-07-01`, fin: `${anio}-06-30` }));
  const ts = await withOrg(A, listarTemporadas);
  T2026 = ts.find((t) => t.anio === 2026)!.id;
  T2027 = ts.find((t) => t.anio === 2027)!.id;
  C1 = randomUUID();
  const [r] = await sync.push(agro, [mut('cuartel', { codigo: 'F-01', variedad: 'Syrah', tipo: 'tinto', superficie: 2 }, C1)]);
  expect(r!.status).toBe('ok');
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('fenología y clima', () => {
  it('un registro de fenología por cuartel y temporada (unicidad compuesta)', async () => {
    const f = { cuartelId: C1, temporadaId: T2026, desborreInicio: '2025-09-12' };
    expect((await sync.push(agro, [mut('fenologia', f)]))[0]!.status).toBe('ok');
    const [dup] = await sync.push(agro, [mut('fenologia', { ...f, desborreInicio: '2025-09-15' })]);
    expect(dup).toMatchObject({ status: 'rejected', message: expect.stringMatching(/ya tiene un registro de fenología/) });
    expect((await sync.push(agro, [mut('fenologia', { ...f, temporadaId: T2027, desborreInicio: '2026-09-10' })]))[0]!.status).toBe('ok');
  });

  it('clima: una fecha por estación, y la fecha debe caer en su temporada', async () => {
    const c = { fecha: '2025-10-01', temporadaId: T2026, tmax: 24, tmin: 8, estacion: 'Propia' };
    expect((await sync.push(agro, [mut('clima', c)]))[0]!.status).toBe('ok');
    expect((await sync.push(agro, [mut('clima', { ...c, estacion: 'propia' })]))[0]).toMatchObject({ status: 'rejected' });
    expect((await sync.push(agro, [mut('clima', { ...c, estacion: 'Otra' })]))[0]!.status).toBe('ok');
    const [fuera] = await sync.push(agro, [mut('clima', { ...c, fecha: '2026-10-01', estacion: 'X' })]);
    expect(fuera).toMatchObject({ status: 'rejected', message: expect.stringMatching(/no corresponde a la temporada 2026/) });
  });

  it('una temporada cerrada es de solo lectura: no se crea, edita ni borra', async () => {
    const id = randomUUID();
    await sync.push(agro, [mut('clima', { fecha: '2025-11-01', temporadaId: T2026, tmax: 25, tmin: 9 }, id)]);
    const t = (await withOrg(A, listarTemporadas)).find((x) => x.anio === 2026)!;
    await withOrg(A, (tx) => guardarTemporada(tx, admin, { ...t, estado: 'cerrada' }, t.version));
    const [nuevo] = await sync.push(agro, [mut('clima', { fecha: '2025-11-02', temporadaId: T2026, tmax: 25, tmin: 9 })]);
    expect(nuevo).toMatchObject({ status: 'rejected', message: expect.stringMatching(/temporada 2026 está cerrada/) });
    const [borrar] = await sync.push(agro, [mut('clima', {}, id, 'delete')]);
    expect(borrar).toMatchObject({ status: 'rejected', message: expect.stringMatching(/cerrada/) });
    const t2 = (await withOrg(A, listarTemporadas)).find((x) => x.anio === 2026)!;
    await withOrg(A, (tx) => guardarTemporada(tx, admin, { ...t2, estado: 'abierta' }, t2.version));
  });

  it('importa fenología y clima de v1 (temporada por número; crea la que falta)', async () => {
    const r = await importV1(admin, {
      app: 'vina-gestion',
      data: {
        cuartel: [{ id: 'cu_9', codigo: 'F-09', variedad: 'País', tipo: 'tinto', superficie: 1 }],
        fenologia: [{ id: 'fen_1', cuartelId: 'cu_9', temporada: 2025, desborreInicio: '2024-09-20', bbch: 'BBCH 89 — cosecha' }],
        clima: [{ id: 'cli_1', fecha: '2024-10-02', temporada: 2025, tmax: 22, tmin: 7, estacion: 'Estación propia' }]
      }
    });
    expect(r.importados).toMatchObject({ fenologia: 1, clima: 1 });
    expect(r.omitidos).toEqual([]);
    expect((await withOrg(A, listarTemporadas)).map((t) => t.anio)).toContain(2025);
    const [f] = await withOrg(A, (tx) => tx.execute<{ bbch: string }>(sql`select bbch from fenologia where id = ${mapId(A, 'fen_1')}`));
    expect(f!.bbch).toBe('BBCH 89 — Cosecha');
  });
});
