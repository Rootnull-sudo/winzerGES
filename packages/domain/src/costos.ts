/**
 * Costos de producción — port de js/calc/financial.js (v1): costo por litro de un lote y costo unitario de una orden
 * de envasado. Funciones puras: reciben los registros ya filtrados de la viña (el servidor los arma desde Postgres).
 * Montos netos en pesos.
 */
import { litrosEntradaLote } from './entities/bodega';
import { costoCosecha } from './entities/cosecha';
import { prorrateoEtiqueta } from './entities/marca';
import { n, sum } from './num';

export interface DatosCostoLote {
  cosechas: readonly {
    id: string;
    loteId?: string | null;
    cuartelId: string;
    temporadaId?: string | null;
    kg?: unknown;
    costoBins?: unknown;
    costoTransporte?: unknown;
    costoAlimentacion?: unknown;
    otrosCostos?: unknown;
  }[];
  jornales: readonly { cosechaId: string; tarifa?: unknown; tarifaTipo?: string | null; kg?: unknown; cajones?: unknown; jornadas?: unknown }[];
  aplicaciones: readonly { cuartelId: string; temporadaId?: string | null; costo?: unknown }[];
  labores: readonly { cuartelId: string; temporadaId?: string | null; costo?: unknown }[];
  aditivos: readonly { loteId: string; costo?: unknown }[];
  fichas: readonly { id: string; loteId: string }[];
  adicionesSO2: readonly { fermentacionId: string; costo?: unknown }[];
  movsBodega: readonly { loteId: string; tipo: string; litros: unknown; estanqueId?: string }[];
}

/**
 * Costo directo de un lote y costo por litro (v1: financial.costoLitroLote):
 *  cosecha = Σ costo de las cosechas del lote (jornales + bins, transporte, alimentación, otros);
 *  agrícola = Σ por cuartel (aplicaciones + labores de la temporada) × kg del cuartel al lote ÷ kg del cuartel en la temporada;
 *  enológico = aditivos del lote + adiciones de SO₂ de sus fichas; uva comprada = campo del lote;
 *  costo/L = total ÷ litros ingresados al lote (o los estimados si aún no ingresa).
 */
export function costoLitroLote(
  lote: { id: string; temporadaId?: string | null; costoUvaComprada?: unknown; litrosEstimados?: unknown },
  d: DatosCostoLote
): { total: number; litros: number; costoLitro: number; partes: { cosecha: number; agricola: number; enologico: number; comprada: number } } {
  const cos = d.cosechas.filter((c) => c.loteId === lote.id);
  const cosecha = sum(cos, (c) => costoCosecha(c, d.jornales).total);
  let agricola = 0;
  for (const cid of new Set(cos.map((c) => c.cuartelId))) {
    const kgLote = sum(
      cos.filter((c) => c.cuartelId === cid),
      (c) => c.kg
    );
    const kgTot =
      sum(
        d.cosechas.filter((c) => c.cuartelId === cid && c.temporadaId === lote.temporadaId),
        (c) => c.kg
      ) || kgLote;
    const campo =
      sum(
        d.aplicaciones.filter((a) => a.cuartelId === cid && a.temporadaId === lote.temporadaId),
        (a) => a.costo
      ) +
      sum(
        d.labores.filter((l) => l.cuartelId === cid && l.temporadaId === lote.temporadaId),
        (l) => l.costo
      );
    agricola += kgTot ? (campo * kgLote) / kgTot : 0;
  }
  const fichas = new Set(d.fichas.filter((f) => f.loteId === lote.id).map((f) => f.id));
  const enologico =
    sum(
      d.aditivos.filter((a) => a.loteId === lote.id),
      (a) => a.costo
    ) +
    sum(
      d.adicionesSO2.filter((x) => fichas.has(x.fermentacionId)),
      (x) => x.costo
    );
  const comprada = n(lote.costoUvaComprada);
  const total = cosecha + agricola + enologico + comprada;
  const litros =
    litrosEntradaLote(
      lote.id,
      d.movsBodega.map((m) => ({ ...m, estanqueId: m.estanqueId ?? '' }))
    ) || n(lote.litrosEstimados);
  return { total, litros, costoLitro: litros ? total / litros : 0, partes: { cosecha, agricola, enologico, comprada } };
}

export interface OrdenCosto {
  unidades: unknown;
  mermaPct?: unknown;
  envaseId?: string | null;
  cierreId?: string | null;
  capsulaId?: string | null;
  cajaId?: string | null;
  etiquetaInsumoId?: string | null;
  manoObra?: unknown;
  energiaAgua?: unknown;
}
export interface PartesCosto {
  vino: number;
  envase: number;
  etiqueta: number;
  capsula: number;
  cierre: number;
  caja: number;
  manoObra: number;
  energia: number;
}

/**
 * Costo unitario de una orden de envasado (v1: financial.costoEnvasado), por unidad:
 *  vino = litros del formato × (1 + merma) × costo/L del lote; envase, cápsula, cierre = precio del insumo;
 *  etiqueta = impresión + prorrateo del diseño (o el precio del insumo de etiqueta si no hay diseño);
 *  caja = precio ÷ unidades por caja; mano de obra y energía ÷ unidades.
 *  litros consumidos = litros del formato × unidades × (1 + merma).
 */
