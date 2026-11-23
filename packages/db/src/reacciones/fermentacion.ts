/** Reacciones de fermentación (F2-3): ficha automática, estado del lote, tarea de trasiego y SO₂. */
import { diasFAPorDefecto, gramosEnUnidad } from '@winzer/domain';
import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { idDerivado } from '../ids';
import { ReglaError } from '../repo';
import { adicionSO2, fermentacion, insumo, lote, movInsumo, seguimiento, tarea } from '../schema';
import type { Reaccion } from './index';

/**
 * Una entrada de uva o mosto crea la ficha de fermentación del lote en borrador si aún no tiene (v1: domain.js:63-74).
 * Id derivado del lote: reintentos o una segunda entrada no crean otra.
 */
export const fichaDesdeEntrada: Reaccion = async (tx, actor, { op, registro, importando }) => {
  // Al importar, el respaldo de v1 ya trae sus fichas.
  if (importando || op !== 'upsert' || registro.deletedAt || registro.tipo !== 'entrada' || registro.origen === 'vino') return;
  const loteId = String(registro.loteId);
  const [ya] = await tx
    .select({ id: fermentacion.id })
    .from(fermentacion)
    .where(and(eq(fermentacion.loteId, loteId), isNull(fermentacion.deletedAt)))
    .limit(1);
  if (ya) return;
  const [l] = await tx.select({ codigo: lote.codigo, tipo: lote.tipo, variedad: lote.variedad }).from(lote).where(eq(lote.id, loteId));
  if (!l) return;
  await tx
    .insert(fermentacion)
    .values({
      id: idDerivado(actor.orgId, `ficha:${loteId}`, 'reaccion'),
      orgId: actor.orgId,
      codigo: `FA-${l.codigo}`,
      loteId,
      estanqueId: String(registro.estanqueId),
      tipo: l.tipo,
      variedad: l.variedad,
      volumen: Number(registro.litros),
      fechaMolienda: String(registro.fecha),
      diasPlanificados: diasFAPorDefecto(l.tipo),
      estado: 'borrador',
      createdBy: actor.userId,
      updatedBy: actor.userId
    })
    .onConflictDoNothing();
};

const POSTERIORES_A_FA = ['Fermentando', 'Macerando', 'FML', 'En guarda', 'Envasado', 'Finalizado'];

/**
 * Hitos de la ficha → estado del lote (v1: domain.js:77-87):
 *  - inicio de FA: lote «Fermentando» (si no está más adelante) e inicio real;
 *  - fin de FA: lote «FML» (tinto sin fin de FML) o «En guarda», nunca hacia atrás (v1 podía devolver un lote envasado
 *    a guarda), fin real, y UNA tarea de trasiego para el enólogo (v1 creaba otra en cada guardado; al importar, ninguna).
 */
export const loteSegunFicha: Reaccion = async (tx, actor, { op, previo, registro, importando }) => {
  if (op !== 'upsert' || registro.deletedAt) return;
  const loteId = String(registro.loteId);
  const nuevo = (k: string) => !!registro[k] && !previo?.[k];
  const base = { version: sql`${lote.version} + 1`, updatedAt: new Date(), updatedBy: actor.userId };
  if (nuevo('inicioFA')) {
    await tx
      .update(lote)
      .set({ ...base, estado: 'Fermentando', inicioFAReal: String(registro.inicioFA) })
      .where(and(eq(lote.id, loteId), notInArray(lote.estado, POSTERIORES_A_FA)));
  }
  if (nuevo('finFA')) {
    const destino = registro.tipo === 'tinto' && !registro.finFML ? 'FML' : 'En guarda';
    await tx
      .update(lote)
      .set({ ...base, estado: destino, finFAReal: String(registro.finFA) })
      .where(and(eq(lote.id, loteId), notInArray(lote.estado, ['FML', 'En guarda', 'Envasado', 'Finalizado'])));
    if (importando) return;
    const [l] = await tx.select({ codigo: lote.codigo }).from(lote).where(eq(lote.id, loteId));
    await tx
      .insert(tarea)
      .values({
        id: idDerivado(actor.orgId, `tarea:finFA:${registro.id}`, 'reaccion'),
        orgId: actor.orgId,
        titulo: `Trasegar lote ${l?.codigo ?? ''}: FA finalizada`,
        descripcion: 'La fermentación alcohólica terminó. Evalúa trasiego/descube y ajuste de SO₂.',
        fecha: String(registro.finFA),
        rol: 'enologo',
        ruta: 'bodega?tab=movimientos',
        modulo: 'bodega',
        origenTipo: 'fermentacion',
        origenId: String(registro.id),
        createdBy: actor.userId,
        updatedBy: actor.userId
      })
      .onConflictDoNothing();
  }
};

