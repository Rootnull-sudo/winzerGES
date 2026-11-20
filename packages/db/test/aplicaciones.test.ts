/** Aplicaciones y labores (F1-3): reacción aplicación → mov_insumo, idempotente, con Postgres real. */
import type { Mutation } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb } from '../src/client';
import { importV1, mapId } from '../src/import-v1';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import { guardarInsumo, stockActual } from '../src/services/insumos';
import { guardarTemporada, listarTemporadas } from '../src/services/temporadas';
import * as sync from '../src/sync';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_ap_${run}`;
const agro: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'agronomo' };
let T = '',
  C = '',
  I1 = '',
  I2 = '';
const mut = (entity: string, id: string, data: Record<string, unknown>, baseVersion: number | null = null, op: Mutation['op'] = 'upsert'): Mutation => ({
  mutationId: randomUUID(),
  entity,
  op,
  id,
  baseVersion,
  data,
  createdAt: new Date().toISOString()
});
const movs = () =>
  withOrg(A, (tx) =>
    tx.execute<{ insumo_id: string; cantidad: string; deleted: boolean }>(
      sql`select insumo_id, cantidad, deleted_at is not null as deleted from mov_insumo where tipo = 'aplicacion'`
    )
  );

beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'A' });
  await withOrg(A, (tx) => guardarTemporada(tx, { ...agro, role: 'admin' }, { anio: 2027, inicio: '2026-07-01', fin: '2027-06-30' }));
  T = (await withOrg(A, listarTemporadas))[0]!.id;
  I1 = String(
    (await withOrg(A, (tx) => guardarInsumo(tx, agro, { nombre: 'Azufre', categoria: 'agricola', unidad: 'kg', precio: 1800, stockInicial: 100, carencia: 7 })))
      .id
  );
  I2 = String((await withOrg(A, (tx) => guardarInsumo(tx, agro, { nombre: 'Cobre', categoria: 'agricola', unidad: 'kg', precio: 5200, stockInicial: 50 }))).id);
  C = randomUUID();
  await sync.push(agro, [mut('cuartel', C, { codigo: 'A-01', variedad: 'Merlot', tipo: 'tinto', superficie: 3 })]);
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('aplicaciones', () => {
  const id = randomUUID();
  const base = () => ({ fecha: '2026-11-10', temporadaId: T, cuartelId: C, insumoId: I1, dosis: 4, cantidad: 12, carencia: 7, costo: 21600 });

  it('al sincronizar, descuenta el insumo', async () => {
    const [r] = await sync.push(agro, [mut('aplicacion', id, base())]);
    expect(r!.status).toBe('ok');
    expect(await withOrg(A, (tx) => stockActual(tx, I1))).toBe(88);
  });

  it('editar la cantidad reescribe el mismo movimiento; un reintento no lo duplica', async () => {
    const m = mut('aplicacion', id, { ...base(), cantidad: 15 }, 1);
    await sync.push(agro, [m]);
    await sync.push(agro, [m]); // misma mutación reenviada (se perdió la respuesta)
    expect(await withOrg(A, (tx) => stockActual(tx, I1))).toBe(85);
    expect((await movs()).filter((x) => !x.deleted)).toHaveLength(1);
  });

  it('cambiar de insumo devuelve el stock al anterior', async () => {
    await sync.push(agro, [mut('aplicacion', id, { ...base(), insumoId: I2, cantidad: 5 }, 2)]);
    expect(await withOrg(A, (tx) => stockActual(tx, I1))).toBe(100);
    expect(await withOrg(A, (tx) => stockActual(tx, I2))).toBe(45);
  });

  it('borrar la aplicación borra el consumo', async () => {
    await sync.push(agro, [mut('aplicacion', id, {}, 3, 'delete')]);
    expect(await withOrg(A, (tx) => stockActual(tx, I2))).toBe(50);
    expect((await movs()).every((x) => x.deleted)).toBe(true);
  });

  it('labor: el costo lo calcula el servidor', async () => {
    const lid = randomUUID();
    const [r] = await sync.push(agro, [
      mut('labor', lid, { fecha: '2026-08-01', temporadaId: T, cuartelId: C, tipo: 'Poda', jornadas: 3, valorJornada: 30000, otrosCostos: 5000, costo: 1 })
    ]);
    expect(r).toMatchObject({ status: 'ok', record: { data: { costo: 95000 } } });
  });

  it('importar aplicaciones de v1 genera su consumo (y omite el consumo de v1 para no duplicar)', async () => {
    const r = await importV1(agro, {
      app: 'vina-gestion',
      data: {
        cuartel: [{ id: 'cu_1', codigo: 'V-01', variedad: 'País', tipo: 'tinto', superficie: 2 }],
        insumo: [{ id: 'in_1', nombre: 'Mancozeb', categoria: 'agricola', unidad: 'kg', precio: 4000, stockInicial: 30 }],
        aplicacion: [
          {
            id: 'ap_1',
            fecha: '2026-10-20',
            temporada: 2027,
            cuartelId: 'cu_1',
            insumoId: 'in_1',
            dosis: 2,
            cantidad: 4,
            carencia: 21,
            costo: 16000.4,
            unidadDosis: 'kg/ha'
          }
        ],
        movInsumo: [{ id: 'mv_1', fecha: '2026-10-20', insumoId: 'in_1', cantidad: -4, tipo: 'aplicacion', ref: 'aplicacion:ap_1' }]
      }
    });
    expect(r.omitidos).toEqual([]);
    expect(await withOrg(A, (tx) => stockActual(tx, mapId(A, 'in_1')))).toBe(26);
  });
});
