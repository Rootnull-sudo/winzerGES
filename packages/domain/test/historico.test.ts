import { describe, expect, it } from 'vitest';
import { historicoLotes, historicoPorTemporada } from '../src/entities/historico';
import { loadLegacy } from './legacy';

const lote = [
  { id: 'l1', codigo: 'L-25-SB', variedad: 'Sauvignon Blanc', tipo: 'blanco', temporadaId: 't25', cuartelIds: ['c1'] },
  { id: 'l2', codigo: 'L-25-CS', variedad: 'Cabernet Sauvignon', tipo: 'tinto', temporadaId: 't25', cuartelIds: [] },
  { id: 'l3', codigo: 'L-26-CS', variedad: 'Cabernet Sauvignon', tipo: 'tinto', temporadaId: 't26', cuartelIds: ['c2'] },
  { id: 'l4', codigo: 'L-26-X', variedad: 'Carmenère', tipo: 'tinto', temporadaId: 't26', cuartelIds: [] }
];
const cosecha = [
  { loteId: 'l1', cuartelId: 'c1', kg: 12000 },
  { loteId: 'l2', cuartelId: 'c2', kg: 6000 },
  { loteId: 'l3', cuartelId: 'c2', kg: 7000 },
  { loteId: 'l3', cuartelId: 'c3', kg: 500 },
  { loteId: null, cuartelId: 'c1', kg: 999 }
];
const movBodega = [
  { estanqueId: 'e1', loteId: 'l1', litros: 9000, tipo: 'entrada' },
  { estanqueId: 'e1', loteId: 'l1', litros: -6000, tipo: 'envasado' },
  { estanqueId: 'e1', loteId: 'l1', litros: -270, tipo: 'merma' },
  { estanqueId: 'e2', loteId: 'l2', litros: 4200, tipo: 'entrada' },
  { estanqueId: 'e2', loteId: 'l2', litros: -1000, tipo: 'venta_granel' },
  { estanqueId: 'e2', loteId: 'l2', litros: -150, tipo: 'vinagre' },
  { estanqueId: 'e3', loteId: 'l3', litros: 5100, tipo: 'entrada' }
];
const anio = (t: string | null | undefined) => ({ t25: 2025, t26: 2026 })[t ?? ''] ?? null;

describe('histórico — paridad con v1', () => {
  const v1 = loadLegacy(['js/calc/inventory.js'], undefined, { movBodega, lote }).calc.inventory;
  const filas = historicoLotes(lote, cosecha, movBodega, anio);
  it('una fila por lote con kg o litros (sin el lote vacío), con el balance de v1', () => {
    expect(filas.map((f) => f.id)).toEqual(['l1', 'l2', 'l3']);
    for (const f of filas) {
      const b = v1.balanceLote(f.id);
      expect([f.litros, f.envasado, f.granel, f.vinagre, f.merma, f.stock]).toEqual([b.entradas, b.envasado, b.ventaGranel, b.vinagre, b.merma, b.stock]);
    }
    const l3 = filas.find((f) => f.id === 'l3')!;
    expect(l3.kg).toBe(7500); // la cosecha sin lote no cuenta
    expect(l3.cuartelIds).toEqual(['c2', 'c3']);
    expect(l3.rendimiento).toBeCloseTo(5100 / 7500, 10);
    expect(filas[0]!.mermaPct).toBeCloseTo(270 / 9000, 10);
  });
  it('totales por temporada y variación de litros', () => {
    const t = historicoPorTemporada(filas);
    expect(t.map((x) => [x.anio, x.kg, x.litros, x.blanco, x.tinto, x.envasado, x.granel, x.merma])).toEqual([
      [2025, 18000, 13200, 9000, 4200, 6000, 1000, 270],
      [2026, 7500, 5100, 0, 5100, 0, 0, 0]
    ]);
    expect(t[0]!.variacion).toBeNull();
    expect(t[1]!.variacion).toBeCloseTo((5100 - 13200) / 13200, 10);
    expect(t[0]!.rendimiento).toBeCloseTo(13200 / 18000, 10);
  });
});
