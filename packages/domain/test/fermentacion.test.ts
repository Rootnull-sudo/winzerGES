import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { adicionSO2Input, etapaFicha, fermentacionInput, gramosEnUnidad, horasDesdeUltimaAdicion, seguimientoInput } from '../src/entities/fermentacion';
import { tiemposFermentacion } from '../src/oenology';
import { loadLegacy } from './legacy';

describe('fermentación — paridad con v1', () => {
  const v1 = loadLegacy(['js/calc/oenology.js']).calc.oenology;
  it('tiempos de una ficha en curso', () => {
    // v1 usa siempre la fecha real de hoy: con fin de FA el resultado no depende de ella.
    const f = { inicioFA: '2027-03-22', inicioTumultuosa: '2027-03-24', finFA: '2027-04-05', brixInicial: 24, diasPlanificados: 10 };
    const segs = [
      { fecha: '2027-03-22', brix: 24 },
      { fecha: '2027-03-26', brix: 15.5 },
      { fecha: '2027-03-30', densidad: 1005 }
    ];
    const a = tiemposFermentacion(f, segs, DEFAULT_CONFIG.enologia, '2027-04-05');
    const b = v1.tiempos(f, segs);
    expect([a.diasFA, a.latencia, a.velocidad, a.desvio, a.alertaDesvio]).toEqual([b.diasFA, b.latencia, b.velocidad, b.desvio, b.alertaDesvio]);
  });
});

describe('fermentación', () => {
  it('seguimiento: °Brix desde la densidad y SO₂ total ≥ libre', () => {
    expect(seguimientoInput.parse({ fermentacionId: 'f', fecha: '2027-03-25', densidad: 1060 }).brix).toBe(14.8);
    expect(seguimientoInput.safeParse({ fermentacionId: 'f', fecha: '2027-03-25', so2Libre: 30, so2Total: 20 }).success).toBe(false);
    // 34 °C se acepta: el aviso es de la pantalla (v1 bloqueaba).
    expect(seguimientoInput.safeParse({ fermentacionId: 'f', fecha: '2027-03-25', temperatura: 34 }).success).toBe(true);
  });
  it('adición: dosis y SO₂ teórico calculados', () => {
    const a = adicionSO2Input.parse({ fermentacionId: 'f', fecha: '2027-04-02', insumoId: 'i', fraccion: 0.57, gramos: 150, volumen: 3000, so2Previo: 12 });
    expect([a.dosisMgL, a.so2Teorico]).toEqual([28.5, 40.5]);
  });
  it('ficha: limpia FML en blancos y valida el fin de FA', () => {
    const base = { codigo: 'FA-1', loteId: 'l', volumen: 3000 };
    expect(fermentacionInput.parse({ ...base, tipo: 'blanco', inicioFML: '2027-04-01' }).inicioFML).toBeNull();
    expect(fermentacionInput.safeParse({ ...base, tipo: 'tinto', inicioFA: '2027-03-22', finFA: '2027-03-20' }).success).toBe(false);
    expect(etapaFicha({ inicioFA: '2027-03-22' })).toBe('Fermentando');
    expect(etapaFicha({ inicioFA: 'x', finFA: 'y', inicioFML: 'z' })).toBe('En FML');
  });
  it('unidades y horas desde la última adición', () => {
    expect([gramosEnUnidad(250, 'kg'), gramosEnUnidad(250, 'g'), gramosEnUnidad(250, 'L')]).toEqual([0.25, 250, null]);
    expect(horasDesdeUltimaAdicion([{ fecha: '2027-04-01' }, { fecha: '2027-04-03' }], new Date('2027-04-03T20:00:00'))).toBe(8);
    expect(horasDesdeUltimaAdicion([])).toBeNull();
  });
});
