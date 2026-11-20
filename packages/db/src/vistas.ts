/**
 * Vistas SQL de derivados (ADR 0010): stocks y saldos se calculan, no se guardan. `ensure.ts` las crea con
 * `security_invoker = true`, así heredan el RLS de las tablas que leen (cada viña ve solo lo suyo).
 * Una vista por módulo, agregada en el mismo PR que sus tablas. Su test vive con el del módulo.
 */
export interface Vista {
  nombre: string;
  /** El SELECT de la vista (sin `create view`). */
  sql: string;
}

export const VISTAS: Vista[] = [];
