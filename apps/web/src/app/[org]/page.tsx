import { schema, withOrg } from '@winzer/db';
import { AREAS, can, clp, dec2, MODULES, today } from '@winzer/domain';
import { and, gte, isNull, sql } from 'drizzle-orm';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { moduleHref } from '@/lib/routes';
import { PageHeader, Stat } from '@/components/ui/page';
import { requireOrg } from '@/lib/session';

export default async function Inicio({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { actor, org, user } = await requireOrg(slug);
  const ok = (m: string) => can(actor.role, m, 'v', actor.customRoles);
  const mes = today().slice(0, 7);
  const data = await withOrg(actor.orgId, async (tx) => {
    const [cu] = ok('catastro')
      ? await tx
          .select({ n: sql<number>`count(*)::int`, ha: sql<number>`coalesce(sum(superficie), 0)::float` })
          .from(schema.cuartel)
          .where(isNull(schema.cuartel.deletedAt))
      : [null];
    const [cl] = ok('clientes')
      ? await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.cliente)
          .where(isNull(schema.cliente.deletedAt))
      : [null];
    const [co] = ok('clientes')
      ? await tx
          .select({ total: sql<number>`coalesce(sum(monto), 0)::float` })
          .from(schema.cobro)
          .where(and(isNull(schema.cobro.deletedAt), gte(schema.cobro.fecha, `${mes}-01`)))
      : [null];
    return { cu, cl, co };
  });
  const migrated = MODULES.filter((m) => m.status === 'v2').length;
  const visibles = MODULES.filter((m) => m.id !== 'dashboard' && ok(m.id));
  const hora = new Date().getHours();

  return (
    <>
      <PageHeader area={org.nombre} title={`${hora < 12 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'}, ${user.name.split(' ')[0]}`} />

      <section className="mb-12 grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
        {data.cu && (
          <Stat
            label="Superficie plantada"
            value={
              <>
                {dec2(data.cu.ha)} <span className="text-[14px] font-medium text-ink-3">ha</span>
              </>
            }
            sub={`${data.cu.n} cuarteles`}
          />
        )}
        {data.cl && <Stat label="Clientes" value={data.cl.n} />}
        {data.co && <Stat label="Cobrado este mes" value={clp(data.co.total)} />}
        <Stat label="Módulos en v2" value={`${migrated} de ${MODULES.length}`} sub="El resto sigue en la versión de escritorio" />
      </section>

      <h2 className="mb-6 border-b border-ink pb-2 font-label text-[22px]">Tus módulos</h2>
      <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
        {AREAS.filter((a) => visibles.some((m) => m.area === a.id)).map((a) => (
          <section key={a.id}>
            <p className="mb-2 flex items-baseline justify-between gap-2">
              <span className="font-label text-[13px] tracking-[0.12em] text-ink-3 uppercase">{a.name}</span>
              {a.offline && <span className="text-[12px] text-ink-3">funciona sin señal</span>}
            </p>
            <ul className="divide-y divide-rule border-y border-rule">
              {visibles
                .filter((m) => m.area === a.id)
                .map((m) => (
                  <li key={m.id}>
                    <Link href={moduleHref(slug, m)} className="group flex h-11 items-center justify-between gap-3 text-[14px] hover:text-ink">
                      <span className={m.status === 'v2' ? 'font-medium' : 'text-ink-3'}>{m.name}</span>
                      {m.status === 'v2' ? (
                        <ArrowUpRight
                          size={15}
                          className="text-ink-4 transition-transform duration-150 group-hover:-translate-y-px group-hover:translate-x-px group-hover:text-ink"
                        />
                      ) : (
                        <span className="text-[11px] text-ink-4">pendiente</span>
                      )}
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
