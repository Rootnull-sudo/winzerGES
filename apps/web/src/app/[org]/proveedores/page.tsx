import { configVigente, schema, withOrg } from '@winzer/db';
import { asc, isNull, sql } from 'drizzle-orm';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page';
import { orgWith } from '@/lib/session';
import type { CompraRow, DocPorPagar, InsumoOpt, PagoRow, PrecioRow } from './comun';
import { ProveedoresView } from './view';

export const metadata = { title: 'Proveedores y compras' };

/** Módulo ONLINE: lee de Postgres en el servidor (saldos desde v_por_pagar) y escribe con Server Actions. */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { allowed, fueraDePlan, actor } = await orgWith(org, 'proveedores');
  if (!allowed) return <NoAccess modulo="proveedores y compras" plan={fueraDePlan} />;
  const { proveedor, compra, compraLinea, insumoPrecio, pago, pagoAplicacion } = schema;
  const [proveedores, compras, lineas, saldos, insumos, precios, cfg, pagos, aplicaciones] = await withOrg(actor.orgId, (tx) =>
    Promise.all([
      tx.select().from(proveedor).where(isNull(proveedor.deletedAt)).orderBy(asc(proveedor.nombre)),
      tx.select().from(compra).where(isNull(compra.deletedAt)),
      tx.select().from(compraLinea).where(isNull(compraLinea.deletedAt)),
      tx.execute<{
        origen: 'compra' | 'gasto';
        documento_id: string;
        proveedor_id: string | null;
        documento: string;
        folio: string | null;
        fecha: string;
        vencimiento: string | null;
        total: string;
        saldo: string;
        notas_credito: string;
      }>(sql`select origen, documento_id, proveedor_id, documento, folio, fecha, vencimiento, total, saldo, notas_credito from v_por_pagar`),
      tx.execute<{ insumo_id: string; nombre: string; unidad: string; precio: string; stock: string }>(
        sql`select insumo_id, nombre, unidad, precio, stock from v_stock_insumo order by nombre`
      ),
      tx
        .select({
          insumoId: insumoPrecio.insumoId,
          fecha: insumoPrecio.fecha,
          precio: insumoPrecio.precio,
          origen: insumoPrecio.origen,
          proveedorId: insumoPrecio.proveedorId
        })
        .from(insumoPrecio)
        .where(isNull(insumoPrecio.deletedAt))
        .orderBy(asc(insumoPrecio.fecha)),
      configVigente(tx),
      tx.select().from(pago).where(isNull(pago.deletedAt)),
      tx.select().from(pagoAplicacion).where(isNull(pagoAplicacion.deletedAt))
    ])
  );
  const saldo = new Map(saldos.map((s) => [s.documento_id, s]));
  const filas: CompraRow[] = compras.map((c) => ({
    id: c.id,
    version: c.version,
    fecha: c.fecha,
    proveedorId: c.proveedorId,
    documento: c.documento,
    folio: c.folio,
    referenciaCompraId: c.referenciaCompraId,
    vencimiento: c.vencimiento,
    estado: c.estado,
    neto: c.neto,
    exento: c.exento,
    iva: c.iva,
    total: c.total,
    observaciones: c.observaciones,
    saldo: saldo.has(c.id) ? Number(saldo.get(c.id)!.saldo) : null,
    notasCredito: saldo.has(c.id) ? Number(saldo.get(c.id)!.notas_credito) : 0,
    lineas: lineas
      .filter((l) => l.compraId === c.id)
      .map((l) => ({
        id: l.id,
        insumoId: l.insumoId,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        exenta: l.exenta,
        neto: l.neto
      }))
  }));
  const ins: InsumoOpt[] = insumos.map((i) => ({ id: i.insumo_id, nombre: i.nombre, unidad: i.unidad, precio: Number(i.precio), stock: Number(i.stock) }));
  const prs: PrecioRow[] = precios.map((p) => ({ ...p, precio: Number(p.precio) }));
  const docs: DocPorPagar[] = saldos.map((d) => ({
    origen: d.origen,
    id: d.documento_id,
    proveedorId: d.proveedor_id,
    documento: d.documento,
    folio: d.folio,
    fecha: d.fecha,
    vencimiento: d.vencimiento,
    total: Number(d.total),
    saldo: Number(d.saldo)
  }));
  const pgs: PagoRow[] = pagos.map((p) => ({
    id: p.id,
    fecha: p.fecha,
    proveedorId: p.proveedorId,
    monto: p.monto,
    medio: p.medio,
    referencia: p.referencia,
    observaciones: p.observaciones,
    aplicaciones: aplicaciones.filter((a) => a.pagoId === p.id).map((a) => ({ compraId: a.compraId, gastoId: a.gastoId, monto: a.monto }))
  }));
  return (
    <>
      <PageHeader
        area="Finanzas"
        title="Proveedores y compras"
        description="Compras con sus líneas, cuentas por pagar, pagos y evolución de precios. Cada compra suma el stock del insumo y actualiza su precio."
      />
      <ProveedoresView
        proveedores={proveedores.map((p) => ({
          id: p.id,
          version: p.version,
          demo: p.demo,
          nombre: p.nombre,
          rut: p.rut,
          categoria: p.categoria,
          contacto: p.contacto,
          email: p.email,
          telefono: p.telefono,
          condiciones: p.condiciones,
          plazo: p.plazo
        }))}
        compras={filas}
        insumos={ins}
        precios={prs}
        tasaIVA={cfg.tributario.tasaIVA}
        porPagar={docs}
        pagos={pgs}
      />
    </>
  );
}
