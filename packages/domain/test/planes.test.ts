import { describe, expect, it } from 'vitest';
import { assertCan, can, PermissionError } from '../src/permissions';
import { accesoDe, enPlan, planQueIncluye, suscripcionInicial } from '../src/planes';

const HOY = '2026-11-20';

describe('planes y acceso', () => {
  it('sin suscripción registrada se comporta como piloto activo', () => {
    expect(accesoDe(null, HOY)).toMatchObject({ planId: 'piloto', estado: 'activa', soloLectura: false, modulos: null, aviso: null });
  });

  it('una viña nueva parte con 30 días de prueba del plan completo', () => {
    const s = suscripcionInicial(HOY);
    expect(s).toEqual({ planId: 'completo', estado: 'prueba', periodoInicio: HOY, periodoFin: '2026-12-20' });
    expect(accesoDe(s, HOY)).toMatchObject({ diasRestantes: 30, aviso: null });
    expect(accesoDe(s, '2026-12-15').aviso).toBe('Tu prueba termina en 5 días.');
  });

  it('vencida: 15 días de gracia y luego solo lectura; cancelada: solo lectura de inmediato', () => {
    const s = { planId: 'completo', estado: 'prueba', periodoInicio: '2026-10-01', periodoFin: '2026-10-31' };
    expect(accesoDe(s, '2026-11-10')).toMatchObject({ soloLectura: false, aviso: expect.stringMatching(/Tienes 5 días/) });
    expect(accesoDe(s, '2026-11-20').soloLectura).toBe(true);
    expect(accesoDe({ ...s, estado: 'cancelada', periodoFin: null }, HOY).soloLectura).toBe(true);
  });

  it('el plan esencial no incluye finanzas, pero sí los módulos base', () => {
    const esencial = accesoDe({ planId: 'esencial', estado: 'activa', periodoInicio: HOY, periodoFin: null }, HOY);
    expect(enPlan(esencial, 'catastro')).toBe(true);
    expect(enPlan(esencial, 'clientes')).toBe(true);
    expect(enPlan(esencial, 'financiero')).toBe(false);
    expect(enPlan(esencial, 'configuracion')).toBe(true);
    expect(planQueIncluye('financiero').id).toBe('completo');
    expect(planQueIncluye('cosecha').id).toBe('esencial');
  });

  it('permiso efectivo = rol ∩ plan, y solo lectura deja ver y exportar', () => {
    const esencial = accesoDe({ planId: 'esencial', estado: 'activa', periodoInicio: HOY, periodoFin: null }, HOY);
    expect(can('admin', 'financiero', 'v', [], esencial)).toBe(false);
    expect(can('admin', 'catastro', 'e', [], esencial)).toBe(true);
    expect(can('ventas', 'catastro', 'v', [], esencial)).toBe(false);
    const lectura = { modulos: null, soloLectura: true };
    expect(can('admin', 'catastro', 'v', [], lectura)).toBe(true);
    expect(can('admin', 'catastro', 'x', [], lectura)).toBe(true);
    expect(can('admin', 'catastro', 'c', [], lectura)).toBe(false);
    expect(() => assertCan('admin', 'financiero', 'v', 'el estado de resultados', [], esencial)).toThrow(/disponible en el plan Completo/);
    expect(() => assertCan('admin', 'catastro', 'e', 'cuarteles', [], lectura)).toThrow(PermissionError);
  });
});
