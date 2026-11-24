/** Personas (F4): trabajadores; remuneraciones y honorarios se agregan en F4-2 y F4-3. */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb } from '../src/client';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import { calcularAlertas } from '../src/alertas/motor';
import { remuneracionesPorPagar } from '../src/alertas/reglas/personas';
import { eliminarTrabajador, guardarTrabajador } from '../src/services/personas';
import { cargarIndicadores } from '../src/services/parametros';
import { calcularMes, guardarNovedades, idRemuneracion, marcarRemuneracionPagada, revertirPagoRemuneracion } from '../src/services/remuneraciones';
import { withOrg } from '../src/tenancy';

const run = randomUUID().slice(0, 8);
const A = `test_pe_${run}`;
const adm: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'administrativo' };
export const fichaBase = { nombre: 'Persona Test', rut: '15.111.222-6', cargo: 'Bodeguero', sueldoBase: 900_000, ingreso: '2025-01-01' };

// UTM distintas en dos meses de un año que no usa nadie más (la tabla de indicadores es global).
const UTM = { '2031-03': 80_000, '2031-04': 90_000 } as const;
beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'A' });
  await cargarIndicadores(adminDb(), [
    { clave: 'utm', fecha: '2031-03-01', valor: UTM['2031-03'], fuente: 'test' },
    { clave: 'utm', fecha: '2031-04-01', valor: UTM['2031-04'], fuente: 'test' }
  ]);
});
afterAll(async () => {
  await adminDb().execute(sql`delete from indicador where fecha like '2031-%'`);
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('trabajadores', () => {
  it('RUT único por viña y auditado como dato sensible', async () => {
    const t = await withOrg(A, (tx) => guardarTrabajador(tx, adm, fichaBase));
    await expect(withOrg(A, (tx) => guardarTrabajador(tx, adm, { ...fichaBase, nombre: 'Otra' }))).rejects.toThrow(/ya está registrado/);
    const [a] = await withOrg(A, (tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int n from audit_log where entidad = 'trabajador' and registro_id = ${t.id}`)
    );
    expect(a!.n).toBe(1);
  });
  it('limpia la gratificación fija y el plan Isapre cuando no aplican', async () => {
    const t = await withOrg(A, (tx) =>
      guardarTrabajador(tx, adm, { ...fichaBase, rut: '16.333.444-5', gratificacion: 'art50', gratificacionMonto: 50_000, salud: 'Fonasa', planSalud: 90_000 })
    );
    expect([t.gratificacionMonto, t.planSalud]).toEqual([0, 0]);
  });
  it('el enólogo no ve ni registra trabajadores', async () => {
    await expect(withOrg(A, (tx) => guardarTrabajador(tx, { ...adm, role: 'enologo' }, { ...fichaBase, rut: '17.555.666-4' }))).rejects.toThrow();
  });
});

describe('remuneraciones', () => {
  let T = '';
  const rem = async (periodo: string) =>
    (await withOrg(A, (tx) => tx.execute<Record<string, unknown>>(sql`select * from remuneracion where trabajador_id = ${T} and periodo = ${periodo}`)))[0]!;
  beforeAll(async () => {
    // Sueldo alto para que pague impuesto único (depende de la UTM).
    T = String((await withOrg(A, (tx) => guardarTrabajador(tx, adm, { ...fichaBase, rut: '18.777.888-3', sueldoBase: 3_000_000, ingreso: '2030-01-01' }))).id);
    await withOrg(A, (tx) => guardarTrabajador(tx, adm, { ...fichaBase, rut: '12.345.678-5', ingreso: '2031-05-01' })); // aún no ingresa
  });

  it('cada mes usa SUS indicadores y guarda la foto (v1 usaba los de hoy)', async () => {
    const r1 = await withOrg(A, (tx) => calcularMes(tx, adm, '2031-03'));
    expect(r1.calculadas).toBe(3); // los 3 vigentes; el que ingresa en mayo no se calcula
    await withOrg(A, (tx) => calcularMes(tx, adm, '2031-04'));
    const [m, a] = [await rem('2031-03'), await rem('2031-04')];
    expect((m.parametros as { utm: number }).utm).toBe(UTM['2031-03']);
    expect((a.parametros as { utm: number }).utm).toBe(UTM['2031-04']);
    expect(Number(m.impuesto_unico)).toBeGreaterThan(Number(a.impuesto_unico)); // UTM más baja → más impuesto
    expect((m.trabajador_foto as { rut: string }).rut).toBe('18.777.888-3');
  });

  it('novedades recalculan; las pagadas no se tocan al recalcular el mes', async () => {
    const id = idRemuneracion(A, T, '2031-03');
    const antes = Number((await rem('2031-03')).liquido);
    await withOrg(A, (tx) => guardarNovedades(tx, adm, id, { diasTrabajados: 30, horasExtra: 0, bonos: 0, comisiones: 0, anticipos: 200_000 }));
    expect(Number((await rem('2031-03')).liquido)).toBe(antes - 200_000);
    await withOrg(A, (tx) => marcarRemuneracionPagada(tx, adm, id, '2031-04-03'));
    await expect(
      withOrg(A, (tx) => guardarNovedades(tx, adm, id, { diasTrabajados: 15, horasExtra: 0, bonos: 0, comisiones: 0, anticipos: 0 }))
    ).rejects.toThrow(/pagada/);
    const r = await withOrg(A, (tx) => calcularMes(tx, adm, '2031-03'));
    expect(r.omitidasPagadas).toBe(1);
    expect((await rem('2031-03')).estado).toBe('pagada');
    await withOrg(A, (tx) => revertirPagoRemuneracion(tx, adm, id));
    expect((await rem('2031-03')).estado).toBe('calculada');
  });

  it('un trabajador con remuneraciones no se elimina', async () => {
    await expect(withOrg(A, (tx) => eliminarTrabajador(tx, adm, T))).rejects.toThrow(/fecha de término/);
  });

  it('alerta: remuneraciones del mes anterior sin pagar desde el día 5', async () => {
    expect((await calcularAlertas(A, [remuneracionesPorPagar], '2031-05-04')).abiertas).toBe(0);
    expect((await calcularAlertas(A, [remuneracionesPorPagar], '2031-05-06')).errores).toEqual([]);
    const [x] = await withOrg(A, (tx) =>
      tx.execute<{ titulo: string }>(sql`select titulo from alerta where estado = 'abierta' and regla = 'administracion.remuneraciones_por_pagar'`)
    );
    expect(x!.titulo).toBe('3 remuneraciones de abril de 2031 sin pagar');
  });
});
