import { describe, expect, it } from 'vitest';
import { cajasNecesarias, costoEnvasado, costoLitroLote, validarDO } from '../src/costos';
import { loadLegacy } from './legacy';

// Mismos datos para v1 (temporada = año) y v2 (temporadaId).
const lote = { id: 'l1', temporada: 2026, temporadaId: 't26', costoUvaComprada: 150_000, litrosEstimados: 9000 };
const cosecha = [
  { id: 'c1', loteId: 'l1', cuartelId: 'q1', temporada: 2026, temporadaId: 't26', kg: 4000, costoBins: 40_000, costoTransporte: 30_000 },
  { id: 'c2', loteId: 'l1', cuartelId: 'q2', temporada: 2026, temporadaId: 't26', kg: 2000, costoAlimentacion: 12_000 },
  { id: 'c3', loteId: 'otro', cuartelId: 'q1', temporada: 2026, temporadaId: 't26', kg: 1000 }
];
const jornal = [{ cosechaId: 'c1', tarifa: 60, tarifaTipo: 'kg', kg: 4000 }];
const aplicacion = [
  { cuartelId: 'q1', temporada: 2026, temporadaId: 't26', costo: 250_000 },
  { cuartelId: 'q1', temporada: 2025, temporadaId: 't25', costo: 999_999 }
];
const labor = [{ cuartelId: 'q2', temporada: 2026, temporadaId: 't26', costo: 90_000 }];
const aditivo = [{ loteId: 'l1', costo: 42_000 }];
const fermentacion = [{ id: 'f1', loteId: 'l1' }];
const adicionSO2 = [{ fermentacionId: 'f1', costo: 7_000 }];
const movBodega = [
  { estanqueId: 'e1', loteId: 'l1', litros: 4200, tipo: 'entrada' },
  { estanqueId: 'e1', loteId: 'l1', litros: -100, tipo: 'merma' }
];
const datos = {
  cosechas: cosecha,
  jornales: jornal,
  aplicaciones: aplicacion,
  labores: labor,
  aditivos: aditivo,
  fichas: fermentacion,
  adicionesSO2: adicionSO2,
  movsBodega: movBodega
};

describe('costos — paridad con v1', () => {
  const insumo = [
    { id: 'env', precio: 420 },
    { id: 'cor', precio: 170 },
    { id: 'cap', precio: 65 },
    { id: 'caj', precio: 980 },
    { id: 'etqi', precio: 92 }
  ];
  const formato = [{ id: 'f075', litros: 0.75, unidadesCaja: 12 }];
  const etiqueta = [{ id: 'et1', costoDiseno: 850_000, costoIlustracion: 250_000, tirajeEstimado: 20_000, costoImpresion: 92 }];
  const ordenEnvasado = [{ id: 'o0', etiquetaId: 'et1', estado: 'confirmada', unidades: 24_000 }];
  const v1 = loadLegacy(['js/calc/inventory.js', 'js/calc/financial.js'], undefined, {
    lote: [lote],
    cosecha,
    jornal,
    aplicacion,
    labor,
    aditivo,
    fermentacion,
    adicionSO2,
    movBodega,
    insumo,
    formato,
    etiqueta,
    ordenEnvasado
  }).calc.financial;

  it('costo por litro del lote', () => {
    const a = costoLitroLote(lote, datos);
    const b = v1.costoLitroLote('l1');
    expect(a.total).toBeCloseTo(b.total, 6);
    expect(a.litros).toBe(b.litros);
    expect(a.costoLitro).toBeCloseTo(b.costoLitro, 6);
    expect(a.partes).toEqual(b.partes);
  });

  it.each<[Record<string, string>, string]>([
    [{ etiquetaId: 'et1' }, 'con diseño de etiqueta'],
    [{ etiquetaInsumoId: 'etqi' }, 'con insumo de etiqueta']
  ])('costo unitario de envasado %#', (extra) => {
    const o = {
      id: 'o1',
      loteId: 'l1',
      formatoId: 'f075',
      unidades: 1200,
      mermaPct: 1.5,
      envaseId: 'env',
      cierreId: 'cor',
      capsulaId: 'cap',
      cajaId: 'caj',
      manoObra: 96_000,
      energiaAgua: 21_600,
      ...extra
    };
    const precio = (id: string | null | undefined) => insumo.find((i) => i.id === id)?.precio ?? 0;
    const a = costoEnvasado(o, {
      formato: formato[0]!,
      costoLitro: costoLitroLote(lote, datos).costoLitro,
      precioInsumo: precio,
      etiqueta: 'etiquetaId' in extra ? etiqueta[0] : null,
      producidasEtiqueta: 24_000
    });
    const b = v1.costoEnvasado(o);
    expect(a.unitario).toBeCloseTo(b.unitario, 6);
    expect(a.litrosConsumidos).toBeCloseTo(b.litrosConsumidos, 6);
    for (const k of Object.keys(b.partes)) expect(a.partes[k as keyof typeof a.partes], k).toBeCloseTo(b.partes[k], 6);
  });
});

describe('costos — reglas', () => {
  it('cajas enteras y D.O.', () => {
    expect(cajasNecesarias(1201, 12)).toBe(101);
    expect(validarDO({ declaraDO: true, pctUvaZona: 70, certificadoDO: 'X' })).toMatch(/75 %/);
    expect(validarDO({ declaraDO: true, pctUvaZona: 100, certificadoDO: '' })).toMatch(/certificado/);
    expect(validarDO({ declaraDO: false })).toBeNull();
  });
});
