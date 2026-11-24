import { candidatosLibres, schema, withOrg } from '@winzer/db';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page';
import { orgWith } from '@/lib/session';
import { ConciliacionView, type DatosConciliacion } from './view';

export const metadata = { title: 'Conciliación bancaria' };

/**
 * Módulo ONLINE (F6-3): libro de banco de la cuenta elegida (`?cuenta=`), sus conciliaciones y los documentos en
 * libros que aún no aparecen en el banco.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ cuenta?: string }> }) {
  const { org } = await params;
  const q = await searchParams;
  const { allowed, fueraDePlan, actor } = await orgWith(org, 'conciliacion');
  if (!allowed) return <NoAccess modulo="conciliación bancaria" plan={fueraDePlan} />;
  const { cuentaBanco, movBanco, conciliacionMatch, cartola } = schema;
  const d = await withOrg(actor.orgId, async (tx) => {
    const cuentas = await tx.select().from(cuentaBanco).where(isNull(cuentaBanco.deletedAt)).orderBy(cuentaBanco.banco);
    const cuenta = cuentas.find((c) => c.id === q.cuenta) ?? cuentas[0] ?? null;
    if (!cuenta) return { cuentas, cuenta, movs: [], matches: [], libres: [], cartolas: [], descripciones: new Map<string, string>() };
    const movs = await tx
      .select()
      .from(movBanco)
      .where(and(eq(movBanco.cuentaId, cuenta.id), isNull(movBanco.deletedAt)))
      .orderBy(movBanco.fecha, movBanco.createdAt);
    const ids = movs.map((m) => m.id);
    const [matches, libres, cartolas] = await Promise.all([
      ids.length
        ? tx
            .select()
            .from(conciliacionMatch)
            .where(and(inArray(conciliacionMatch.movBancoId, ids), isNull(conciliacionMatch.deletedAt)))
        : Promise.resolve([]),
      candidatosLibres(tx),
      tx
        .select()
        .from(cartola)
        .where(and(eq(cartola.cuentaId, cuenta.id), isNull(cartola.deletedAt)))
        .orderBy(desc(cartola.importadaEn))
    ]);
    const desc_ = matches.length
      ? await tx.execute<{ origen_tipo: string; origen_id: string; descripcion: string }>(sql`
          select origen_tipo, origen_id, descripcion from v_candidatos_banco
          where (origen_tipo || ':' || origen_id) in (${sql.join(
            matches.map((m) => sql`${m.origenTipo + ':' + m.origenId}`),
            sql`, `
          )})`)
      : [];
    return { cuentas, cuenta, movs, matches, libres, cartolas, descripciones: new Map(desc_.map((x) => [`${x.origen_tipo}:${x.origen_id}`, x.descripcion])) };
  });
  const datos: DatosConciliacion = {
    cuentas: d.cuentas.map((c) => ({
      id: c.id,
      version: c.version,
      banco: c.banco,
      tipo: c.tipo,
      numero: c.numero,
      moneda: c.moneda,
      fechaInicio: c.fechaInicio,
      saldoInicial: c.saldoInicial
    })),
    cuentaId: d.cuenta?.id ?? null,
    movs: d.movs.map((m) => {
      const ms = d.matches.filter((x) => x.movBancoId === m.id);
      return {
        id: m.id,
        fecha: m.fecha,
        glosa: m.glosa,
        monto: m.monto,
        estado: m.estado,
        nota: m.nota,
        huella: m.huella,
        diferencia: ms.length ? ms.reduce((s, x) => s + x.diferencia, 0) : null,
        match: ms.map((x) => ({
          tipo: x.origenTipo,
          descripcion: d.descripciones.get(`${x.origenTipo}:${x.origenId}`) ?? x.origenTipo,
          automatico: x.automatico
        }))
      };
    }),
    libres: d.libres,
    cartolas: d.cartolas.map((c) => ({
      id: c.id,
      archivo: c.archivo,
      importadaEn: c.importadaEn.toISOString(),
      filas: c.filasImportadas,
      duplicadas: c.duplicadas
    }))
  };
  return (
    <>
      <PageHeader
        area="Tributario"
        title="Conciliación bancaria"
        description="Importa la cartola, deja que el sistema sugiera las coincidencias y concilia el resto a mano. Saldo según extracto ± partidas en tránsito = saldo según libros."
      />
      <ConciliacionView datos={datos} />
    </>
  );
}
