/**
 * Configuración por viña (organización). En v1 vivía en la entidad `config` (js/core/store.js);
 * en v2 son los valores por defecto: los de cada viña viven en `parametro_org` y los indicadores (UF, UTM, IMM) en
 * `indicador`, ambos con vigencia. `configVigente(tx, fecha)` (@winzer/db) arma la configuración de una fecha.
 * Los cálculos reciben la configuración como parámetro: nunca leen estado global.
 */

import type { RangosLab } from './entities/analisis';

export interface RangoSO2 {
  min: number;
  max: number;
  alerta: number;
}

export interface OrgConfig {
  tributario: {
    regimen: '14D3' | '14D8' | '14A';
    tasaIVA: number;
    tasaIDPC: number;
    tasaPPM: number;
    ilaActivo: boolean;
    tasaILA: number;
    diaF29: number;
    mesRenta: number;
    diaRenta: number;
    retencionHonorarios: number;
    remanenteInicial: number;
  };
  remuneraciones: {
    utm: number;
    uf: number;
    imm: number;
    afp: number;
    salud: number;
    cesantiaTrabajador: number;
    cesantiaEmpleador: number;
    sis: number;
    aporteEmpleadorPension: number;
    /** Aporte del empleador al seguro de cesantía en contratos a plazo fijo u obra (v1: 0,03 fijo). */
    cesantiaEmpleadorPlazoFijo: number;
    /** Tope imponible AFP/salud en UF (indicador; v1: 87,8 fijo). */
    topeImponibleUF: number;
    /** Tope imponible del seguro de cesantía en UF (indicador; no existía en v1). */
    topeAfcUF: number;
    /** Jornada ordinaria semanal (horas), para el valor de la hora extra. */
    jornadaSemanal: number;
    /** Valor de una jornada de campo por defecto en labores (v1 lo tenía fijo en 30.000). */
    valorJornada: number;
  };
  enologia: {
    so2Blanco: RangoSO2;
    so2Tinto: RangoSO2;
    /** Rangos objetivo de laboratorio (análisis), por tipo de vino. */
    labBlanco: RangosLab;
    labTinto: RangosLab;
    intervaloMinHoras: number;
    desviacionDias: number;
    kgCajonMin: number;
    kgCajonMax: number;
    tempBaseGD: number;
    /** Merma de envasado sobre la cual se avisa (%; v1: 3 fijo). */
    mermaEnvasadoMax: number;
  };
  finanzas: { margenMinimo: number; saldoInicialCaja: number; patrimonio: number; capitalInvertido: number };
  alertas: { stockMinimoDiasVencimiento: number; foliosPct: number; inactividadMin: number };
}

export const DEFAULT_CONFIG: OrgConfig = {
  tributario: {
    regimen: '14D3',
    tasaIVA: 0.19,
    tasaIDPC: 0.25,
    tasaPPM: 0.0025,
    ilaActivo: true,
    tasaILA: 0.205,
    diaF29: 20,
    mesRenta: 4,
    diaRenta: 30,
    retencionHonorarios: 0.1525,
    remanenteInicial: 0
  },
  remuneraciones: {
    utm: 69500,
    uf: 39800,
    imm: 539000,
    afp: 0.1127,
    salud: 0.07,
    cesantiaTrabajador: 0.006,
    cesantiaEmpleador: 0.024,
    sis: 0.0154,
    aporteEmpleadorPension: 0.01,
    cesantiaEmpleadorPlazoFijo: 0.03,
    topeImponibleUF: 87.8,
    topeAfcUF: 131.9,
    jornadaSemanal: 42,
    valorJornada: 30_000
  },
  enologia: {
    so2Blanco: { min: 25, max: 35, alerta: 40 },
    so2Tinto: { min: 20, max: 30, alerta: 35 },
    // v1: laboratorio/index.js RANGOS (referenciales).
    labBlanco: {
      ph: { min: 3.1, max: 3.4 },
      acidezTotal: { min: 5.5, max: 7.5 },
      acidezVolatil: { min: 0, max: 0.6 },
      so2Total: { min: 0, max: 200 },
      alcohol: { min: 11.5, max: 14 },
      azucarResidual: { min: 0, max: 4 }
    },
    labTinto: {
      ph: { min: 3.4, max: 3.8 },
      acidezTotal: { min: 4.8, max: 6.5 },
      acidezVolatil: { min: 0, max: 0.7 },
      so2Total: { min: 0, max: 150 },
      alcohol: { min: 12.5, max: 15 },
      azucarResidual: { min: 0, max: 4 }
    },
    intervaloMinHoras: 24,
    desviacionDias: 3,
    kgCajonMin: 18,
    kgCajonMax: 20,
    tempBaseGD: 10,
    mermaEnvasadoMax: 3
  },
  finanzas: { margenMinimo: 0.25, saldoInicialCaja: 15_000_000, patrimonio: 120_000_000, capitalInvertido: 150_000_000 },
  alertas: { stockMinimoDiasVencimiento: 30, foliosPct: 0.8, inactividadMin: 15 }
};

type Plain = Record<string, unknown>;
const isObj = (v: unknown): v is Plain => !!v && typeof v === 'object' && !Array.isArray(v);

/** Mezcla profunda (los arrays se reemplazan). Igual que deepMerge de v1. */
export function deepMerge<T>(a: T, b: unknown): T {
  if (!isObj(a) || !isObj(b)) return b === undefined ? a : (b as T);
  const out: Plain = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
  return out as T;
}

/** Configuración efectiva de una viña: defaults + lo guardado. */
export function resolveConfig(saved?: unknown): OrgConfig {
  return deepMerge(DEFAULT_CONFIG, saved ?? {});
}
