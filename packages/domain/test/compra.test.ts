import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { compraInput, estadoPagoDoc, signoStock, totalesCompra, variacionPrecio } from '../src/entities/compra';
import { vencimientoSugerido } from '../src/entities/proveedor';
import { loadLegacy } from './legacy';

const tasa = DEFAULT_CONFIG.tributario.tasaIVA;

describe('compras — paridad con v1 (factura de una línea)', () => {
  const v1 = loadLegacy(['js/calc/tax.js']).calc.tax;
  it.each([
    [10, 1850],
    [3.5, 4199],
    [1200, 92]
  ])('cantidad %s × precio %s', (cantidad, precio) => {
    // v1 (proveedores/index.js:35): neto = round(cantidad × precio), iva = tax.iva(neto), total = neto + iva + exento.
    const neto = Math.round(cantidad * precio);
    const t = totalesCompra([{ cantidad, precioUnitario: precio }], 'factura', tasa);
    expect(t).toEqual({ neto, exento: 0, iva: v1.iva(neto), total: neto + v1.iva(neto) });
  });
});

describe('compras — documentos', () => {
  const lineas = [
    { cantidad: 10, precioUnitario: 1000 },
    { cantidad: 1, precioUnitario: 5000, exenta: true }
  ];
  it('factura: IVA solo sobre lo afecto', () => {
    expect(totalesCompra(lineas, 'factura', tasa)).toEqual({ neto: 10000, exento: 5000, iva: 1900, total: 16900 });
  });
  it('factura exenta: todo exento; boleta y guía sin IVA; NC con IVA y positiva', () => {
    expect(totalesCompra(lineas, 'factura_exenta', tasa)).toEqual({ neto: 0, exento: 15000, iva: 0, total: 15000 });
    expect(totalesCompra(lineas, 'boleta', tasa).iva).toBe(0);
    expect(totalesCompra(lineas, 'guia', tasa).iva).toBe(0);
    expect(totalesCompra(lineas, 'nota_credito', tasa)).toEqual({ neto: 10000, exento: 5000, iva: 1900, total: 16900 });
  });
  it('signo del stock', () => {
    expect([signoStock('factura'), signoStock('guia'), signoStock('nota_credito'), signoStock('factura', true)]).toEqual([1, 1, -1, 0]);
  });
  it('esquema: NC exige referencia; la factura exenta marca todas las líneas; la guía no vence', () => {
    const base = { fecha: '2026-11-01', proveedorId: 'p', folio: '10', lineas: [{ descripcion: 'x', cantidad: 1, precioUnitario: 1 }] };
    expect(compraInput.safeParse({ ...base, documento: 'nota_credito' }).success).toBe(false);
    expect(compraInput.parse({ ...base, documento: 'factura_exenta' }).lineas[0]!.exenta).toBe(true);
    expect(compraInput.parse({ ...base, documento: 'guia', vencimiento: '2026-12-01' }).vencimiento).toBeNull();
    expect(compraInput.safeParse({ ...base, documento: 'factura', lineas: [] }).success).toBe(false);
    expect(compraInput.safeParse({ ...base, documento: 'factura', vencimiento: '2026-10-01' }).success).toBe(false);
  });
  it('vencimiento sugerido: plazo 0 es contado (v1 lo volvía 30)', () => {
    expect(vencimientoSugerido('2026-11-01', 0)).toBe('2026-11-01');
    expect(vencimientoSugerido('2026-11-01', 45)).toBe('2026-12-16');
  });
  it('variación de precio', () => {
    expect(variacionPrecio(1100, 1000)).toBeCloseTo(0.1, 10);
    expect(variacionPrecio(1100, 0)).toBeNull();
  });
});

describe('compras — estado de pago derivado', () => {
  const hoy = '2026-11-20';
  it.each([
    [{ documento: 'factura', total: 100, saldo: 100, vencimiento: '2026-12-01' }, 'pendiente'],
    [{ documento: 'factura', total: 100, saldo: 40, vencimiento: '2026-12-01' }, 'parcial'],
    [{ documento: 'factura', total: 100, saldo: 40, vencimiento: '2026-11-01' }, 'vencida'],
    [{ documento: 'factura', total: 100, saldo: 0, vencimiento: '2026-11-01' }, 'pagada'],
    [{ documento: 'factura', total: 100, saldo: 100, vencimiento: null }, 'pendiente'],
    [{ documento: 'guia', total: 100, saldo: null }, 'sin_deuda'],
    [{ documento: 'factura', estado: 'anulada', total: 100, saldo: 100 }, 'anulada']
  ])('%o → %s', (d, e) => expect(estadoPagoDoc(d, hoy)).toBe(e));
});
