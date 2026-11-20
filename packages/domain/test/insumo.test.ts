import { describe, expect, it } from 'vitest';
import { ajusteStockInput, diasParaVencer, insumoInput, stockInsumo, valorInventario } from '../src/entities/insumo';
import { loadLegacy } from './legacy';

const insumos = [
  { id: 'i1', nombre: 'Azufre', categoria: 'agricola', unidad: 'kg', precio: 1800, stockInicial: 100 },
  { id: 'i2', nombre: 'Metabisulfito', categoria: 'enologico', unidad: 'kg', precio: 6500, stockInicial: '12.5' },
  { id: 'i3', nombre: 'Botella', categoria: 'envasado', unidad: 'un', precio: 420 }
];
const movInsumo = [
  { insumoId: 'i1', cantidad: -30, tipo: 'aplicacion' },
  { insumoId: 'i1', cantidad: 50, tipo: 'compra' },
  { insumoId: 'i2', cantidad: -20, tipo: 'so2' },
  { insumoId: 'i3', cantidad: 1200, tipo: 'compra' },
  { insumoId: 'i3', cantidad: -1300, tipo: 'consumo_envasado' }
];

describe('insumos — paridad con v1', () => {
  const v1 = loadLegacy(['js/calc/inventory.js'], undefined, { insumo: insumos, movInsumo }).calc.inventory;
  it.each(['i1', 'i2', 'i3'])('stock de %s', (id) => {
    expect(
      stockInsumo(
        insumos.find((i) => i.id === id)!,
        movInsumo
      )
    ).toBe(v1.stockInsumo(id));
  });
  it('valor del inventario (los negativos no restan)', () => {
    expect(valorInventario(insumos, movInsumo)).toBe(v1.valorInventarioInsumos());
  });
});

describe('insumos — esquemas', () => {
  it('limpia los campos que no aplican a la categoría', () => {
    const e = insumoInput.parse({ nombre: 'Levadura', categoria: 'enologico', tipo: 'Levadura', unidad: 'kg', precio: 100, npk: '12-12-17', carencia: 5 });
    expect(e.npk).toBeNull();
    expect(e.carencia).toBeNull();
    const s = insumoInput.parse({ nombre: 'MBK', categoria: 'enologico', tipo: 'Sulfitante', unidad: 'kg', precio: 100, quimico: 'K2S2O5', so2Pct: '57' });
    expect(s).toMatchObject({ quimico: 'K2S2O5', so2Pct: 57 });
    expect(insumoInput.parse({ nombre: 'X', categoria: 'agricola', unidad: 'kg', precio: '1500', stockMinimo: '' }).stockMinimo).toBeNull();
  });
  it('rechaza precio con decimales y ajustes sin sentido', () => {
    expect(insumoInput.safeParse({ nombre: 'X', categoria: 'agricola', unidad: 'kg', precio: 10.5 }).success).toBe(false);
    expect(ajusteStockInput.safeParse({ insumoId: 'i', fecha: '2026-01-01', modo: 'conteo', cantidad: -1, motivo: 'x' }).success).toBe(false);
    expect(ajusteStockInput.safeParse({ insumoId: 'i', fecha: '2026-01-01', modo: 'diferencia', cantidad: 0, motivo: 'x' }).success).toBe(false);
    expect(ajusteStockInput.safeParse({ insumoId: 'i', fecha: '2026-01-01', modo: 'diferencia', cantidad: -3, motivo: '' }).success).toBe(false);
  });
  it('días para vencer', () => {
    expect(diasParaVencer('2026-12-20', '2026-11-20')).toBe(30);
    expect(diasParaVencer('2026-11-19', '2026-11-20')).toBe(-1);
    expect(diasParaVencer(null, '2026-11-20')).toBeNull();
  });
});
