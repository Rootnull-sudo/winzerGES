/**
 * Reglas de alerta financieras — port de js/core/alerts.js:100-108 (v1), con su texto: margen bruto bajo el mínimo,
 * punto de equilibrio no alcanzado (temporada en curso) y caja proyectada negativa (año en curso, flujo corregido).
 */
import { estadoResultados, flujoCaja, porFormato, puntoEquilibrio, type Periodo } from '@winzer/domain';
import { isNull, sql } from 'drizzle-orm';
import type { Tx } from '../../client';
import { formato } from '../../schema';
import { datosPeriodo, movimientosCaja, participacionEnvase } from '../../services/financiero';
import type { Regla } from '../motor';

const clp = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;
const pct = (v: number, d = 1) => `${(v * 100).toLocaleString('es-CL', { maximumFractionDigits: d })} %`;

async function temporadaEnCurso(tx: Tx, hoy: string): Promise<Periodo> {
  const [t] = await tx.execute<{ inicio: string; fin: string }>(
    sql`select inicio, fin from temporada where deleted_at is null and ${hoy} between inicio and fin limit 1`
  );
  return t ? { desde: t.inicio, hasta: t.fin } : { desde: `${hoy.slice(0, 4)}-01-01`, hasta: `${hoy.slice(0, 4)}-12-31` };
}

export const margenBajo: Regla = {
  id: 'financiero.margen_bajo',
  modulo: 'financiero',
  severidad: 'warn',
  async evaluar(tx, { hoy, config }) {
    const p = await temporadaEnCurso(tx, hoy);
    const er = estadoResultados(await datosPeriodo(tx, p), p, config.tributario);
    if (!er.ingresos) return [];
    const mb = er.mb / er.ingresos;
    if (mb >= config.finanzas.margenMinimo) return [];
    return [{ titulo: 'Margen bruto bajo el umbral', mensaje: `${pct(mb)} vs mínimo ${pct(config.finanzas.margenMinimo, 0)}.`, ruta: 'financiero' }];
  }
};

export const sinEquilibrio: Regla = {
  id: 'financiero.sin_equilibrio',
  modulo: 'financiero',
  severidad: 'info',
  async evaluar(tx, { hoy, config }) {
    const p = await temporadaEnCurso(tx, hoy);
    const d = await datosPeriodo(tx, p);
    const er = estadoResultados(d, p, config.tributario);
    if (!er.ingresos) return [];
    const fs = await tx.select().from(formato).where(isNull(formato.deletedAt));
    const pf = porFormato(
      d.lineas,
      fs.map((f) => f.id)
    );
    const pe = puntoEquilibrio(
      er,
      pf,
      fs.map((f) => ({ id: f.id, nombre: f.nombre, litros: Number(f.litros) })),
      await participacionEnvase(tx),
      config.tributario.tasaIDPC
    );
    if (pe.alcanzado) return [];
    const falta = Number.isFinite(pe.pePesos)
      ? `Faltan ${clp(pe.pePesos - pe.ingresos)} en ventas netas.`
      : 'La contribución de las ventas no cubre los costos variables.';
    return [{ titulo: 'Punto de equilibrio aún no alcanzado', mensaje: falta, ruta: 'financiero?tab=equilibrio' }];
  }
};

export const cajaNegativa: Regla = {
  id: 'financiero.caja_negativa',
  modulo: 'financiero',
  severidad: 'bad',
  async evaluar(tx, { hoy, config }) {
    const anio = Number(hoy.slice(0, 4));
    const fc = flujoCaja(anio, await movimientosCaja(tx, anio, config.tributario.diaF29), config.finanzas.saldoInicialCaja, hoy.slice(0, 7));
    if (!fc.negativo) return [];
    return [{ titulo: 'Caja proyectada negativa', mensaje: `En ${fc.negativo.mes} el saldo sería ${clp(fc.negativo.saldo)}.`, ruta: 'financiero?tab=flujo' }];
  }
};
