import { configVigente, costoLitroLoteDb, schema, withOrg } from '@winzer/db';
import { and, asc, isNull, sql } from 'drizzle-orm';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page';
import { orgWith } from '@/lib/session';
import { EnvasadoView, type DatosEnvasado, type FormatoFila, type OrdenFila } from './view';

export const metadata = { title: 'Envasado y etiquetado' };

/**
 * Módulo ONLINE: órdenes de envasado, formatos y validador de etiqueta. El servidor entrega lo necesario para el
 * costo en vivo (costo por litro de cada lote en estanque, precios y stock de materiales); al confirmar se recalcula
 * y se congela en el servidor.
 */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { allowed, fueraDePlan, actor, org: vina } = await orgWith(org, 'envasado');
  if (!allowed) return <NoAccess modulo="envasado y etiquetado" plan={fueraDePlan} />;
  const { formato, ordenEnvasado, etiqueta, insumo, lote, estanque } = schema;
  const datos = await withOrg(actor.orgId, async (tx) => {
    const [formatos, ordenes, etiquetas, insumos, stockProd, enEstanque, lotes, estanques, cfg] = await Promise.all([
      tx.select().from(formato).where(isNull(formato.deletedAt)).orderBy(asc(formato.litros)),
      tx.select().from(ordenEnvasado).where(isNull(ordenEnvasado.deletedAt)),
      tx.select().from(etiqueta).where(isNull(etiqueta.deletedAt)),
      tx.execute<{ insumo_id: string; nombre: string; unidad: string; precio: string; stock: string }>(
        sql`select insumo_id, nombre, unidad, precio, stock from v_stock_insumo`
      ),
      tx.execute<{ orden_envasado_id: string; formato_id: string; stock: string }>(sql`select orden_envasado_id, formato_id, stock from v_stock_producto`),
      tx.execute<{ estanque_id: string; lote_id: string; litros: string }>(sql`select estanque_id, lote_id, litros from v_stock_estanque`),
      tx.select({ id: lote.id, codigo: lote.codigo, variedad: lote.variedad, tipo: lote.tipo }).from(lote).where(isNull(lote.deletedAt)),
      tx.select({ id: estanque.id, codigo: estanque.codigo }).from(estanque).where(isNull(estanque.deletedAt)),
      configVigente(tx)
    ]);
    const tipos = new Map(
      (
        await tx
          .select({ id: insumo.id, tipo: insumo.tipo, categoria: insumo.categoria })
          .from(insumo)
          .where(and(isNull(insumo.deletedAt), sql`${insumo.categoria} in ('envasado', 'etiquetado')`))
      ).map((i) => [i.id, i])
    );
    const lotesEnEstanque = [...new Set(enEstanque.map((e) => e.lote_id))];
    const costoLitro = Object.fromEntries(await Promise.all(lotesEnEstanque.map(async (id) => [id, (await costoLitroLoteDb(tx, id)).costoLitro] as const)));
    // Botellas producidas por etiqueta (órdenes confirmadas): base del prorrateo del diseño.
    const producidas: Record<string, number> = {};
    for (const o of ordenes) if (o.estado === 'confirmada' && o.etiquetaId) producidas[o.etiquetaId] = (producidas[o.etiquetaId] ?? 0) + o.unidades;
    return {
      formatos,
      ordenes,
      etiquetas,
      insumos,
      tipos,
      stockProd,
      enEstanque,
      lotes,
      estanques,
      costoLitro,
      producidas,
      mermaMax: cfg.enologia.mermaEnvasadoMax
    };
  });
  const stockOrden = new Map(datos.stockProd.map((s) => [s.orden_envasado_id, Number(s.stock)]));
  const stockFormato = new Map<string, number>();
  for (const s of datos.stockProd) stockFormato.set(s.formato_id, (stockFormato.get(s.formato_id) ?? 0) + Number(s.stock));
  const formatos: FormatoFila[] = datos.formatos.map((f) => ({
    id: f.id,
    version: f.version,
    nombre: f.nombre,
    litros: Number(f.litros),
    envase: f.envase,
    unidadesCaja: f.unidadesCaja,
    stockMinimo: f.stockMinimo,
    stock: stockFormato.get(f.id) ?? 0
  }));
  const ordenes: OrdenFila[] = datos.ordenes.map((o) => ({
    id: o.id,
    version: o.version,
    codigo: o.codigo,
    fecha: o.fecha,
    estanqueId: o.estanqueId,
    loteId: o.loteId,
    formatoId: o.formatoId,
    unidades: o.unidades,
    mermaPct: Number(o.mermaPct),
    responsable: o.responsable,
    envaseId: o.envaseId,
    cierreId: o.cierreId,
    capsulaId: o.capsulaId,
    cajaId: o.cajaId,
    etiquetaId: o.etiquetaId,
    etiquetaInsumoId: o.etiquetaInsumoId,
    manoObra: o.manoObra,
    energiaAgua: o.energiaAgua,
    graduacion: o.graduacion == null ? null : Number(o.graduacion),
    declaraDO: o.declaraDO,
    pctUvaZona: o.pctUvaZona == null ? null : Number(o.pctUvaZona),
    certificadoDO: o.certificadoDO,
    observaciones: o.observaciones,
    estado: o.estado,
    costoUnitario: o.costoUnitario == null ? null : Number(o.costoUnitario),
    costoTotal: o.costoTotal,
    litrosConsumidos: o.litrosConsumidos == null ? null : Number(o.litrosConsumidos),
    costoPartes: (o.costoPartes as Record<string, number> | null) ?? null,
    stock: stockOrden.get(o.id) ?? 0
  }));
  const d: DatosEnvasado = {
    insumos: datos.insumos
      .filter((i) => datos.tipos.has(i.insumo_id))
      .map((i) => ({
        id: i.insumo_id,
        nombre: i.nombre,
        unidad: i.unidad,
        tipo: datos.tipos.get(i.insumo_id)!.tipo ?? '',
        precio: Number(i.precio),
        stock: Number(i.stock)
      })),
    etiquetas: datos.etiquetas.map((e) => ({
      id: e.id,
      nombre: `${e.nombre} v${e.versionDiseno}`,
      costoImpresion: Number(e.costoImpresion),
      costoDiseno: e.costoDiseno,
      costoFotografia: e.costoFotografia,
      costoIlustracion: e.costoIlustracion,
      tirajeEstimado: e.tirajeEstimado,
      producidas: datos.producidas[e.id] ?? 0,
      denominacion: e.denominacion,
      graduacion: e.graduacion == null ? null : Number(e.graduacion),
      contenido: e.contenido,
      varietal: e.varietal,
      do: e.do,
      aprobacionLegal: e.aprobacionLegal
    })),
    enEstanque: datos.enEstanque.map((e) => ({ estanqueId: e.estanque_id, loteId: e.lote_id, litros: Number(e.litros) })),
    lotes: datos.lotes,
    estanques: datos.estanques,
    costoLitro: datos.costoLitro,
    mermaMax: datos.mermaMax,
    vina: { razonSocial: vina.razonSocial ?? vina.nombre, rut: vina.rut }
  };
  return (
    <>
      <PageHeader
        area="Comercial"
        title="Envasado y etiquetado"
        description="Órdenes de envasado con su costo por botella, formatos y validación de la etiqueta. Confirmar una orden descuenta los litros de bodega y los insumos en una sola operación."
      />
      <EnvasadoView formatos={formatos} ordenes={ordenes} datos={d} />
    </>
  );
}
