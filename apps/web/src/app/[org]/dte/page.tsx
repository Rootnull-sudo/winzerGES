import { emisorDe, schema, withOrg } from '@winzer/db';
import { desc, inArray, isNull } from 'drizzle-orm';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page';
import { orgWith } from '@/lib/session';
import { DteView, type DatosDte } from './view';

export const metadata = { title: 'DTE (SII)' };

/**
 * Módulo ONLINE (F6-1): documentos emitidos y recibidos, libros, folios y emisor. Los DTE los generan las ventas,
 * compras y gastos; aquí se cambian estados, se emiten notas y se descargan los XML.
 */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { allowed, fueraDePlan, actor } = await orgWith(org, 'dte');
  if (!allowed) return <NoAccess modulo="DTE" plan={fueraDePlan} />;
  const { dte, dteLinea, caf } = schema;
  const d = await withOrg(actor.orgId, async (tx) => {
    const docs = await tx.select().from(dte).where(isNull(dte.deletedAt)).orderBy(desc(dte.fecha), desc(dte.createdAt)).limit(3000);
    const ids = docs.map((x) => x.id);
    const [lineas, cafs, emisor] = await Promise.all([
      ids.length
        ? tx
            .select()
            .from(dteLinea)
            .where(inArray(dteLinea.dteId, ids))
            .then((ls) => ls.filter((l) => !l.deletedAt))
        : Promise.resolve([]),
      tx.select().from(caf).where(isNull(caf.deletedAt)).orderBy(caf.tipo, caf.desde),
      emisorDe(tx)
    ]);
    return { docs, lineas, cafs, emisor };
  });
  const datos: DatosDte = {
    documentos: d.docs.map((x) => ({
      id: x.id,
      direccion: x.direccion,
      tipo: x.tipo,
      folio: x.folio,
      fecha: x.fecha,
      estado: x.estado,
      fechasEstado: x.fechasEstado,
      contraparteRut: x.contraparteRut,
      contraparte: x.contraparte,
      neto: x.neto,
      exento: x.exento,
      iva: x.iva,
      ila: x.ila,
      total: x.total,
      vencimiento: x.vencimiento,
      referencia: x.referencia ?? null,
      dteRefId: x.dteRefId,
      origen: x.ventaId ? 'venta' : x.compraId ? 'compra' : x.gastoId ? 'gasto' : null
    })),
    lineas: d.lineas.map((l) => ({
      dteId: l.dteId,
      nombre: l.nombre,
      cantidad: Number(l.cantidad),
      unidad: l.unidad,
      precio: Number(l.precio),
      monto: l.monto
    })),
    cafs: d.cafs.map((c) => ({ id: c.id, tipo: c.tipo, desde: c.desde, hasta: c.hasta, fechaAutorizacion: c.fechaAutorizacion, vence: c.vence })),
    emisor: { ...d.emisor, resolucionFecha: d.emisor.resolucionFecha ?? null, certificadoVence: d.emisor.certificadoVence ?? null }
  };
  return (
    <>
      <PageHeader
        area="Tributario"
        title="DTE (SII)"
        description="Documentos tributarios emitidos y recibidos, libros de compras y ventas, folios autorizados y datos del emisor. El XML se descarga para enviarlo por tu proveedor de facturación autorizado."
      />
      <DteView datos={datos} />
    </>
  );
}
