/**
 * Reglas de alerta de DTE — port de js/core/alerts.js:81-82 (v1), con su texto: documentos rechazados por el SII y
 * folios autorizados por agotarse. Nueva: certificado digital por vencer (v1 solo lo mostraba como banner).
 */
import { nombreDte, usoFolios } from '@winzer/domain';
import { sql } from 'drizzle-orm';
import type { Regla } from '../motor';

export const dteRechazado: Regla = {
  id: 'dte.rechazado',
  modulo: 'dte',
  severidad: 'bad',
  async evaluar(tx) {
    const filas = await tx.execute<{ id: string; tipo: number; folio: string; contraparte: string | null }>(
      sql`select id, tipo, folio, contraparte from dte where deleted_at is null and direccion = 'emitido' and estado = 'rechazado'`
    );
    return filas.map((d) => ({
      registroId: d.id,
      entidad: 'dte',
      titulo: `DTE rechazado: ${nombreDte(d.tipo)} N° ${d.folio}`,
      mensaje: `${d.contraparte ?? 'Sin receptor'}. Revisa el motivo y anúlalo o corrígelo con una nota.`,
      ruta: 'dte'
    }));
  }
};

/** % de folios usados por tipo con CAF cargado: aviso desde `alertas.foliosPct`, error al agotarse. */
export const foliosPorAgotarse: Regla = {
  id: 'dte.folios',
  modulo: 'dte',
  severidad: 'warn',
  async evaluar(tx, { config }) {
    const cafs = await tx.execute<{ tipo: number; desde: number; hasta: number }>(sql`select tipo, desde, hasta from caf where deleted_at is null`);
    const folios = await tx.execute<{ tipo: number; folio: string }>(
      sql`select tipo, folio from dte where deleted_at is null and direccion = 'emitido' and folio ~ '^[0-9]+$'`
    );
    const out = [];
    for (const tipo of [...new Set(cafs.map((c) => c.tipo))]) {
      const u = usoFolios(
        cafs.filter((c) => c.tipo === tipo),
        folios.filter((f) => f.tipo === tipo).map((f) => Number(f.folio))
      );
      if (u.pct < config.alertas.foliosPct) continue;
      out.push({
        registroId: `folios-${tipo}`,
        entidad: 'caf',
        severidad: u.disponibles === 0 ? ('bad' as const) : ('warn' as const),
        titulo: u.disponibles === 0 ? `Sin folios de ${nombreDte(tipo)}` : `Folios de ${nombreDte(tipo)} por agotarse`,
        mensaje: `Usados ${u.usados} de ${u.total} (${Math.round(u.pct * 100)} %). Carga un nuevo CAF en DTE › Folios.`,
        ruta: 'dte?tab=folios'
      });
    }
    return out;
  }
};

export const certificadoPorVencer: Regla = {
  id: 'dte.certificado',
  modulo: 'dte',
  severidad: 'warn',
  async evaluar(tx, { hoy }) {
    const [e] = await tx.execute<{ certificado_vence: string | null }>(sql`select certificado_vence from emisor where deleted_at is null`);
    const vence = e?.certificado_vence;
    if (!vence) return [];
    const dias = Math.round((Date.parse(vence) - Date.parse(hoy)) / 86_400_000);
    if (dias > 60) return [];
    return [
      {
        registroId: 'certificado',
        entidad: 'emisor',
        severidad: dias < 0 ? ('bad' as const) : ('warn' as const),
        titulo: dias < 0 ? 'Certificado digital vencido' : 'Certificado digital por vencer',
        mensaje: dias < 0 ? `Venció hace ${-dias} días: renuévalo para emitir DTE.` : `Vence en ${dias} días.`,
        ruta: 'dte?tab=emisor'
      }
    ];
  }
};
