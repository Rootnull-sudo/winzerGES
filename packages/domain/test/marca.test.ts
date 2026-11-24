import { describe, expect, it } from 'vitest';
import { amortizacionMarca, estadoMarca, marcaInput, prorrateoEtiqueta, vencimientoMarca } from '../src/entities/marca';
import { loadLegacy } from './legacy';

const et = { id: 'e1', costoDiseno: 850_000, costoFotografia: 0, costoIlustracion: 250_000, tirajeEstimado: 20_000, costoImpresion: 92 };

describe('etiquetas — paridad con v1', () => {
  it.each([
    [[], 0],
    [[{ etiquetaId: 'e1', estado: 'confirmada', unidades: 8000 }], 8000],
    [
      [
        { etiquetaId: 'e1', estado: 'confirmada', unidades: 15_000 },
        { etiquetaId: 'e1', estado: 'confirmada', unidades: 9000 },
        { etiquetaId: 'e1', estado: 'borrador', unidades: 50_000 }
      ],
      24_000
    ]
  ])('prorrateo con producción %#', (ordenes, producidas) => {
    const v1 = loadLegacy(['js/calc/financial.js'], undefined, { ordenEnvasado: ordenes }).calc.financial;
    expect(prorrateoEtiqueta(et, producidas)).toBeCloseTo(v1.prorrateoEtiqueta(et), 10);
  });
});

describe('marcas', () => {
  it('vence a los 10 años; estado según días', () => {
    expect(vencimientoMarca('2019-05-14')).toBe('2029-05-14');
    expect(marcaInput.parse({ nombre: 'X', fechaRegistro: '2019-05-14' }).vencimiento).toBe('2029-05-14');
    expect(estadoMarca('2029-05-14', '2026-11-24').estado).toBe('vigente');
    expect(estadoMarca('2027-03-01', '2026-11-24').estado).toBe('renovar');
    expect(estadoMarca('2026-11-01', '2026-11-24').estado).toBe('vencida');
  });
  it('amortización solo dentro de la vigencia (v1: costo ÷ 120 por mes, para siempre)', () => {
    const m = { costo: 3_650_000, fechaRegistro: '2020-01-01', vencimiento: '2030-01-01' };
    const anual = amortizacionMarca(m, '2026-01-01', '2026-12-31');
    expect(anual).toBeCloseTo((3_650_000 / 3653) * 365, 6);
    expect(amortizacionMarca(m, '2031-01-01', '2031-12-31')).toBe(0);
    expect(amortizacionMarca(m, '2019-01-01', '2019-12-31')).toBe(0);
  });
});
