/**
 * Paridad con v1 sobre el respaldo demo COMPLETO (F7-4). El respaldo lo genera `scripts/demo-v1.mjs` ejecutando el
 * seed de v1; aquí se importa a una viña de prueba y se comparan los indicadores con los que calcula v1 (en una VM)
 * sobre los mismos datos. Cada diferencia permitida se explica contra su bug en docs/v2/dominio.md.
 */
import { DEFAULT_CONFIG, estadoResultados, periodoAnio } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadLegacy } from '../../domain/test/legacy';
import { adminDb } from '../src/client';
import { importV1, mapId, type ImportReport, type V1Dump } from '../src/import-v1';
import type { Actor } from '../src/repo';
import { organization } from '../src/schema';
import { datosPeriodo } from '../src/services/financiero';
import { f29Periodos } from '../src/services/tributario';
import { withOrg } from '../src/tenancy';

const dump = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/demo-v1.json'), 'utf8')) as V1Dump;
const run = randomUUID().slice(0, 8);
const A = `test_pv_${run}`;
const admin: Actor = { orgId: A, userId: 'u', userName: 'Test', role: 'admin' };
let rep: ImportReport;

// v1 sobre los mismos datos.
const VG = loadLegacy(
  ['js/calc/oenology.js', 'js/calc/tax.js', 'js/calc/inventory.js', 'js/calc/financial.js'],
  DEFAULT_CONFIG,
  dump.data as Record<string, unknown[]>
);
VG.utils.memo = (_k: string, fn: () => unknown) => fn();
const v1 = { F: VG.calc.financial, T: VG.calc.tax, I: VG.calc.inventory };
const q = <T extends Record<string, unknown>>(s: ReturnType<typeof sql>) => withOrg(A, (tx) => tx.execute<T>(s));

beforeAll(async () => {
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'Viña Los Robles Demo', rut: '76.543.210-3', razonSocial: 'Viña Los Robles Demo SpA' });
  rep = await importV1(admin, dump);
}, 300_000);
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
});

describe('respaldo demo completo de v1', () => {
  it('se importa entero: las 49 entidades (config, usuarios, roles y auditoría se omiten a propósito)', () => {
    expect(rep.omitidos).toEqual([]);
    expect(rep.pendientes).toEqual({});
    const entidades = Object.keys(dump.data).filter((e) => !['config', 'usuario', 'rol', 'auditoria'].includes(e));
    for (const e of entidades)
      expect(rep.importados[e], e).toBe(
        dump.data[e]!.length -
          (e === 'pagoImpuesto' ? dump.data[e]!.filter((p) => !Number(p.monto)).length : 0) -
          (e === 'movBodega' ? dump.data[e]!.filter((m) => m.tipo === 'envasado' || m.tipo === 'venta_granel').length : 0) -
          (e === 'movInsumo' ? dump.data[e]!.filter((m) => ['aplicacion', 'so2', 'aditivo', 'compra', 'consumo_envasado'].includes(String(m.tipo))).length : 0)
      );
  });

  it('litros por estanque', async () => {
    const rows = await q<{ codigo: string; litros: string }>(sql`select codigo, litros from v_ocupacion`);
    for (const e of dump.data.estanque!) {
      const v2 = Number(rows.find((r) => r.codigo === e.codigo)?.litros ?? 0);
      expect(v2, String(e.codigo)).toBeCloseTo(v1.I.litrosEstanque(e.id), 2);
    }
  });

  it('stock de cada insumo', async () => {
    const rows = await q<{ insumo_id: string; stock: string }>(sql`select insumo_id, stock from v_stock_insumo`);
    for (const i of dump.data.insumo!) {
      const v2 = Number(rows.find((r) => r.insumo_id === mapId(A, String(i.id)))?.stock ?? NaN);
      expect(v2, String(i.nombre)).toBeCloseTo(v1.I.stockInsumo(i.id), 4);
    }
  });

  it('valor del producto terminado', async () => {
    const [r] = await q<{ v: string }>(sql`select coalesce(sum(valor), 0) as v from v_stock_producto`);
    expect(Number(r!.v)).toBeCloseTo(v1.I.valorProductoTerminado(), 0);
  });

  it.each([2025, 2026])('estado de resultados %i (sin depreciación ni amortización, que v2 corrige: bug 4)', async (anio) => {
    const p = periodoAnio(anio);
    const er = estadoResultados(await withOrg(A, (tx) => datosPeriodo(tx, p)), p, DEFAULT_CONFIG.tributario);
    const b = v1.F.estadoResultados(p);
    for (const k of [
      'ingresos',
      'ingGranel',
      'ingEnv',
      'cogs',
      'mb',
      'gav',
      'gastosAdmin',
      'indirectos',
      'gastosProduccion',
      'ebitda',
      'gFin',
      'litros',
      'unidades',
      'ventasN'
    ] as const)
      expect(er[k], k).toBeCloseTo(b[k], 0);
    expect(er.porCanal).toEqual(b.porCanal);
    expect(er.remuneraciones).toEqual(b.remuneraciones);
  });

  it('F29 de cada mes con documentos', async () => {
    const meses = [...new Set((dump.data.dte ?? []).map((d) => String(d.fecha).slice(0, 7)))].sort();
    const v2 = await withOrg(A, (tx) => f29Periodos(tx, meses[0]!, meses.at(-1)!));
    for (const m of meses) {
      const a = v2.find((x) => x.periodo === m)!;
      const b = v1.T.f29(m);
      // Un F29 declarado o pagado en v1 se importa con su foto: se compara la foto.
      const ref = (dump.data.f29 ?? []).find((f) => f.periodo === m && ['declarado', 'pagado'].includes(String(f.estado)) && f.snapshot)
        ? ((dump.data.f29 ?? []).find((f) => f.periodo === m)!.snapshot as typeof b)
        : b;
      for (const k of ['ivaDebito', 'ivaCredito', 'ivaPagar', 'ppm', 'retencionHonorarios', 'impuestoUnico', 'total'] as const)
        expect(a.calculo[k], `${m} ${k}`).toBeCloseTo(ref[k], 0);
    }
  });
});
