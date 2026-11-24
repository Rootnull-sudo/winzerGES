import { configVigente, f29Periodos, schema, withOrg } from '@winzer/db';
import { calendarioTributario, estadoObligacion, fechaHoy, tax } from '@winzer/domain';
import { desc, isNull } from 'drizzle-orm';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page';
import { orgWith } from '@/lib/session';
import { TributarioView, type DatosTributario } from './view';

export const metadata = { title: 'Tributario (F29, PPM)' };

/**
 * Módulo ONLINE (F6-2): F29 calculado desde los libros de DTE, honorarios y remuneraciones; PPM del año; pagos de
 * impuesto y calendario. `?periodo=AAAA-MM` elige el F29; `?anio=` el calendario.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ periodo?: string; anio?: string }> }) {
  const { org } = await params;
  const q = await searchParams;
  const { allowed, fueraDePlan, actor } = await orgWith(org, 'tributario');
  if (!allowed) return <NoAccess modulo="tributario" plan={fueraDePlan} />;
  const hoy = fechaHoy();
  const periodo = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.periodo ?? '') ? q.periodo! : tax.periodoAnterior(hoy.slice(0, 7));
  const anioF29 = periodo.slice(0, 4);
  const anioCal = /^\d{4}$/.test(q.anio ?? '') ? Number(q.anio) : Number(hoy.slice(0, 4));
  // Historial del año del período elegido hasta hoy (o diciembre), incluyendo siempre el período elegido.
  const tope = `${anioF29}-12` < hoy.slice(0, 7) ? `${anioF29}-12` : hoy.slice(0, 7);
  const hastaAnio = periodo > tope ? periodo : tope;
  const d = await withOrg(actor.orgId, async (tx) => {
    const [delAnio, pagos, obligaciones, cfg] = await Promise.all([
      f29Periodos(tx, `${anioF29}-01`, hastaAnio),
      tx.select().from(schema.pagoImpuesto).where(isNull(schema.pagoImpuesto.deletedAt)).orderBy(desc(schema.pagoImpuesto.fecha)),
      tx.select().from(schema.obligacion).where(isNull(schema.obligacion.deletedAt)),
      configVigente(tx)
    ]);
    return { delAnio, pagos, obligaciones, cfg };
  });
  const t = d.cfg.tributario;
  const reg = new Map(d.obligaciones.map((o) => [o.clave, o]));
  const datos: DatosTributario = {
    periodo,
    anioCalendario: anioCal,
    f29: d.delAnio.map((x) => ({
      periodo: x.periodo,
      calculo: x.calculo,
      estado: x.registro?.estado ?? null,
      folioSii: x.registro?.folioSii ?? null,
      fechaPago: x.registro?.fechaPago ?? null
    })),
    vence: (() => {
      const [y, m] = periodo.split('-').map(Number) as [number, number];
      return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-${String(t.diaF29).padStart(2, '0')}`;
    })(),
    pagos: d.pagos.map((p) => ({
      id: p.id,
      tipo: p.tipo,
      periodo: p.periodo,
      fecha: p.fecha,
      monto: p.monto,
      folioSii: p.folioSii,
      incluidoEnF29: p.incluidoEnF29,
      delF29: !!p.f29Id
    })),
    calendario: calendarioTributario(anioCal, t).map((i) => {
      const r = reg.get(i.clave);
      return { ...i, ...estadoObligacion(i.fecha, r, hoy), folio: r?.folio ?? null };
    }),
    trib: {
      regimen: t.regimen,
      tasaIVA: t.tasaIVA,
      tasaIDPC: t.tasaIDPC,
      tasaPPM: t.tasaPPM,
      ilaActivo: t.ilaActivo,
      tasaILA: t.tasaILA,
      diaF29: t.diaF29,
      remanenteInicial: t.remanenteInicial
    }
  };
  return (
    <>
      <PageHeader
        area="Tributario"
        title="Tributario (F29, PPM)"
        description="Borradores de apoyo calculados con los documentos registrados: F29 mensual, PPM, pagos de impuesto y calendario de obligaciones. No reemplazan la declaración oficial ante el SII ni la asesoría de tu contador."
      />
      <TributarioView datos={datos} />
    </>
  );
}
