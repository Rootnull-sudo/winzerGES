/** Fermentación (F2-3) con Postgres real: ficha automática, estados del lote, tarea única y SO₂ en la unidad del insumo. */
import type { Mutation } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb } from '../src/client';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import { guardarInsumo, stockActual } from '../src/services/insumos';
import { marcarTarea, tareasPara } from '../src/services/tareas';
import { guardarTemporada, listarTemporadas } from '../src/services/temporadas';
import * as sync from '../src/sync';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_fe2_${run}`;
const eno: Actor = { orgId: A, userId: 'u_eno', userName: 'Enólogo', role: 'enologo' };
const mut = (
  entity: string,
  data: Record<string, unknown>,
  id: string = randomUUID(),
  baseVersion: number | null = null,
  op: Mutation['op'] = 'upsert'
): Mutation => ({
  mutationId: randomUUID(),
  entity,
  op,
  id,
  baseVersion,
  data,
  createdAt: new Date().toISOString()
});
const ok = async (m: Mutation) => {
  const [r] = await sync.push(eno, [m]);
  expect(r, JSON.stringify(r)).toMatchObject({ status: 'ok' });
  return r as { record: { version: number; data: Record<string, unknown> } };
};
const q = <T extends Record<string, unknown>>(s: ReturnType<typeof sql>) => withOrg(A, (tx) => tx.execute<T>(s));
let L = '',
  E = '',
  MBK = '';

beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'A' });
  await withOrg(A, (tx) => guardarTemporada(tx, { ...eno, role: 'admin' }, { anio: 2027, inicio: '2026-07-01', fin: '2027-06-30' }));
  const T = (await withOrg(A, listarTemporadas))[0]!.id;
  L = randomUUID();
  E = randomUUID();
  await ok(mut('lote', { codigo: 'L-F', temporadaId: T, variedad: 'Syrah', tipo: 'tinto', fechaVendimiaPlan: '2027-03-20' }, L));
  await ok(mut('estanque', { codigo: 'F-1', capacidad: 10000 }, E));
  MBK = String(
    (
      await withOrg(A, (tx) =>
        guardarInsumo(
          tx,
          { ...eno, role: 'admin' },
          { nombre: 'MBK', categoria: 'enologico', tipo: 'Sulfitante', unidad: 'kg', precio: 6500, stockInicial: 10, quimico: 'K2S2O5', so2Pct: 57 }
        )
      )
    ).id
  );
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('fermentación', () => {
  let ficha = { id: '', version: 0, data: {} as Record<string, unknown> };

  it('la entrada de mosto crea UNA ficha en borrador', async () => {
    await ok(mut('mov_bodega', { fecha: '2027-03-21', estanqueId: E, loteId: L, litros: 5000, tipo: 'entrada', origen: 'mosto' }));
    await ok(mut('mov_bodega', { fecha: '2027-03-22', estanqueId: E, loteId: L, litros: 1000, tipo: 'entrada', origen: 'uva' }));
    const fichas = await q<{ id: string; codigo: string; estado: string; volumen: string; dias_planificados: number; version: number }>(
      sql`select id, codigo, estado, volumen, dias_planificados, version from fermentacion`
    );
    expect(fichas.map((f) => [f.codigo, f.estado, Number(f.volumen), f.dias_planificados])).toEqual([['FA-L-F', 'borrador', 5000, 10]]);
    ficha = { id: fichas[0]!.id, version: fichas[0]!.version, data: { codigo: 'FA-L-F', loteId: L, estanqueId: E, tipo: 'tinto', volumen: 5000 } };
  });

  it('inicio y fin de FA mueven el lote y crean una sola tarea de trasiego', async () => {
    let r = await ok(mut('fermentacion', { ...ficha.data, estado: 'activa', inicioFA: '2027-03-23' }, ficha.id, ficha.version));
    expect((await q<{ estado: string }>(sql`select estado from lote where id = ${L}`))[0]!.estado).toBe('Fermentando');
    r = await ok(mut('fermentacion', { ...ficha.data, estado: 'activa', inicioFA: '2027-03-23', finFA: '2027-04-02' }, ficha.id, r.record.version));
    // Guardar otra vez (o reintentar) no crea otra tarea.
    r = await ok(
      mut('fermentacion', { ...ficha.data, estado: 'activa', inicioFA: '2027-03-23', finFA: '2027-04-02', alcoholFinal: 13.8 }, ficha.id, r.record.version)
    );
    expect((await q<{ estado: string; fin: string }>(sql`select estado, fin_fa_real fin from lote where id = ${L}`))[0]).toEqual({
      estado: 'FML',
      fin: '2027-04-02'
    });
    const tareas = await withOrg(A, (tx) => tareasPara(tx, eno));
    expect(tareas.map((t) => t.titulo)).toEqual(['Trasegar lote L-F: FA finalizada']);
    expect(await withOrg(A, (tx) => tareasPara(tx, { ...eno, role: 'ventas', userId: 'otro' }))).toEqual([]);
    await withOrg(A, (tx) => marcarTarea(tx, eno, tareas[0]!.id, true));
    expect(await withOrg(A, (tx) => tareasPara(tx, eno))).toEqual([]);
    ficha.version = r.record.version;
  });

  it('adición de SO₂: descuenta en kg, registra la medición y borrarla deshace ambos', async () => {
    const id = randomUUID();
    await ok(
      mut(
        'adicion_so2',
        { fermentacionId: ficha.id, fecha: '2027-04-03', insumoId: MBK, fraccion: 0.57, gramos: 250, volumen: 5000, so2Previo: 10, so2Medido: 36, costo: 1625 },
        id
      )
    );
    expect(await withOrg(A, (tx) => stockActual(tx, MBK))).toBe(9.75);
    const [seg] = await q<{ so2_libre: string }>(sql`select so2_libre from seguimiento where deleted_at is null`);
    expect(Number(seg!.so2_libre)).toBe(36);
    await ok(mut('adicion_so2', {}, id, 1, 'delete'));
    expect(await withOrg(A, (tx) => stockActual(tx, MBK))).toBe(10);
    expect(await q(sql`select id from seguimiento where deleted_at is null`)).toHaveLength(0);
  });

  it('rechaza una adición si el metabisulfito no está en unidad de masa', async () => {
    const litro = String(
      (
        await withOrg(A, (tx) =>
          guardarInsumo(tx, { ...eno, role: 'admin' }, { nombre: 'SO2 líquido', categoria: 'enologico', tipo: 'Sulfitante', unidad: 'L', precio: 9000 })
        )
      ).id
    );
    const [r] = await sync.push(eno, [
      mut('adicion_so2', { fermentacionId: ficha.id, fecha: '2027-04-04', insumoId: litro, fraccion: 0.57, gramos: 100, volumen: 5000 })
    ]);
    expect(r).toMatchObject({ status: 'rejected', message: expect.stringMatching(/debe estar en kg o g/) });
  });

  it('borrar la ficha borra su seguimiento y sus adiciones, y devuelve el metabisulfito', async () => {
    await ok(mut('adicion_so2', { fermentacionId: ficha.id, fecha: '2027-04-05', insumoId: MBK, fraccion: 0.57, gramos: 500, volumen: 5000, so2Medido: 40 }));
    await ok(mut('seguimiento', { fermentacionId: ficha.id, fecha: '2027-04-06', brix: -1.5 }));
    expect(await withOrg(A, (tx) => stockActual(tx, MBK))).toBe(9.5);
    const [f] = await q<{ version: number }>(sql`select version from fermentacion where id = ${ficha.id}`);
    await ok(mut('fermentacion', {}, ficha.id, f!.version, 'delete'));
    expect(await withOrg(A, (tx) => stockActual(tx, MBK))).toBe(10);
    expect(await q(sql`select id from seguimiento where deleted_at is null`)).toHaveLength(0);
    expect(await q(sql`select id from adicion_so2 where deleted_at is null`)).toHaveLength(0);
  });
});
