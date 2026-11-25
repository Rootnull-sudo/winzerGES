/**
 * Datos del dashboard (F7-3; v1: modules/dashboard opData). Indicadores de operación por temporada (para comparar la
 * elegida con la anterior y graficar las últimas cinco), ocupación de bodega y granel por tipo de vino.
 */
import { sql } from 'drizzle-orm';
import type { Tx } from '../client';

export interface OperacionTemporada {
  temporadaId: string;
  anio: number;
  kg: number;
  litros: number;
  envasado: number;
  granelVendido: number;
  mermas: number;
  enFermentacion: number;
}

/** Kg cosechados, litros que entraron, envasados, vendidos a granel, mermas + vinagre y lotes en fermentación. */
export async function operacionPorTemporada(tx: Tx): Promise<OperacionTemporada[]> {
  const rows = await tx.execute<{
    id: string;
    anio: number;
    kg: string;
    litros: string;
    envasado: string;
    granel: string;
    mermas: string;
    fermentando: number;
  }>(sql`
    select t.id, t.anio,
      (select coalesce(sum(c.kg), 0) from cosecha c where c.temporada_id = t.id and c.deleted_at is null) as kg,
      coalesce(sum(b.entradas), 0) as litros, coalesce(sum(b.envasado), 0) as envasado,
      coalesce(sum(b.venta_granel), 0) as granel, coalesce(sum(b.merma + b.vinagre), 0) as mermas,
      (select count(*)::int from lote l where l.temporada_id = t.id and l.deleted_at is null and l.estado in ('Fermentando', 'Macerando', 'FML')) as fermentando
    from temporada t left join v_balance_lote b on b.temporada_id = t.id
    where t.deleted_at is null
    group by t.id
    order by t.anio`);
  return rows.map((r) => ({
    temporadaId: r.id,
    anio: r.anio,
    kg: Number(r.kg),
    litros: Number(r.litros),
    envasado: Number(r.envasado),
    granelVendido: Number(r.granel),
    mermas: Number(r.mermas),
    enFermentacion: r.fermentando
  }));
}

/** Ocupación por estanque y granel en stock por tipo de vino. */
export async function bodegaHoy(tx: Tx) {
  const ocup = await tx.execute<{ codigo: string; capacidad: string; litros: string; estado: string }>(
    sql`select codigo, capacidad, litros, estado from v_ocupacion order by codigo`
  );
  const granel = await tx.execute<{ tipo: string | null; litros: string }>(sql`
    select l.tipo, sum(s.litros) as litros from v_stock_estanque s join lote l on l.id = s.lote_id group by l.tipo`);
  return {
    estanques: ocup.map((e) => ({ codigo: e.codigo, capacidad: Number(e.capacidad), litros: Math.max(0, Number(e.litros)), estado: e.estado })),
    granelPorTipo: Object.fromEntries(granel.map((g) => [g.tipo ?? 'otro', Number(g.litros)])) as Record<string, number>
  };
}
