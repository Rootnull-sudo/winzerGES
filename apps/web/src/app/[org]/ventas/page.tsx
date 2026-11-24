import { configVigente, costoLitroLoteDb, schema, withOrg } from '@winzer/db';
import { asc, isNull, sql } from 'drizzle-orm';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page';
import { orgWith } from '@/lib/session';
import { VentasView, type DatosVenta, type VentaFila } from './view';

export const metadata = { title: 'Ventas' };

/** Módulo ONLINE: ventas con líneas envasadas o a granel; el servidor valida stock y congela costos al confirmar. */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { allowed, fueraDePlan, actor } = await orgWith(org, 'ventas');
  if (!allowed) return <NoAccess modulo="ventas" plan={fueraDePlan} />;
  const { venta, ventaLinea, cliente, formato, lote, estanque } = schema;
  const d = await withOrg(actor.orgId, async (tx) => {
    const [ventas, lineas, clientes, productos, granel, formatos, lotes, estanques, balance, cfg, saldos] = await Promise.all([
      tx.select().from(venta).where(isNull(venta.deletedAt)),
      tx.select().from(ventaLinea).where(isNull(ventaLinea.deletedAt)),
      tx
        .select({ id: cliente.id, nombre: cliente.nombre, tipo: cliente.tipo, canal: cliente.canal, plazo: cliente.plazo })
        .from(cliente)
        .where(isNull(cliente.deletedAt))
        .orderBy(asc(cliente.nombre)),
      tx.execute<{ orden_envasado_id: string; codigo: string; formato_id: string; lote_id: string; stock: string; costo_unitario: string | null }>(
        sql`select orden_envasado_id, codigo, formato_id, lote_id, stock, costo_unitario from v_stock_producto`
      ),
      tx.execute<{ estanque_id: string; lote_id: string; litros: string }>(sql`select estanque_id, lote_id, litros from v_stock_estanque`),
      tx.select({ id: formato.id, nombre: formato.nombre, litros: formato.litros }).from(formato).where(isNull(formato.deletedAt)),
      tx.select({ id: lote.id, codigo: lote.codigo, variedad: lote.variedad, tipo: lote.tipo }).from(lote).where(isNull(lote.deletedAt)),
      tx.select({ id: estanque.id, codigo: estanque.codigo }).from(estanque).where(isNull(estanque.deletedAt)),
      tx.execute<{ lote_id: string; codigo: string; entradas: string; envasado: string; venta_granel: string; merma: string; vinagre: string; stock: string }>(
        sql`select lote_id, codigo, entradas, envasado, venta_granel, merma, vinagre, stock from v_balance_lote where entradas > 0`
      ),
      configVigente(tx),
      tx.execute<{ venta_id: string; saldo: string }>(sql`select venta_id, saldo from v_por_cobrar`)
    ]);
    const lotesGranel = [...new Set(granel.map((g) => g.lote_id))];
    const costoLitro = Object.fromEntries(await Promise.all(lotesGranel.map(async (id) => [id, (await costoLitroLoteDb(tx, id)).costoLitro] as const)));
    return { ventas, lineas, clientes, productos, granel, formatos, lotes, estanques, balance, cfg, costoLitro, saldos };
  });
  const saldo = new Map(d.saldos.map((x) => [x.venta_id, Number(x.saldo)]));
  const filas: VentaFila[] = d.ventas.map((v) => ({
    id: v.id,
    version: v.version,
    codigo: v.codigo,
    fecha: v.fecha,
    clienteId: v.clienteId,
    canal: v.canal,
    documento: v.documento,
    generarDte: v.generarDte,
    vencimiento: v.vencimiento,
    estado: v.estado,
    neto: v.neto,
    iva: v.iva,
    ila: v.ila,
    total: v.total,
    dteTipo: v.dteTipo,
    dteFolio: v.dteFolio,
    ncFolio: v.ncFolio,
    observaciones: v.observaciones,
    saldo: saldo.get(v.id) ?? null,
    lineas: d.lineas
      .filter((l) => l.ventaId === v.id)
      .map((l) => ({
        id: l.id,
        tipo: l.tipo,
        ordenEnvasadoId: l.ordenEnvasadoId,
        estanqueId: l.estanqueId,
        loteId: l.loteId,
        formatoId: l.formatoId,
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad),
        precio: Number(l.precio),
        afectoIla: l.afectoIla,
        costoUnitario: l.costoUnitario == null ? null : Number(l.costoUnitario),
        neto: l.neto,
        litros: l.litros == null ? null : Number(l.litros)
      }))
  }));
  const datos: DatosVenta = {
    clientes: d.clientes,
    productos: d.productos.map((p) => ({
      id: p.orden_envasado_id,
      codigo: p.codigo,
      formatoId: p.formato_id,
      loteId: p.lote_id,
      stock: Number(p.stock),
      costoUnitario: Number(p.costo_unitario ?? 0)
    })),
    granel: d.granel.map((g) => ({ estanqueId: g.estanque_id, loteId: g.lote_id, litros: Number(g.litros) })),
    formatos: d.formatos.map((f) => ({ ...f, litros: Number(f.litros) })),
    lotes: d.lotes,
    estanques: d.estanques,
    costoLitro: d.costoLitro,
    tributario: d.cfg.tributario,
    balance: d.balance.map((b) => ({
      loteId: b.lote_id,
      codigo: b.codigo,
      entradas: Number(b.entradas),
      envasado: Number(b.envasado),
      granel: Number(b.venta_granel),
      merma: Number(b.merma),
      vinagre: Number(b.vinagre),
      stock: Number(b.stock)
    }))
  };
  return (
    <>
      <PageHeader
        area="Comercial"
        title="Ventas"
        description="Ventas de vino envasado y a granel con varias líneas. Al confirmar se descuenta el stock, se congela el costo y se asigna el folio del documento."
      />
      <VentasView ventas={filas} datos={datos} />
    </>
  );
}
