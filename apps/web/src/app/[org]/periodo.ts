import 'server-only';
/**
 * Período de las vistas financieras (F7): la temporada de `?t=` (o la actual) o el mes de `?mes=AAAA-MM`, y el
 * período anterior para comparar (temporada previa o mes previo).
 */
import { listarTemporadas, type Tx } from '@winzer/db';
import { elegirTemporada, fechaHoy, periodoMes, rangoPorDefecto, tax, type Periodo } from '@winzer/domain';

export interface PeriodoVista {
  periodo: Periodo;
  anterior: Periodo;
  /** "Temporada 2027" o "noviembre 2026" */
  etiqueta: string;
  etiquetaAnterior: string;
  /** Año de la temporada, o null en modo mes. */
  anio: number | null;
  mes: string | null;
}

const nombreMes = (ym: string) => new Date(`${ym}-15T12:00:00`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });

export async function periodoDeVista(tx: Tx, q: { t?: string; mes?: string }): Promise<PeriodoVista> {
  if (q.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes)) {
    const ant = tax.periodoAnterior(q.mes);
    return { periodo: periodoMes(q.mes), anterior: periodoMes(ant), etiqueta: nombreMes(q.mes), etiquetaAnterior: nombreMes(ant), anio: null, mes: q.mes };
  }
  const temporadas = await listarTemporadas(tx);
  const t = elegirTemporada(temporadas, q.t, fechaHoy());
  const previa = temporadas.find((x) => x.anio === t.anio - 1) ?? rangoPorDefecto(t.anio - 1);
  return {
    periodo: { desde: t.inicio, hasta: t.fin },
    anterior: { desde: previa.inicio, hasta: previa.fin },
    etiqueta: `Temporada ${t.anio}`,
    etiquetaAnterior: `Temporada ${t.anio - 1}`,
    anio: t.anio,
    mes: null
  };
}
