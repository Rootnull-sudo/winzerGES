import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import * as oe from '../src/oenology';
import { loadLegacy } from './legacy';

const v1 = loadLegacy(['js/calc/oenology.js']).calc.oenology;
const cfg = DEFAULT_CONFIG.enologia;

describe('oenology — paridad con v1', () => {
  it('dosis de SO₂ (ejemplo documentado: 50 g K₂S₂O₅ en 1.000 L = 28,5 mg/L)', () => {
    expect(oe.dosisMgL(50, 1000, 0.57)).toBeCloseTo(28.5);
    expect(oe.dosisMgL(50, 1000, 0.57)).toBe(v1.dosisMgL(50, 1000, 0.57));
  });

  it.each([
    [10, 'blanco'],
    [25, 'blanco'],
    [37, 'blanco'],
    [41, 'blanco'],
    [15, 'tinto'],
    [22, 'tinto'],
    [31, 'tinto'],
    [36, 'tinto'],
    ['30,5', 'tinto']
  ])('estadoSO2(%s, %s)', (valor, tipo) => {
    expect(oe.estadoSO2(valor, tipo, cfg)).toBe(v1.estadoSO2(valor, tipo));
  });

  it.each([1090, 1100.5, 1000, 995, 0])('brixDesdeDensidad(%s)', (d) => {
    expect(oe.brixDesdeDensidad(d)).toBe(v1.brixDesdeDensidad(d));
  });

  it('gramos para dosis, fracción, alcohol, velocidad', () => {
    expect(oe.gramosParaDosis(30, 14600, 0.57)).toBe(v1.gramosParaDosis(30, 14600, 0.57));
    expect(oe.fraccionSO2({ quimico: 'Na2S2O5' })).toBe(v1.fraccionSO2({ quimico: 'Na2S2O5' }));
    expect(oe.fraccionSO2({ so2Pct: 50 })).toBe(0.5);
    expect(oe.alcoholProbable(24.8)).toBe(v1.alcoholProbable(24.8));
    expect(oe.velocidadFA(24.8, 8, 5)).toBe(v1.velocidadFA(24.8, 8, 5));
  });

  it('grados día y validación de cajón', () => {
    const regs = [
      { tmax: 30, tmin: 12 },
      { tmax: 18, tmin: 1 },
      { tmax: '25,5', tmin: 10 }
    ];
    expect(oe.gradosDia(regs, 10)).toBe(v1.gradosDia(regs, 10));
    expect(oe.cajonValido(950, 50, cfg)).toBe(v1.cajonValido(950, 50));
    expect(oe.cajonValido(1200, 50, cfg)).toBe(false);
  });

  it('tiempos de fermentación (ficha cerrada del seed)', () => {
    const f = { inicioFA: '2026-03-09', inicioTumultuosa: '2026-03-11', finFA: '2026-03-27', brixInicial: 22.4, diasPlanificados: 18 };
    const segs = [
      { fecha: '2026-03-12', brix: 18 },
      { fecha: '2026-03-20', densidad: 1010 }
    ];
    expect(oe.tiemposFermentacion(f, segs, cfg)).toEqual(v1.tiempos(f, segs));
  });
});
