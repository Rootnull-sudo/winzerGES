import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { diasEnPeriodo, rangoPeriodo, trabajadorInput, vigenteEnPeriodo } from '../src/entities/trabajador';
import * as tax from '../src/tax';

const r = DEFAULT_CONFIG.remuneraciones;
const base = { sueldoBase: 900_000, gratificacion: 'art50', contrato: 'indefinido', salud: 'Fonasa' } as const;

describe('liquidación v2 — corrige v1', () => {
  it('los topes son indicadores: subir el tope imponible sube la AFP de un sueldo alto', () => {
    const alto = { sueldoBase: 5_000_000, gratificacion: 'ninguna' };
    const a = tax.liquidacion(alto, r);
    const b = tax.liquidacion(alto, { ...r, topeImponibleUF: 90 });
    expect(a.afp).toBe(Math.round(87.8 * r.uf * r.afp));
    expect(b.afp).toBe(Math.round(90 * r.uf * r.afp));
  });
  it('el seguro de cesantía usa su propio tope (v1 usaba el de AFP)', () => {
    const l = tax.liquidacion({ sueldoBase: 5_000_000, gratificacion: 'ninguna' }, r);
    expect(l.cesantia).toBe(Math.round(Math.min(5_000_000, 131.9 * r.uf) * r.cesantiaTrabajador));
  });
  it('obra cotiza como plazo fijo; gratificación "ninguna" da 0; con Fonasa el plan Isapre no cuenta', () => {
    const obra = tax.liquidacion({ ...base, contrato: 'obra' }, r);
    expect(obra.cesantia).toBe(0);
    expect(obra.cesantiaEmpleador).toBe(Math.round(obra.imponible * r.cesantiaEmpleadorPlazoFijo));
    expect(tax.liquidacion({ ...base, gratificacion: 'ninguna', gratificacionMonto: 100_000 }, r).gratificacion).toBe(0);
    expect(tax.liquidacion({ ...base, planSalud: 300_000 }, r).salud).toBe(Math.round(tax.liquidacion(base, r).imponible * r.salud));
    expect(tax.liquidacion({ ...base, salud: 'Isapre', planSalud: 300_000 }, r).salud).toBe(300_000);
  });
  it('días trabajados prorratean base y gratificación; horas extra con recargo 50 %; anticipos descuentan', () => {
    const mes = tax.liquidacion(base, r);
    const quince = tax.liquidacion(base, r, { diasTrabajados: 15 });
    expect(quince.base).toBe(450_000);
    expect(quince.gratificacion).toBe(Math.round(mes.gratificacion / 2));
    const hx = tax.liquidacion(base, r, { horasExtra: 10, anticipos: 100_000 });
    // valor hora = 900.000 × 7 / (30 × 42) = 5.000; × 1,5 × 10 h = 75.000
    expect(hx.horasExtra).toBe(75_000);
    expect(hx.anticipos).toBe(100_000);
    expect(hx.liquido).toBe(tax.liquidacion(base, r, { horasExtra: 10 }).liquido - 100_000);
  });
});

describe('trabajadores', () => {
  it('esquema: limpia montos que no aplican; término posterior al ingreso; sueldo bajo el IMM se acepta', () => {
    const t = trabajadorInput.parse({
      nombre: 'A',
      rut: '11.111.111-1',
      cargo: 'Bodeguero',
      sueldoBase: 300_000,
      gratificacion: 'art50',
      gratificacionMonto: 50_000,
      planSalud: 90_000
    });
    expect([t.gratificacionMonto, t.planSalud]).toEqual([0, 0]);
    expect(
      trabajadorInput.safeParse({ nombre: 'A', rut: '11.111.111-1', cargo: 'x', sueldoBase: 1, ingreso: '2026-05-01', termino: '2026-04-01' }).success
    ).toBe(false);
  });
  it('vigencia y días propuestos del periodo', () => {
    expect(rangoPeriodo('2026-02')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28', dias: 28 });
    expect(diasEnPeriodo({ ingreso: '2025-01-01' }, '2026-02')).toBe(30);
    expect(diasEnPeriodo({ ingreso: '2026-11-16' }, '2026-11')).toBe(15);
    expect(diasEnPeriodo({ ingreso: '2025-01-01', termino: '2026-11-10' }, '2026-11')).toBe(10);
    expect(vigenteEnPeriodo({ ingreso: '2026-12-01' }, '2026-11')).toBe(false);
    expect(diasEnPeriodo({ termino: '2026-10-31' }, '2026-11')).toBe(0);
  });
});
