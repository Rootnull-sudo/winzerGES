/**
 * Reglas de alerta del viñedo — port de js/core/alerts.js (v1), con sus mismos textos.
 * Diferencias con v1: las de carencia se limitan a la temporada actual (v1 revisaba todas) y las de fenología
 * usan la temporada registrada, no el año calendario.
 */
import { cosecharDesde, diffDays, doyTemporada, kgPorCajon, oenology, temporadaActual } from '@winzer/domain';
import { and, eq, isNull } from 'drizzle-orm';
import type { Tx } from '../../client';
import { aplicacion, cosecha, cuartel, fenologia } from '../../schema';
import { listarTemporadas } from '../../services/temporadas';
import type { Hallazgo, Regla } from '../motor';

const dmy = (d: string) => d.split('-').reverse().join('-');
/** Días antes de que venza la carencia para avisar (v1: 21, fijo). */
const AVISO_CARENCIA_DIAS = 21;
/** Desborre: días sin registrar el fin y diferencia entre temporadas que merecen aviso (v1: 25 y 7). */
const DESBORRE_SIN_FIN_DIAS = 25;
const DESBORRE_DESVIO_DIAS = 7;

async function contexto(tx: Tx, hoy: string) {
  const temporadas = await listarTemporadas(tx);
  const actual = temporadaActual(temporadas, hoy) ?? null;
  const anterior = actual ? (temporadas.find((t) => t.anio === actual.anio - 1) ?? null) : null;
  const cuarteles = await tx.select({ id: cuartel.id, codigo: cuartel.codigo }).from(cuartel).where(isNull(cuartel.deletedAt));
  const codigo = new Map(cuarteles.map((c) => [c.id, c.codigo]));
  return { actual, anterior, cuarteles, codigo };
}

async function aplicacionesYCosechas(tx: Tx, temporadaId: string) {
  const [apls, coss] = await Promise.all([
    tx
      .select({ id: aplicacion.id, fecha: aplicacion.fecha, cuartelId: aplicacion.cuartelId, carencia: aplicacion.carencia })
      .from(aplicacion)
      .where(and(eq(aplicacion.temporadaId, temporadaId), isNull(aplicacion.deletedAt))),
    tx
      .select({ id: cosecha.id, fecha: cosecha.fecha, cuartelId: cosecha.cuartelId, kg: cosecha.kg, cajones: cosecha.cajones })
      .from(cosecha)
      .where(and(eq(cosecha.temporadaId, temporadaId), isNull(cosecha.deletedAt)))
  ]);
  return { apls, coss };
}

/** Cosecha del mismo cuartel entre la aplicación y el fin de su carencia (v1: alerts.js:34-38). */
export const cosechaEnCarencia: Regla = {
  id: 'insumos.cosecha_en_carencia',
  modulo: 'insumos',
  severidad: 'bad',
  async evaluar(tx, { hoy }) {
    const { actual, codigo } = await contexto(tx, hoy);
    if (!actual) return [];
    const { apls, coss } = await aplicacionesYCosechas(tx, actual.id);
    const out: Hallazgo[] = [];
    for (const a of apls.filter((x) => (x.carencia ?? 0) > 0)) {
      const libre = cosecharDesde(a.fecha, a.carencia);
      for (const c of coss.filter((x) => x.cuartelId === a.cuartelId && a.fecha <= x.fecha && x.fecha < libre)) {
        out.push({
          registroId: `${a.id}:${c.id}`,
          entidad: 'aplicacion',
          titulo: `Cosecha dentro del período de carencia (${codigo.get(a.cuartelId) ?? 'cuartel'})`,
          mensaje: `Aplicación del ${dmy(a.fecha)} con ${a.carencia} días de carencia; se cosechó el ${dmy(c.fecha)}.`,
          ruta: 'insumos?tab=aplicaciones'
        });
      }
    }
    return out;
  }
};

/** Carencia que termina dentro de 21 días, sin cosecha dentro del período (v1: alerts.js:39). */
export const carenciaVigente: Regla = {
  id: 'insumos.carencia_vigente',
  modulo: 'insumos',
  severidad: 'warn',
  async evaluar(tx, { hoy }) {
    const { actual, codigo } = await contexto(tx, hoy);
    if (!actual) return [];
    const { apls, coss } = await aplicacionesYCosechas(tx, actual.id);
    return apls
      .filter((a) => (a.carencia ?? 0) > 0)
      .filter((a) => {
        const libre = cosecharDesde(a.fecha, a.carencia);
        const yaCosechado = coss.some((c) => c.cuartelId === a.cuartelId && a.fecha <= c.fecha && c.fecha < libre);
        return !yaCosechado && libre > hoy && (diffDays(hoy, libre) ?? 99) <= AVISO_CARENCIA_DIAS;
      })
      .map((a) => ({
        registroId: a.id,
        entidad: 'aplicacion',
        titulo: `Carencia vigente en ${codigo.get(a.cuartelId) ?? 'cuartel'}`,
        mensaje: `No cosechar antes del ${dmy(cosecharDesde(a.fecha, a.carencia))}.`,
        ruta: 'insumos?tab=aplicaciones'
      }));
  }
};

