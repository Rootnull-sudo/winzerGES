import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { analisisInput, fueraDeRango, rangosAnalisis } from '../src/entities/analisis';
import { esquemaValor } from '../src/parametros';

// v1 (laboratorio/index.js RANGOS): los valores por defecto deben coincidir con los rangos fijos de v1.
const RANGOS_V1 = {
  blanco: {
    ph: [3.1, 3.4],
    acidezTotal: [5.5, 7.5],
    acidezVolatil: [0, 0.6],
    so2Libre: [25, 35],
    so2Total: [0, 200],
    alcohol: [11.5, 14],
    azucarResidual: [0, 4]
  },
  tinto: {
    ph: [3.4, 3.8],
    acidezTotal: [4.8, 6.5],
    acidezVolatil: [0, 0.7],
    so2Libre: [20, 30],
    so2Total: [0, 150],
    alcohol: [12.5, 15],
    azucarResidual: [0, 4]
  }
} as const;

describe('laboratorio — rangos', () => {
  it('por defecto coinciden con v1, con el SO₂ libre desde el rango de fermentación', () => {
    for (const tipo of ['blanco', 'tinto'] as const) {
      const r = rangosAnalisis(tipo, DEFAULT_CONFIG.enologia);
      for (const [k, [min, max]] of Object.entries(RANGOS_V1[tipo])) expect(r[k as keyof typeof r], `${tipo}.${k}`).toEqual({ min, max });
    }
  });
  it('fuera de rango: vacío no cuenta, 0 sí', () => {
    const r = rangosAnalisis('blanco', DEFAULT_CONFIG.enologia);
    expect(fueraDeRango({ ph: 3.3, so2Libre: '', alcohol: null }, r)).toEqual([]);
    expect(fueraDeRango({ ph: 3.6, so2Libre: 0, acidezVolatil: 0.6 }, r).map((f) => f.clave)).toEqual(['ph', 'so2Libre']);
  });
  it('usa los rangos de la viña', () => {
    const enologia = { ...DEFAULT_CONFIG.enologia, labTinto: { ...DEFAULT_CONFIG.enologia.labTinto, alcohol: { min: 13, max: 16 } } };
    expect(fueraDeRango({ alcohol: 15.5 }, rangosAnalisis('tinto', enologia))).toEqual([]);
    expect(fueraDeRango({ alcohol: 15.5 }, rangosAnalisis('tinto', DEFAULT_CONFIG.enologia))).toHaveLength(1);
  });
  it('parámetro rangos_lab', () => {
    expect(esquemaValor('rangos_lab').safeParse(DEFAULT_CONFIG.enologia.labBlanco).success).toBe(true);
    const malo = { ...DEFAULT_CONFIG.enologia.labBlanco, ph: { min: 3.5, max: 3.2 } };
    expect(esquemaValor('rangos_lab').safeParse(malo).success).toBe(false);
  });
});

describe('laboratorio — esquema', () => {
  const base = { fecha: '2026-04-02', loteId: 'l1', laboratorio: 'Laboratorio Demo' };
  it('campos vacíos quedan null y SO₂ total ≥ libre', () => {
    const a = analisisInput.parse({ ...base, ph: '', so2Libre: '30', so2Total: '98' });
    expect(a.ph).toBeNull();
    expect(a.so2Libre).toBe(30);
    expect(analisisInput.safeParse({ ...base, so2Libre: 40, so2Total: 30 }).success).toBe(false);
  });
  it('exige lote y laboratorio', () => {
    expect(analisisInput.safeParse({ fecha: '2026-04-02', loteId: '', laboratorio: '' }).success).toBe(false);
  });
});