export function costoEnvasado(
  o: OrdenCosto,
  c: {
    formato: { litros: unknown; unidadesCaja?: unknown } | null;
    costoLitro: number;
    precioInsumo: (id: string | null | undefined) => number;
    etiqueta?: { costoImpresion?: unknown; costoDiseno?: unknown; costoFotografia?: unknown; costoIlustracion?: unknown; tirajeEstimado?: unknown } | null;
    /** Botellas producidas con esa etiqueta en órdenes confirmadas (para el prorrateo). */
    producidasEtiqueta?: number;
  }
): { partes: PartesCosto; unitario: number; total: number; litrosConsumidos: number; costoLitroVino: number } {
  const litrosFmt = n(c.formato?.litros ?? 0.75);
  const merma = n(o.mermaPct) / 100;
  const unidades = n(o.unidades) || 1;
  const etiqueta = c.etiqueta ? n(c.etiqueta.costoImpresion) + prorrateoEtiqueta(c.etiqueta, c.producidasEtiqueta ?? 0) : c.precioInsumo(o.etiquetaInsumoId);
  const partes: PartesCosto = {
    vino: litrosFmt * (1 + merma) * c.costoLitro,
    envase: c.precioInsumo(o.envaseId),
    etiqueta,
    capsula: c.precioInsumo(o.capsulaId),
    cierre: c.precioInsumo(o.cierreId),
    caja: o.cajaId ? c.precioInsumo(o.cajaId) / (n(c.formato?.unidadesCaja) || 12) : 0,
    manoObra: n(o.manoObra) / unidades,
    energia: n(o.energiaAgua) / unidades
  };
  const unitario = sum(Object.values(partes));
  return { partes, unitario, total: unitario * unidades, litrosConsumidos: litrosFmt * unidades * (1 + merma), costoLitroVino: c.costoLitro };
}

/** Cajas que se consumen: enteras (una caja incompleta se usa igual). El costo se calcula por fracción (v1). */
export const cajasNecesarias = (unidades: unknown, unidadesCaja: unknown) => Math.ceil(n(unidades) / (n(unidadesCaja) || 12));

/** Requisitos de la D.O. para envasar: ≥ 75 % de uva de la zona y certificado (v1: envasado:87-100). */
export function validarDO(o: { declaraDO?: unknown; pctUvaZona?: unknown; certificadoDO?: string | null }): string | null {
  if (!o.declaraDO) return null;
  if (n(o.pctUvaZona) < 75) return 'Para declarar D.O. se requiere al menos 75 % de uva de la zona.';
  if (!o.certificadoDO) return 'Para declarar D.O. se requiere el N° de certificado.';
  return null;
}

/**
 * Validador de rotulación (Ley 18.455 y Decreto 78, v1: envasado/validador): requisitos de la etiqueta.
 * Cada ítem dice si está cumplido con los datos de la orden, la etiqueta y la viña.
 */
export function validarRotulacion(x: {
  etiqueta?: {
    denominacion?: string | null;
    graduacion?: unknown;
    contenido?: string | null;
    varietal?: string | null;
    do?: string | null;
    aprobacionLegal?: boolean;
  } | null;
  orden: { graduacion?: unknown; declaraDO?: unknown; pctUvaZona?: unknown; certificadoDO?: string | null };
  formato?: { litros: unknown } | null;
  vina: { razonSocial?: string | null; rut?: string | null };
}): { item: string; ok: boolean; detalle: string }[] {
  const e = x.etiqueta;
  const grad = n(e?.graduacion ?? x.orden.graduacion);
  return [
    { item: 'Denominación del producto', ok: !!e?.denominacion, detalle: e?.denominacion ?? 'Falta (ej. "Vino")' },
    { item: 'Graduación alcohólica (% vol)', ok: grad > 0, detalle: grad ? `${grad.toLocaleString('es-CL')} % vol` : 'Falta' },
    { item: 'Contenido neto', ok: !!(e?.contenido || x.formato), detalle: e?.contenido ?? (x.formato ? `${n(x.formato.litros) * 1000} mL` : 'Falta') },
    { item: 'Nombre o razón social del envasador', ok: !!x.vina.razonSocial, detalle: x.vina.razonSocial ?? 'Completa la razón social de la viña' },
    { item: 'RUT del envasador', ok: !!x.vina.rut, detalle: x.vina.rut ?? 'Completa el RUT de la viña' },
    { item: 'País de origen ("Producto de Chile")', ok: true, detalle: 'Se imprime en la etiqueta' },
    {
      item: 'Varietal y añada (≥ 75 % de la variedad)',
      ok: !e?.varietal || n(x.orden.pctUvaZona || 75) >= 75,
      detalle: e?.varietal ? `${e.varietal}` : 'Sin varietal declarado'
    },
    {
      item: 'Denominación de origen respaldada',
      ok: !validarDO(x.orden),
      detalle: validarDO(x.orden) ?? (x.orden.declaraDO ? `Certificado ${x.orden.certificadoDO}` : 'No declara D.O.')
    },
    { item: 'Declaración "Contiene sulfitos"', ok: true, detalle: 'Obligatoria en vinos con SO₂' },
    { item: 'Rotulación aprobada', ok: !!e?.aprobacionLegal, detalle: e?.aprobacionLegal ? 'Aprobada' : 'Pendiente de aprobación legal' }
  ];
}
