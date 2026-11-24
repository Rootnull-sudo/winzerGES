/**
 * Reglas de alerta comerciales — port de js/core/alerts.js:72 (v1), con su texto.
 * Marca: error si el registro INAPI ya venció; aviso si vence en 180 días o menos.
 */
import { estadoMarca } from '@winzer/domain';
import { isNull } from 'drizzle-orm';
import { marca } from '../../schema';
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
