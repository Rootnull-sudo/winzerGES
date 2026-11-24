import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { margenVenta, totalesVenta, ventaInput, ventaLineaInput } from '../src/entities/venta';
import { loadLegacy } from './legacy';

const t = DEFAULT_CONFIG.tributario;

describe('ventas — paridad con v1 (una línea)', () => {
  const v1 = loadLegacy(['js/calc/tax.js']).calc.tax;
  it.each([
    [600, 4500, true],
    [500, 2200, false],
    [7, 12_990, true]
  ])('factura %s × %s (ILA %s)', (cantidad, precio, ila) => {
    const r = totalesVenta([{ cantidad, precio, afectoIla: ila }], 'factura', t);
    const x = v1.totales(cantidad * precio, { ila });
    expect([r.neto, r.iva, r.ila, r.total]).toEqual([x.neto, x.iva, x.ila, x.total]);
  });
});

describe('ventas — corrige v1', () => {
  it('boleta: el precio incluye IVA e ILA y se desglosa (v1 lo trataba como neto)', () => {
    const r = totalesVenta([{ cantidad: 2, precio: 8990, afectoIla: true }], 'boleta', t);
    expect(r.total).toBeCloseTo(2 * 8990, -1);
    expect(r.neto).toBe(Math.round(17_980 / (1 + t.tasaIVA + t.tasaILA)));
  });
  it('ILA por línea: por defecto en envasado, no en granel', () => {
    expect(ventaLineaInput.parse({ tipo: 'granel', estanqueId: 'e', loteId: 'l', cantidad: 500, precio: 2000 }).afectoIla).toBe(false);
    expect(ventaLineaInput.parse({ tipo: 'envasado', ordenEnvasadoId: 'o', cantidad: 6, precio: 5000 }).afectoIla).toBe(true);
    const r = totalesVenta(
      [
        { cantidad: 6, precio: 5000, afectoIla: true },
        { cantidad: 500, precio: 2000, afectoIla: false }
      ],
      'factura',
      t
    );
    expect(r.ila).toBe(Math.round(30_000 * t.tasaILA));
  });
  it('esquema y margen', () => {
    expect(ventaInput.safeParse({ fecha: '2026-11-01', clienteId: 'c', lineas: [] }).success).toBe(false);
    expect(ventaLineaInput.safeParse({ tipo: 'envasado', cantidad: 1.5, precio: 1, ordenEnvasadoId: 'o' }).success).toBe(false);
    expect(margenVenta(100_000, [{ cantidad: 10, costoUnitario: 6000 }])).toEqual({ costo: 60_000, margen: 40_000, pct: 0.4 });
  });
});
