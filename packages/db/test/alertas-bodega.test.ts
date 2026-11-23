/** Reglas de alerta de fermentación y bodega (F2-7) con Postgres real y una fecha fija. */
import type { Mutation } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularAlertas } from '../src/alertas/motor';
import { REGLAS } from '../src/alertas/reglas';
import { adminDb } from '../src/client';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import { guardarTemporada, listarTemporadas } from '../src/services/temporadas';
import * as sync from '../src/sync';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_ab_${run}`;
const HOY = '2026-11-20'; // temporada 2027
const eno: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'admin' };
const push = async (entity: string, data: Record<string, unknown>, id: string = randomUUID()) => {
  const m: Mutation = { mutationId: randomUUID(), entity, op: 'upsert', id, baseVersion: null, data, createdAt: new Date().toISOString() };
  const [r] = await sync.push(eno, [m]);
  expect(r, JSON.stringify(r)).toMatchObject({ status: 'ok' });
  return id;
};

beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'A' });
  await withOrg(A, (tx) => guardarTemporada(tx, eno, { anio: 2027, inicio: '2026-07-01', fin: '2027-06-30' }));
  const T = (await withOrg(A, listarTemporadas))[0]!.id;
  const lote = (codigo: string, tipo: string) =>
    push('lote', { codigo, temporadaId: T, variedad: 'Syrah', tipo, estado: 'Planificado', fechaVendimiaPlan: '2026-10-01' });
  const LB = await lote('AB-B', 'blanco');
  const LT = await lote('AB-T', 'tinto');
  const E1 = await push('estanque', { codigo: 'AB-E1', capacidad: 5000, tipo: 'Fermentación', estado: 'operativo' });
  const datosE2 = { codigo: 'AB-E2', capacidad: 1000, tipo: 'Fermentación', estado: 'operativo' };
  const E2 = await push('estanque', datosE2);
  // Origen "vino": no crea ficha automática.
  await push('mov_bodega', { fecha: '2026-11-02', estanqueId: E1, loteId: LB, litros: 2000, tipo: 'entrada', origen: 'vino' });
  await push('mov_bodega', { fecha: '2026-11-10', estanqueId: E1, loteId: LB, litros: -100, tipo: 'merma', motivo: 'Borras' }); // 5 %
  await push('mov_bodega', { fecha: '2026-11-02', estanqueId: E2, loteId: LT, litros: 900, tipo: 'entrada', origen: 'vino' });
  // Bajan la capacidad del estanque después de llenarlo.
  const [r] = await sync.push(eno, [
    {
      mutationId: randomUUID(),
      entity: 'estanque',
      op: 'upsert',
      id: E2,
      baseVersion: 1,
      data: { ...datosE2, capacidad: 800 },
      createdAt: new Date().toISOString()
    }
  ]);
  expect(r, JSON.stringify(r)).toMatchObject({ status: 'ok' });

  const ficha = (codigo: string, loteId: string, tipo: string, extra: Record<string, unknown>) =>
    push('fermentacion', { codigo, loteId, tipo, volumen: 1000, diasPlanificados: 10, estado: 'activa', ...extra });
  // FA-1 (blanco): 19 días de FA con 10 planificados, SO₂ libre 45 (alerta 40) y último registro hace 5 días.
  const F1 = await ficha('FA-1', LB, 'blanco', { inicioFA: '2026-11-01' });
  await push('seguimiento', { fermentacionId: F1, fecha: '2026-11-15', so2Libre: 45, brix: 4 });
  // FA-2 (tinto): FA terminada, FML de 61 días y SO₂ libre 15 (mínimo 20).
  const F2 = await ficha('FA-2', LT, 'tinto', { inicioFA: '2026-09-01', finFA: '2026-09-10', inicioFML: '2026-09-20' });
  await push('seguimiento', { fermentacionId: F2, fecha: '2026-11-19', so2Libre: 15 });
  // FA-3 (tinto): partió hace 2 días (sin desvío en curso), SO₂ libre 32 (rango 20–30, alerta 35).
  const F3 = await ficha('FA-3', LT, 'tinto', { inicioFA: '2026-11-18' });
  await push('seguimiento', { fermentacionId: F3, fecha: '2026-11-19', so2Libre: 32 });
  // FA-4 (cerrada): no avisa aunque tenga SO₂ crítico.
  const F4 = await ficha('FA-4', LT, 'tinto', { inicioFA: '2026-10-01', estado: 'cerrada' });
  await push('seguimiento', { fermentacionId: F4, fecha: '2026-10-05', so2Libre: 90 });
  // FA-5 (blanco): inició hace 4 días sin registros.
  await ficha('FA-5', LB, 'blanco', { inicioFA: '2026-11-16' });
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('alertas de fermentación y bodega', () => {
  it('cada regla detecta su caso con los textos de v1', async () => {
    const r = await calcularAlertas(A, REGLAS, HOY);
    expect(r.errores).toEqual([]);
    const filas = await withOrg(A, (tx) =>
      tx.execute<{ regla: string; titulo: string; mensaje: string; ruta: string }>(
        sql`select regla, titulo, mensaje, ruta from alerta where estado = 'abierta' order by regla, titulo`
      )
    );
    const por = (regla: string) => filas.filter((f) => f.regla === regla).map((f) => `${f.titulo} | ${f.mensaje}`);
    expect(por('fermentacion.so2_critico')).toEqual(['Sobre-sulfitado en FA-1 | SO₂ libre 45,0 mg/L supera el umbral de alerta (40 mg/L).']);
    expect(por('fermentacion.so2_alto')).toEqual(['SO₂ libre alto en FA-3 | 32,0 mg/L sobre el rango suave (20–30).']);
    expect(por('fermentacion.so2_bajo')).toEqual(['SO₂ libre bajo en FA-2 | 15,0 mg/L: evalúa ajuste para proteger el vino.']);
    expect(por('fermentacion.desvio_fa')).toEqual(['Desviación de fermentación en FA-1 | +9 días respecto de lo planificado (10 días).']);
    expect(por('fermentacion.fml_prolongada')).toEqual(['FML prolongada en FA-2 | Lleva 61 días.']);
    expect(por('fermentacion.seguimiento_atrasado')).toEqual([
      'Seguimiento atrasado en FA-1 | El último registro es de hace 5 días.',
      'Seguimiento atrasado en FA-5 | Inició la FA hace 4 días y no tiene registros.'
    ]);
    expect(por('bodega.sobrecapacidad')).toEqual(['Sobrecapacidad en AB-E2 | 900 L en un estanque de 800 L.']);
    expect(por('bodega.merma_alta')).toEqual(['Mermas altas en lote AB-B | 5,0% de las entradas (100 L).']);
    expect(filas.find((f) => f.regla === 'fermentacion.so2_critico')!.ruta).toMatch(/^fermentacion\?ficha=/);
  });
});
