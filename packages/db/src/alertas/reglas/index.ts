/**
 * Reglas de alerta activas. Un archivo por módulo (`reglas/<modulo>.ts`) y una línea aquí, para que dos ramas en
 * paralelo no choquen. Al portar una regla de js/core/alerts.js, agrega su test en packages/db/test/alertas.test.ts.
 */
import type { Regla } from '../motor';
import { insumoPorVencer, insumoVencido, stockBajo } from './insumos';
import { temporadaSinCerrar } from './nucleo';
import { cajonFueraDeRango, carenciaVigente, cosechaEnCarencia, desborreDesviado, desborreSinFin, desborreSinRegistrar } from './vinedo';

export const REGLAS: readonly Regla[] = [
  temporadaSinCerrar,
  // Viñedo (F1-5)
  cosechaEnCarencia,
  carenciaVigente,
  cajonFueraDeRango,
  desborreSinRegistrar,
  desborreSinFin,
  desborreDesviado,
  // Insumos (F1-5)
  stockBajo,
  insumoVencido,
  insumoPorVencer
];
