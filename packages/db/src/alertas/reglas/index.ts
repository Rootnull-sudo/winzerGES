/**
 * Reglas de alerta activas. Un archivo por módulo (`reglas/<modulo>.ts`) y una línea aquí, para que dos ramas en
 * paralelo no choquen. Al portar una regla de js/core/alerts.js, agrega su test en packages/db/test/alertas.test.ts.
 */
import { diferenciasConciliacion, movimientosSinConciliar } from './conciliacion';
import { vencimientosTributarios } from './tributario';
import { certificadoPorVencer, dteRechazado, foliosPorAgotarse } from './dte';
import type { Regla } from '../motor';
import { desvioFA, fmlProlongada, mermaAlta, seguimientoAtrasado, so2Alto, so2Bajo, so2Critico, sobrecapacidad } from './bodega';
import { insumoPorVencer, insumoVencido, stockBajo } from './insumos';
import { temporadaSinCerrar } from './nucleo';
import { formatoBajoMinimo, marcaPorVencer, marcaVencida, mermaEnvasadoAlta, ventasEnMora } from './comercial';
import { remuneracionesPorPagar } from './personas';
import { porPagar } from './proveedores';
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
  insumoPorVencer,
  // Fermentación y bodega (F2-7)
  so2Critico,
  so2Alto,
  so2Bajo,
  desvioFA,
  fmlProlongada,
  seguimientoAtrasado,
  sobrecapacidad,
  mermaAlta,
  // Proveedores (F3-3)
  porPagar,
  // Personas (F4-2)
  remuneracionesPorPagar,
  // Comercial (F5)
  marcaVencida,
  marcaPorVencer,
  mermaEnvasadoAlta,
  ventasEnMora,
  formatoBajoMinimo,
  // DTE (F6-1)
  dteRechazado,
  foliosPorAgotarse,
  certificadoPorVencer,
  // Tributario (F6-2)
  vencimientosTributarios,
  // Conciliación (F6-3)
  movimientosSinConciliar,
  diferenciasConciliacion
];
