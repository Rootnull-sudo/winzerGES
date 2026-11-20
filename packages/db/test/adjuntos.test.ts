/** Adjuntos (F0-6, ADR 0013) con Postgres y almacenamiento S3 reales (s3mock de docker-compose / CI). */
import { accesoDe, fechaHoy, type SubidaInput } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb } from '../src/client';
import type { Actor } from '../src/repo';
import { adjunto, organization } from '../src/schema';
import { confirmarSubida, eliminarAdjunto, listarAdjuntos, prepararSubida, purgarAdjuntos, urlDescarga } from '../src/services/adjuntos';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_ad_${run}`;
const admin: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'admin', acceso: accesoDe(null, fechaHoy()) };
const pdf = Buffer.from('%PDF-1.4 prueba');

async function subir(actor: Actor, nombre = 'informe.pdf', cuerpo: Buffer = pdf, mime: SubidaInput['mime'] = 'application/pdf') {
  const p = await withOrg(A, (tx) => prepararSubida(tx, actor, { entidad: 'cliente', registroId: 'c1', nombre, mime, bytes: cuerpo.length }));
  const r = await fetch(p.url, { method: 'PUT', body: new Uint8Array(cuerpo), headers: { 'Content-Type': mime } });
  expect(r.ok).toBe(true);
  return { ...p, nombre };
}

beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'A' });
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('adjuntos', () => {
  it('subir, listar y descargar con URLs firmadas', async () => {
    const p = await subir(admin);
    expect(p.clave.startsWith(`${A}/cliente/c1/`)).toBe(true);
    await withOrg(A, (tx) => confirmarSubida(tx, admin, { id: p.id, clave: p.clave, entidad: 'cliente', registroId: 'c1', nombre: p.nombre }));
    const lista = await withOrg(A, (tx) => listarAdjuntos(tx, admin, 'cliente', 'c1'));
    expect(lista).toMatchObject([{ id: p.id, nombre: 'informe.pdf', mime: 'application/pdf', bytes: pdf.length }]);
    const url = await withOrg(A, (tx) => urlDescarga(tx, admin, p.id));
    const r = await fetch(url);
    expect(Buffer.from(await r.arrayBuffer()).equals(pdf)).toBe(true);
    expect(r.headers.get('content-disposition')).toContain('informe.pdf');
  });

  it('no se puede confirmar una clave de otro registro o viña', async () => {
    const p = await subir(admin);
    await expect(
      withOrg(A, (tx) =>
        confirmarSubida(tx, admin, { id: p.id, clave: `otra_vina/cliente/c1/${p.id}-informe.pdf`, entidad: 'cliente', registroId: 'c1', nombre: p.nombre })
      )
    ).rejects.toThrow(/no corresponde/);
  });

  it('el tipo real del archivo manda: un ejecutable declarado como PDF se rechaza y se borra', async () => {
    const p = await withOrg(A, (tx) => prepararSubida(tx, admin, { entidad: 'cliente', registroId: 'c1', nombre: 'x.pdf', mime: 'application/pdf', bytes: 4 }));
    // El navegador sube con otro Content-Type del que declaró.
    await fetch(p.url, { method: 'PUT', body: 'MZ..', headers: { 'Content-Type': 'application/x-msdownload' } });
    await expect(
      withOrg(A, (tx) => confirmarSubida(tx, admin, { id: p.id, clave: p.clave, entidad: 'cliente', registroId: 'c1', nombre: 'x.pdf' }))
    ).rejects.toThrow(/no permitido/);
  });

  it('respeta permisos del rol y la cuota del plan', async () => {
    const agronomo = { ...admin, role: 'agronomo' };
    await expect(
      withOrg(A, (tx) => prepararSubida(tx, agronomo, { entidad: 'cliente', registroId: 'c1', nombre: 'x.pdf', mime: 'application/pdf', bytes: 10 }))
    ).rejects.toThrow(/permiso/);
    const sinEspacio = { ...admin, acceso: { ...admin.acceso!, maxGb: 0 } };
    await expect(
      withOrg(A, (tx) => prepararSubida(tx, sinEspacio, { entidad: 'cliente', registroId: 'c1', nombre: 'x.pdf', mime: 'application/pdf', bytes: 10 }))
    ).rejects.toThrow(/espacio del plan/);
  });

  it('borrar es lógico y la purga elimina después del plazo', async () => {
    const [a] = await withOrg(A, (tx) => listarAdjuntos(tx, admin, 'cliente', 'c1'));
    await withOrg(A, (tx) => eliminarAdjunto(tx, admin, a!.id));
    expect(await withOrg(A, (tx) => listarAdjuntos(tx, admin, 'cliente', 'c1'))).toEqual([]);
    expect(await purgarAdjuntos(A)).toBe(0);
    expect(await purgarAdjuntos(A, -1)).toBe(1);
    expect(
      await adminDb()
        .select()
        .from(adjunto)
        .where(sql`org_id = ${A}`)
    ).toEqual([]);
  });
});
