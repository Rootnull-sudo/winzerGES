import { describe, expect, it } from 'vitest';
import { aplicarEnOrden, diasAlVencimiento, pagoInput, resumenPorPagar } from '../src/entities/pago';
import { loadLegacy } from './legacy';

describe('pagos', () => {
  const docs = [
    { id: 'b', saldo: 300, vencimiento: '2026-12-10', fecha: '2026-11-10' },
    { id: 'a', saldo: 500, vencimiento: '2026-11-04', fecha: '2026-10-05' },
    { id: 'c', saldo: 200, vencimiento: null, fecha: '2026-11-15' }
  ];
  it('aplica primero lo que vence antes', () => {
    expect(aplicarEnOrden(docs, 650)).toEqual([
      { id: 'a', monto: 500 },
      { id: 'c', monto: 150 }
    ]);
    expect(aplicarEnOrden(docs, 5000).reduce((s, x) => s + x.monto, 0)).toBe(1000);
  });
  it('la suma aplicada debe ser el monto; cada aplicación a un solo documento', () => {
    const base = { fecha: '2026-11-20', proveedorId: 'p', monto: 800 };
    expect(pagoInput.safeParse({ ...base, aplicaciones: [{ compraId: 'a', monto: 800 }] }).success).toBe(true);
    expect(pagoInput.safeParse({ ...base, aplicaciones: [{ compraId: 'a', monto: 700 }] }).success).toBe(false);
    expect(pagoInput.safeParse({ ...base, aplicaciones: [{ compraId: 'a', gastoId: 'g', monto: 800 }] }).success).toBe(false);
    expect(pagoInput.safeParse({ ...base, aplicaciones: [] }).success).toBe(false);
  });
  it('días al vencimiento y resumen como v1 (vencido, próximos 7 días)', () => {
    const U = loadLegacy([]).utils;
    expect(diasAlVencimiento('2026-11-04', '2026-11-20')).toBe(U.diffDays('2026-11-20', '2026-11-04'));
    expect(resumenPorPagar(docs, '2026-11-20')).toEqual({ total: 1000, vencido: 500, proximo: 0 });
    expect(resumenPorPagar(docs, '2026-12-04')).toEqual({ total: 1000, vencido: 500, proximo: 300 });
  });
});
