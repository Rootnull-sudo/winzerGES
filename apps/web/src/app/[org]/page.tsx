import { schema, withOrg } from '@winzer/db';
import { AREAS, can, clp, dec2, MODULES, today } from '@winzer/domain';
import { and, gte, isNull, sql } from 'drizzle-orm';
import { ArrowUpRight, Coins, LayoutGrid, Sprout, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { moduleHref } from '@/lib/routes';
import { PageHeader, Stat, StatGrid } from '@/components/ui/page';
import { requireOrg } from '@/lib/session';

export default async function Inicio({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { actor, org, user } = await requireOrg(slug);
  const ok = (m: string) => can(actor.role, m, 'v', actor.customRoles, actor.acceso);
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
      <PageHeader
        title={`${hora < 12 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'}, ${user.name.split(' ')[0]}`}
        description={
          <>
            Resumen de <strong className="text-ink">{org.nombre}</strong>.
          </>
        }
      />

      <StatGrid title="Resumen">
        {data.cu && (
          <Stat
            label="Superficie plantada"
            value={
              <>
                {dec2(data.cu.ha)} <span className="text-[15px] font-semibold text-ink-3">ha</span>
              </>
            }
            sub={`${data.cu.n} cuarteles`}
            icon={<Sprout size={16} strokeWidth={1.6} />}
          />
        )}
        {data.cl && <Stat label="Clientes" value={data.cl.n} sub="activos" icon={<Users size={16} strokeWidth={1.6} />} />}
        {data.co && <Stat label="Cobrado este mes" value={clp(data.co.total)} icon={<Coins size={16} strokeWidth={1.6} />} />}
        <Stat
          label="Módulos en v2"
          value={`${migrated} de ${MODULES.length}`}
          sub="El resto sigue en la versión de escritorio"
          icon={<LayoutGrid size={16} strokeWidth={1.6} />}
        />
      </StatGrid>

      <h2 className="mb-2.5 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Tus módulos</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {AREAS.filter((a) => visibles.some((m) => m.area === a.id)).map((a) => (
          <section key={a.id} className="rounded-card border border-rule bg-raised px-4.5 pt-4 pb-1.5">
            <p className="mb-1 flex items-baseline justify-between gap-2">
              <span className="font-label text-[20px]">{a.name}</span>
              {a.offline && (
                <Badge tone="ok" className="shrink-0 whitespace-nowrap">
                  funciona sin señal
                </Badge>
              )}
            </p>
            <ul className="divide-y divide-rule">
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
