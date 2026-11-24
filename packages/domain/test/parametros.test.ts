import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { configEn, INDICADORES, PARAMETROS, parametroInput, valorPorDefecto, vigenteEn } from '../src/parametros';

describe('parámetros con vigencia', () => {
  it('el catálogo cubre OrgConfig salvo los indicadores globales', () => {
    const campos = Object.entries(DEFAULT_CONFIG).flatMap(([g, o]) => Object.keys(o).map((k) => `${g}.${k}`));
    const indicadores = Object.values(INDICADORES).map((i) => i.campo as string);
    expect(PARAMETROS.map((d) => d.clave).sort()).toEqual(campos.filter((c) => !indicadores.includes(c)).sort());
    for (const d of PARAMETROS) expect(valorPorDefecto(d.clave)).toBeDefined();
  });

  it('vigenteEn toma la fila más reciente que ya rige', () => {
    const filas = [
      { clave: 'x', valor: 1, desde: '2025-01-01' },
      { clave: 'x', valor: 2, desde: '2026-01-01' },
      { clave: 'y', valor: 9, desde: '2020-01-01' }
    ];
    expect(vigenteEn(filas, 'x', '2024-12-31')).toBeUndefined();
    expect(vigenteEn(filas, 'x', '2025-06-01')?.valor).toBe(1);
    expect(vigenteEn(filas, 'x', '2026-01-01')?.valor).toBe(2);
  });

  it('configEn usa los valores vigentes en la fecha pedida', () => {
    const params = [
      { clave: 'tributario.tasaPPM', valor: 0.003, desde: '2026-01-01' },
      { clave: 'enologia.kgCajonMax', valor: 22, desde: '2025-07-01' }
    ];
    const ind = [
      { clave: 'utm', valor: 60000, desde: '2025-01-01' },
      { clave: 'utm', valor: 61000, desde: '2025-02-01' }
    ];
    const marzo25 = configEn(params, ind, '2025-03-15');
    expect(marzo25.tributario.tasaPPM).toBe(DEFAULT_CONFIG.tributario.tasaPPM);
    expect(marzo25.remuneraciones.utm).toBe(61000);
    expect(marzo25.remuneraciones.uf).toBe(DEFAULT_CONFIG.remuneraciones.uf);
    const marzo26 = configEn(params, ind, '2026-03-15');
    expect(marzo26.tributario.tasaPPM).toBe(0.003);
    expect(marzo26.enologia.kgCajonMax).toBe(22);
    // No muta los valores por defecto.
    expect(DEFAULT_CONFIG.enologia.kgCajonMax).toBe(20);
  });

  it('valida el valor según el tipo', () => {
    expect(parametroInput.safeParse({ clave: 'tributario.tasaIVA', valor: '0.19', vigenteDesde: '2026-01-01' }).success).toBe(true);
    expect(parametroInput.safeParse({ clave: 'tributario.tasaIVA', valor: 19, vigenteDesde: '2026-01-01' }).success).toBe(false);
    expect(parametroInput.safeParse({ clave: 'no.existe', valor: 1, vigenteDesde: '2026-01-01' }).success).toBe(false);
    expect(parametroInput.safeParse({ clave: 'enologia.so2Tinto', valor: { min: 30, max: 20, alerta: 35 }, vigenteDesde: '2026-01-01' }).success).toBe(false);
    expect(parametroInput.parse({ clave: 'finanzas.patrimonio', valor: '1000', vigenteDesde: '2026-01-01' }).valor).toBe(1000);
  });
});
