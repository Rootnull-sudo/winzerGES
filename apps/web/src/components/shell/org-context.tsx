'use client';
import { can as canRole, type Action, type RoleDef } from '@winzer/domain';
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
  return (moduleId: string, action: Action = 'v') => canRole(c.role, moduleId, action, c.customRoles);
}
