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
  },
  {
    // Litros por estanque y lote (v1: inventory.lotesEnEstanque); solo lo que supera 0,5 L.
    nombre: 'v_stock_estanque',
    sql: `select m.org_id, m.estanque_id, m.lote_id, sum(m.litros) as litros
          from mov_bodega m
          where m.deleted_at is null
          group by m.org_id, m.estanque_id, m.lote_id
          having sum(m.litros) > 0.5`
  },
  {
    // Ocupación por estanque (v1: inventory.ocupacion / estadoEstanque).
    nombre: 'v_ocupacion',
    sql: `select e.org_id, e.id as estanque_id, e.codigo, e.capacidad, e.estado,
            coalesce(sum(m.litros), 0) as litros,
            case when e.capacidad > 0 then coalesce(sum(m.litros), 0) / e.capacidad else 0 end as pct
          from estanque e
          left join mov_bodega m on m.estanque_id = e.id and m.deleted_at is null
          where e.deleted_at is null
          group by e.id`
  },
  {
    // Balance por lote (v1: inventory.balanceLote) + kg de uva cosechados y rendimiento L/kg (v2).
    nombre: 'v_balance_lote',
    sql: `select l.org_id, l.id as lote_id, l.codigo, l.temporada_id, l.tipo, l.variedad,
            coalesce(sum(m.litros) filter (where m.tipo = 'entrada'), 0) as entradas,
            -coalesce(sum(m.litros) filter (where m.tipo = 'envasado'), 0) as envasado,
            -coalesce(sum(m.litros) filter (where m.tipo = 'venta_granel'), 0) as venta_granel,
            -coalesce(sum(m.litros) filter (where m.tipo = 'merma'), 0) as merma,
            -coalesce(sum(m.litros) filter (where m.tipo = 'vinagre'), 0) as vinagre,
            coalesce(sum(m.litros) filter (where m.tipo = 'ajuste'), 0) as ajustes,
            coalesce(sum(m.litros), 0) as stock,
            (select coalesce(sum(c.kg), 0) from cosecha c where c.lote_id = l.id and c.deleted_at is null) as kg_uva
          from lote l
          left join mov_bodega m on m.lote_id = l.id and m.deleted_at is null
          where l.deleted_at is null
          group by l.id`
  },
  {
    // Cuentas por pagar (F3): saldo = total − notas de crédito que lo referencian − pagos aplicados. Solo documentos
    // que generan deuda (la guía no; la NC resta en su referencia) y gastos a crédito (vencen en su fecha). Estado y días al vencimiento se calculan en el dominio.
    nombre: 'v_por_pagar',
    sql: `select c.org_id, 'compra'::text as origen, c.id as documento_id, c.proveedor_id, c.documento, c.folio, c.fecha,
            c.vencimiento, c.total, nc.total as notas_credito, ap.total as aplicado, c.total - nc.total - ap.total as saldo
          from compra c
          cross join lateral (
            select coalesce(sum(x.total), 0)::numeric as total from compra x
            where x.referencia_compra_id = c.id and x.documento = 'nota_credito' and x.estado = 'registrada' and x.deleted_at is null
          ) nc
          cross join lateral (
            select coalesce(sum(a.monto), 0)::numeric as total from pago_aplicacion a
            where a.compra_id = c.id and a.deleted_at is null
          ) ap
          where c.deleted_at is null and c.estado = 'registrada' and c.documento in ('factura', 'factura_exenta', 'boleta')
          union all
          select g.org_id, 'gasto'::text, g.id, g.proveedor_id, g.documento, g.folio, g.fecha, g.fecha, g.total, 0::numeric, ap.total,
            g.total - ap.total
          from gasto g
          cross join lateral (
            select coalesce(sum(a.monto), 0)::numeric as total from pago_aplicacion a
            where a.gasto_id = g.id and a.deleted_at is null
          ) ap
          where g.deleted_at is null and g.estado = 'pendiente'`
  },
  {
    // Producto terminado (F5-2): unidades por orden de envasado según el libro mov_producto, valorizadas al costo
    // unitario congelado de la orden (v1: inventory.stockOrden / valorProductoTerminado).
    nombre: 'v_stock_producto',
    sql: `select o.org_id, o.id as orden_envasado_id, o.codigo, o.formato_id, o.lote_id, o.fecha, o.unidades as producidas,
            o.costo_unitario, coalesce(sum(m.unidades), 0) as stock,
            coalesce(sum(m.unidades), 0) * coalesce(o.costo_unitario, 0) as valor
          from orden_envasado o
          left join mov_producto m on m.orden_envasado_id = o.id and m.deleted_at is null
          where o.deleted_at is null and o.estado = 'confirmada'
          group by o.id`
  }
];
