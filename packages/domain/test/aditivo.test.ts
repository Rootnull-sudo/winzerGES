import { describe, expect, it } from 'vitest';
import { aditivoInput, cantidadAditivo, unidadDosis } from '../src/entities/aditivo';

// v1 (vinificacion/index.js `cantidad`): g = dosis × volumen / 100; en g si el insumo es "g", si no ÷ 1000 (asumía kg).
describe('aditivos — conversión de unidades', () => {
  it('masa: kg y g dan lo mismo que v1', () => {
    expect(cantidadAditivo(30, 5000, 'kg')).toBe(1.5); // v1: 1500 g / 1000
    expect(cantidadAditivo(30, 5000, 'g')).toBe(1500); // v1: igual
  });
  it('líquidos: mL/hL a L o mL (v1 los trataba como kg)', () => {
    expect(cantidadAditivo(20, 3000, 'L')).toBe(0.6);
    expect(cantidadAditivo(20, 3000, 'mL')).toBe(600);
    expect(unidadDosis('L')).toBe('mL/hL');
    expect(unidadDosis('kg')).toBe('g/hL');
  });
  it('unidades no dosificables', () => {
    expect(cantidadAditivo(20, 3000, 'un')).toBeNull();
    expect(unidadDosis('caja')).toBeNull();
  });
  it('esquema', () => {
    const base = { fecha: '2027-04-10', loteId: 'l', tipo: 'bentonita', insumoId: 'i', volumen: 5000, unidadDosis: 'g/hL', cantidad: 1.5 };
    expect(aditivoInput.safeParse({ ...base, dosis: 30 }).success).toBe(true);
    expect(aditivoInput.safeParse({ ...base, dosis: 0 }).success).toBe(false);
    expect(aditivoInput.safeParse({ ...base, dosis: 30, tipo: 'so2' }).success).toBe(false); // el SO₂ va en la ficha
  });
});
