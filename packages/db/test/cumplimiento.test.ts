/** Cumplimiento (F6-4): registro, verificaciones automáticas, libro de existencias y alertas. */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Mutation } from '@winzer/domain';
import { calcularAlertas } from '../src/alertas/motor';
import { cumplimientoVencimientos, vencimientosNormativos } from '../src/alertas/reglas/cumplimiento';
import { adminDb } from '../src/client';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import { controlesCumplimiento, eliminarCumplimiento, existenciasDb, guardarCumplimiento } from '../src/services/cumplimiento';
import { asegurarTemporada, listarTemporadas } from '../src/services/temporadas';
import * as sync from '../src/sync';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_cu_${run}`;
const admin: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'admin' };
const HOY = '2026-11-24';
const push = async (entity: string, data: Record<string, unknown>, id: string = randomUUID()) => {
  const m: Mutation = { mutationId: randomUUID(), entity, op: 'upsert', id, baseVersion: null, data, createdAt: new Date().toISOString() };
  const [r] = await sync.push(admin, [m]);
  expect(r, JSON.stringify(r)).toMatchObject({ status: 'ok' });
  return id;
};
let LOTE = '';

beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'A' });
  await withOrg(A, (tx) => asegurarTemporada(tx, A, HOY));
  const T = (await withOrg(A, listarTemporadas)).find((t) => t.inicio <= HOY && t.fin >= HOY)!.id;
  LOTE = await push('lote', { codigo: 'L-CU', temporadaId: T, variedad: 'Syrah', tipo: 'tinto', estado: 'En guarda', fechaVendimiaPlan: '2026-03-01' });
  const E = await push('estanque', { codigo: 'CU-1', capacidad: 5000, tipo: 'Guarda', estado: 'operativo' });
  await push('mov_bodega', { fecha: '2026-08-01', estanqueId: E, loteId: LOTE, litros: 1200.4, tipo: 'entrada', origen: 'vino' });
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('cumplimiento normativo', () => {
  it('verificaciones: lote sin análisis autorizado e inscripción faltante; se resuelven al registrarlos', async () => {
    let c = await withOrg(A, (tx) => controlesCumplimiento(tx, HOY));
    expect(c).toEqual({ lotesSinAnalisis: ['L-CU'], ordenesDoSinRespaldo: [], faltaInscripcion: true });
    await push('analisis', { fecha: '2026-09-01', loteId: LOTE, laboratorio: 'Lab Autorizado', autorizadoSAG: true });
    await withOrg(A, (tx) => guardarCumplimiento(tx, admin, { nombre: 'Inscripción de productos en el SAG', tipo: 'SAG' }));
    c = await withOrg(A, (tx) => controlesCumplimiento(tx, HOY));
    expect(c).toEqual({ lotesSinAnalisis: [], ordenesDoSinRespaldo: [], faltaInscripcion: false });
  });

  it('libro de existencias con el granel en litros enteros', async () => {
    const filas = await withOrg(A, existenciasDb);
    expect(filas).toEqual([{ ubicacion: 'CU-1', lote: 'L-CU', variedad: 'Syrah', tipo: 'tinto', anada: 2027, estado: 'Granel', litros: 1200 }]);
  });

  it('alertas: por vencer según los días de aviso, vencida, y calendario normativo con registros', async () => {
    const a = await withOrg(A, (tx) =>
      guardarCumplimiento(tx, admin, { nombre: 'Certificación sustentable', tipo: 'Certificación', vencimiento: '2026-12-01', avisoDias: 30 })
    );
    await withOrg(A, (tx) => guardarCumplimiento(tx, admin, { nombre: 'Patente comercial', tipo: 'Municipal', vencimiento: '2026-11-01' }));
    await withOrg(A, (tx) => guardarCumplimiento(tx, admin, { nombre: 'Registro lejano', tipo: 'Otro', vencimiento: '2028-01-01' }));
    const r = await calcularAlertas(A, [cumplimientoVencimientos, vencimientosNormativos], HOY);
    expect(r.errores).toEqual([]);
    const al = await withOrg(A, (tx) =>
      tx.execute<{ titulo: string; severidad: string }>(
        sql`select titulo, severidad from alerta where regla = 'cumplimiento.vencimiento' and estado = 'abierta' order by titulo`
      )
    );
    expect(al.map((x) => [x.titulo, x.severidad])).toEqual([
      ['Por vencer: Certificación sustentable', 'warn'],
      ['Vencido: Patente comercial', 'bad']
    ]);
    await withOrg(A, (tx) => eliminarCumplimiento(tx, admin, String(a.id)));
    // El enólogo solo ve cumplimiento.
    await expect(withOrg(A, (tx) => guardarCumplimiento(tx, { ...admin, role: 'enologo' }, { nombre: 'x', tipo: 'SAG' }))).rejects.toThrow();
  });
});
