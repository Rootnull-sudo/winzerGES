/**
 * Vencimientos del calendario tributario — port de js/core/alerts.js:74-78 (v1): aviso si vence en 10 días o menos,
 * error si venció hace 30 días o menos, salvo que la obligación esté cumplida. Las de patentes y SAG son del módulo
 * cumplimiento (F6-4). Solo se evalúa si la viña ya tiene DTE, F29 u obligaciones registradas.
 */
import { calendarioTributario, estadoObligacion } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import type { Tx } from '../../client';
import type { OrgConfig } from '@winzer/domain';
import type { Hallazgo, Regla } from '../motor';

const dmy = (d: string) => d.split('-').reverse().join('-');

/** Hallazgos del calendario de un módulo: aviso a ≤ 10 días, error si venció hace ≤ 30 días, salvo cumplidas. */
export async function hallazgosCalendario(tx: Tx, hoy: string, config: OrgConfig, modulo: 'tributario' | 'cumplimiento'): Promise<Hallazgo[]> {
  const anio = Number(hoy.slice(0, 4));
  const items = [...calendarioTributario(anio, config.tributario), ...calendarioTributario(anio + 1, config.tributario)].filter((i) => i.modulo === modulo);
  const obs = await tx.execute<{ clave: string; estado: string }>(sql`select clave, estado from obligacion where deleted_at is null`);
  const reg = new Map(obs.map((o) => [o.clave, o]));
  const out: Hallazgo[] = [];
  for (const i of items) {
    const { estado, dias } = estadoObligacion(i.fecha, reg.get(i.clave), hoy);
    if (estado === 'cumplida' || dias > 10 || dias < -30) continue;
    out.push({
      registroId: i.clave,
      entidad: 'obligacion',
      severidad: dias < 0 ? 'bad' : 'warn',
      titulo: dias < 0 ? `Vencido: ${i.nombre}` : `Vence pronto: ${i.nombre}`,
      mensaje: dias < 0 ? `Venció el ${dmy(i.fecha)}.` : dias === 0 ? 'Vence hoy.' : `Vence el ${dmy(i.fecha)} (en ${dias} días).`,
      ruta: modulo === 'cumplimiento' ? 'cumplimiento' : i.tipo === 'F29' ? 'tributario' : 'tributario?tab=calendario'
    });
  }
  return out;
}

export const vencimientosTributarios: Regla = {
  id: 'tributario.calendario',
  modulo: 'tributario',
  severidad: 'warn',
  async evaluar(tx, { hoy, config }) {
    // Solo viñas con actividad tributaria registrada (una viña recién creada no recibe avisos de un calendario vacío).
    const [act] = await tx.execute<{ si: boolean }>(
      sql`select exists (select 1 from dte where deleted_at is null) or exists (select 1 from f29 where deleted_at is null) or exists (select 1 from obligacion where deleted_at is null) as si`
    );
    if (!act?.si) return [];
    return hallazgosCalendario(tx, hoy, config, 'tributario');
  }
};
