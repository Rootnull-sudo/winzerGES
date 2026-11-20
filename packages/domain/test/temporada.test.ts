import { describe, expect, it } from 'vitest';
import { anioDeFecha, elegirTemporada, rangoPorDefecto, seSolapan, temporadaActual, temporadaDeFecha, temporadaInput } from '../src/entities/temporada';

const T = [2025, 2026, 2027].map(rangoPorDefecto);

describe('temporada', () => {
  it('rango por defecto: 1 de julio del año anterior al 30 de junio', () => {
    expect(rangoPorDefecto(2026)).toEqual({ anio: 2026, inicio: '2025-07-01', fin: '2026-06-30' });
  });

  it.each([
    ['2026-06-30', 2026],
    ['2026-07-01', 2027],
    ['2026-01-15', 2026],
    ['2026-12-31', 2027]
  ])('anioDeFecha(%s) = %i', (fecha, anio) => {
    expect(anioDeFecha(fecha)).toBe(anio);
  });

  it('temporadaDeFecha usa límites inclusivos', () => {
    expect(temporadaDeFecha(T, '2025-07-01')?.anio).toBe(2026);
    expect(temporadaDeFecha(T, '2026-06-30')?.anio).toBe(2026);
    expect(temporadaDeFecha(T, '2030-01-01')).toBeUndefined();
  });

  it('temporadaActual: la que contiene hoy, si no la última que empezó, si no la primera', () => {
    expect(temporadaActual(T, '2026-11-20')?.anio).toBe(2027);
    expect(temporadaActual(T, '2030-01-01')?.anio).toBe(2027);
    expect(temporadaActual(T, '2000-01-01')?.anio).toBe(2025);
    expect(temporadaActual([], '2026-11-20')).toBeUndefined();
  });

  it('elegirTemporada respeta ?t solo si existe', () => {
    expect(elegirTemporada(T, '2025', '2026-11-20').anio).toBe(2025);
    expect(elegirTemporada(T, '1999', '2026-11-20').anio).toBe(2027);
    expect(elegirTemporada(T, 'abc', '2026-11-20').anio).toBe(2027);
    expect(elegirTemporada([], null, '2026-11-20')).toEqual(rangoPorDefecto(2027));
  });

  it('seSolapan', () => {
    expect(seSolapan(T[0]!, T[1]!)).toBe(false);
    expect(seSolapan(T[1]!, { anio: 2026, inicio: '2026-06-01', fin: '2027-05-31' })).toBe(true);
  });

  it('valida fechas y año', () => {
    expect(temporadaInput.safeParse({ anio: 2026, inicio: '2025-07-01', fin: '2026-06-30' }).success).toBe(true);
    expect(temporadaInput.safeParse({ anio: 2026, inicio: '2026-06-30', fin: '2025-07-01' }).success).toBe(false);
    expect(temporadaInput.safeParse({ anio: 2030, inicio: '2025-07-01', fin: '2026-06-30' }).success).toBe(false);
    expect(temporadaInput.parse({ anio: '2026', inicio: '2025-07-01', fin: '2026-06-30' }).estado).toBe('abierta');
  });
});
