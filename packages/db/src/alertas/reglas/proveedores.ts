/**
 * Regla de alerta de cuentas por pagar — port de js/core/alerts.js:95-96 (v1), con su texto.
 * Diferencia con v1: lee el saldo real (total − NC − pagos aplicados) de v_por_pagar; v1 sumaba el total de toda
 * compra no marcada como pagada, incluidas las notas de crédito en negativo.
 */
import { DIAS_AVISO_POR_PAGAR, diasAlVencimiento } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import type { Regla } from '../motor';

const clp = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

export const porPagar: Regla = {
  id: 'proveedores.por_pagar',
  modulo: 'proveedores',
  severidad: 'warn',
  async evaluar(tx, { hoy }) {
    const docs = await tx.execute<{ saldo: string; vencimiento: string | null }>(sql`select saldo, vencimiento from v_por_pagar where saldo > 0`);
    const urgentes = docs.filter((d) => d.vencimiento && diasAlVencimiento(d.vencimiento, hoy) <= DIAS_AVISO_POR_PAGAR);
    if (!urgentes.length) return [];
    const total = urgentes.reduce((s, d) => s + Number(d.saldo), 0);
    return [
      {
        titulo: `${urgentes.length} facturas de proveedores por pagar`,
        mensaje: `Vencidas o por vencer en ${DIAS_AVISO_POR_PAGAR} días: ${clp(total)}.`,
        ruta: 'proveedores?tab=por-pagar'
      }
    ];
  }
};
