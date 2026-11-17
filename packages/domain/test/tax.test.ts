import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import * as tax from '../src/tax';
import { loadLegacy } from './legacy';

const t = DEFAULT_CONFIG.tributario;
const r = DEFAULT_CONFIG.remuneraciones;

describe('tax — paridad con v1', () => {
  const v1 = loadLegacy(['js/calc/tax.js']).calc.tax;

  it.each([0, 1, 9990, 1_234_567, '45.000'])('totales de factura con ILA (neto %s)', (neto) => {
    expect(tax.totales(neto, t)).toEqual(v1.totales(neto));
  });
  it('boleta con IVA incluido y documento sin ILA', () => {
    expect(tax.totales(12990, t, { ivaIncluido: true })).toEqual(v1.totales(12990, { ivaIncluido: true }));
    expect(tax.totales(100000, t, { ila: false, exento: 5000 })).toEqual(v1.totales(100000, { ila: false, exento: 5000 }));
  });
  it.each([500_000, 1_200_000, 2_500_000, 6_000_000, 30_000_000])('impuesto único (base %s)', (base) => {
    expect(tax.impuestoUnico(base, r.utm)).toBe(v1.impuestoUnico(base, r.utm));
  });
  it.each([
    [{ sueldoBase: 650000, gratificacion: 'art50', colacion: 50000, movilizacion: 40000, contrato: 'indefinido' }],
    [{ sueldoBase: 2_800_000, gratificacionMonto: 100000, contrato: 'plazo_fijo', planSalud: 250000 }]
  ])('liquidación de sueldo %#', (trab) => {
    expect(tax.liquidacion(trab, r)).toEqual(v1.liquidacion(trab));
  });
  it('periodo anterior', () => {
    expect(tax.periodoAnterior('2026-01')).toBe('2025-12');
    expect(tax.periodoAnterior('2026-11')).toBe('2026-10');
  });
});

describe('F29 — paridad con v1', () => {
  const dte = [
    { direccion: 'emitido', tipo: 33, fecha: '2026-10-05', estado: 'aceptado', neto: 1_000_000, iva: 190_000, ila: 205_000, total: 1_395_000 },
    { direccion: 'emitido', tipo: 39, fecha: '2026-10-09', estado: 'aceptado', neto: 50_000, iva: 9_500, ila: 10_250, total: 69_750 },
    { direccion: 'emitido', tipo: 61, fecha: '2026-10-20', estado: 'aceptado', neto: 100_000, iva: 19_000, ila: 20_500, total: 139_500 },
    { direccion: 'emitido', tipo: 52, fecha: '2026-10-21', estado: 'aceptado', neto: 0, iva: 0, total: 0 },
    { direccion: 'recibido', tipo: 33, fecha: '2026-10-11', estado: 'aceptado', neto: 400_000, iva: 76_000, total: 476_000 }
  ];
  const honorario = [{ fecha: '2026-10-15', retencion: 76_250 }];
  const remuneracion = [{ periodo: '2026-10', impuestoUnico: 12_345 }];
  const v1 = loadLegacy(['js/calc/tax.js'], DEFAULT_CONFIG, { dte, honorario, remuneracion, f29: [], obligacion: [] });
  v1.utils.memo = (_k: string, fn: () => unknown) => fn();

  it('mismo resultado que v1 para octubre 2026', () => {
    const esperado = v1.calc.tax.f29('2026-10');
    const valido = (d: (typeof dte)[number], dir: string) => d.direccion === dir && d.fecha.startsWith('2026-10') && d.tipo !== 52;
    const obtenido = tax.f29(
      {
        periodo: '2026-10',
        emitidos: dte.filter((d) => valido(d, 'emitido')),
        recibidos: dte.filter((d) => valido(d, 'recibido')),
        remanenteAnterior: esperado.remanenteAnterior,
        retencionHonorarios: 76_250,
        impuestoUnico: 12_345
      },
      t
    );
    expect(obtenido).toEqual(esperado);
  });
});
