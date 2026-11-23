import { describe, expect, it } from 'vitest';
import { desviosLote, diasVentana, enVentana, hitosReales, loteInput, planLote, VENTANAS_BASE, ventanaInput } from '../src/entities/lote';

// Valores esperados calculados a mano con la fórmula de v1 (calendario/index.js `plan`).
describe('plan de vendimia', () => {
  it('tinto con maceración y FML', () => {
    expect(planLote({ fechaVendimiaPlan: '2027-03-20', tipo: 'tinto', diasVendimia: 3, diasFA: 10, diasMaceracion: 15, diasFML: 30, diasGuarda: 180 })).toEqual(
      [
        { fase: 'Vendimia', desde: '2027-03-20', hasta: '2027-03-23' },
        { fase: 'FA', desde: '2027-03-22', hasta: '2027-04-01' },
        { fase: 'Maceración', desde: '2027-03-21', hasta: '2027-04-05' }, // descube = fin maceración (posterior al fin FA)
        { fase: 'FML', desde: '2027-04-07', hasta: '2027-05-07' },
        { fase: 'Guarda', desde: '2027-05-07', hasta: '2027-11-03' }
      ]
    );
  });
  it('blanco: FA de 18 días por defecto y guarda de 90 si no se indica', () => {
    expect(planLote({ fechaVendimiaPlan: '2027-02-25', tipo: 'blanco' })).toEqual([
      { fase: 'Vendimia', desde: '2027-02-25', hasta: '2027-02-27' },
      { fase: 'FA', desde: '2027-02-27', hasta: '2027-03-17' },
      { fase: 'Guarda', desde: '2027-03-17', hasta: '2027-06-15' }
    ]);
  });
  it('0 días de guarda se respetan (v1 los convertía en 90)', () => {
    expect(planLote({ fechaVendimiaPlan: '2027-02-25', tipo: 'blanco', diasGuarda: 0 }).at(-1)).toEqual({
      fase: 'Guarda',
      desde: '2027-03-17',
      hasta: '2027-03-17'
    });
  });
  it('desviaciones sobre el umbral', () => {
    const plan = planLote({ fechaVendimiaPlan: '2027-03-20', tipo: 'tinto', diasFA: 10, diasFML: 30, diasMaceracion: 0 });
    expect(desviosLote(plan, { faIni: '2027-03-27', faFin: '2027-04-02' }, 3)).toEqual(['Inicio FA +5 d']);
    expect(desviosLote(plan, hitosReales({}, { inicioFA: '2027-03-17', finFA: '2027-04-01' }), 3)).toEqual(['Inicio FA −5 d']);
  });
});

describe('lotes y ventanas', () => {
  it('limpia maceración y FML en blancos', () => {
    const l = loteInput.parse({
      codigo: 'L-1',
      temporadaId: 't',
      variedad: 'Chardonnay',
      tipo: 'blanco',
      fechaVendimiaPlan: '2027-02-25',
      diasMaceracion: 7,
      diasFML: 30
    });
    expect([l.diasMaceracion, l.diasFML, l.estado, l.cuartelIds]).toEqual([null, null, 'Planificado', []]);
  });
  it('ventanas: formato, orden y pertenencia', () => {
    expect(ventanaInput.safeParse({ variedad: 'X', valle: 'Y', desde: '3-15', hasta: '04-20' }).success).toBe(false);
    expect(ventanaInput.safeParse({ variedad: 'X', valle: 'Y', desde: '04-20', hasta: '03-15' }).success).toBe(false);
    const ventanas = VENTANAS_BASE.map(([variedad, valle, desde, hasta], i) => ({ id: String(i), variedad, valle, desde, hasta, fuente: null }));
    expect(enVentana('2027-03-25', 'carménère', 'Colchagua', ventanas)?.dentro).toBe(false);
    expect(enVentana('2027-04-20', 'Carménère', 'Colchagua', ventanas)?.dentro).toBe(true);
    expect(enVentana('2027-04-20', 'Carménère', 'Elqui', ventanas)).toBeNull();
    expect(VENTANAS_BASE).toHaveLength(30);
    expect(diasVentana('02-20', '03-20')).toBe(28);
  });
});
