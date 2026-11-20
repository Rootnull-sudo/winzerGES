/**
 * Reglas de alerta activas. Un archivo por módulo (`reglas/<modulo>.ts`) y una línea aquí, para que dos ramas en
 * paralelo no choquen. Al portar una regla de js/core/alerts.js, agrega su test en packages/db/test/alertas.test.ts.
 */
import type { Regla } from '../motor';
import { temporadaSinCerrar } from './nucleo';

export const REGLAS: readonly Regla[] = [temporadaSinCerrar];
