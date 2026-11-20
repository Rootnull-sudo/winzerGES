import { describe, expect, it } from 'vitest';
import { aplicacionInput, cantidadSugerida, cosecharDesde, costoAplicacion, laborInput } from '../src/entities/aplicacion';

describe('aplicaciones y labores', () => {
  it('cálculos de v1: sugerida, costo y "cosechar desde"', () => {
    expect(cantidadSugerida(2.5, 3.2)).toBe(8);
    expect(costoAplicacion(8, 1850)).toBe(14800);
    expect(costoAplicacion('7,5', 1999)).toBe(14993);
    expect(cosecharDesde('2026-02-25', 14)).toBe('2026-03-11');
    expect(cosecharDesde('2026-02-25', null)).toBe('2026-02-25');
  });
  it('la labor siempre recalcula su costo', () => {
    const l = laborInput.parse({
      fecha: '2026-08-10',
      temporadaId: 't',
      cuartelId: 'c',
      tipo: 'Poda',
      jornadas: 4,
      valorJornada: 30000,
      otrosCostos: 12000,
      costo: 1
    });
    expect(l.costo).toBe(132000);
    expect(laborInput.parse({ fecha: '2026-08-10', temporadaId: 't', cuartelId: 'c', tipo: 'Riego (energía)', otrosCostos: '45000' }).costo).toBe(45000);
  });
  it('la aplicación exige cantidad positiva', () => {
    const base = { fecha: '2026-10-01', temporadaId: 't', cuartelId: 'c', insumoId: 'i', dosis: 2 };
    expect(aplicacionInput.safeParse({ ...base, cantidad: 0 }).success).toBe(false);
    expect(aplicacionInput.parse({ ...base, cantidad: '4', carencia: '' })).toMatchObject({ cantidad: 4, carencia: null, costo: 0 });
  });
});