/**
 * Una adición de SO₂ descuenta el metabisulfito en la unidad real del insumo (v1 asumía kg) y, si se midió el SO₂
 * después, registra esa medición en el seguimiento. Borrar la adición borra ambos (v1 dejaba la medición).
 */
export const efectosDeSO2: Reaccion = async (tx, actor, { op, registro }) => {
  const movId = idDerivado(actor.orgId, `so2:${registro.id}`, 'reaccion');
  const segId = idDerivado(actor.orgId, `so2seg:${registro.id}`, 'reaccion');
  const borrado = op === 'delete' || !!registro.deletedAt;
  const borrar = async (t: typeof movInsumo | typeof seguimiento, id: string) =>
    tx
      .update(t)
      .set({ deletedAt: new Date(), version: sql`${t.version} + 1`, updatedAt: new Date(), updatedBy: actor.userId })
      .where(and(eq(t.id, id), isNull(t.deletedAt)));
  if (borrado) {
    await borrar(movInsumo, movId);
    await borrar(seguimiento, segId);
    return;
  }
  const [ins] = await tx
    .select({ unidad: insumo.unidad })
    .from(insumo)
    .where(eq(insumo.id, String(registro.insumoId)));
  const cantidad = gramosEnUnidad(registro.gramos, ins?.unidad);
  if (cantidad == null) throw new ReglaError(`El metabisulfito debe estar en kg o g en el maestro de insumos (está en ${ins?.unidad ?? '—'}).`);
  const mov = {
    fecha: String(registro.fecha),
    insumoId: String(registro.insumoId),
    cantidad: -cantidad,
    tipo: 'so2',
    origenTipo: 'adicion_so2',
    origenId: String(registro.id),
    deletedAt: null,
    updatedAt: new Date(),
    updatedBy: actor.userId
  };
  await tx
    .insert(movInsumo)
    .values({ ...mov, id: movId, orgId: actor.orgId, createdBy: actor.userId })
    .onConflictDoUpdate({ target: movInsumo.id, set: { ...mov, version: sql`${movInsumo.version} + 1` } });
  if (registro.so2Medido == null) {
    await borrar(seguimiento, segId);
    return;
  }
  const seg = {
    fermentacionId: String(registro.fermentacionId),
    fecha: String(registro.fecha),
    so2Libre: Number(registro.so2Medido),
    responsable: (registro.responsable as string | null) ?? null,
    observaciones: 'Medición post adición de SO₂',
    deletedAt: null,
    updatedAt: new Date(),
    updatedBy: actor.userId
  };
  await tx
    .insert(seguimiento)
    .values({ ...seg, id: segId, orgId: actor.orgId, createdBy: actor.userId })
    .onConflictDoUpdate({ target: seguimiento.id, set: { ...seg, version: sql`${seguimiento.version} + 1` } });
};

/**
 * Borrar una ficha borra su seguimiento y sus adiciones de SO₂; cada adición devuelve el metabisulfito al stock
 * (mismos efectos que borrarla a mano). El estado del lote no se revierte: se corrige a mano si hace falta.
 */
export const fichaBorrada: Reaccion = async (tx, actor, ctx) => {
  if (ctx.op !== 'delete' && !ctx.registro.deletedAt) return;
  const id = String(ctx.registro.id);
  const adiciones = (await tx
    .select()
    .from(adicionSO2)
    .where(and(eq(adicionSO2.fermentacionId, id), isNull(adicionSO2.deletedAt)))) as Record<string, unknown>[];
  for (const a of adiciones) {
    await tx
      .update(adicionSO2)
      .set({ deletedAt: new Date(), version: sql`${adicionSO2.version} + 1`, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(adicionSO2.id, String(a.id)));
    await efectosDeSO2(tx, actor, { entity: 'adicion_so2', op: 'delete', previo: a, registro: a });
  }
  await tx
    .update(seguimiento)
    .set({ deletedAt: new Date(), version: sql`${seguimiento.version} + 1`, updatedAt: new Date(), updatedBy: actor.userId })
    .where(and(eq(seguimiento.fermentacionId, id), isNull(seguimiento.deletedAt)));
};
