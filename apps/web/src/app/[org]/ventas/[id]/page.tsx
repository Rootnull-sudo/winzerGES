import { schema, withOrg } from '@winzer/db';
import { clp, DOCUMENTOS_VENTA } from '@winzer/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/no-access';
import { orgWith } from '@/lib/session';
import { Imprimir } from '../../administracion/liquidacion/[id]/imprimir';

export const metadata = { title: 'Documento de venta' };
const DOC = Object.fromEntries(DOCUMENTOS_VENTA) as Record<string, string>;
const fechaLarga = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

/** Documento imprimible de una venta (borrador para revisar o confirmada). No reemplaza al DTE electrónico (F6). */
export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org: slug, id } = await params;
  const { allowed, fueraDePlan, actor, org } = await orgWith(slug, 'ventas');
  if (!allowed) return <NoAccess modulo="ventas" plan={fueraDePlan} />;
  const { venta, ventaLinea, cliente, ordenEnvasado, formato, lote } = schema;
  const r = await withOrg(actor.orgId, async (tx) => {
    const [v] = await tx
      .select()
      .from(venta)
      .where(and(eq(venta.id, id), isNull(venta.deletedAt)));
    if (!v) return null;
    const [c] = await tx.select().from(cliente).where(eq(cliente.id, v.clienteId));
    const lineas = await tx
      .select({ l: ventaLinea, formato: formato.nombre, variedad: lote.variedad, loteCodigo: lote.codigo, orden: ordenEnvasado.codigo })
      .from(ventaLinea)
      .leftJoin(ordenEnvasado, eq(ordenEnvasado.id, ventaLinea.ordenEnvasadoId))
      .leftJoin(formato, eq(formato.id, ventaLinea.formatoId))
      .leftJoin(lote, eq(lote.id, ventaLinea.loteId))
      .where(and(eq(ventaLinea.ventaId, id), isNull(ventaLinea.deletedAt)));
    return { v, c, lineas };
  });
  if (!r) notFound();
  const { v, c, lineas } = r;
  const titulo = v.estado === 'borrador' ? 'Borrador de venta' : `${DOC[v.documento] ?? v.documento}${v.dteFolio ? ` N° ${v.dteFolio}` : ''}`;
  return (
    <article className="mx-auto max-w-3xl rounded-card border border-rule bg-raised p-8 text-[14px] print:max-w-none print:border-0 print:p-0">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/${slug}/ventas`} className="inline-flex items-center gap-1.5 text-[14px] text-ink-2 hover:text-ink">
          <ArrowLeft size={16} /> Ventas
        </Link>
        <Imprimir />
      </div>
      <header className="mb-6 flex flex-wrap justify-between gap-4 border-b border-rule pb-4">
        <div>
          <p className="font-label text-[26px] leading-tight">{titulo}</p>
          <p className="text-ink-2">
            {v.codigo ?? 'Sin código'} · {fechaLarga(v.fecha)}
            {v.estado === 'anulada' && ` · ANULADA${v.ncFolio ? ` (nota de crédito N° ${v.ncFolio})` : ''}`}
          </p>
        </div>
        <div className="text-right text-[13px] text-ink-2">
          <p className="font-semibold text-ink">{org.razonSocial ?? org.nombre}</p>
          {org.rut && <p>RUT {org.rut}</p>}
        </div>
      </header>
      <section aria-label="Cliente" className="mb-6 grid gap-x-8 gap-y-1 text-[13px] sm:grid-cols-2">
        <p>
          <span className="text-ink-3">Cliente:</span> <b>{c?.nombre}</b>
        </p>
        <p>
          <span className="text-ink-3">RUT:</span> {c?.rut}
        </p>
        {c?.giro && (
          <p>
            <span className="text-ink-3">Giro:</span> {c.giro}
          </p>
        )}
        {v.vencimiento && (
          <p>
            <span className="text-ink-3">Vencimiento:</span> {fechaLarga(v.vencimiento)}
          </p>
        )}
      </section>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-rule-strong text-left text-ink-3">
            <th className="py-1.5 font-semibold">Detalle</th>
            <th className="py-1.5 text-right font-semibold">Cantidad</th>
            <th className="py-1.5 text-right font-semibold">Precio</th>
            <th className="py-1.5 text-right font-semibold">Monto</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map(({ l, formato: fmt, variedad, loteCodigo, orden }) => (
            <tr key={l.id} className="border-b border-rule">
              <td className="py-1.5">
                {l.tipo === 'granel'
                  ? `Vino a granel ${variedad ?? ''} (lote ${loteCodigo ?? ''})`
                  : `${variedad ?? 'Vino'} ${fmt ?? ''}${orden ? ` · ${orden}` : ''}`}
                {l.descripcion && <span className="block text-ink-3">{l.descripcion}</span>}
              </td>
              <td className="py-1.5 text-right tabular">
                {Number(l.cantidad).toLocaleString('es-CL')} {l.tipo === 'granel' ? 'L' : 'un'}
              </td>
              <td className="py-1.5 text-right tabular">{clp(Number(l.precio))}</td>
              <td className="py-1.5 text-right tabular">{clp(Math.round(Number(l.cantidad) * Number(l.precio)))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="mt-4 ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[14px]">
        <dt className="text-ink-3">Neto</dt>
        <dd className="text-right tabular">{clp(v.neto)}</dd>
        <dt className="text-ink-3">IVA</dt>
        <dd className="text-right tabular">{clp(v.iva)}</dd>
        {v.ila > 0 && (
          <>
            <dt className="text-ink-3">ILA</dt>
            <dd className="text-right tabular">{clp(v.ila)}</dd>
          </>
        )}
        <dt className="font-bold">Total</dt>
        <dd className="text-right text-[18px] font-bold tabular">{clp(v.total)}</dd>
      </dl>
      <p className="mt-8 text-[12px] text-ink-3">Documento de apoyo a la gestión. El documento tributario electrónico lo emite el módulo DTE.</p>
    </article>
  );
}
