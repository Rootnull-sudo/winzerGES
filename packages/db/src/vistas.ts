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

export const VISTAS: Vista[] = [
  {
    // Stock y valorización de cada insumo (v1: inventory.js stockInsumo / valorInventarioInsumos).
    nombre: 'v_stock_insumo',
    sql: `select i.org_id, i.id as insumo_id, i.nombre, i.unidad, i.precio, i.stock_minimo, i.vencimiento,
            coalesce(i.stock_inicial, 0) + coalesce(sum(m.cantidad), 0) as stock,
            greatest(coalesce(i.stock_inicial, 0) + coalesce(sum(m.cantidad), 0), 0) * i.precio as valor
          from insumo i
          left join mov_insumo m on m.insumo_id = i.id and m.deleted_at is null
          where i.deleted_at is null
          group by i.id`
  }
];
