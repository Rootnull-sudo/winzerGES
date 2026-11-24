/**
 * Maestro de proveedores (F3-1, online). Siempre dentro de withOrg() con la conexión de la app.
 */
import { proveedorInput, type ProveedorInput } from '@winzer/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../client';
import { ReglaError, softDelete, upsert, type Actor, type EntityMeta } from '../repo';
import { compra, gasto, insumo, proveedor } from '../schema';

export const metaProveedor: EntityMeta = { entity: 'proveedor', module: 'proveedores', label: 'proveedores', display: (r) => String(r.nombre) };

/** Crea o edita un proveedor. RUT único por viña (el índice lo garantiza; aquí el mensaje claro). */
export async function guardarProveedor(tx: Tx, actor: Actor, input: ProveedorInput, baseVersion?: number) {
  const data = proveedorInput.parse(input);
  const id = data.id ?? randomUUID();
  const [dup] = await tx
    .select({ nombre: proveedor.nombre })
    .from(proveedor)
    .where(and(eq(proveedor.rut, data.rut), sql`${proveedor.id} <> ${id}`, isNull(proveedor.deletedAt)))
    .limit(1);
  if (dup) throw new ReglaError(`El RUT ${data.rut} ya está registrado para ${dup.nombre}.`);
  return upsert(tx, proveedor, actor, metaProveedor, { ...data, id }, { baseVersion, checkVersion: baseVersion != null });
}

type ConProveedor = typeof insumo | typeof compra | typeof gasto;
/** Tablas que referencian al proveedor. */
const REFERENCIAS: { tabla: ConProveedor; nombre: string }[] = [
  { tabla: compra, nombre: 'compras' },
  { tabla: gasto, nombre: 'gastos' },
  { tabla: insumo, nombre: 'insumos' }
];

/** Elimina un proveedor sin documentos ni insumos asociados (v1: "el proveedor tiene compras"). */
export async function eliminarProveedor(tx: Tx, actor: Actor, id: string) {
  for (const r of REFERENCIAS) {
    const [x] = await tx
      .select({ id: r.tabla.id })
      .from(r.tabla)
      .where(and(eq(r.tabla.proveedorId, id), isNull(r.tabla.deletedAt)))
      .limit(1);
    if (x) throw new ReglaError(`No se puede eliminar: el proveedor tiene ${r.nombre} asociados.`);
  }
  return softDelete(tx, proveedor, actor, metaProveedor, id);
}
