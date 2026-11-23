import { describe, expect, it } from 'vitest';
import { balanceLote, estadoEstanque, litrosEstanque, lotesEnEstanque, movBodegaInput, ocupacion, validarEntrada, validarSalida } from '../src/entities/bodega';
import { loadLegacy } from './legacy';

const estanque = [
  { id: 'e1', codigo: 'E-01', capacidad: 16000, estado: 'operativo' },
  { id: 'e2', codigo: 'E-02', capacidad: 8000, estado: 'operativo' },
  { id: 'e3', codigo: 'E-03', capacidad: 5000, estado: 'mantencion' }
];
const lote = [
  { id: 'l1', tipo: 'blanco' },
  { id: 'l2', tipo: 'tinto' }
];
const movBodega = [
  { estanqueId: 'e1', loteId: 'l1', litros: 9000, tipo: 'entrada' },
  { estanqueId: 'e1', loteId: 'l1', litros: -3000, tipo: 'trasiego_salida', grupo: 'g' },
  { estanqueId: 'e2', loteId: 'l1', litros: 2900, tipo: 'trasiego_entrada', grupo: 'g' },
  { estanqueId: 'e1', loteId: 'l1', litros: -100, tipo: 'merma', grupo: 'g' },
  { estanqueId: 'e2', loteId: 'l2', litros: 4000, tipo: 'entrada' },
  { estanqueId: 'e2', loteId: 'l2', litros: -0.3, tipo: 'ajuste' },
  { estanqueId: 'e1', loteId: 'l1', litros: -250, tipo: 'vinagre' }
];

describe('bodega — paridad con v1', () => {
  const v1 = loadLegacy(['js/calc/inventory.js'], undefined, { estanque, movBodega, lote }).calc.inventory;
  it.each(['e1', 'e2', 'e3'])('litros y lotes del estanque %s', (id) => {
    expect(litrosEstanque(id, movBodega)).toBeCloseTo(v1.litrosEstanque(id), 6);
    expect(
      lotesEnEstanque(id, movBodega)
        .map((x) => x.loteId)
        .sort()
    ).toEqual(
      v1
        .lotesEnEstanque(id)
        .map((x: { loteId: string }) => x.loteId)
        .sort()
    );
    expect(
      estadoEstanque(
        estanque.find((e) => e.id === id)!,
        movBodega
      )
    ).toBe(v1.estadoEstanque(estanque.find((e) => e.id === id)));
  });
  it('balance del lote (salidas y stock)', () => {
    const b = balanceLote('l1', movBodega);
    const o = v1.balanceLote('l1');
    expect([b.entradas, b.merma, b.vinagre, b.envasado, b.stock]).toEqual([o.entradas, o.merma, o.vinagre, o.envasado, o.stock]);
  });
  it('validaciones con los mensajes de v1', () => {
    for (const [e, l] of [
      [estanque[1]!, 3000],
      [estanque[2]!, 10],
      [estanque[0]!, 1000]
    ] as const) {
      let v1msg: string | null = null;
      try {
        v1.validarEntrada(e.id, l);
      } catch (x) {
        v1msg = (x as Error).message;
      }
      expect(validarEntrada(e, l, movBodega)).toBe(v1msg);
    }
    let v1msg: string | null = null;
    try {
      v1.validarSalida('e1', 6000, 'l1');
    } catch (x) {
      v1msg = (x as Error).message;
    }
    expect(validarSalida(estanque[0]!, 6000, 'l1', movBodega)).toBe(v1msg);
  });
});

describe('bodega — v2', () => {
  it('ocupación reparte estanques mezclados por tipo de lote', () => {
    const o = ocupacion(estanque, movBodega, (id) => lote.find((l) => l.id === id)?.tipo ?? null);
    expect(o.porTipo).toEqual({ blanco: 5650 + 2900, tinto: 3999.7 });
    expect([o.ocupados, o.vacios, o.total]).toEqual([2, 1, 3]);
  });
  it('signos y movimientos de otros módulos', () => {
    const base = { fecha: '2027-03-20', estanqueId: 'e', loteId: 'l' };
    expect(movBodegaInput.safeParse({ ...base, tipo: 'merma', litros: 10 }).success).toBe(false);
    expect(movBodegaInput.safeParse({ ...base, tipo: 'entrada', litros: -10 }).success).toBe(false);
    expect(movBodegaInput.safeParse({ ...base, tipo: 'envasado', litros: -10 }).success).toBe(false);
    expect(movBodegaInput.safeParse({ ...base, tipo: 'ajuste', litros: -3 }).success).toBe(true);
  });
});
