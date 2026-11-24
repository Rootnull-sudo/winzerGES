/** Proveedores (F3-1): servicio, RUT único, borrado bloqueado, FK desde insumos e importador. */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb } from '../src/client';
import { importV1, mapId } from '../src/import-v1';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import { guardarInsumo } from '../src/services/insumos';
import { eliminarProveedor, guardarProveedor } from '../src/services/proveedores';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_pv_${run}`,
  B = `test_pw_${run}`;
const actor = (orgId = A, role = 'administrativo'): Actor => ({ orgId, userId: 'u', userName: 'Test', role });

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
});

describe('proveedores', () => {
  it('RUT válido y único por viña; formatea el RUT', async () => {
    const p = await withOrg(A, (tx) => guardarProveedor(tx, actor(), { nombre: 'Vidrios Test', rut: '761112228', plazo: 30 }));
    expect(p.rut).toBe('76.111.222-8');
    await expect(withOrg(A, (tx) => guardarProveedor(tx, actor(), { nombre: 'Otro', rut: '76.111.222-8' }))).rejects.toThrow(/ya está registrado/);
    await expect(withOrg(A, (tx) => guardarProveedor(tx, actor(), { nombre: 'Malo', rut: '76.111.222-1' }))).rejects.toThrow();
    // Otra viña puede tener el mismo RUT.
    await withOrg(B, (tx) => guardarProveedor(tx, actor(B), { nombre: 'Vidrios Test', rut: '76.111.222-8' }));
  });

  it('no se elimina si un insumo lo tiene como proveedor habitual', async () => {
    const p = await withOrg(A, (tx) => guardarProveedor(tx, actor(), { nombre: 'Agro Test', rut: '76.333.444-9', plazo: 0 }));
    await withOrg(A, (tx) =>
      guardarInsumo(tx, actor(A, 'admin'), { nombre: 'Urea test', categoria: 'agricola', unidad: 'kg', precio: 700, proveedorId: String(p.id) })
    );
    await expect(withOrg(A, (tx) => eliminarProveedor(tx, actor(), String(p.id)))).rejects.toThrow(/insumos asociados/);
    const q = await withOrg(A, (tx) => guardarProveedor(tx, actor(), { nombre: 'Sin uso', rut: '76.555.666-K' }));
    await withOrg(A, (tx) => eliminarProveedor(tx, actor(), String(q.id)));
  });

  it('el agrónomo no puede crear proveedores', async () => {
    await expect(withOrg(A, (tx) => guardarProveedor(tx, actor(A, 'agronomo'), { nombre: 'X', rut: '76.777.888-0' }))).rejects.toThrow();
  });

  it('importador: proveedor antes que insumo; una referencia a un proveedor inexistente queda en null', async () => {
    const r = await importV1(actor(B, 'admin'), {
      app: 'vina-gestion',
      data: {
        proveedor: [{ id: 'prv_1', nombre: 'Enología Imp', rut: '76.999.000-3', plazo: 45 }],
        insumo: [
          {
            id: 'ins_1',
            nombre: 'Levadura imp',
            categoria: 'enologico',
            unidad: 'kg',
            precio: 9000,
            proveedorId: 'prv_1',
            historialPrecios: [{ fecha: '2026-08-01', precio: 9000, proveedorId: 'prv_x' }]
          },
          { id: 'ins_2', nombre: 'Tapón imp', categoria: 'envasado', unidad: 'un', precio: 90, proveedorId: 'prv_no_existe' }
        ]
      }
    });
    expect(r.importados).toEqual({ proveedor: 1, insumo: 2 });
    expect(r.omitidos).toEqual([]);
    const filas = await withOrg(B, (tx) => tx.execute<{ id: string; proveedor_id: string | null }>(sql`select id, proveedor_id from insumo order by nombre`));
    expect(Object.fromEntries(filas.map((f) => [f.id, f.proveedor_id]))).toEqual({ [mapId(B, 'ins_1')]: mapId(B, 'prv_1'), [mapId(B, 'ins_2')]: null });
  });
});
