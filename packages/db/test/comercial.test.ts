/** Comercial (F5): formatos, marcas y etiquetas; envasado, ventas y cobros se agregan en F5-2…F5-4. */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularAlertas } from '../src/alertas/motor';
import { marcaPorVencer, marcaVencida } from '../src/alertas/reglas/comercial';
import { adminDb } from '../src/client';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import { eliminarMarca, guardarEtiqueta, guardarFormato, guardarMarca } from '../src/services/marcas';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_cm_${run}`;
const admin: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'admin' };

beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'A' });
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('formatos, marcas y etiquetas', () => {
  it('la versión del diseño no pisa el control de versión del registro', async () => {
    const m = await withOrg(A, (tx) => guardarMarca(tx, admin, { nombre: 'Marca Test', fechaRegistro: '2017-03-10' }));
    expect(m.vencimiento).toBe('2027-03-10');
    const e = await withOrg(A, (tx) => guardarEtiqueta(tx, admin, { nombre: 'Etiqueta', versionDiseno: 3, marcaId: String(m.id) }));
    expect([e.versionDiseno, e.version]).toEqual([3, 1]);
    const e2 = await withOrg(A, (tx) => guardarEtiqueta(tx, admin, { id: String(e.id), nombre: 'Etiqueta', versionDiseno: 3, marcaId: String(m.id) }, 1));
    expect([e2.versionDiseno, e2.version]).toEqual([3, 2]);
    await expect(withOrg(A, (tx) => eliminarMarca(tx, admin, String(m.id)))).rejects.toThrow(/tiene etiquetas/);
  });

  it('el enólogo ve marcas pero no las crea; crea formatos (envasado)', async () => {
    const eno = { ...admin, role: 'enologo' };
    await expect(withOrg(A, (tx) => guardarMarca(tx, eno, { nombre: 'X', fechaRegistro: '2020-01-01' }))).rejects.toThrow();
    const f = await withOrg(A, (tx) => guardarFormato(tx, eno, { nombre: 'Botella 0,75 L', litros: 0.75 }));
    expect(Number(f.litros)).toBe(0.75);
  });

  it('alerta de marca: aviso a ≤ 180 días y error si venció (textos de v1)', async () => {
    const r = await calcularAlertas(A, [marcaVencida, marcaPorVencer], '2026-11-24');
    expect(r.errores).toEqual([]);
    const filas = await withOrg(A, (tx) =>
      tx.execute<{ regla: string; titulo: string; mensaje: string }>(sql`select regla, titulo, mensaje from alerta where estado = 'abierta'`)
    );
    expect(filas).toEqual([{ regla: 'marca.por_vencer', titulo: 'Renovar marca Marca Test (INAPI)', mensaje: 'Vence el 10-03-2027.' }]);
    await calcularAlertas(A, [marcaVencida, marcaPorVencer], '2027-04-01');
    const [v] = await withOrg(A, (tx) => tx.execute<{ regla: string }>(sql`select regla from alerta where estado = 'abierta'`));
    expect(v!.regla).toBe('marca.vencida');
  });
});
