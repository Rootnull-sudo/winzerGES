/**
 * Reglas de alerta de conciliación bancaria — port de js/core/alerts.js:84-90 (v1), con su texto: movimientos sin
 * conciliar por cuenta (informativa, con el más antiguo) y diferencias de conciliación.
 */
import { sql } from 'drizzle-orm';
import type { Regla } from '../motor';

const dmy = (d: string) => d.split('-').reverse().join('-');

export const movimientosSinConciliar: Regla = {
  id: 'conciliacion.pendientes',
  modulo: 'conciliacion',
  severidad: 'info',
  async evaluar(tx) {
    const filas = await tx.execute<{ id: string; banco: string; numero: string; n: number; desde: string }>(sql`
      select c.id, c.banco, c.numero, count(*)::int as n, min(m.fecha) as desde
      from mov_banco m join cuenta_banco c on c.id = m.cuenta_id
      where m.deleted_at is null and m.estado = 'pendiente'
      group by c.id`);
    return filas.map((f) => ({
      registroId: f.id,
      entidad: 'cuenta_banco',
      titulo: `${f.n} movimientos sin conciliar en ${f.banco}`,
      mensaje: `Cuenta ${f.numero}. El más antiguo es del ${dmy(f.desde)}.`,
      ruta: `conciliacion?cuenta=${f.id}`
    }));
  }
};

export const diferenciasConciliacion: Regla = {
  id: 'conciliacion.diferencias',
  modulo: 'conciliacion',
  severidad: 'warn',
  async evaluar(tx) {
    const [f] = await tx.execute<{ n: number; total: string }>(sql`
      select count(*)::int as n, coalesce(sum(abs(coalesce(x.diferencia, m.monto))), 0) as total
      from mov_banco m
      left join lateral (select sum(diferencia) as diferencia from conciliacion_match c where c.mov_banco_id = m.id and c.deleted_at is null) x on true
      where m.deleted_at is null and m.estado = 'diferencia'`);
    if (!f?.n) return [];
    return [
      {
        titulo: 'Diferencias de conciliación',
        mensaje: `${f.n} movimientos por $${Math.round(Number(f.total)).toLocaleString('es-CL')}. Regístralas como gasto financiero o corrige el documento.`,
        ruta: 'conciliacion'
      }
    ];
  }
};
