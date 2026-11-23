/**
 * Reglas de alerta de fermentación y bodega — port de js/core/alerts.js:18-30 y :49-51 (v1), con sus textos.
 * Diferencias con v1:
 *  - Los umbrales de SO₂ y de desvío son los parámetros vigentes de la viña.
 *  - Nueva: seguimiento atrasado (ficha en FA sin registros hace más de 2 días; docs/v2/dominio.md § Alertas).
 *  - Mermas altas solo en lotes que siguen en bodega (con stock): v1 avisaba para siempre de lotes ya cerrados.
 *  - Desvío de la FA en curso: solo si ya superó lo planificado (v1 avisaba un desvío negativo apenas partía).
 */
import { diffDays, FML_PROLONGADA_DIAS, oenology } from '@winzer/domain';
import { and, isNull, ne, sql } from 'drizzle-orm';
import type { Tx } from '../../client';
import { fermentacion, seguimiento } from '../../schema';
import type { Hallazgo, Regla } from '../motor';

/** Días sin seguimiento durante la FA que merecen aviso. */
export const SEGUIMIENTO_ATRASADO_DIAS = 2;
/** Merma sobre las entradas del lote que merece aviso (v1: 3 %). */
export const MERMA_ALTA = 0.03;

const dec1 = (v: number) => v.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const int = (v: number) => Math.round(v).toLocaleString('es-CL');
const pct = (v: number) => `${(v * 100).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const ruta = (id: string) => `fermentacion?ficha=${id}`;

/** Fichas no cerradas con su seguimiento, del más reciente al más antiguo. */
async function fichasAbiertas(tx: Tx) {
  const [fichas, segs] = await Promise.all([
    tx
      .select()
      .from(fermentacion)
      .where(and(isNull(fermentacion.deletedAt), ne(fermentacion.estado, 'cerrada'))),
    tx
      .select({
        fermentacionId: seguimiento.fermentacionId,
        fecha: seguimiento.fecha,
        brix: seguimiento.brix,
        densidad: seguimiento.densidad,
        so2Libre: seguimiento.so2Libre
      })
      .from(seguimiento)
      .where(isNull(seguimiento.deletedAt))
  ]);
  return fichas.map((f) => ({
    f,
    segs: segs.filter((s) => s.fermentacionId === f.id).sort((a, b) => b.fecha.localeCompare(a.fecha))
  }));
}

/** Último SO₂ libre medido de cada ficha abierta, con su estado según el rango del tipo de vino. */
async function so2(tx: Tx, enologia: Parameters<typeof oenology.estadoSO2>[2]) {
  const out: { id: string; codigo: string; tipo: string; finFA: string | null; valor: number; estado: string }[] = [];
  for (const { f, segs } of await fichasAbiertas(tx)) {
    const ultimo = segs.find((s) => s.so2Libre != null);
    if (!ultimo) continue;
    const valor = Number(ultimo.so2Libre);
    out.push({ id: f.id, codigo: f.codigo, tipo: f.tipo, finFA: f.finFA, valor, estado: oenology.estadoSO2(valor, f.tipo, enologia) });
  }
  return out;
}

export const so2Critico: Regla = {
  id: 'fermentacion.so2_critico',
  modulo: 'fermentacion',
  severidad: 'bad',
  async evaluar(tx, { config }) {
    return (await so2(tx, config.enologia))
      .filter((x) => x.estado === 'critico')
      .map((x) => ({
        registroId: x.id,
        entidad: 'fermentacion',
        titulo: `Sobre-sulfitado en ${x.codigo}`,
        mensaje: `SO₂ libre ${dec1(x.valor)} mg/L supera el umbral de alerta (${oenology.rangoSO2(x.tipo, config.enologia).alerta} mg/L).`,
        ruta: ruta(x.id)
      }));
  }
};

export const so2Alto: Regla = {
  id: 'fermentacion.so2_alto',
  modulo: 'fermentacion',
  severidad: 'warn',
  async evaluar(tx, { config }) {
    return (await so2(tx, config.enologia))
      .filter((x) => x.estado === 'alto')
      .map((x) => {
        const r = oenology.rangoSO2(x.tipo, config.enologia);
        return {
          registroId: x.id,
          entidad: 'fermentacion',
          titulo: `SO₂ libre alto en ${x.codigo}`,
          mensaje: `${dec1(x.valor)} mg/L sobre el rango suave (${r.min}–${r.max}).`,
          ruta: ruta(x.id)
        };
      });
  }
};

/** Solo después de la FA (durante la fermentación el SO₂ libre bajo es normal). */
export const so2Bajo: Regla = {
  id: 'fermentacion.so2_bajo',
  modulo: 'fermentacion',
  severidad: 'warn',
  async evaluar(tx, { config }) {
    return (await so2(tx, config.enologia))
      .filter((x) => x.estado === 'bajo' && x.finFA)
      .map((x) => ({
        registroId: x.id,
        entidad: 'fermentacion',
        titulo: `SO₂ libre bajo en ${x.codigo}`,
        mensaje: `${dec1(x.valor)} mg/L: evalúa ajuste para proteger el vino.`,
        ruta: ruta(x.id)
      }));
  }
};

export const desvioFA: Regla = {
  id: 'fermentacion.desvio_fa',
  modulo: 'fermentacion',
  severidad: 'warn',
  async evaluar(tx, { hoy, config }) {
    const out: Hallazgo[] = [];
    for (const { f, segs } of await fichasAbiertas(tx)) {
      const t = oenology.tiemposFermentacion(f, segs, config.enologia, hoy);
      // En curso solo avisa si ya superó el plan (v1 comparaba los días transcurridos y avisaba "−8 días" al partir).
      if (t.alertaDesvio && t.desvio != null && (f.finFA || t.desvio > 0))
        out.push({
          registroId: f.id,
          entidad: 'fermentacion',
          titulo: `Desviación de fermentación en ${f.codigo}`,
          mensaje: `${t.desvio > 0 ? '+' : ''}${t.desvio} días respecto de lo planificado (${f.diasPlanificados} días).`,
          ruta: ruta(f.id)
        });
    }
    return out;
  }
};

export const fmlProlongada: Regla = {
  id: 'fermentacion.fml_prolongada',
  modulo: 'fermentacion',
  severidad: 'warn',
  async evaluar(tx, { hoy }) {
    const out: Hallazgo[] = [];
    for (const { f } of await fichasAbiertas(tx)) {
      const dias = f.tipo === 'tinto' && f.inicioFML && !f.finFML ? (diffDays(f.inicioFML, hoy) ?? 0) : 0;
      if (dias > FML_PROLONGADA_DIAS)
        out.push({ registroId: f.id, entidad: 'fermentacion', titulo: `FML prolongada en ${f.codigo}`, mensaje: `Lleva ${dias} días.`, ruta: ruta(f.id) });
    }
    return out;
  }
};

/** Ficha en FA (con inicio y sin fin) cuyo último seguimiento —o el inicio, si no hay— tiene más de 2 días. */
export const seguimientoAtrasado: Regla = {
  id: 'fermentacion.seguimiento_atrasado',
  modulo: 'fermentacion',
  severidad: 'warn',
  async evaluar(tx, { hoy }) {
    const out: Hallazgo[] = [];
    for (const { f, segs } of await fichasAbiertas(tx)) {
      if (!f.inicioFA || f.finFA || f.inicioFA > hoy) continue;
      const desde = segs[0]?.fecha ?? f.inicioFA;
      const dias = diffDays(desde, hoy) ?? 0;
      if (dias > SEGUIMIENTO_ATRASADO_DIAS)
        out.push({
          registroId: f.id,
          entidad: 'fermentacion',
          titulo: `Seguimiento atrasado en ${f.codigo}`,
          mensaje: segs.length ? `El último registro es de hace ${dias} días.` : `Inició la FA hace ${dias} días y no tiene registros.`,
          ruta: ruta(f.id)
        });
    }
    return out;
  }
};

export const sobrecapacidad: Regla = {
  id: 'bodega.sobrecapacidad',
  modulo: 'bodega',
  severidad: 'bad',
  async evaluar(tx) {
    const filas = await tx.execute<{ estanque_id: string; codigo: string; capacidad: string; litros: string }>(
      sql`select estanque_id, codigo, capacidad, litros from v_ocupacion where litros > capacidad + 0.5`
    );
    return filas.map((e) => ({
      registroId: e.estanque_id,
      entidad: 'estanque',
      titulo: `Sobrecapacidad en ${e.codigo}`,
      mensaje: `${int(Number(e.litros))} L en un estanque de ${int(Number(e.capacidad))} L.`,
      ruta: 'bodega'
    }));
  }
};

export const mermaAlta: Regla = {
  id: 'bodega.merma_alta',
  modulo: 'bodega',
  severidad: 'warn',
  async evaluar(tx) {
    const filas = await tx.execute<{ lote_id: string; codigo: string; entradas: string; merma: string }>(
      sql`select lote_id, codigo, entradas, merma from v_balance_lote where entradas > 0 and stock > 0.5 and merma / entradas > ${MERMA_ALTA}`
    );
    return filas.map((l) => ({
      registroId: l.lote_id,
      entidad: 'lote',
      titulo: `Mermas altas en lote ${l.codigo}`,
      mensaje: `${pct(Number(l.merma) / Number(l.entradas))} de las entradas (${int(Number(l.merma))} L).`,
      ruta: 'bodega?tab=balance'
    }));
  }
};
