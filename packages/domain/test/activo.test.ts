import { describe, expect, it } from 'vitest';
import { activoInput, depreciacionAcumulada, depreciacionEntre, estadoActivo, finVidaUtil, valorLibro } from '../src/entities/activo';
import { loadLegacy } from './legacy';

const prensa = { valor: 18_000_000, vidaUtilAnios: 10, fechaCompra: '2018-02-01', fechaBaja: null };

describe('activos — paridad con v1', () => {
  it('un año completo dentro de la vida útil = financial.depreciacion de v1 (valor ÷ vida)', () => {
    const v1 = loadLegacy(['js/calc/financial.js'], undefined, { activo: [{ ...prensa, vidaUtil: 10 }] }).calc.financial;
    expect(depreciacionEntre(prensa, '2026-01-01', '2026-12-31')).toBeCloseTo(v1.depreciacion({ desde: '2026-01-01', hasta: '2026-12-31' }), 6);
  });
});

describe('activos — corrige v1', () => {
  it('termina al cumplir la vida útil (v1 seguía depreciando)', () => {
    expect(finVidaUtil(prensa)).toBe('2028-01-31');
    expect(depreciacionEntre(prensa, '2029-01-01', '2029-12-31')).toBe(0);
    expect(valorLibro(prensa, '2030-06-01')).toBe(0);
    expect(estadoActivo(prensa, '2030-06-01')).toBe('depreciado');
  });
  it('se prorratea desde la fecha de compra (v1 cobraba el período completo)', () => {
    const nuevo = { valor: 3_650_000, vidaUtilAnios: 10, fechaCompra: '2026-07-01' };
    expect(depreciacionEntre(nuevo, '2026-01-01', '2026-12-31')).toBeCloseTo((365_000 / 365) * 184, 6); // 1-jul a 31-dic
    expect(depreciacionAcumulada(nuevo, '2026-06-30')).toBe(0);
  });
  it('se detiene en la fecha de baja', () => {
    const t = { valor: 3_650_000, vidaUtilAnios: 10, fechaCompra: '2026-01-01', fechaBaja: '2026-01-10' };
    expect(depreciacionAcumulada(t, '2026-12-31')).toBeCloseTo(10_000, 6);
    expect(estadoActivo(t, '2026-12-31')).toBe('de_baja');
  });
  it('esquema', () => {
    expect(activoInput.safeParse({ nombre: 'x', valor: 1, vidaUtilAnios: 0, fechaCompra: '2026-01-01' }).success).toBe(false);
    expect(activoInput.safeParse({ nombre: 'x', valor: 1, vidaUtilAnios: 5, fechaCompra: '2026-01-01', fechaBaja: '2025-01-01' }).success).toBe(false);
  });
});
