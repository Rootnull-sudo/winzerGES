'use client';
import { can as canRole, type AccesoPlan, type Action, type RoleDef } from '@winzer/domain';
import { createContext, useContext } from 'react';

export interface OrgCtx {
  org: { id: string; slug: string; nombre: string };
  user: { id: string; name: string; email: string };
  role: string;
  roleName: string;
  customRoles: RoleDef[];
  /** Temporadas de la viña (ADR 0011) y el año de la actual (derivado de la fecha de hoy en el servidor). */
  temporadas: { anio: number; inicio: string; fin: string; estado: 'abierta' | 'cerrada' }[];
  temporadaActual: number | null;
  /** Plan y estado de la suscripción de la viña (F0-7). */
  acceso: AccesoPlan;
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
