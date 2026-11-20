import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { cosechaInput, costoCosecha, destinoDeV1, jornalInput, pagoJornal, rendimientoKgHa } from '../src/entities/cosecha';
import { cajonValido } from '../src/oenology';
import { loadLegacy } from './legacy';

const cosechas = [
  { id: 'c1', kg: 3800, costoBins: 40000, costoTransporte: 25000, costoAlimentacion: 18000, otrosCostos: 0 },
  { id: 'c2', kg: 0, costoBins: 1000 }
];
const jornal = [
  { id: 'j1', cosechaId: 'c1', tarifaTipo: 'cajon', tarifa: 650, cajones: 120 },
  { id: 'j2', cosechaId: 'c1', tarifaTipo: 'kg', tarifa: 45, kg: 1520 },
  { id: 'j3', cosechaId: 'c1', tarifaTipo: 'dia', tarifa: 35000, jornadas: 2.5 },
  { id: 'j4', cosechaId: 'c2', tarifaTipo: 'dia', tarifa: 30000 }
];

describe('cosecha — paridad con v1', () => {
  const v1 = loadLegacy(['js/calc/financial.js', 'js/calc/oenology.js'], undefined, { jornal });
  it.each(jornal)('pago del jornal $id', (j) => {
    expect(pagoJornal(j)).toBe(v1.calc.financial.pagoJornal(j));
  });
  it.each(cosechas)('costo de la cosecha $id', (c) => {
    expect(costoCosecha(c, jornal)).toEqual(v1.calc.financial.costoCosecha(c));
  });
  it.each([
    [3800, 200],
    [3800, 180],
    [500, 0]
  ])('cajón válido (%i kg, %i cajones)', (kg, cajones) => {
    expect(cajonValido(kg, cajones, DEFAULT_CONFIG.enologia)).toBe(v1.calc.oenology.cajonValido(kg, cajones));
  });
});

describe('cosecha — esquemas', () => {
  it('destino de v1 → id', () => {
    expect(destinoDeV1('Venta de uva')).toBe('venta');
    expect(destinoDeV1('descarte')).toBe('descarte');
    expect(cosechaInput.parse({ fecha: '2026-03-10', temporadaId: 't', cuartelId: 'c', cajones: 200, kg: 3800, destino: 'Vinificación propia' }).destino).toBe(
      'propia'
    );
  });
  it('el jornal calcula el pago, limpia cantidades ajenas y exige jornadas por día', () => {
    const j = jornalInput.parse({ cosechaId: 'c', nombre: 'Cuadrilla Norte', tarifaTipo: 'cajon', tarifa: 650, cajones: 120, kg: 999, trabajadores: '' });
    expect(j).toMatchObject({ pago: 78000, kg: null, trabajadores: 1 });
    expect(jornalInput.safeParse({ cosechaId: 'c', nombre: 'X', tarifaTipo: 'dia', tarifa: 30000 }).success).toBe(false);
    expect(jornalInput.safeParse({ cosechaId: 'c', nombre: 'X', tarifaTipo: 'kg', tarifa: 40, kg: 10, rut: '12.345.678-0' }).success).toBe(false);
  });
  it('rendimiento', () => {
    expect(rendimientoKgHa(3800, 2.5)).toBe(1520);
    expect(rendimientoKgHa(3800, 0)).toBeNull();
  });
});
