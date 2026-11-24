/**
 * Reglas de alerta de cumplimiento — port de js/core/alerts.js:64-78 (v1), con su texto: obligaciones vencidas o
 * por vencer según sus días de aviso, D.O. declarada sin respaldo y el calendario normativo (patentes y SAG).
 */
import { estadoCumplimiento } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import type { Hallazgo, Regla } from '../motor';
import { hallazgosCalendario } from './tributario';

const dmy = (d: string) => d.split('-').reverse().join('-');

export const cumplimientoVencimientos: Regla = {
  id: 'cumplimiento.vencimiento',
  modulo: 'cumplimiento',
  severidad: 'warn',
  async evaluar(tx, { hoy }) {
    const filas = await tx.execute<{ id: string; nombre: string; estado: string; vencimiento: string | null; aviso_dias: number }>(sql`
      select id, nombre, estado, vencimiento, aviso_dias from cumplimiento where deleted_at is null and vencimiento is not null`);
    const out: Hallazgo[] = [];
    for (const c of filas) {
      // v1 avisaba también de las pendientes de trámite con vencimiento: se evalúan por la fecha.
      const e = estadoCumplimiento({ estado: 'vigente', vencimiento: c.vencimiento, avisoDias: c.aviso_dias }, hoy);
      if (e !== 'vencido' && e !== 'por vencer') continue;
      out.push({
        registroId: c.id,
        entidad: 'cumplimiento',
        severidad: e === 'vencido' ? 'bad' : 'warn',
        titulo: e === 'vencido' ? `Vencido: ${c.nombre}` : `Por vencer: ${c.nombre}`,
        mensaje: `${e === 'vencido' ? 'Venció' : 'Vence'} el ${dmy(c.vencimiento!)}.${c.estado === 'pendiente' ? ' Trámite pendiente.' : ''}`,
        ruta: 'cumplimiento'
      });
    }
    return out;
  }
};

export const doSinRespaldo: Regla = {
  id: 'envasado.do_sin_respaldo',
  modulo: 'envasado',
  severidad: 'bad',
  async evaluar(tx) {
    const filas = await tx.execute<{ id: string; codigo: string | null }>(sql`
      select id, codigo from orden_envasado
      where deleted_at is null and estado <> 'anulada' and declara_do
        and (coalesce(pct_uva_zona, 0) < 75 or coalesce(certificado_do, '') = '')`);
    return filas.map((o) => ({
      registroId: o.id,
      entidad: 'orden_envasado',
      titulo: `D.O. sin respaldo: ${o.codigo ?? 'orden en borrador'}`,
      mensaje: 'La etiqueta declara denominación de origen sin 75 % de uva de la zona o sin certificado.',
      ruta: 'envasado'
    }));
  }
};

/** Patentes y declaraciones SAG del calendario; solo para viñas que ya registran su cumplimiento. */
export const vencimientosNormativos: Regla = {
  id: 'cumplimiento.calendario',
  modulo: 'cumplimiento',
  severidad: 'warn',
  async evaluar(tx, { hoy, config }) {
    const [act] = await tx.execute<{ si: boolean }>(sql`select exists (select 1 from cumplimiento where deleted_at is null) as si`);
    if (!act?.si) return [];
    return hallazgosCalendario(tx, hoy, config, 'cumplimiento');
  }
};
