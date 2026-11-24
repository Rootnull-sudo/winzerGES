/**
 * Reglas de alerta comerciales — port de js/core/alerts.js:72 (v1), con su texto.
 * Marca: error si el registro INAPI ya venció; aviso si vence en 180 días o menos.
 */
import { estadoMarca } from '@winzer/domain';
import { and, eq, gte, isNull } from 'drizzle-orm';
import { marca, ordenEnvasado } from '../../schema';
import type { Hallazgo, Regla } from '../motor';

const dmy = (d: string) => d.split('-').reverse().join('-');

async function marcas(tx: Parameters<Regla['evaluar']>[0], hoy: string, cual: 'vencida' | 'renovar'): Promise<Hallazgo[]> {
  const filas = await tx.select({ id: marca.id, nombre: marca.nombre, vencimiento: marca.vencimiento }).from(marca).where(isNull(marca.deletedAt));
  return filas
    .filter((m) => estadoMarca(m.vencimiento, hoy).estado === cual)
    .map((m) => ({
      registroId: m.id,
      entidad: 'marca',
      titulo: `Renovar marca ${m.nombre} (INAPI)`,
      mensaje: cual === 'vencida' ? `Venció el ${dmy(m.vencimiento)}.` : `Vence el ${dmy(m.vencimiento)}.`,
      ruta: 'marca'
    }));
}

export const marcaVencida: Regla = { id: 'marca.vencida', modulo: 'marca', severidad: 'bad', evaluar: (tx, { hoy }) => marcas(tx, hoy, 'vencida') };
export const marcaPorVencer: Regla = { id: 'marca.por_vencer', modulo: 'marca', severidad: 'warn', evaluar: (tx, { hoy }) => marcas(tx, hoy, 'renovar') };

/** Orden de envasado con merma sobre el parámetro de la viña (v1: alerts.js:52, umbral 3 fijo). Últimos 90 días. */
export const mermaEnvasadoAlta: Regla = {
  id: 'envasado.merma_alta',
  modulo: 'envasado',
  severidad: 'warn',
  async evaluar(tx, { hoy, config }) {
    const desde = new Date(Date.parse(`${hoy}T12:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);
    const filas = await tx
      .select({ id: ordenEnvasado.id, codigo: ordenEnvasado.codigo, merma: ordenEnvasado.mermaPct })
      .from(ordenEnvasado)
      .where(and(eq(ordenEnvasado.estado, 'confirmada'), isNull(ordenEnvasado.deletedAt), gte(ordenEnvasado.fecha, desde)));
    return filas
      .filter((o) => Number(o.merma) > config.enologia.mermaEnvasadoMax)
      .map((o) => ({
        registroId: o.id,
        entidad: 'orden_envasado',
        titulo: `Merma de envasado alta (${o.codigo})`,
        mensaje: `${Number(o.merma).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% sobre el volumen envasado.`,
        ruta: 'envasado'
      }));
  }
};
