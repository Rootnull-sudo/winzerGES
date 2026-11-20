/**
 * Planes y acceso por suscripción (ADR 0014, F0-7). Sin cobro real todavía: los planes se asignan a mano
 * (`npm run plan`). El acceso efectivo de un usuario = permisos de su rol ∩ módulos del plan, y sin escritura
 * si la suscripción quedó en solo lectura.
 */
import { MODULES } from './modules';

export type PlanId = 'piloto' | 'esencial' | 'completo';
export type EstadoSuscripcion = 'prueba' | 'activa' | 'morosa' | 'cancelada';

export interface PlanDef {
  id: PlanId;
  nombre: string;
  descripcion: string;
  /** null = todos los módulos. */
  modulos: readonly string[] | null;
  maxUsuarios: number;
  maxGb: number;
  /** Precio mensual en CLP; null = por definir (aún no hay cobro). */
  precioClp: number | null;
}

/** Módulos que toda viña tiene, sea cual sea el plan. */
export const MODULOS_BASE = ['dashboard', 'usuarios', 'configuracion', 'ayuda'] as const;

const deAreas = (...areas: string[]) => MODULES.filter((m) => areas.includes(m.area)).map((m) => m.id);

/** Límites y precios provisorios: se fijan al definir la oferta comercial (ADR 0014). */
export const PLANES: Record<PlanId, PlanDef> = {
  piloto: {
    id: 'piloto',
    nombre: 'Piloto',
    descripcion: 'Todo incluido, sin costo, para viñas que prueban Winzer con nosotros.',
    modulos: null,
    maxUsuarios: 10,
    maxGb: 5,
    precioClp: 0
  },
  esencial: {
    id: 'esencial',
    nombre: 'Esencial',
    descripcion: 'Viñedo, bodega y comercial.',
    modulos: deAreas('operacion', 'bodega', 'comercial'),
    maxUsuarios: 5,
    maxGb: 5,
    precioClp: null
  },
  completo: {
    id: 'completo',
    nombre: 'Completo',
    descripcion: 'Todo Winzer: además finanzas, tributario y conciliación.',
    modulos: null,
    maxUsuarios: 15,
    maxGb: 20,
    precioClp: null
  }
};

/** Días de prueba al crear una viña y de gracia después de vencer el periodo. */
export const DIAS_PRUEBA = 30;
export const DIAS_GRACIA = 15;

export interface Suscripcion {
  planId: string;
  estado: EstadoSuscripcion | string;
  periodoInicio: string;
  /** Fin del periodo pagado o de la prueba (null = sin vencimiento, p. ej. piloto). */
  periodoFin: string | null;
}

export interface AccesoPlan {
  planId: PlanId;
  planNombre: string;
  estado: EstadoSuscripcion;
  /** null = todos los módulos. */
  modulos: readonly string[] | null;
  maxUsuarios: number;
  maxGb: number;
  /** Solo ver y exportar: la suscripción venció hace más de DIAS_GRACIA días o está cancelada. Nunca se borran datos. */
  soloLectura: boolean;
  /** Días que quedan del periodo (null si no vence). Negativo = vencido. */
  diasRestantes: number | null;
  /** Mensaje para la franja superior, o null si no hay nada que avisar. */
  aviso: string | null;
}

const dias = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

/** Acceso efectivo de la viña en `hoy`. Sin suscripción registrada = piloto activo (viñas creadas antes de F0-7). */
export function accesoDe(s: Suscripcion | null | undefined, hoy: string): AccesoPlan {
  const plan = PLANES[(s?.planId as PlanId) ?? 'piloto'] ?? PLANES.piloto;
  const estado = (['prueba', 'activa', 'morosa', 'cancelada'].includes(String(s?.estado)) ? s!.estado : 'activa') as EstadoSuscripcion;
  const restantes = s?.periodoFin ? dias(hoy, s.periodoFin) : null;
  const vencida = restantes != null && restantes < 0;
  const soloLectura = estado === 'cancelada' || ((vencida || estado === 'morosa') && (restantes ?? 0) < -DIAS_GRACIA);
  let aviso: string | null = null;
  if (soloLectura) aviso = 'La suscripción está vencida: puedes ver y exportar tus datos, pero no modificarlos. Escríbenos para reactivarla.';
  else if (estado === 'morosa' || vencida)
    aviso = `La suscripción está vencida. Tienes ${DIAS_GRACIA + (restantes ?? 0)} días antes de que la viña quede en solo lectura.`;
  else if (estado === 'prueba' && restantes != null && restantes <= 7)
    aviso = restantes === 0 ? 'Tu prueba termina hoy.' : `Tu prueba termina en ${restantes} ${restantes === 1 ? 'día' : 'días'}.`;
  return {
    planId: plan.id,
    planNombre: plan.nombre,
    estado,
    modulos: plan.modulos,
    maxUsuarios: plan.maxUsuarios,
    maxGb: plan.maxGb,
    soloLectura,
    diasRestantes: restantes,
    aviso
  };
}

/** ¿El plan incluye el módulo? Los módulos base siempre. */
export function enPlan(acceso: Pick<AccesoPlan, 'modulos'> | null | undefined, moduleId: string): boolean {
  if (!acceso || !acceso.modulos) return true;
  return (MODULOS_BASE as readonly string[]).includes(moduleId) || acceso.modulos.includes(moduleId);
}

/** ¿El plan permite la acción? Fuera del plan, nada; en solo lectura, solo ver (v) y exportar (x). */
export function planPermite(acceso: Pick<AccesoPlan, 'modulos' | 'soloLectura'> | null | undefined, moduleId: string, action: string): boolean {
  if (!acceso) return true;
  if (!enPlan(acceso, moduleId)) return false;
  return !acceso.soloLectura || action === 'v' || action === 'x';
}

/** Plan más económico que incluye el módulo (para "disponible en …"). */
export function planQueIncluye(moduleId: string): PlanDef {
  return (['esencial', 'completo'] as const).map((id) => PLANES[id]).find((p) => enPlan(p, moduleId)) ?? PLANES.completo;
}

/** Suscripción inicial de una viña nueva: prueba del plan completo por DIAS_PRUEBA días. */
export function suscripcionInicial(hoy: string): Suscripcion {
  const fin = new Date(Date.parse(`${hoy}T00:00:00Z`) + DIAS_PRUEBA * 86_400_000).toISOString().slice(0, 10);
  return { planId: 'completo', estado: 'prueba', periodoInicio: hoy, periodoFin: fin };
}
