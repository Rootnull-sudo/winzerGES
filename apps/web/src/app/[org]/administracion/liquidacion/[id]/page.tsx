import { schema, withOrg } from '@winzer/db';
import { clp, nombrePeriodo } from '@winzer/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/no-access';
import { orgWith } from '@/lib/session';
import type { RemuneracionFila } from '../../view';
import { Imprimir } from './imprimir';

export const metadata = { title: 'Liquidación de sueldo' };

const fechaLarga = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Liquidación de sueldo imprimible. Todo sale de la foto guardada en la remuneración (trabajador e indicadores del
 * mes): v1 mostraba los datos actuales del trabajador, así que una liquidación vieja cambiaba al editar la ficha.
 */
export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org: slug, id } = await params;
  const { allowed, fueraDePlan, actor, org } = await orgWith(slug, 'administracion');
  if (!allowed) return <NoAccess modulo="sueldos y gastos" plan={fueraDePlan} />;
  const [r] = await withOrg(actor.orgId, (tx) =>
    tx
      .select()
      .from(schema.remuneracion)
      .where(and(eq(schema.remuneracion.id, id), isNull(schema.remuneracion.deletedAt)))
  );
  if (!r) notFound();
  const t = r.trabajadorFoto as RemuneracionFila['trabajadorFoto'];
  const p = r.parametros as RemuneracionFila['parametros'];
  const linea = (l: string, v: number, fuerte = false) =>
    v || fuerte ? (
      <div className={`flex justify-between py-1 ${fuerte ? 'border-t border-rule-strong font-bold' : ''}`}>
        <span>{l}</span>
        <span className="tabular">{clp(v)}</span>
      </div>
    ) : null;
  return (
    <article className="mx-auto max-w-3xl rounded-card border border-rule bg-raised p-8 text-[14px] print:max-w-none print:border-0 print:p-0">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link
          href={`/${slug}/administracion?tab=remuneraciones&periodo=${r.periodo}`}
          className="inline-flex items-center gap-1.5 text-[14px] text-ink-2 hover:text-ink"
        >
          <ArrowLeft size={16} /> Remuneraciones de {nombrePeriodo(r.periodo)}
        </Link>
        <Imprimir />
      </div>
      <header className="mb-6 flex flex-wrap justify-between gap-4 border-b border-rule pb-4">
        <div>
          <p className="font-label text-[26px] leading-tight">Liquidación de sueldo</p>
          <p className="text-ink-2">{nombrePeriodo(r.periodo).replace(/^./, (c) => c.toUpperCase())}</p>
        </div>
        <div className="text-right text-[13px] text-ink-2">
          <p className="font-semibold text-ink">{org.razonSocial ?? org.nombre}</p>
          {org.rut && <p>RUT {org.rut}</p>}
        </div>
      </header>
      <section aria-label="Trabajador" className="mb-6 grid gap-x-8 gap-y-1 text-[13px] sm:grid-cols-2">
        <p>
          <span className="text-ink-3">Trabajador:</span> <b>{t.nombre}</b>
        </p>
        <p>
          <span className="text-ink-3">RUT:</span> {t.rut}
        </p>
        <p>
          <span className="text-ink-3">Cargo:</span> {t.cargo}
        </p>
        <p>
          <span className="text-ink-3">AFP / Salud:</span> {t.afp} / {t.salud}
        </p>
        <p>
          <span className="text-ink-3">Días trabajados:</span> {r.diasTrabajados}
          {Number(r.horasExtraCantidad) > 0 && ` · ${Number(r.horasExtraCantidad).toLocaleString('es-CL')} h extra`}
        </p>
        <p>
          <span className="text-ink-3">Estado:</span> {r.estado === 'pagada' ? `Pagada el ${r.fechaPago ? fechaLarga(r.fechaPago) : '—'}` : 'Por pagar'}
        </p>
      </section>
      <div className="grid gap-8 sm:grid-cols-2">
        <section aria-label="Haberes">
          <h2 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Haberes</h2>
          {linea('Sueldo base', r.base, true)}
          {linea('Gratificación', r.gratificacion)}
          {linea('Bonos', r.bonos)}
          {linea('Comisiones', r.comisiones)}
          {linea('Horas extra', r.horasExtra)}
          {linea('Total imponible', r.imponible, true)}
          {linea('Colación y movilización (no imponible)', r.noImponible)}
        </section>
        <section aria-label="Descuentos">
          <h2 className="mb-2 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Descuentos</h2>
          {linea(`AFP ${t.afp}`, r.afp, true)}
          {linea(`Salud (${t.salud})`, r.salud, true)}
          {linea('Seguro de cesantía', r.cesantia)}
          {linea('Impuesto único', r.impuestoUnico)}
          {linea('Anticipos', r.anticipos)}
          {linea('Total descuentos', r.descuentos, true)}
        </section>
      </div>
      <p className="mt-6 flex items-baseline justify-between rounded-card bg-sunken px-4 py-3 text-[16px] print:border print:border-rule-strong print:bg-transparent">
        <span className="font-semibold">Líquido a pagar</span>
        <span className="text-[22px] font-bold tabular">{clp(r.liquido)}</span>
      </p>
      <footer className="mt-6 space-y-1 text-[12px] text-ink-3">
        <p>
          Aportes del empleador (no se descuentan): seguro de cesantía {clp(r.cesantiaEmpleador)}, SIS {clp(r.sis)}, aporte previsional {clp(r.aporteEmpleador)}
          . Costo empresa {clp(r.costoEmpresa)}.
        </p>
        {p.uf ? (
          <p aria-label="Indicadores usados">
            Indicadores del mes (al {p.fecha ? fechaLarga(p.fecha) : '—'}): UF {clp(p.uf)}, UTM {clp(p.utm ?? 0)}, IMM {clp(p.imm ?? 0)}, tope imponible{' '}
            {(p.topeImponibleUF ?? 0).toLocaleString('es-CL')} UF.
          </p>
        ) : (
          <p>Liquidación importada de la versión anterior: no registra los indicadores usados.</p>
        )}
        <p>Documento de apoyo a la gestión; la liquidación legal la emite el empleador.</p>
      </footer>
      <div className="mt-16 hidden grid-cols-2 gap-16 text-center text-[12px] print:grid">
        <p className="border-t border-ink pt-2">Firma del empleador</p>
        <p className="border-t border-ink pt-2">Firma del trabajador</p>
      </div>
    </article>
  );
}
