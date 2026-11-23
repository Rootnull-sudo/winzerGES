/**
 * Histórico de kilos y litros — port de js/modules/historico (v1). Solo lectura: se deriva de lotes, cosechas y
 * movimientos de bodega (ADR 0010), sin tablas propias.
 * Trazabilidad por lote: uva cosechada (kg) → litros ingresados → envasado, granel, vinagre y mermas → stock.
 * Diferencias con v1:
 *  - Las unidades envasadas (botellas) llegan con el envasado (F3); hasta entonces no se muestran.
 *  - La variación entre temporadas compara con la temporada anterior que tenga litros (v1 mostraba "—" si la
 *    anterior no tenía y comparaba contra 0 si existía vacía).
 */
import { n } from '../num';
import { balanceLote } from './bodega';

interface LoteH {
  id: string;
  codigo: string;
  variedad?: string | null;
  tipo?: string | null;
  temporadaId?: string | null;
  cuartelIds?: readonly string[] | null;
}
interface CosechaH {
  loteId?: string | null;
  cuartelId: string;
  kg: unknown;
}
type MovH = Parameters<typeof balanceLote>[1][number];

export interface FilaHistorico {
  id: string;
  anio: number;
  lote: string;
  variedad: string;
  tipo: string;
  cuartelIds: string[];
  kg: number;
  litros: number;
  /** L/kg (v1: rendimiento; 0 sin kg). */
  rendimiento: number;
  envasado: number;
  granel: number;
  vinagre: number;
  merma: number;
  stock: number;
  /** merma / litros ingresados. */
  mermaPct: number;
}

/** Una fila por lote con kg o litros (v1: historico `filas`). `anioDe` traduce la temporada del lote a su año. */
export function historicoLotes(
  lotes: readonly LoteH[],
  cosechas: readonly CosechaH[],
  movs: readonly MovH[],
  anioDe: (temporadaId: string | null | undefined) => number | null
): FilaHistorico[] {
  const out: FilaHistorico[] = [];
  for (const l of lotes) {
    const anio = anioDe(l.temporadaId);
    if (anio == null) continue;
    const cos = cosechas.filter((c) => c.loteId === l.id);
    const kg = cos.reduce((s, c) => s + n(c.kg), 0);
    const b = balanceLote(l.id, movs);
    if (!kg && !b.entradas) continue;
    out.push({
      id: l.id,
      anio,
      lote: l.codigo,
      variedad: l.variedad ?? '',
      tipo: l.tipo ?? '',
      cuartelIds: [...new Set([...cos.map((c) => c.cuartelId), ...(l.cuartelIds ?? [])])],
      kg,
      litros: b.entradas,
      rendimiento: kg ? b.entradas / kg : 0,
      envasado: b.envasado,
      granel: b.ventaGranel,
      vinagre: b.vinagre,
      merma: b.merma,
      stock: b.stock,
      mermaPct: b.entradas ? b.merma / b.entradas : 0
    });
  }
  return out;
}

export interface TotalTemporada {
  anio: number;
  kg: number;
  litros: number;
  blanco: number;
  tinto: number;
  /** L/kg de la temporada: litros / kg (null sin kg). */
  rendimiento: number | null;
  envasado: number;
  granel: number;
  merma: number;
  /** (litros − litros de la temporada anterior con litros) / esos litros; null si no hay con qué comparar. */
  variacion: number | null;
}

/** Comparativa entre temporadas (v1: porT), en orden ascendente de año. */
export function historicoPorTemporada(filas: readonly FilaHistorico[]): TotalTemporada[] {
  const anios = [...new Set(filas.map((f) => f.anio))].sort((a, b) => a - b);
  const out: TotalTemporada[] = [];
  for (const anio of anios) {
    const rs = filas.filter((f) => f.anio === anio);
    const s = (fn: (f: FilaHistorico) => number) => rs.reduce((t, f) => t + fn(f), 0);
    const kg = s((f) => f.kg);
    const litros = s((f) => f.litros);
    const previa = out.findLast((t) => t.litros > 0);
    out.push({
      anio,
      kg,
      litros,
      blanco: s((f) => (f.tipo === 'blanco' ? f.litros : 0)),
      tinto: s((f) => (f.tipo === 'tinto' ? f.litros : 0)),
      rendimiento: kg ? litros / kg : null,
      envasado: s((f) => f.envasado),
      granel: s((f) => f.granel),
      merma: s((f) => f.merma),
      variacion: previa ? (litros - previa.litros) / previa.litros : null
    });
  }
  return out;
}
