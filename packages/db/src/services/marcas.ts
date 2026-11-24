/**
 * Formatos (módulo envasado), marcas y etiquetas (módulo marca) — F5-1, online.
 * Un formato o una etiqueta usados por órdenes de envasado no se eliminan (F5-2 agrega esa verificación).
 */
import { etiquetaInput, formatoInput, marcaInput, type EtiquetaInput, type FormatoInput, type MarcaInput } from '@winzer/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../client';
import { ReglaError, softDelete, upsert, type Actor, type EntityMeta } from '../repo';
import { etiqueta, formato, marca } from '../schema';
import { usadoPorOrdenes } from './envasado';

export const metaFormato: EntityMeta = { entity: 'formato', module: 'envasado', label: 'formatos', display: (r) => String(r.nombre) };
export const metaMarca: EntityMeta = { entity: 'marca', module: 'marca', label: 'marcas', display: (r) => String(r.nombre) };
export const metaEtiqueta: EntityMeta = { entity: 'etiqueta', module: 'marca', label: 'etiquetas', display: (r) => `${r.nombre} v${r.versionDiseno}` };

const opts = (v?: number) => ({ baseVersion: v, checkVersion: v != null });

export async function guardarFormato(tx: Tx, actor: Actor, input: FormatoInput, version?: number) {
  const data = formatoInput.parse(input);
  return upsert(tx, formato, actor, metaFormato, { ...data, id: data.id ?? randomUUID() }, opts(version));
}

export async function guardarMarca(tx: Tx, actor: Actor, input: MarcaInput, version?: number) {
  const data = marcaInput.parse(input);
  return upsert(tx, marca, actor, metaMarca, { ...data, id: data.id ?? randomUUID() }, opts(version));
}

export async function guardarEtiqueta(tx: Tx, actor: Actor, input: EtiquetaInput, version?: number) {
  const data = etiquetaInput.parse(input);
  return upsert(tx, etiqueta, actor, metaEtiqueta, { ...data, id: data.id ?? randomUUID() }, opts(version));
}

export async function eliminarFormato(tx: Tx, actor: Actor, id: string) {
  if (await usadoPorOrdenes(tx, 'formatoId', id)) throw new ReglaError('No se puede eliminar: hay órdenes de envasado con este formato.');
  return softDelete(tx, formato, actor, metaFormato, id);
}

export async function eliminarEtiqueta(tx: Tx, actor: Actor, id: string) {
  if (await usadoPorOrdenes(tx, 'etiquetaId', id)) throw new ReglaError('No se puede eliminar: hay órdenes de envasado con esta etiqueta.');
  return softDelete(tx, etiqueta, actor, metaEtiqueta, id);
}

export async function eliminarMarca(tx: Tx, actor: Actor, id: string) {
  const [e] = await tx
    .select({ id: etiqueta.id })
    .from(etiqueta)
    .where(and(eq(etiqueta.marcaId, id), isNull(etiqueta.deletedAt)))
    .limit(1);
  if (e) throw new ReglaError('No se puede eliminar: la marca tiene etiquetas.');
  return softDelete(tx, marca, actor, metaMarca, id);
}
