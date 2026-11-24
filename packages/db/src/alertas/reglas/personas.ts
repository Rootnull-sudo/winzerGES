/**
 * Regla de alerta de remuneraciones (nueva en v2; v1 no avisaba): desde el día 5, remuneraciones del mes anterior
 * que siguen sin pagar.
 */
import { moverPeriodo, nombrePeriodo } from '@winzer/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { remuneracion } from '../../schema';
import type { Regla } from '../motor';

/** Día del mes desde el que se avisa (los sueldos se pagan dentro de los primeros días). */
export const DIA_AVISO_REMUNERACIONES = 5;

export const remuneracionesPorPagar: Regla = {
  id: 'administracion.remuneraciones_por_pagar',
  modulo: 'administracion',
  severidad: 'warn',
  async evaluar(tx, { hoy }) {
    if (Number(hoy.slice(8, 10)) < DIA_AVISO_REMUNERACIONES) return [];
    const periodo = moverPeriodo(hoy.slice(0, 7), -1);
    const [r] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(remuneracion)
      .where(and(eq(remuneracion.periodo, periodo), eq(remuneracion.estado, 'calculada'), isNull(remuneracion.deletedAt)));
    if (!r?.n) return [];
    return [
      {
        registroId: periodo,
        entidad: 'remuneracion',
        titulo: `${r.n} remuneraciones de ${nombrePeriodo(periodo)} sin pagar`,
        mensaje: 'Regístralas como pagadas con su fecha de pago (o revisa si falta pagarlas).',
        ruta: `administracion?tab=remuneraciones&periodo=${periodo}`
      }
    ];
  }
};
