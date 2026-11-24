/**
 * Aislamiento multi-viña con Postgres real (npm run db:up && npm run db:migrate).
 * Verifica que la conexión de la app (rol winzer_app) NUNCA ve filas de otra viña,
 * incluso con SQL sin filtro por org_id, y que sin viña activa no ve nada.
 */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb, db } from '../src/client';
import { ConflictError, upsert, type Actor } from '../src/repo';
import { cliente, cuartel, member, organization, user } from '../src/schema';
import * as sync from '../src/sync';
import { importV1, mapId } from '../src/import-v1';
import { withOrg } from '../src/tenancy';
import { demoDump } from '../src/seed-data';
import { PermissionError } from '@winzer/domain';

const run = randomUUID().slice(0, 8);
const A = `test_a_${run}`,
  B = `test_b_${run}`,
  U = `test_u_${run}`;
const actorA: Actor = { orgId: A, userId: U, userName: 'Test', role: 'admin' };
const actorB: Actor = { ...actorA, orgId: B };
const metaCli = { entity: 'cliente', module: 'clientes', label: 'clientes', sensitive: true };

beforeAll(async () => {
  await adminDb()
    .insert(user)
    .values({ id: U, name: 'Test', email: `${U}@test.local` });
  await adminDb()
    .insert(organization)
    .values([
      { id: A, slug: A, nombre: 'A' },
      { id: B, slug: B, nombre: 'B' }
    ]);
  await adminDb()
    .insert(member)
    .values([
      { orgId: A, userId: U, role: 'admin' },
      { orgId: B, userId: U, role: 'admin' }
    ]);
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id in (${A}, ${B})`);
  await adminDb()
    .delete(user)
    .where(sql`id = ${U}`);
});

describe('RLS', () => {
  it('cada viña ve solo sus clientes, incluso con SELECT sin WHERE', async () => {
    await withOrg(A, (tx) => upsert(tx, cliente, actorA, metaCli, { id: randomUUID(), nombre: 'Cliente de A', rut: '66.666.666-6', tipo: 'Persona' }));
    await withOrg(B, (tx) => upsert(tx, cliente, actorB, metaCli, { id: randomUUID(), nombre: 'Cliente de B', rut: '66.666.666-6', tipo: 'Persona' }));
    const enA = await withOrg(A, (tx) => tx.execute<{ nombre: string }>(sql`select nombre from cliente`));
    const enB = await withOrg(B, (tx) => tx.execute<{ nombre: string }>(sql`select nombre from cliente`));
    expect(enA.map((r) => r.nombre)).toEqual(['Cliente de A']);
    expect(enB.map((r) => r.nombre)).toEqual(['Cliente de B']);
  });

  it('sin viña activa la app no ve ninguna fila (falla cerrada)', async () => {
    const rows = await db().execute(sql`select count(*)::int as n from cliente`);
    expect(rows[0]!.n).toBe(0);
  });

  it('no se puede insertar ni mover filas hacia otra viña', async () => {
    const pgError = (e: { cause?: { message?: string } }) => e.cause?.message ?? '';
    const ins = await withOrg(A, (tx) =>
      tx.execute(sql`insert into cliente (id, org_id, nombre, rut, tipo) values (${randomUUID()}, ${B}, 'intruso', '1-9', 'Persona')`)
    ).catch(pgError);
    expect(ins).toMatch(/row-level security/);
    const moved = await withOrg(A, (tx) => tx.execute(sql`update cliente set org_id = ${B}`)).catch(pgError);
    expect(moved).toMatch(/row-level security/);
  });

  it('la auditoría queda registrada en la misma viña', async () => {
    const logs = await withOrg(A, (tx) => tx.execute<{ accion: string; entidad: string }>(sql`select accion, entidad from audit_log`));
    expect(logs).toEqual([{ accion: 'crear', entidad: 'cliente' }]);
  });
});

describe('permisos y concurrencia en servidor', () => {
  it('rol ventas no puede editar catastro', async () => {
    const ventas = { ...actorA, role: 'ventas' };
    await expect(
      withOrg(A, (tx) =>
        upsert(
          tx,
          cuartel,
          ventas,
          { entity: 'cuartel', module: 'catastro', label: 'cuarteles' },
          { id: randomUUID(), codigo: 'X', variedad: 'País', tipo: 'tinto', superficie: 1 }
        )
      )
    ).rejects.toBeInstanceOf(PermissionError);
  });
});

describe('sync offline', () => {
  const id = randomUUID();
  const base = { codigo: 'S-01', variedad: 'Syrah', tipo: 'tinto', superficie: 1.5 };
  const mut = (o: Partial<sync_Mutation>): sync_Mutation => ({
    mutationId: randomUUID(),
    entity: 'cuartel',
    op: 'upsert',
    id,
    baseVersion: null,
    data: base,
    createdAt: new Date().toISOString(),
    ...o
  });

  it('push crea, pull lo devuelve y el cursor avanza', async () => {
    const [r] = await sync.push(actorA, [mut({})]);
    expect(r!.status).toBe('ok');
    const p1 = await sync.pull(actorA, null);
    expect(p1.records.map((x) => x.id)).toContain(id);
    const p2 = await sync.pull(actorA, p1.cursor);
    expect(p2.records).toEqual([]);
    // La otra viña no recibe nada de A
    expect((await sync.pull(actorB, null)).records.find((x) => x.id === id)).toBeUndefined();
  });

  it('edición concurrente: la segunda con versión vieja es conflicto', async () => {
    const ok = await sync.push(actorA, [mut({ baseVersion: 1, data: { ...base, superficie: 2 } })]);
    expect(ok[0]!.status).toBe('ok');
    const conflict = await sync.push(actorA, [mut({ baseVersion: 1, data: { ...base, superficie: 9 } })]);
    expect(conflict[0]!.status).toBe('conflict');
    if (conflict[0]!.status === 'conflict') expect(conflict[0]!.record!.data.superficie).toBe(2);
  });

  it('reenviar una mutación ya aplicada es idempotente', async () => {
    const again = await sync.push(actorA, [mut({ baseVersion: 1, data: { ...base, superficie: 2 } })]);
    expect(again[0]!.status).toBe('ok');
  });

  it('código duplicado y datos inválidos se rechazan con mensaje', async () => {
    const dup = await sync.push(actorA, [mut({ id: randomUUID(), data: { ...base, codigo: 's-01' } })]);
    expect(dup[0]).toMatchObject({ status: 'rejected' });
    const bad = await sync.push(actorA, [mut({ id: randomUUID(), data: { ...base, superficie: 0 } })]);
    expect(bad[0]).toMatchObject({ status: 'rejected' });
  });

  it('borrado lógico se sincroniza', async () => {
    const p0 = await sync.pull(actorA, null);
    await sync.push(actorA, [mut({ op: 'delete', data: undefined })]);
    const p1 = await sync.pull(actorA, p0.cursor);
    expect(p1.records).toEqual([expect.objectContaining({ id, deleted: true })]);
  });

  it('una transacción abierta no hace que el cursor se salte filas', async () => {
    const p0 = await sync.pull(actorA, null);
    const slowId = randomUUID();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    // Transacción lenta: inserta primero (seq menor) pero confirma después.
    const slow = withOrg(A, async (tx) => {
      await upsert(
        tx,
        cuartel,
        actorA,
        { entity: 'cuartel', module: 'catastro', label: 'cuarteles' },
        { id: slowId, codigo: 'SLOW', variedad: 'País', tipo: 'tinto', superficie: 1 }
      );
      await gate;
    });
    await new Promise((r) => setTimeout(r, 200));
    const fastId = randomUUID();
    await sync.push(actorA, [mut({ id: fastId, data: { ...base, codigo: 'FAST' } })]);
    const p1 = await sync.pull(actorA, p0.cursor);
    expect(p1.records.map((r) => r.id)).not.toContain(slowId);
    release();
    await slow;
    const p2 = await sync.pull(actorA, p1.cursor);
    const all = [...p1.records, ...p2.records].map((r) => r.id);
    expect(all).toContain(slowId);
    expect(all).toContain(fastId);
  });
});

describe('importador v1', () => {
  it('importa el demo, es idempotente y reporta pendientes', async () => {
    const dump = { ...demoDump, data: { ...demoDump.data, renta: [{ id: 'd1' }, { id: 'd2' }] } };
    const r1 = await importV1(actorB, dump as never);
    expect(r1.importados).toEqual({
      cuartel: 3,
      cliente: 6,
      proveedor: 5,
      compra: 5,
      pago: 3,
      gasto: 10,
      presupuesto: 7,
      activo: 3,
      trabajador: 3,
      remuneracion: 7,
      honorario: 4,
      formato: 4,
      marca: 1,
      etiqueta: 2,
      ordenEnvasado: 3,
      venta: 5,
      cobro: 3,
      insumo: 11,
      movInsumo: 1,
      fenologia: 5,
      clima: 22,
      aplicacion: 4,
      labor: 3,
      cosecha: 3,
      jornal: 3,
      lote: 5,
      estanque: 4,
      movBodega: 6,
      fermentacion: 2,
      seguimiento: 17,
      adicionSO2: 1,
      aditivo: 2,
      analisis: 4,
      emisor: 1,
      caf: 3
    });
    expect(r1.omitidos).toEqual([]);
    expect(r1.pendientes).toEqual({ renta: 2 });
    await importV1(actorB, dump as never);
    const n = await withOrg(B, (tx) => tx.execute<{ n: number }>(sql`select count(*)::int n from cuartel where demo`));
    expect(n[0]!.n).toBe(3);
    const cob = await withOrg(B, (tx) => tx.execute<{ cliente_id: string }>(sql`select cliente_id from cobro order by fecha limit 1`));
    expect(cob[0]!.cliente_id).toBe(mapId(B, 'cli_dist'));
    // Reimportar no duplica consumos de aplicaciones ni movimientos: urea = 500 − 150 (aplicación) − 20 (ajuste).
    const [urea] = await withOrg(B, (tx) => tx.execute<{ stock: string }>(sql`select stock from v_stock_insumo where insumo_id = ${mapId(B, 'ins_urea')}`));
    expect(Number(urea!.stock)).toBe(330);
  });
});

type sync_Mutation = import('@winzer/domain').Mutation;
void ConflictError;
