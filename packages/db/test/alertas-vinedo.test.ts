/** Reglas de alerta del viñedo e insumos (F1-5) con Postgres real y una fecha fija. */
import type { Mutation } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularAlertas } from '../src/alertas/motor';
import { REGLAS } from '../src/alertas/reglas';
import { adminDb } from '../src/client';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import { guardarInsumo } from '../src/services/insumos';
import { guardarTemporada, listarTemporadas } from '../src/services/temporadas';
import * as sync from '../src/sync';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_av_${run}`;
const HOY = '2026-11-20'; // temporada actual 2027 (2026-07-01 a 2027-06-30)
const agro: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'agronomo' };
const push = async (entity: string, data: Record<string, unknown>, id: string = randomUUID()) => {
  const m: Mutation = { mutationId: randomUUID(), entity, op: 'upsert', id, baseVersion: null, data, createdAt: new Date().toISOString() };
  const [r] = await sync.push(agro, [m]);
  expect(r, JSON.stringify(r)).toMatchObject({ status: 'ok' });
  return id;
};

beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'A' });
  for (const anio of [2026, 2027])
    await withOrg(A, (tx) => guardarTemporada(tx, { ...agro, role: 'admin' }, { anio, inicio: `${anio - 1}-07-01`, fin: `${anio}-06-30` }));
  const ts = await withOrg(A, listarTemporadas);
  const T26 = ts.find((t) => t.anio === 2026)!.id,
    T27 = ts.find((t) => t.anio === 2027)!.id;
  const C1 = await push('cuartel', { codigo: 'AV-1', variedad: 'Syrah', tipo: 'tinto', superficie: 2 });
  const C2 = await push('cuartel', { codigo: 'AV-2', variedad: 'Merlot', tipo: 'tinto', superficie: 2 });
  const ins = async (nombre: string, extra: Record<string, unknown>) =>
    String((await withOrg(A, (tx) => guardarInsumo(tx, agro, { nombre, categoria: 'agricola', unidad: 'kg', precio: 1000, ...extra }))).id);
  const azufre = await ins('Azufre AV', { stockInicial: 100, carencia: 21 });
  await ins('Cobre AV', { stockInicial: 5, stockMinimo: 10 }); // stock bajo
  await ins('Vencido AV', { stockInicial: 3, vencimiento: '2026-10-01' });
  await ins('Por vencer AV', { stockInicial: 3, vencimiento: '2026-12-10' }); // 20 días ≤ 30
  // Carencia vigente en AV-1: aplicada el 10-11 con 21 días → libre el 01-12 (11 días).
  await push('aplicacion', { fecha: '2026-11-10', temporadaId: T27, cuartelId: C1, insumoId: azufre, dosis: 1, cantidad: 2, carencia: 21, costo: 2000 });
  // Cosecha dentro de la carencia en AV-2.
  await push('aplicacion', { fecha: '2026-11-01', temporadaId: T27, cuartelId: C2, insumoId: azufre, dosis: 1, cantidad: 2, carencia: 30, costo: 2000 });
  await push('cosecha', { fecha: '2026-11-15', temporadaId: T27, cuartelId: C2, cajones: 10, kg: 250 }); // 25 kg/cajón: fuera de rango
  // Fenología: AV-1 inició el 01-09-2026 sin fin (80 días) y 19 días antes que en 2026; AV-2 sin desborre en 2027.
  await push('fenologia', { cuartelId: C1, temporadaId: T26, desborreInicio: '2025-09-20', desborreFin: '2025-10-05' });
  await push('fenologia', { cuartelId: C1, temporadaId: T27, desborreInicio: '2026-09-01' });
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('alertas del viñedo e insumos', () => {
  it('cada regla detecta su caso con los textos de v1', async () => {
    const r = await calcularAlertas(A, REGLAS, HOY);
    expect(r.errores).toEqual([]);
    const filas = await withOrg(A, (tx) =>
      tx.execute<{ regla: string; titulo: string; mensaje: string }>(
        sql`select regla, titulo, mensaje from alerta where estado = 'abierta' order by regla, titulo`
      )
    );
    const por = (regla: string) => filas.filter((f) => f.regla === regla).map((f) => `${f.titulo} | ${f.mensaje}`);
    expect(por('insumos.carencia_vigente')).toEqual(['Carencia vigente en AV-1 | No cosechar antes del 01-12-2026.']);
    expect(por('insumos.cosecha_en_carencia')).toEqual([
      'Cosecha dentro del período de carencia (AV-2) | Aplicación del 01-11-2026 con 30 días de carencia; se cosechó el 15-11-2026.'
    ]);
    expect(por('cosecha.cajon_fuera_de_rango')).toEqual(['Peso por cajón fuera de rango | 15-11-2026 · AV-2: 25 kg/cajón (rango 18–20 kg).']);
    expect(por('fenologia.desborre_sin_registrar')).toEqual(['Registrar desborre de AV-2 | No hay fecha de inicio de desborre para la temporada 2027.']);
    expect(por('fenologia.desborre_sin_fin')).toEqual(['AV-1: registra el fin del desborre | Inició hace 80 días.']);
    expect(por('fenologia.desborre_desviado')).toEqual([
      'AV-1: desborre adelantado 19 días | Respecto de la temporada 2026. Considera ajustar el calendario de labores y heladas.'
    ]);
    expect(por('insumos.stock_bajo')).toEqual(['Stock bajo: Cobre AV | Quedan 5 kg (mínimo 10).']);
    expect(por('insumos.vencido')).toEqual(['Insumo vencido: Vencido AV | Venció el 01-10-2026.']);
    expect(por('insumos.por_vencer')).toEqual(['Insumo por vencer: Por vencer AV | Vence en 20 días.']);
  });

  it('el agrónomo ve las de viñedo e insumos; ventas no ve ninguna de ellas', async () => {
    const { alertasPara } = await import('../src/alertas/motor');
    expect((await withOrg(A, (tx) => alertasPara(tx, agro))).length).toBeGreaterThanOrEqual(9);
    expect(await withOrg(A, (tx) => alertasPara(tx, { ...agro, role: 'ventas' }))).toEqual([]);
  });
});
