import { describe, expect, it } from 'vitest';
import { climaInput, doyTemporada, fenologiaInput, gdTemporada, normalizarBBCH, regionWinkler } from '../src/entities/fenologia';
import { gradosDia } from '../src/oenology';
import { loadLegacy } from './legacy';

describe('fenología — paridad con v1', () => {
  const v1 = loadLegacy(['js/calc/oenology.js']).calc.oenology;
  it('grados día', () => {
    const rs = [
      { tmax: 28, tmin: 12 },
      { tmax: 18, tmin: 2 },
      { tmax: '31,5', tmin: '14' }
    ];
    expect(gradosDia(rs, 10)).toBe(v1.gradosDia(rs, 10));
  });
  it('región de Winkler con los cortes de v1', () => {
    expect([1389, 1390, 1669, 1940, 2219, 2220].map(regionWinkler)).toEqual([
      'Región I (fría)',
      'Región II',
      'Región II',
      'Región IV',
      'Región IV',
      'Región V (cálida)'
    ]);
  });
});

describe('fenología', () => {
  it('días desde el 1 de julio', () => {
    expect(doyTemporada('2025-07-01')).toBe(0);
    expect(doyTemporada('2025-09-20')).toBe(81);
    expect(doyTemporada('2026-01-01')).toBe(184);
    expect(doyTemporada(null)).toBeNull();
  });
  it('grados día solo de septiembre a abril, acumulados por mes', () => {
    const rs = [
      { fecha: '2025-08-15', tmax: 30, tmin: 20 }, // agosto: fuera del período
      { fecha: '2025-09-10', tmax: 20, tmin: 10 }, // 5
      { fecha: '2025-09-20', tmax: 24, tmin: 10 }, // 7
      { fecha: '2026-01-05', tmax: 30, tmin: 14 }, // 12
      { fecha: '2026-05-02', tmax: 30, tmin: 20 } // mayo: fuera
    ];
    const g = gdTemporada(rs, 10);
    expect(g.total).toBe(24);
    expect(g.porMes).toEqual([12, null, null, null, 24, null, null, null]);
  });
  it('orden de fechas del desborre y temperaturas', () => {
    const base = { cuartelId: 'c', temporadaId: 't', desborreInicio: '2025-09-10' };
    expect(fenologiaInput.safeParse({ ...base, desborre50: '2025-09-15', desborreFin: '2025-09-25' }).success).toBe(true);
    expect(fenologiaInput.safeParse({ ...base, desborre50: '2025-09-05' }).success).toBe(false);
    expect(fenologiaInput.safeParse({ ...base, desborre50: '2025-09-15', desborreFin: '2025-09-12' }).success).toBe(false);
    expect(fenologiaInput.parse({ ...base, bbch: 'BBCH 89 — cosecha' }).bbch).toBe('BBCH 89 — Cosecha');
    expect(climaInput.safeParse({ fecha: '2025-10-01', temporadaId: 't', tmax: 10, tmin: 12 }).success).toBe(false);
    expect(normalizarBBCH('otra cosa')).toBeNull();
  });
});
