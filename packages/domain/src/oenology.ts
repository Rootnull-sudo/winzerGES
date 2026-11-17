/**
 * Cálculos enológicos — port de js/calc/oenology.js (v1).
 * Fórmulas referenciales: el enólogo debe validar con análisis de laboratorio.
 * Diferencia con v1: la configuración se pasa como argumento (OrgConfig['enologia']).
 */
import type { OrgConfig } from './config';
import { diffDays, n, sum, today } from './num';

type Enologia = OrgConfig['enologia'];
export type TipoVino = 'blanco' | 'tinto';

/** Fracción de SO₂ que aporta cada producto. */
export const SO2_FRACCION = { K2S2O5: 0.57, Na2S2O5: 0.67 } as const;

/** Fracción de SO₂ de un insumo (campo so2Pct en %) o de su tipo químico. */
export function fraccionSO2(insumo?: { so2Pct?: unknown; quimico?: string } | null): number {
  if (!insumo) return SO2_FRACCION.K2S2O5;
  if (n(insumo.so2Pct) > 0) return n(insumo.so2Pct) / 100;
  return SO2_FRACCION[insumo.quimico as keyof typeof SO2_FRACCION] ?? SO2_FRACCION.K2S2O5;
}

/** dosis[mg/L] = gramos × 1000 × fracciónSO₂ / volumen[L] */
export function dosisMgL(gramos: unknown, litros: unknown, fraccion: unknown): number {
  if (!n(litros)) return 0;
  return (n(gramos) * 1000 * n(fraccion)) / n(litros);
}

/** gramos = objetivo[mg/L] × volumen[L] / (1000 × fracciónSO₂) */
export function gramosParaDosis(mgL: unknown, litros: unknown, fraccion: unknown): number {
  if (!n(fraccion)) return 0;
  return (n(mgL) * n(litros)) / (1000 * n(fraccion));
}

export const so2Teorico = (previo: unknown, dosis: unknown) => n(previo) + n(dosis);
export const eficienciaSO2 = (previo: unknown, medido: unknown, dosis: unknown) => (n(dosis) ? (n(medido) - n(previo)) / n(dosis) : null);

export const rangoSO2 = (tipo: TipoVino | string, cfg: Enologia) => (tipo === 'blanco' ? cfg.so2Blanco : cfg.so2Tinto);

export type EstadoSO2 = 'bajo' | 'ok' | 'alto' | 'critico';
export function estadoSO2(valor: unknown, tipo: TipoVino | string, cfg: Enologia): EstadoSO2 {
  const r = rangoSO2(tipo, cfg);
  const v = n(valor);
  if (v > r.alerta) return 'critico';
  if (v > r.max) return 'alto';
  if (v < r.min) return 'bajo';
  return 'ok';
}

/** °Brix ≈ 261,3 × (1 − 1/SG), SG = densidad/1000 */
export function brixDesdeDensidad(d: unknown): number {
  const sg = n(d) / 1000;
  if (sg <= 0) return 0;
  return Math.max(0, 261.3 * (1 - 1 / sg));
}
export const azucarDesdeBrix = (brix: unknown) => n(brix) * 10;
export const alcoholProbable = (brix: unknown) => azucarDesdeBrix(brix) / 16.83;

/** v = (azúcar inicial − azúcar actual) / días */
export function velocidadFA(brixInicial: unknown, brixActual: unknown, dias: unknown): number {
  if (!n(dias)) return 0;
  return (azucarDesdeBrix(brixInicial) - azucarDesdeBrix(brixActual)) / n(dias);
}

export interface FichaFermentacion {
  inicioFA?: string | null;
  finFA?: string | null;
  inicioTumultuosa?: string | null;
  inicioFML?: string | null;
  finFML?: string | null;
  brixInicial?: unknown;
  diasPlanificados?: unknown;
}
export interface Seguimiento {
  fecha: string;
  brix?: unknown;
  densidad?: unknown;
}

/** Resumen de tiempos de una ficha de fermentación (latencia, días FA, velocidad, desvío). */
export function tiemposFermentacion(f: FichaFermentacion, segs: Seguimiento[], cfg: Enologia, hoy = today()) {
  const fin = f.finFA || null;
  const diasFA = f.inicioFA ? diffDays(f.inicioFA, fin || hoy) : null;
  const latencia = f.inicioFA && f.inicioTumultuosa ? diffDays(f.inicioFA, f.inicioTumultuosa) : null;
  const sorted = segs.slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  const last = sorted.filter((x) => (x.brix !== '' && x.brix !== undefined && x.brix !== null) || n(x.densidad)).pop();
  const brixActual = last && n(last.brix) ? n(last.brix) : last && n(last.densidad) ? brixDesdeDensidad(last.densidad) : null;
  const velocidad =
    brixActual !== null && diasFA && last && f.inicioFA ? velocidadFA(f.brixInicial, brixActual, Math.max(1, diffDays(f.inicioFA, last.fecha) ?? 1)) : null;
  const plan = n(f.diasPlanificados) || null;
  const desvio = plan && diasFA !== null ? diasFA - plan : null;
  const diasFML = f.inicioFML ? diffDays(f.inicioFML, f.finFML || hoy) : null;
  return {
    diasFA,
    latencia,
    velocidad,
    brixActual,
    desvio,
    enCurso: !!f.inicioFA && !fin,
    diasFML,
    alertaDesvio: desvio !== null && Math.abs(desvio) > cfg.desviacionDias
  };
}

/** Grados día (Winkler): Σ max(0, (Tmáx + Tmín)/2 − Tbase) */
export function gradosDia(registros: { tmax?: unknown; tmin?: unknown }[], base: number): number {
  return sum(registros, (r) => Math.max(0, (n(r.tmax) + n(r.tmin)) / 2 - base));
}

/** Kg por cajón dentro del rango aceptado. */
export function cajonValido(kg: unknown, cajones: unknown, cfg: Enologia): boolean {
  if (!n(cajones)) return true;
  const x = n(kg) / n(cajones);
  return x >= cfg.kgCajonMin && x <= cfg.kgCajonMax;
}
