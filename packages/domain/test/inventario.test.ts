import { describe, expect, it } from 'vitest';
import { deltaAjusteProducto, stockPorFormato, valorProductoTerminado } from '../src/costos';
import { loadLegacy } from './legacy';

// v1 derivaba el stock de "unidades de la orden − ventas no anuladas"; v2 lo deriva del libro mov_producto.
const ordenEnvasado = [
  { id: 'o1', estado: 'confirmada', formatoId: 'f750', unidades: 1200, costoUnitario: 2150.5 },
  { id: 'o2', estado: 'confirmada', formatoId: 'f750', unidades: 600, costoUnitario: 1800 },
  { id: 'o3', estado: 'confirmada', formatoId: 'f375', unidades: 300, costoUnitario: 1200 },
  { id: 'o4', estado: 'borrador', formatoId: 'f375', unidades: 999, costoUnitario: 5000 }
];
const venta = [
  { ordenEnvasadoId: 'o1', cantidad: 100, estado: 'confirmada' },
  { ordenEnvasadoId: 'o1', cantidad: 50, estado: 'anulada' },
  { ordenEnvasadoId: 'o3', cantidad: 300, estado: 'confirmada' }
];
const movProducto = [
  { ordenEnvasadoId: 'o1', unidades: 1200 },
  { ordenEnvasadoId: 'o1', unidades: -100 },
  { ordenEnvasadoId: 'o1', unidades: -50 },
  { ordenEnvasadoId: 'o1', unidades: 50 }, // venta anulada: se revierte
  { ordenEnvasadoId: 'o2', unidades: 600 },
  { ordenEnvasadoId: 'o3', unidades: 300 },
  { ordenEnvasadoId: 'o3', unidades: -300 }
];
const filas = ordenEnvasado
  .filter((o) => o.estado === 'confirmada')
  .map((o) => ({
    formatoId: o.formatoId,
    costoUnitario: o.costoUnitario,
    stock: movProducto.filter((m) => m.ordenEnvasadoId === o.id).reduce((s, m) => s + m.unidades, 0)
  }));

describe('producto terminado: paridad v1', () => {
  const v1 = loadLegacy(['js/calc/inventory.js', 'js/calc/financial.js'], undefined, { ordenEnvasado, venta }).calc.inventory;

  it('stock y valor por formato', () => {
    const a = stockPorFormato(filas);
    const b = v1.stockPorFormato();
    for (const k of Object.keys(b)) {
      expect(a[k]!.unidades).toBe(b[k].unidades);
      expect(a[k]!.valor).toBeCloseTo(b[k].valor, 6);
    }
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
  });

  it('valor del producto terminado', () => {
    expect(valorProductoTerminado(filas)).toBeCloseTo(v1.valorProductoTerminado(), 6);
  });
});

describe('ajuste de producto terminado', () => {
  it('quiebre y muestra sacan unidades; el conteo registra la diferencia', () => {
    expect(deltaAjusteProducto('quiebre', 3, 100)).toBe(-3);
    expect(deltaAjusteProducto('muestra', 6, 100)).toBe(-6);
    expect(deltaAjusteProducto('ajuste', 97, 100)).toBe(-3);
    expect(deltaAjusteProducto('ajuste', 104, 100)).toBe(4);
  });
});
