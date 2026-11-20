/**
 * Reglas de alerta de insumos — port de js/core/alerts.js:57-58 (v1). En v1 eran del módulo `inventarios`; en v2
 * quedan en `insumos`, que es donde se ve y ajusta el stock. El umbral de vencimiento es el parámetro de la viña
 * (v1 usaba 30 fijo en la lista y el parámetro en la alerta).
 */
import { diffDays } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import type { Tx } from '../../client';
import type { Regla } from '../motor';

type StockRow = {
  insumo_id: string;
  nombre: string;
  unidad: string;
  stock: string;
  stock_minimo: string | null;
  vencimiento: string | null;
};
const stocks = (tx: Tx) => tx.execute<StockRow>(sql`select insumo_id, nombre, unidad, stock, stock_minimo, vencimiento from v_stock_insumo`);
const fmt = (v: number) => v.toLocaleString('es-CL', { maximumFractionDigits: 2 });

export const stockBajo: Regla = {
  id: 'insumos.stock_bajo',
  modulo: 'insumos',
  severidad: 'warn',
  async evaluar(tx) {
    return (await stocks(tx))
      .filter((s) => s.stock_minimo != null && Number(s.stock) < Number(s.stock_minimo))
      .map((s) => ({
        registroId: s.insumo_id,
        entidad: 'insumo',
        titulo: `Stock bajo: ${s.nombre}`,
        mensaje: `Quedan ${fmt(Number(s.stock))} ${s.unidad} (mínimo ${fmt(Number(s.stock_minimo))}).`,
        ruta: 'insumos'
      }));
  }
};

export const insumoVencido: Regla = {
  id: 'insumos.vencido',
  modulo: 'insumos',
  severidad: 'bad',
  async evaluar(tx, { hoy }) {
    return (await stocks(tx))
      .filter((s) => s.vencimiento && Number(s.stock) > 0 && (diffDays(hoy, s.vencimiento) ?? 0) < 0)
      .map((s) => ({
        registroId: s.insumo_id,
        entidad: 'insumo',
        titulo: `Insumo vencido: ${s.nombre}`,
        mensaje: `Venció el ${s.vencimiento!.split('-').reverse().join('-')}.`,
        ruta: 'insumos'
      }));
  }
};

export const insumoPorVencer: Regla = {
  id: 'insumos.por_vencer',
  modulo: 'insumos',
  severidad: 'warn',
  async evaluar(tx, { hoy, config }) {
    const limite = config.alertas.stockMinimoDiasVencimiento;
    return (await stocks(tx))
      .filter((s) => {
        const d = s.vencimiento ? diffDays(hoy, s.vencimiento) : null;
        return d != null && d >= 0 && d <= limite && Number(s.stock) > 0;
      })
      .map((s) => ({
        registroId: s.insumo_id,
        entidad: 'insumo',
        titulo: `Insumo por vencer: ${s.nombre}`,
        mensaje: `Vence en ${diffDays(hoy, s.vencimiento)} días.`,
        ruta: 'insumos'
      }));
  }
};
