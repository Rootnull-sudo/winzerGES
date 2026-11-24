import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { gastoInput, mesesTranscurridos, presupuestoVsReal, totalesGasto } from '../src/entities/gasto';
import { loadLegacy } from './legacy';

const tasa = DEFAULT_CONFIG.tributario.tasaIVA;

describe('gastos', () => {
  const v1 = loadLegacy(['js/calc/tax.js']).calc.tax;
  it('IVA solo en factura afecta (paridad con tax.iva de v1)', () => {
    expect(totalesGasto({ monto: 500000, documento: 'factura', afectoIVA: true }, tasa)).toEqual({ iva: v1.iva(500000), total: 500000 + v1.iva(500000) });
    expect(totalesGasto({ monto: 500000, documento: 'factura', afectoIVA: false }, tasa).iva).toBe(0);
    expect(totalesGasto({ monto: 500000, documento: 'boleta', afectoIVA: true }, tasa).iva).toBe(0);
  });
  it('el esquema apaga afectoIVA fuera de factura (v1 sumaba IVA fantasma) y el folio en "otro"', () => {
    const base = { fecha: '2026-03-10', categoria: 'servicios', descripcion: 'Luz', monto: 1000 };
    expect(gastoInput.parse({ ...base, documento: 'boleta', afectoIVA: true }).afectoIVA).toBe(false);
    expect(gastoInput.parse({ ...base, documento: 'factura', afectoIVA: 'on' }).afectoIVA).toBe(true);
    expect(gastoInput.parse({ ...base, documento: 'otro', folio: '12' }).folio).toBeNull();
    expect(gastoInput.safeParse({ ...base, categoria: 'inventada' }).success).toBe(false);
  });
});

describe('presupuesto vs real', () => {
  const gastos = [
    { fecha: '2026-01-10', categoria: 'servicios', monto: 500000 },
    { fecha: '2026-02-10', categoria: 'servicios', monto: 520000 },
    { fecha: '2025-12-10', categoria: 'servicios', monto: 999999 },
    { fecha: '2026-03-01', categoria: 'seguros', monto: 300000 }
  ];
  const presupuestos = [{ anio: 2026, categoria: 'servicios', monto: 6_000_000 }];
  it('fórmula de v1: proyección = real ÷ meses × 12; desviación contra el presupuesto', () => {
    const f = presupuestoVsReal(gastos, presupuestos, 2026, '2026-03-15');
    const s = f.find((x) => x.categoria === 'servicios')!;
    expect(s.real).toBe(1_020_000);
    expect(s.proyeccion).toBeCloseTo((1_020_000 / 3) * 12, 6);
    expect(s.desviacion).toBeCloseTo(((1_020_000 / 3) * 12 - 6_000_000) / 6_000_000, 10);
    expect(s.avance).toBeCloseTo(0.17, 10);
  });
  it('incluye todas las categorías (v1 ocultaba las sin datos) y los meses salen de la fecha', () => {
    const f = presupuestoVsReal(gastos, presupuestos, 2026, '2026-03-15');
    expect(f).toHaveLength(12);
    expect(f.find((x) => x.categoria === 'arriendo')).toMatchObject({ presupuesto: 0, real: 0, avance: null, desviacion: null });
    expect([mesesTranscurridos(2026, '2026-03-15'), mesesTranscurridos(2025, '2026-03-15'), mesesTranscurridos(2027, '2026-03-15')]).toEqual([3, 12, 1]);
  });
});