/** Peso por cajón fuera del rango del parámetro (v1: alerts.js:43). */
export const cajonFueraDeRango: Regla = {
  id: 'cosecha.cajon_fuera_de_rango',
  modulo: 'cosecha',
  severidad: 'warn',
  async evaluar(tx, { hoy, config }) {
    const { actual, codigo } = await contexto(tx, hoy);
    if (!actual) return [];
    const { coss } = await aplicacionesYCosechas(tx, actual.id);
    const { kgCajonMin: min, kgCajonMax: max } = config.enologia;
    return coss
      .filter((c) => !oenology.cajonValido(c.kg, c.cajones, config.enologia))
      .map((c) => ({
        registroId: c.id,
        entidad: 'cosecha',
        titulo: 'Peso por cajón fuera de rango',
        mensaje: `${dmy(c.fecha)} · ${codigo.get(c.cuartelId) ?? ''}: ${(kgPorCajon(c.kg, c.cajones) ?? 0).toLocaleString('es-CL', { maximumFractionDigits: 1 })} kg/cajón (rango ${min}–${max} kg).`,
        ruta: 'cosecha'
      }));
  }
};

async function fenologiaDe(tx: Tx, temporadaId: string) {
  return tx
    .select({ cuartelId: fenologia.cuartelId, inicio: fenologia.desborreInicio, fin: fenologia.desborreFin })
    .from(fenologia)
    .where(and(eq(fenologia.temporadaId, temporadaId), isNull(fenologia.deletedAt)));
}

/** Desde el 15 de octubre, cuarteles sin inicio de desborre en la temporada actual (v1: alerts.js:46-47). */
export const desborreSinRegistrar: Regla = {
  id: 'fenologia.desborre_sin_registrar',
  modulo: 'fenologia',
  severidad: 'info',
  async evaluar(tx, { hoy }) {
    const { actual, cuarteles } = await contexto(tx, hoy);
    if (!actual || hoy < `${actual.anio - 1}-10-15` || hoy > actual.fin) return [];
    const con = new Set((await fenologiaDe(tx, actual.id)).filter((f) => f.inicio).map((f) => f.cuartelId));
    return cuarteles
      .filter((c) => !con.has(c.id))
      .map((c) => ({
        registroId: c.id,
        entidad: 'cuartel',
        titulo: `Registrar desborre de ${c.codigo}`,
        mensaje: `No hay fecha de inicio de desborre para la temporada ${actual.anio}.`,
        ruta: 'fenologia'
      }));
  }
};

/** Desborre iniciado hace más de 25 días sin fecha de fin (v1: fenologia/index.js:57). */
export const desborreSinFin: Regla = {
  id: 'fenologia.desborre_sin_fin',
  modulo: 'fenologia',
  severidad: 'info',
  async evaluar(tx, { hoy }) {
    const { actual, codigo } = await contexto(tx, hoy);
    if (!actual) return [];
    return (await fenologiaDe(tx, actual.id))
      .filter((f) => f.inicio && !f.fin && (diffDays(f.inicio, hoy) ?? 0) > DESBORRE_SIN_FIN_DIAS)
      .map((f) => ({
        registroId: f.cuartelId,
        entidad: 'fenologia',
        titulo: `${codigo.get(f.cuartelId) ?? 'Cuartel'}: registra el fin del desborre`,
        mensaje: `Inició hace ${diffDays(f.inicio, hoy)} días.`,
        ruta: 'fenologia'
      }));
  }
};

/** Inicio del desborre 7 días o más antes o después que la temporada anterior (v1: fenologia/index.js:52-56). */
export const desborreDesviado: Regla = {
  id: 'fenologia.desborre_desviado',
  modulo: 'fenologia',
  severidad: 'warn',
  async evaluar(tx, { hoy }) {
    const { actual, anterior, codigo } = await contexto(tx, hoy);
    if (!actual || !anterior) return [];
    const [esta, previa] = await Promise.all([fenologiaDe(tx, actual.id), fenologiaDe(tx, anterior.id)]);
    const out: Hallazgo[] = [];
    for (const f of esta) {
      const p = previa.find((x) => x.cuartelId === f.cuartelId);
      const a = doyTemporada(f.inicio),
        b = doyTemporada(p?.inicio);
      if (a == null || b == null || Math.abs(a - b) < DESBORRE_DESVIO_DIAS) continue;
      out.push({
        registroId: f.cuartelId,
        entidad: 'fenologia',
        titulo: `${codigo.get(f.cuartelId) ?? 'Cuartel'}: desborre ${a < b ? 'adelantado' : 'atrasado'} ${Math.abs(a - b)} días`,
        mensaje: `Respecto de la temporada ${anterior.anio}. Considera ajustar el calendario de labores y heladas.`,
        ruta: 'fenologia'
      });
    }
    return out;
  }
};
