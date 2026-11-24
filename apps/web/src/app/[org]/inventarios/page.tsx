import { costoLitroLoteDb, schema, withOrg } from '@winzer/db';
import { can } from '@winzer/domain';
import { desc, eq, isNull, sql } from 'drizzle-orm';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page';
import { orgWith } from '@/lib/session';
import { InventariosView, type DatosInventario } from './view';

export const metadata = { title: 'Inventarios' };

/**
 * Módulo ONLINE (F5-5): existencias derivadas de los libros (mov_producto, mov_bodega, mov_insumo). Los costos y
 * valores solo viajan al cliente si el rol puede ver costos.
 */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { allowed, fueraDePlan, actor } = await orgWith(org, 'inventarios');
  if (!allowed) return <NoAccess modulo="inventarios" plan={fueraDePlan} />;
  const verCostos = can(actor.role, 'costos', 'v', actor.customRoles, actor.acceso);
  const { formato, lote, estanque, temporada, insumo, movProducto, ordenEnvasado } = schema;
  const d = await withOrg(actor.orgId, async (tx) => {
    const [stockProd, formatos, lotes, estanques, enEstanque, insumos, movs] = await Promise.all([
      tx.execute<{
        orden_envasado_id: string;
        codigo: string | null;
        formato_id: string;
        lote_id: string | null;
        fecha: string;
        producidas: number;
        costo_unitario: string | null;
        stock: string;
      }>(sql`select orden_envasado_id, codigo, formato_id, lote_id, fecha, producidas, costo_unitario, stock from v_stock_producto`),
      tx
        .select({ id: formato.id, nombre: formato.nombre, stockMinimo: formato.stockMinimo, litros: formato.litros })
        .from(formato)
        .where(isNull(formato.deletedAt)),
      tx
        .select({ id: lote.id, codigo: lote.codigo, variedad: lote.variedad, tipo: lote.tipo, anio: temporada.anio })
        .from(lote)
        .leftJoin(temporada, eq(temporada.id, lote.temporadaId))
        .where(isNull(lote.deletedAt)),
      tx.select({ id: estanque.id, codigo: estanque.codigo }).from(estanque).where(isNull(estanque.deletedAt)),
      tx.execute<{ estanque_id: string; lote_id: string; litros: string }>(sql`select estanque_id, lote_id, litros from v_stock_estanque`),
      tx
        .select({
          id: insumo.id,
          nombre: insumo.nombre,
          tipo: insumo.tipo,
          categoria: insumo.categoria,
          unidad: insumo.unidad,
          vencimiento: insumo.vencimiento,
          stockMinimo: insumo.stockMinimo,
          precio: insumo.precio,
          stock: sql<string>`(select stock from v_stock_insumo v where v.insumo_id = ${insumo.id})`
        })
        .from(insumo)
        .where(isNull(insumo.deletedAt)),
      tx
        .select({
          id: movProducto.id,
          fecha: movProducto.fecha,
          ordenEnvasadoId: movProducto.ordenEnvasadoId,
          codigo: ordenEnvasado.codigo,
          formatoId: movProducto.formatoId,
          unidades: movProducto.unidades,
          tipo: movProducto.tipo,
          motivo: movProducto.motivo
        })
        .from(movProducto)
        .innerJoin(ordenEnvasado, eq(ordenEnvasado.id, movProducto.ordenEnvasadoId))
        .where(isNull(movProducto.deletedAt))
        .orderBy(desc(movProducto.fecha), desc(movProducto.createdAt))
        .limit(1000)
    ]);
    const lotesEnEstanque = [...new Set(enEstanque.map((e) => e.lote_id))];
    const costoLitro = verCostos
      ? Object.fromEntries(await Promise.all(lotesEnEstanque.map(async (id) => [id, (await costoLitroLoteDb(tx, id)).costoLitro] as const)))
      : {};
    return { stockProd, formatos, lotes, estanques, enEstanque, insumos, movs, costoLitro };
  });

  const lotes = new Map(d.lotes.map((l) => [l.id, l]));
  const est = new Map(d.estanques.map((e) => [e.id, e.codigo]));
  const datos: DatosInventario = {
    verCostos,
    formatos: d.formatos.map((f) => ({ id: f.id, nombre: f.nombre, stockMinimo: f.stockMinimo ?? 0 })),
    producto: d.stockProd.map((s) => ({
      id: s.orden_envasado_id,
      codigo: s.codigo,
      formatoId: s.formato_id,
      lote: s.lote_id ? (lotes.get(s.lote_id)?.codigo ?? null) : null,
      variedad: s.lote_id ? (lotes.get(s.lote_id)?.variedad ?? null) : null,
      anada: s.lote_id ? (lotes.get(s.lote_id)?.anio ?? null) : null,
      fecha: s.fecha,
      producidas: Number(s.producidas),
      stock: Number(s.stock),
      costoUnitario: verCostos && s.costo_unitario != null ? Number(s.costo_unitario) : null
    })),
    granel: d.enEstanque.map((e) => {
      const l = lotes.get(e.lote_id);
      const cl = verCostos ? (d.costoLitro[e.lote_id] ?? 0) : null;
      return {
        id: `${e.estanque_id}|${e.lote_id}`,
        estanque: est.get(e.estanque_id) ?? '—',
        lote: l?.codigo ?? '—',
        variedad: l?.variedad ?? null,
        tipo: l?.tipo ?? null,
        anada: l?.anio ?? null,
        litros: Number(e.litros),
        costoLitro: cl
      };
    }),
    insumos: d.insumos.map((i) => ({
      id: i.id,
      nombre: i.nombre,
      tipo: i.tipo,
      categoria: i.categoria,
      unidad: i.unidad,
      vencimiento: i.vencimiento,
      minimo: i.stockMinimo == null ? null : Number(i.stockMinimo),
      stock: Number(i.stock ?? 0),
      precio: verCostos ? Number(i.precio ?? 0) : null
    })),
    movimientos: d.movs.map((m) => ({ ...m, motivo: m.motivo ?? null }))
  };
  return (
    <>
      <PageHeader
        area="Comercial"
        title="Inventarios"
        description="Existencias calculadas desde los movimientos: envasado, ventas, compras y consumos. Para corregir una diferencia, registra un ajuste."
      />
      <InventariosView datos={datos} />
    </>
  );
}
