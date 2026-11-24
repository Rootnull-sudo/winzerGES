import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { docsLibro } from '../src/entities/dte';
import { calendarioTributario, encadenarF29, estadoObligacion, periodosEntre, resumenPpm } from '../src/entities/tributario';
import { loadLegacy } from './legacy';

const t = DEFAULT_CONFIG.tributario;
// Septiembre con más crédito que débito (deja remanente), octubre lo consume, noviembre normal.
const dte = [
  { id: 'a', direccion: 'emitido', tipo: 33, fecha: '2026-09-05', estado: 'aceptado', neto: 100_000, exento: 0, iva: 19_000, ila: 20_500, total: 139_500 },
  { id: 'b', direccion: 'recibido', tipo: 33, fecha: '2026-09-10', estado: 'aceptado', neto: 500_000, exento: 0, iva: 95_000, ila: 0, total: 595_000 },
  { id: 'c', direccion: 'emitido', tipo: 33, fecha: '2026-10-05', estado: 'aceptado', neto: 300_000, exento: 0, iva: 57_000, ila: 61_500, total: 418_500 },
  { id: 'd', direccion: 'emitido', tipo: 33, fecha: '2026-11-05', estado: 'aceptado', neto: 800_000, exento: 0, iva: 152_000, ila: 164_000, total: 1_116_000 },
  { id: 'e', direccion: 'recibido', tipo: 33, fecha: '2026-11-07', estado: 'aceptado', neto: 100_000, exento: 0, iva: 19_000, ila: 0, total: 119_000 }
];
const honorario = [{ fecha: '2026-10-15', retencion: 10_000 }];
const remuneracion = [{ periodo: '2026-11', impuestoUnico: 5_000 }];
const entradas = periodosEntre('2026-09', '2026-11').map((p) => ({
  periodo: p,
  emitidos: docsLibro(dte, 'emitido', p),
  recibidos: docsLibro(dte, 'recibido', p),
  retencionHonorarios: honorario.filter((h) => h.fecha.startsWith(p)).reduce((s, h) => s + h.retencion, 0),
  impuestoUnico: remuneracion.filter((r) => r.periodo === p).reduce((s, r) => s + r.impuestoUnico, 0)
}));

describe('F29 encadenados: paridad v1 (tax.remanente / tax.f29)', () => {
  const legacy = (f29: unknown[]) => {
    const VG = loadLegacy(['js/calc/tax.js'], DEFAULT_CONFIG, { dte, honorario, remuneracion, f29, obligacion: [], pagoImpuesto: [] });
    VG.utils.memo = (_k: string, fn: () => unknown) => fn();
    return VG.calc.tax;
  };

  it('sin F29 cerrados: el remanente de septiembre pasa a octubre', () => {
    const v1 = legacy([]);
    const r = encadenarF29(entradas, {}, t.remanenteInicial, t);
    expect(r.map((x) => x.periodo)).toEqual(['2026-09', '2026-10', '2026-11']);
    for (const x of r) expect(x).toEqual(v1.f29(x.periodo));
    expect(r[0]!.remanenteSiguiente).toBe(76_000);
    expect(r[1]!.remanenteAnterior).toBe(76_000);
  });

  it('un F29 declarado aporta el remanente de su foto', () => {
    const v1 = legacy([{ periodo: '2026-10', estado: 'declarado', snapshot: { remanenteSiguiente: 12_345 } }]);
    const r = encadenarF29(entradas, { '2026-10': 12_345 }, t.remanenteInicial, t);
    expect(r[2]).toEqual(v1.f29('2026-11'));
    expect(r[2]!.remanenteAnterior).toBe(12_345);
  });

  it('PPM del año como v1', () => {
    const pagos = [{ tipo: 'PPM', periodo: '2026-09', monto: 250 }];
    const VG = loadLegacy(['js/calc/tax.js'], DEFAULT_CONFIG, { dte, honorario, remuneracion, f29: [], obligacion: [], pagoImpuesto: pagos });
    VG.utils.memo = (_k: string, fn: () => unknown) => fn();
    const esperado = VG.calc.tax.ppmAnual(2026);
    const porMes = encadenarF29(
      periodosEntre('2026-01', '2026-12').map(
        (p) => entradas.find((e) => e.periodo === p) ?? { periodo: p, emitidos: [], recibidos: [], retencionHonorarios: 0, impuestoUnico: 0 }
      ),
      {},
      0,
      t
    ).map((x) => ({ periodo: x.periodo, ppm: x.ppm }));
    expect(porMes.map((m) => m.ppm)).toEqual(esperado.porMes);
    const r = resumenPpm(porMes, 250);
    expect([r.total, r.pagados]).toEqual([esperado.total, esperado.pagados]);
  });
});

describe('calendario tributario: paridad v1', () => {
  it('mismas obligaciones, tipos y fechas', () => {
    const v1 = loadLegacy(['js/calc/tax.js'], DEFAULT_CONFIG, { obligacion: [] }).calc.tax.calendario(2027);
    const a = calendarioTributario(2027, t).map((i) => [i.clave, i.tipo, i.fecha, i.modulo]);
    const b = v1.map((i: { key: string; tipo: string; fecha: string; modulo: string }) => [i.key, i.tipo, i.fecha, i.modulo]);
    expect(a).toEqual(b);
  });
  it('estado: registro, o vencida/pendiente por fecha', () => {
    expect(estadoObligacion('2027-01-20', null, '2027-01-25')).toEqual({ estado: 'vencida', dias: -5 });
    expect(estadoObligacion('2027-01-20', null, '2027-01-15')).toEqual({ estado: 'pendiente', dias: 5 });
    expect(estadoObligacion('2027-01-20', { estado: 'cumplida' }, '2027-01-25').estado).toBe('cumplida');
  });
});
