'use client';
import { can as canRole, fechaHoy, temporadaDeFecha, type AccesoPlan, type Action, type RoleDef } from '@winzer/domain';
import { useSearchParams } from 'next/navigation';
import { createContext, useContext } from 'react';

export interface OrgCtx {
  org: { id: string; slug: string; nombre: string };
  user: { id: string; name: string; email: string };
  role: string;
  roleName: string;
  customRoles: RoleDef[];
  /** Temporadas de la viña (ADR 0011) y el año de la actual (derivado de la fecha de hoy en el servidor). */
  temporadas: { id: string; anio: number; inicio: string; fin: string; estado: 'abierta' | 'cerrada' }[];
  temporadaActual: number | null;
  /** Plan y estado de la suscripción de la viña (F0-7). */
  acceso: AccesoPlan;
  /** Tareas pendientes del usuario, de su rol o de toda la viña (F2-3). */
  tareas: { id: string; titulo: string; descripcion: string | null; fecha: string; ruta: string | null }[];
  /** El usuario pidió el resumen diario de avisos por correo (F0-8). */
  resumenAlertas: boolean;
  /** Alertas abiertas visibles para el rol (ADR 0012), las no vistas primero. */
  alertas: {
    id: string;
    severidad: 'info' | 'warn' | 'bad';
    titulo: string;
    mensaje: string | null;
    ruta: string | null;
    detectadaEn: string;
    vista: boolean;
  }[];
}
export const OrgContext = createContext<OrgCtx | null>(null);
export function useOrg() {
  const c = useContext(OrgContext);
  if (!c) throw new Error('useOrg fuera de OrgContext');
  return c;
}
/** Permisos en la UI (el servidor vuelve a verificar siempre). */
export function useCan() {
  const c = useOrg();
  return (moduleId: string, action: Action = 'v') => canRole(c.role, moduleId, action, c.customRoles, c.acceso);
}

export type TemporadaCtx = OrgCtx['temporadas'][number];

/**
 * Temporada que muestra la página (ADR 0011): la de `?t=` si existe en la viña; si no, la actual. Las listas de
 * viñedo y bodega filtran por su `id`; las comerciales por `inicio`–`fin`. null si la viña no tiene temporadas.
 */
export function useTemporadaElegida(): TemporadaCtx | null {
  const { temporadas, temporadaActual } = useOrg();
  const t = Number(useSearchParams().get('t'));
  return temporadas.find((x) => x.anio === t) ?? temporadas.find((x) => x.anio === temporadaActual) ?? temporadas.at(-1) ?? null;
}

/**
 * Temporada que corresponde a una fecha, para proponerla en un formulario. Devuelve también un mensaje si no hay
 * ninguna o si está cerrada (el servidor lo vuelve a verificar al sincronizar).
 */
export function useTemporadaParaFecha() {
  const { temporadas } = useOrg();
  return (fecha: string = fechaHoy()): { temporada: TemporadaCtx | null; error: string | null } => {
    const t = temporadaDeFecha(temporadas, fecha) ?? null;
    if (!t) return { temporada: null, error: 'No hay una temporada que incluya esa fecha. Créala en Configuración › Temporadas.' };
    if (t.estado === 'cerrada') return { temporada: t, error: `La temporada ${t.anio} está cerrada: no se pueden agregar registros.` };
    return { temporada: t, error: null };
  };
}
