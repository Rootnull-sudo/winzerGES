/**
 * Roles y permisos — port de js/auth/permissions.js (v1).
 * Permisos por módulo como string de letras: v = ver, c = crear, e = editar, d = eliminar, x = exportar.
 * En v2 el rol es POR VIÑA (tabla member.role): una persona puede ser admin en su viña
 * y "administrativo" en la de un cliente. Los roles personalizados viven en la tabla `org_role`.
 */
import { MODULE_IDS } from './modules';
import { planPermite, planQueIncluye, type AccesoPlan } from './planes';

export type Action = 'v' | 'c' | 'e' | 'd' | 'x';
export type PermissionMap = Record<string, string>;
export interface RoleDef {
  id: string;
  nombre: string;
  descripcion: string;
  permisos: PermissionMap;
}

export const ACTIONS: Record<Action, string> = { v: 'Ver', c: 'Crear', e: 'Editar', d: 'Eliminar', x: 'Exportar' };
const ALL = 'vcedx';
const fill = (mods: readonly string[], p: string): PermissionMap => Object.fromEntries(mods.map((m) => [m, p]));

export const ROLES: Record<string, RoleDef> = {
  admin: { id: 'admin', nombre: 'Administrador', descripcion: 'Acceso total a la viña, usuarios y configuración.', permisos: fill(MODULE_IDS, ALL) },
  enologo: {
    id: 'enologo',
    nombre: 'Enólogo',
    descripcion: 'Vinificación, fermentación, bodega, laboratorio y envasado. Sin finanzas ni precios.',
    permisos: {
      ...fill(['vinificacion', 'fermentacion', 'bodega', 'laboratorio', 'envasado'], ALL),
      calendario: 'vcex',
      historico: 'vx',
      catastro: 'v',
      cosecha: 'v',
      insumos: 'v',
      inventarios: 'v',
      marca: 'v',
      cumplimiento: 'v',
      dashboard: 'v',
      ayuda: 'v'
    }
  },
  agronomo: {
    id: 'agronomo',
    nombre: 'Agrónomo',
    descripcion: 'Catastro, fenología, insumos, cosecha y calendario. Sin finanzas ni ventas.',
    permisos: {
      ...fill(['catastro', 'fenologia', 'insumos', 'cosecha', 'calendario'], ALL),
      laboratorio: 'v',
      historico: 'vx',
      bodega: 'v',
      cumplimiento: 'v',
      dashboard: 'v',
      ayuda: 'v'
    }
  },
  administrativo: {
    id: 'administrativo',
    nombre: 'Administrativo / Contador',
    descripcion: 'Compras, proveedores, gastos, sueldos, tributario, financiero, conciliación y DTE. Sin operación.',
    permisos: {
      ...fill(['proveedores', 'administracion', 'tributario', 'financiero', 'conciliacion', 'dte', 'costos', 'clientes', 'cumplimiento'], ALL),
      inventarios: 'vcex',
      ventas: 'vx',
      marca: 'vcex',
      dashboard: 'v',
      ayuda: 'v',
      configuracion: 'vex',
      historico: 'vx'
    }
  },
  ventas: {
    id: 'ventas',
    nombre: 'Ventas',
    descripcion: 'Clientes, ventas, inventario de producto terminado y DTE de venta. Sin costos, sueldos ni tributario.',
    permisos: { ...fill(['clientes', 'ventas'], 'vcex'), inventarios: 'v', dte: 'vcx', dashboard: 'v', ayuda: 'v' }
  },
  auditor: { id: 'auditor', nombre: 'Solo lectura / Auditor', descripcion: 'Puede ver y exportar todo, sin modificar nada.', permisos: fill(MODULE_IDS, 'vx') }
};

export const ROLE_IDS = Object.keys(ROLES);

/** ¿El rol permite la acción en el módulo? `customRoles` = roles personalizados de la viña. */
export function can(
  roleId: string | null | undefined,
  moduleId: string,
  action: Action = 'v',
  customRoles: readonly RoleDef[] = [],
  /** Acceso del plan de la viña (F0-7). Sin él solo se evalúa el rol. */
  acceso?: Pick<AccesoPlan, 'modulos' | 'soloLectura'> | null
): boolean {
  if (!roleId) return false;
  const r = ROLES[roleId] ?? customRoles.find((x) => x.id === roleId);
  if (!r) return false;
  return (r.permisos[moduleId] ?? '').includes(action) && planPermite(acceso, moduleId, action);
}

export class PermissionError extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

const VERBOS: Record<Action, string> = { v: 'ver', c: 'crear', e: 'editar', d: 'eliminar', x: 'exportar' };
export function assertCan(
  roleId: string | null | undefined,
  moduleId: string,
  action: Action,
  label: string,
  customRoles: readonly RoleDef[] = [],
  acceso?: Pick<AccesoPlan, 'modulos' | 'soloLectura'> | null
): void {
  if (!can(roleId, moduleId, action, customRoles)) {
    throw new PermissionError(`Tu rol no tiene permiso para ${VERBOS[action]} ${label}. Pide acceso a un administrador.`);
  }
  if (!planPermite(acceso, moduleId, action)) {
    throw new PermissionError(
      acceso?.soloLectura
        ? 'La viña está en solo lectura porque la suscripción venció. Puedes ver y exportar, pero no modificar.'
        : `Tu plan no incluye este módulo. Está disponible en el plan ${planQueIncluye(moduleId).nombre}.`
    );
  }
}
