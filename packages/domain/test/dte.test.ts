import { describe, expect, it } from 'vitest';
import { aLatin1, docsLibro, folioEnCaf, montosNota, puedeTransitar, usoFolios, validarXmlDte, xmlDte, xmlTexto } from '../src/entities/dte';
import { DEFAULT_CONFIG } from '../src/config';
import { loadLegacy } from './legacy';

const dtes = [
  { id: 'a', direccion: 'emitido', tipo: 33, folio: 10, fecha: '2026-10-03', estado: 'generado', neto: 100_000, iva: 19_000, ila: 20_500, total: 139_500 },
  { id: 'b', direccion: 'emitido', tipo: 39, folio: 4, fecha: '2026-10-05', estado: 'aceptado', neto: 50_000, iva: 9_500, ila: 0, total: 59_500 },
  { id: 'c', direccion: 'emitido', tipo: 52, folio: 1, fecha: '2026-10-05', estado: 'generado', neto: 10_000, iva: 1_900, total: 11_900 },
  { id: 'd', direccion: 'emitido', tipo: 33, folio: 11, fecha: '2026-10-07', estado: 'rechazado', neto: 1, iva: 1, total: 2 },
  { id: 'e', direccion: 'emitido', tipo: 33, folio: 12, fecha: '2026-10-08', estado: 'borrador', neto: 1, iva: 1, total: 2 },
  { id: 'f', direccion: 'emitido', tipo: 61, folio: 3, fecha: '2026-10-09', estado: 'generado', neto: 20_000, iva: 3_800, total: 23_800 },
  { id: 'g', direccion: 'emitido', tipo: 33, folio: 13, fecha: '2026-11-01', estado: 'generado', neto: 5, iva: 1, total: 6 },
  { id: 'h', direccion: 'recibido', tipo: 33, folio: 900, fecha: '2026-10-10', estado: 'aceptado', neto: 40_000, iva: 7_600, total: 47_600 },
  { id: 'i', direccion: 'recibido', tipo: 33, folio: 901, fecha: '2026-10-11', estado: 'rechazado', neto: 9, iva: 9, total: 18 },
  { id: 'j', direccion: 'recibido', tipo: 61, folio: 77, fecha: '2026-10-12', estado: 'aceptado', neto: 5_000, iva: 950, total: 5_950 }
];

describe('libros: paridad v1 (tax.dteEmitidos / dteRecibidos)', () => {
  const v1 = loadLegacy(['js/calc/tax.js'], DEFAULT_CONFIG as never, { dte: dtes }).calc.tax;
  it.each(['emitido', 'recibido'] as const)('%s', (dir) => {
    const a = docsLibro(dtes, dir, '2026-10').map((d) => d.id);
    const b = (dir === 'emitido' ? v1.dteEmitidos('2026-10') : v1.dteRecibidos('2026-10')).map((d: { id: string }) => d.id);
    expect(a.sort()).toEqual(b.sort());
  });
});

describe('XML: paridad v1 y correcciones', () => {
  const empresa = {
    rut: '76.543.210-3',
    razonSocial: 'Viña Demo SpA',
    giro: 'Producción de vino',
    acteco: '110200',
    direccion: 'Camino 123',
    comuna: 'Santa Cruz'
  };
  const cfg = { ...(DEFAULT_CONFIG as unknown as Record<string, unknown>), empresa, tributario: { tasaIVA: 0.19, tasaILA: 0.205 } };
  const d = {
    direccion: 'emitido',
    tipo: 33,
    folio: 10,
    fecha: '2026-10-03',
    formaPago: 2,
    vencimiento: '2026-11-02',
    contraparteRut: '12.345.678-5',
    contraparte: 'Distribuidora Sur Ltda.',
    giro: 'Comercio',
    direccionContraparte: 'Av. Uno 1',
    comuna: 'Talca',
    neto: 100_000,
    exento: 0,
    iva: 19_000,
    ila: 20_500,
    total: 139_500,
    referencia: null
  };
  const lineas = [{ nombre: 'Vino Botella 0,75 L', cantidad: 12, unidad: 'UN', precio: 8333.3333, monto: 100_000 }];
  const sinFirma = (x: string) =>
    x
      .split('\n')
      .filter((l) => !l.includes('TmstFirma') && !l.startsWith('<!--'))
      .join('\n');

  it('mismo documento que v1 para datos sin caracteres especiales', () => {
    const VG = loadLegacy(['js/calc/tax.js', 'js/integrations/dte.js'], cfg as never);
    VG.VERSION = 'x';
    const b = VG.integrations.dte.xml({ ...d, detalle: lineas }, cfg);
    const a = xmlDte(d, lineas, empresa, { tasaIVA: 0.19, tasaILA: 0.205 });
    expect(sinFirma(a)).toBe(sinFirma(b));
    expect(validarXmlDte(a)).toEqual([]);
  });

  it('trunca antes de escapar: nunca deja una entidad cortada', () => {
    const t = xmlTexto('A'.repeat(79) + '&B', 80);
    expect(t).toBe('A'.repeat(79) + '&amp;');
    expect(xmlTexto('Ñuñoa & "Cía"', 100)).toBe('Ñuñoa &amp; &quot;Cía&quot;');
  });

  it('ISO-8859-1 de verdad: ñ es un byte, fuera de Latin-1 pasa a ?', () => {
    expect([...aLatin1('ñ€')]).toEqual([0xf1, 0x3f]);
  });
});

describe('folios, transiciones y notas', () => {
  const cafs = [
    { desde: 1, hasta: 50 },
    { desde: 101, hasta: 150 }
  ];
  it('el folio cae en un rango o salta al siguiente; sin rangos, null; sin CAF, el candidato', () => {
    expect(folioEnCaf(cafs, 1)).toBe(1);
    expect(folioEnCaf(cafs, 50)).toBe(50);
    expect(folioEnCaf(cafs, 51)).toBe(101);
    expect(folioEnCaf(cafs, 151)).toBeNull();
    expect(folioEnCaf([], 7)).toBe(7);
  });
  it('uso de folios', () => {
    expect(usoFolios(cafs, [1, 2, 101, 400])).toEqual({ total: 100, usados: 3, disponibles: 97, pct: 0.03 });
  });
  it('transiciones', () => {
    expect(puedeTransitar('emitido', 'generado', 'enviado')).toBe(true);
    expect(puedeTransitar('emitido', 'aceptado', 'anulado')).toBe(false);
    expect(puedeTransitar('emitido', 'borrador', 'aceptado')).toBe(false);
    expect(puedeTransitar('recibido', 'aceptado', 'rechazado')).toBe(true);
  });
  it('NC total copia los montos; parcial prorratea IVA e ILA del original', () => {
    const o = { neto: 100_000, exento: 0, iva: 19_000, ila: 20_500, total: 139_500 };
    expect(montosNota(o, null)).toEqual(o);
    expect(montosNota(o, 50_000)).toEqual({ neto: 50_000, exento: 0, iva: 9_500, ila: 10_250, total: 69_750 });
    expect(montosNota({ neto: 0, exento: 80_000, iva: 0, ila: 0, total: 80_000 }, 10_000)).toEqual({ neto: 0, exento: 10_000, iva: 0, ila: 0, total: 10_000 });
  });
});
