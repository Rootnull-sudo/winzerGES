import { describe, expect, it } from 'vitest';
import { autoConciliar, huellaMov, montoCartola, normFecha, parseCartola, parseCsv, resumenCuenta, sugerencias } from '../src/entities/banco';
import { loadLegacy } from './legacy';

const VG = loadLegacy(['js/integrations/recon.js']);
const R = VG.integrations.recon;

const csv =
  '﻿Fecha;Descripción;Cargos;Abonos\r\n05/10/2026;"Transferencia; cliente ""A""";;1.395.000\r\n2026-10-07;Comisión;8.900;\r\n8.10.26;Pago proveedor;476.000;\r\n;sin fecha;1;\r\n09/10/2026;en cero;;\n';

describe('cartola: paridad v1 (utils.parseCSV, recon.normFecha, recon.parseCartola)', () => {
  it('parseCsv', () => {
    expect(parseCsv(csv)).toEqual(VG.utils.parseCSV(csv));
    expect(parseCsv('a,b\n1,"x,y"')).toEqual([
      ['a', 'b'],
      ['1', 'x,y']
    ]);
  });
  it.each(['05/10/2026', '5-1-26', '2026-10-07', '8.10.26', 'x', ''])('normFecha %s', (s) => {
    expect(normFecha(s)).toBe(R.normFecha(s));
  });
  it('parseCartola con cargo/abono y con monto único', () => {
    const map = { fecha: 0, glosa: 1, cargo: 2, abono: 3, saltar: 1 };
    const a = parseCartola(csv, map);
    // Mismas filas, fechas y glosas que v1; los montos con punto de miles se corrigen (v1: 1.395.000 → 1,395).
    expect(a.map((r) => [r.fecha, r.glosa])).toEqual(R.parseCartola(csv, map).map((r: { fecha: string; glosa: string }) => [r.fecha, r.glosa]));
    expect(a.map((r) => r.monto)).toEqual([1_395_000, -8_900, -476_000]);
    expect([montoCartola('$ 1.234,50'), montoCartola('-12.500'), montoCartola('1500'), montoCartola('12.5')]).toEqual([1234.5, -12_500, 1500, 12.5]);
    const unico = 'f;g;m\n01/11/2026;Depósito;250000\n02/11/2026;Cheque;-12500\n';
    expect(parseCartola(unico, { fecha: 0, glosa: 1, monto: 2 })).toEqual(R.parseCartola(unico, { fecha: 0, glosa: 1, monto: 2, saltar: 1 }));
  });
  it('huella ignora mayúsculas y espacios de la glosa', () => {
    expect(huellaMov('2026-10-05', 1000.4, ' Pago A ')).toBe(huellaMov('2026-10-05', 1000, 'pago a'));
  });
});

const cands = [
  { origenTipo: 'cobro', origenId: 'c1', ref: 'cobro:c1', fecha: '2026-10-04', monto: 1_395_000, descripcion: 'Cobro A', tipo: 'Cobro', desc: 'A' },
  { origenTipo: 'cobro', origenId: 'c2', ref: 'cobro:c2', fecha: '2026-10-15', monto: 1_395_000, descripcion: 'Cobro B', tipo: 'Cobro', desc: 'B' },
  { origenTipo: 'pago', origenId: 'p1', ref: 'pago:p1', fecha: '2026-10-09', monto: -476_000, descripcion: 'Pago', tipo: 'Pago', desc: 'P' },
  { origenTipo: 'pago', origenId: 'p2', ref: 'pago:p2', fecha: '2026-10-09', monto: -50_000, descripcion: 'Pago 2', tipo: 'Pago', desc: 'P2' },
  { origenTipo: 'pago', origenId: 'p3', ref: 'pago:p3', fecha: '2026-10-11', monto: -50_000, descripcion: 'Pago 3', tipo: 'Pago', desc: 'P3' }
];
const movs = [
  { id: 'm1', cuentaId: 'k', fecha: '2026-10-05', monto: 1_395_000, estado: 'pendiente' },
  { id: 'm2', cuentaId: 'k', fecha: '2026-10-08', monto: -476_001, estado: 'pendiente' },
  { id: 'm3', cuentaId: 'k', fecha: '2026-10-10', monto: -50_000, estado: 'pendiente' },
  { id: 'm4', cuentaId: 'k', fecha: '2026-10-30', monto: -8_900, estado: 'pendiente' },
  { id: 'm5', cuentaId: 'k', fecha: '2026-10-05', monto: 1_395_000, estado: 'conciliado' }
];

describe('matching: paridad v1 (recon.sugerencias / autoConciliar)', () => {
  it('sugerencias', () => {
    for (const m of movs) {
      const a = sugerencias(m, cands).map((s) => [s.origenId, s.score]);
      const b = R.sugerencias(m, cands).map((s: { origenId: string; score: number }) => [s.origenId, s.score]);
      expect(a).toEqual(b);
    }
  });
  it('autoConciliar elige el mismo candidato y deja los empates', async () => {
    const guardados: { id: string; matchRef: string }[] = [];
    const V = loadLegacy(['js/integrations/recon.js'], undefined, { movBanco: movs });
    V.db.save = async (_e: string, r: { id: string; matchRef: string }) => guardados.push(r);
    V.events = { emit: () => {} };
    V.integrations.recon.candidatos = () => cands;
    await V.integrations.recon.autoConciliar('k');
    const a = autoConciliar(movs, cands).map((x) => [x.mov.id, `${x.cand.origenTipo}:${x.cand.origenId}`]);
    expect(a).toEqual(guardados.map((g) => [g.id, g.matchRef]));
    // m3 empata entre p2 y p3 a 1 y 1 día: no se concilia solo.
    expect(a.map((x) => x[0])).not.toContain('m3');
  });
});

describe('resumen de cuenta', () => {
  it('una diferencia con match ajusta solo la diferencia', () => {
    const r = resumenCuenta(
      1_000_000,
      [
        { id: '1', fecha: '2026-10-01', monto: 500_000, estado: 'conciliado' },
        { id: '2', fecha: '2026-10-02', monto: -100_500, estado: 'diferencia', diferencia: -500 },
        { id: '3', fecha: '2026-10-03', monto: -8_900, estado: 'diferencia' },
        { id: '4', fecha: '2026-10-04', monto: 3_200, estado: 'pendiente' }
      ],
      [{ monto: 200_000 }, { monto: -50_000 }]
    );
    expect(r.extracto).toBe(1_393_800);
    expect([r.ajustes, r.pendientes, r.depositos, r.girados]).toEqual([-9_400, 3_200, 200_000, -50_000]);
    expect(r.libros).toBe(1_393_800 - 3_200 + 9_400 + 200_000 - 50_000);
  });
});
