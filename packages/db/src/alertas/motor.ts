/**
 * Motor de alertas (ADR 0012). Reemplaza a js/core/alerts.js de v1, que recalculaba todo en cada lectura en el
 * navegador. Aquí cada regla se evalúa en el servidor (job por viña cada hora y tras un push de sync) y los
 * hallazgos se guardan en `alerta`:
 *  - hallazgo nuevo → alerta abierta;
 *  - hallazgo que sigue → se actualiza el texto (no se duplica: única abierta por regla + registro);
 *  - alerta abierta que ya no aparece → `resuelta`.
 */
import { can, fechaHoy, type OrgConfig } from '@winzer/domain';
import { and, desc, eq, notInArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../client';
import type { Actor } from '../repo';
import { alerta, alertaVista } from '../schema';
import { configVigente } from '../services/parametros';
import { withOrg } from '../tenancy';

export type Severidad = 'info' | 'warn' | 'bad';

export interface Hallazgo {
  /** Registro al que apunta; omitido si la alerta es de la viña completa. */
  registroId?: string;
  entidad?: string;
  titulo: string;
  mensaje?: string;
  /** Ruta relativa a la viña, p. ej. `configuracion#temporadas`. */
  ruta?: string;
}

export interface ContextoRegla {
  orgId: string;
  /** Fecha de evaluación (yyyy-mm-dd, hora de Chile). */
  hoy: string;
  /** Parámetros vigentes hoy (umbrales, tasas). */
  config: OrgConfig;
}

export interface Regla {
  /** Id estable: si cambia, las alertas abiertas de la regla anterior quedan huérfanas. */
  id: string;
  modulo: string;
  severidad: Severidad;
  evaluar: (tx: Tx, ctx: ContextoRegla) => Promise<Hallazgo[]>;
}

export interface ResultadoAlertas {
  abiertas: number;
  nuevas: number;
  resueltas: number;
  /** Reglas que fallaron (las demás se aplican igual). */
  errores: { regla: string; mensaje: string }[];
}

/** Evalúa las reglas para una viña y sincroniza la tabla `alerta`. */
export async function calcularAlertas(orgId: string, reglas: readonly Regla[], hoy: string = fechaHoy()): Promise<ResultadoAlertas> {
  return withOrg(orgId, async (tx) => {
    const ctx: ContextoRegla = { orgId, hoy, config: await configVigente(tx, hoy) };
    const res: ResultadoAlertas = { abiertas: 0, nuevas: 0, resueltas: 0, errores: [] };
    for (const regla of reglas) {
      try {
        // Savepoint: si la regla falla, se deshace solo lo suyo y la transacción sigue.
        await tx.transaction(async (sp) => {
          const hallazgos = await regla.evaluar(sp, ctx);
          const ids = [...new Set(hallazgos.map((h) => h.registroId ?? ''))];
          for (const h of hallazgos) {
            const [r] = await sp
              .insert(alerta)
              .values({
                id: randomUUID(),
                orgId,
                regla: regla.id,
                severidad: regla.severidad,
                modulo: regla.modulo,
                entidad: h.entidad ?? null,
                registroId: h.registroId ?? '',
                titulo: h.titulo,
                mensaje: h.mensaje ?? null,
                ruta: h.ruta ?? null
              })
              .onConflictDoUpdate({
                target: [alerta.orgId, alerta.regla, alerta.registroId],
                targetWhere: sql`${alerta.estado} = 'abierta'`,
                set: { severidad: regla.severidad, titulo: h.titulo, mensaje: h.mensaje ?? null, ruta: h.ruta ?? null, actualizadaEn: new Date() }
              })
              // xmax = 0 solo en filas recién insertadas (no en las actualizadas por el conflicto).
              .returning({ nueva: sql<boolean>`(xmax = 0)` });
            if (r?.nueva) res.nuevas++;
          }
          res.abiertas += ids.length;
          const resueltas = await sp
            .update(alerta)
            .set({ estado: 'resuelta', resueltaEn: new Date() })
            .where(and(eq(alerta.regla, regla.id), eq(alerta.estado, 'abierta'), ids.length ? notInArray(alerta.registroId, ids) : undefined))
            .returning({ id: alerta.id });
          res.resueltas += resueltas.length;
        });
      } catch (e) {
        console.error(`[alertas] regla ${regla.id} (${orgId})`, e);
        res.errores.push({ regla: regla.id, mensaje: (e as Error).message });
      }
    }
    return res;
  });
}

export interface AlertaVisible {
  id: string;
  severidad: Severidad;
  modulo: string;
  titulo: string;
  mensaje: string | null;
  ruta: string | null;
  detectadaEn: Date;
  vista: boolean;
}

/** Alertas abiertas que el usuario puede ver (según el permiso de ver el módulo dueño), las no vistas primero. */
export async function alertasPara(tx: Tx, actor: Actor): Promise<AlertaVisible[]> {
  const rows = await tx
    .select({
      id: alerta.id,
      severidad: alerta.severidad,
      modulo: alerta.modulo,
      titulo: alerta.titulo,
      mensaje: alerta.mensaje,
      ruta: alerta.ruta,
      detectadaEn: alerta.detectadaEn,
      vista: sql<boolean>`${alertaVista.userId} is not null`
    })
    .from(alerta)
    .leftJoin(alertaVista, and(eq(alertaVista.alertaId, alerta.id), eq(alertaVista.userId, actor.userId)))
    .where(eq(alerta.estado, 'abierta'))
    .orderBy(desc(alerta.detectadaEn));
  const orden: Record<string, number> = { bad: 0, warn: 1, info: 2 };
  return (rows as AlertaVisible[])
    .filter((a) => can(actor.role, a.modulo, 'v', actor.customRoles, actor.acceso))
    .sort((a, b) => Number(a.vista) - Number(b.vista) || (orden[a.severidad] ?? 3) - (orden[b.severidad] ?? 3));
}

/** Marca alertas como vistas por el usuario (idempotente). */
export async function marcarAlertasVistas(tx: Tx, actor: Actor, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await tx
    .insert(alertaVista)
    .values(ids.map((alertaId) => ({ orgId: actor.orgId, alertaId, userId: actor.userId })))
    .onConflictDoNothing();
}
