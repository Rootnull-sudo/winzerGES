/**
 * Conciliación bancaria (F6-3, online). Cuentas, cartolas (CSV adjunto a la cartola), libro de banco y matches con
 * los candidatos de `v_candidatos_banco` (cobros, pagos, gastos, remuneraciones, honorarios e impuestos).
 * Un candidato se concilia una sola vez (índice único). La diferencia que genera un gasto financiero queda
 * conciliada con ese gasto; deshacer el match lo elimina (v1 dejaba el gasto y lo volvía a contar).
 */
import {
  autoConciliar,
  cuentaBancoInput,
  diferenciaInput,
  huellaMov,
  importarCartolaInput,
  movManualInput,
  type Candidato,
  type CuentaBancoInput,
  type DiferenciaInput,
  type ImportarCartolaInput,
  type MovManualInput
} from '@winzer/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../client';
import { can, ReglaError, softDelete, upsert, type Actor, type EntityMeta } from '../repo';
import { cartola, conciliacionMatch, cuentaBanco, movBanco } from '../schema';
import { eliminarGasto, guardarGasto } from './gastos';

export const metaCuenta: EntityMeta = {
  entity: 'cuenta_banco',
  module: 'conciliacion',
  label: 'cuentas bancarias',
  sensitive: true,
  display: (r) => `${r.banco} ${r.numero}`
};
export const metaMovBanco: EntityMeta = { entity: 'mov_banco', module: 'conciliacion', label: 'movimientos bancarios', display: (r) => String(r.glosa) };
const metaMatch: EntityMeta = { entity: 'conciliacion_match', module: 'conciliacion', label: 'conciliaciones', display: (r) => `${r.origenTipo} ${r.monto}` };
const metaCartola: EntityMeta = { entity: 'cartola', module: 'conciliacion', label: 'cartolas', display: (r) => String(r.archivo ?? 'Cartola') };
const clp = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

export async function guardarCuenta(tx: Tx, actor: Actor, input: CuentaBancoInput, baseVersion?: number) {
  const c = cuentaBancoInput.parse(input);
  return upsert(tx, cuentaBanco, actor, metaCuenta, { ...c, id: c.id ?? randomUUID() }, { baseVersion, checkVersion: baseVersion != null });
}

export async function eliminarCuenta(tx: Tx, actor: Actor, id: string) {
  const [m] = await tx
    .select({ id: movBanco.id })
    .from(movBanco)
    .where(and(eq(movBanco.cuentaId, id), isNull(movBanco.deletedAt)))
    .limit(1);
  if (m) throw new ReglaError('La cuenta tiene movimientos: no se puede eliminar.');
  return softDelete(tx, cuentaBanco, actor, metaCuenta, id);
}

/** Candidatos sin conciliar (todas las cuentas: un cobro o pago no dice por qué cuenta pasó). */
export async function candidatosLibres(tx: Tx): Promise<Candidato[]> {
  const rows = await tx.execute<{ origen_tipo: string; origen_id: string; fecha: string; monto: string; descripcion: string }>(
    sql`select origen_tipo, origen_id, fecha, monto, descripcion from v_candidatos_banco where not conciliado order by fecha`
  );
  return rows.map((r) => ({ origenTipo: r.origen_tipo, origenId: r.origen_id, fecha: r.fecha, monto: Number(r.monto), descripcion: r.descripcion }));
}

async function huellasDe(tx: Tx, cuentaId: string) {
  const rows = await tx
    .select({ huella: movBanco.huella })
    .from(movBanco)
    .where(and(eq(movBanco.cuentaId, cuentaId), isNull(movBanco.deletedAt)));
  return new Set(rows.map((r) => r.huella));
}

async function cuentaViva(tx: Tx, id: string) {
  const [c] = await tx.select().from(cuentaBanco).where(eq(cuentaBanco.id, id));
  if (!c || c.deletedAt) throw new ReglaError('La cuenta no existe.');
  return c;
}

export async function movimientoManual(tx: Tx, actor: Actor, input: MovManualInput) {
  const x = movManualInput.parse(input);
  await cuentaViva(tx, x.cuentaId);
  const monto = x.sentido === 'cargo' ? -x.monto : x.monto;
  const huella = huellaMov(x.fecha, monto, x.glosa);
  if ((await huellasDe(tx, x.cuentaId)).has(huella)) throw new ReglaError('Ya existe un movimiento con la misma fecha, monto y glosa en esta cuenta.');
  return upsert(tx, movBanco, actor, metaMovBanco, {
    id: randomUUID(),
    cuentaId: x.cuentaId,
    fecha: x.fecha,
    glosa: x.glosa,
    monto,
    estado: 'pendiente',
    huella
  });
}

/**
 * Importa una cartola ya leída en el navegador (filas fecha/glosa/monto): crea la cartola, agrega los movimientos
 * nuevos (los repetidos por huella se informan y se omiten) y concilia automáticamente.
 */
export async function importarCartola(tx: Tx, actor: Actor, input: ImportarCartolaInput) {
  const x = importarCartolaInput.parse(input);
  can(actor, metaMovBanco, 'c');
  await cuentaViva(tx, x.cuentaId);
  const vistas = await huellasDe(tx, x.cuentaId);
  const cartolaId = randomUUID();
  const nuevas: (typeof movBanco.$inferInsert)[] = [];
  let duplicadas = 0;
  for (const f of x.filas) {
    const huella = huellaMov(f.fecha, f.monto, f.glosa);
    if (vistas.has(huella)) {
      duplicadas++;
      continue;
    }
    vistas.add(huella);
    nuevas.push({
      id: randomUUID(),
      orgId: actor.orgId,
      createdBy: actor.userId,
      updatedBy: actor.userId,
      cuentaId: x.cuentaId,
      cartolaId,
      fecha: f.fecha,
      glosa: f.glosa,
      monto: f.monto,
      estado: 'pendiente',
      huella
    });
  }
  await upsert(tx, cartola, actor, metaCartola, {
    id: cartolaId,
    cuentaId: x.cuentaId,
    archivo: x.archivo,
    mapeo: x.mapeo,
    filasImportadas: nuevas.length,
    duplicadas
  });
  for (let i = 0; i < nuevas.length; i += 500) await tx.insert(movBanco).values(nuevas.slice(i, i + 500));
  const conciliados = nuevas.length ? await autoConciliarCuenta(tx, actor, x.cuentaId) : 0;
  return { id: cartolaId, cartolaId, importados: nuevas.length, duplicadas, conciliados };
}

async function crearMatch(
  tx: Tx,
  actor: Actor,
  mov: typeof movBanco.$inferSelect,
  origen: { origenTipo: string; origenId: string; monto: number },
  o: { automatico?: boolean; generoGasto?: boolean; nota?: string | null } = {}
) {
  const diferencia = mov.monto - origen.monto;
  await upsert(tx, conciliacionMatch, actor, metaMatch, {
    id: randomUUID(),
    movBancoId: mov.id,
    origenTipo: origen.origenTipo,
    origenId: origen.origenId,
    monto: origen.monto,
    diferencia,
    nota: o.nota ?? null,
    automatico: !!o.automatico,
    generoGasto: !!o.generoGasto
  });
  const cuadra = Math.abs(diferencia) <= 1;
  await upsert(tx, movBanco, actor, metaMovBanco, {
    id: mov.id,
    estado: cuadra ? 'conciliado' : 'diferencia',
    nota: o.nota ?? (cuadra ? null : `Diferencia ${clp(diferencia)}`)
  });
}

/** Concilia los movimientos pendientes de la cuenta con la mejor sugerencia única (±1 peso, ±7 días). */
export async function autoConciliarCuenta(tx: Tx, actor: Actor, cuentaId: string) {
  can(actor, metaMovBanco, 'e');
  const movs = await tx
    .select()
    .from(movBanco)
    .where(and(eq(movBanco.cuentaId, cuentaId), eq(movBanco.estado, 'pendiente'), isNull(movBanco.deletedAt)))
    .orderBy(movBanco.fecha);
  const pares = autoConciliar(movs, await candidatosLibres(tx));
  for (const p of pares)
    await crearMatch(
      tx,
      actor,
      movs.find((m) => m.id === p.mov.id)!,
      p.cand,
      { automatico: true }
    );
  return pares.length;
}

async function movParaConciliar(tx: Tx, movId: string) {
  const [m] = await tx.select().from(movBanco).where(eq(movBanco.id, movId)).for('update');
  if (!m || m.deletedAt) throw new ReglaError('El movimiento no existe.');
  const [ya] = await tx
    .select({ id: conciliacionMatch.id })
    .from(conciliacionMatch)
    .where(and(eq(conciliacionMatch.movBancoId, movId), isNull(conciliacionMatch.deletedAt)))
    .limit(1);
  if (ya || m.estado === 'conciliado') throw new ReglaError('El movimiento ya está conciliado: deshaz la conciliación primero.');
  return m;
}

/** Conciliación manual con un candidato libre; si los montos difieren, queda en "diferencia" con la diferencia. */
export async function conciliar(tx: Tx, actor: Actor, input: { movId: string; origenTipo: string; origenId: string; nota?: string | null }) {
  can(actor, metaMovBanco, 'e');
  const m = await movParaConciliar(tx, input.movId);
  const [c] = await tx.execute<{ monto: string; conciliado: boolean }>(
    sql`select monto, conciliado from v_candidatos_banco where origen_tipo = ${input.origenTipo} and origen_id = ${input.origenId}`
  );
  if (!c) throw new ReglaError('El documento no existe o no es conciliable (pagado en efectivo o sin pagar).');
  if (c.conciliado) throw new ReglaError('Ese documento ya está conciliado con otro movimiento.');
  if (Math.sign(Number(c.monto)) !== Math.sign(m.monto)) throw new ReglaError('Un cargo se concilia con una salida y un abono con una entrada.');
  await crearMatch(tx, actor, m, { origenTipo: input.origenTipo, origenId: input.origenId, monto: Number(c.monto) }, { nota: input.nota ?? null });
}

/** Deshace la conciliación del movimiento (y elimina el gasto financiero que se creó al registrar la diferencia). */
export async function desconciliar(tx: Tx, actor: Actor, movId: string) {
  can(actor, metaMovBanco, 'e');
  const matches = await tx
    .select()
    .from(conciliacionMatch)
    .where(and(eq(conciliacionMatch.movBancoId, movId), isNull(conciliacionMatch.deletedAt)));
  for (const x of matches) {
    await softDelete(tx, conciliacionMatch, actor, metaMatch, x.id);
    if (x.generoGasto && x.origenTipo === 'gasto') await eliminarGasto(tx, actor, x.origenId);
  }
  return upsert(tx, movBanco, actor, metaMovBanco, { id: movId, estado: 'pendiente', nota: null });
}

/**
 * Diferencia sin documento en libros (v1: "registrar diferencia"): con `crearGasto` y un cargo, crea el gasto
 * financiero pagado y lo deja conciliado con el movimiento; si no, el movimiento queda en "diferencia" con el motivo.
 */
export async function registrarDiferencia(tx: Tx, actor: Actor, input: DiferenciaInput) {
  can(actor, metaMovBanco, 'e');
  const x = diferenciaInput.parse(input);
  const m = await movParaConciliar(tx, x.movId);
  if (x.crearGasto) {
    if (m.monto >= 0) throw new ReglaError('Solo un cargo genera un gasto financiero.');
    const g = await guardarGasto(tx, actor, {
      fecha: m.fecha,
      categoria: 'financiero',
      descripcion: `${x.motivo} · ${m.glosa}`.slice(0, 160),
      monto: -m.monto,
      documento: 'otro',
      afectoIVA: false,
      medioPago: 'cargo_automatico',
      estado: 'pagado',
      tipoCosto: 'fijo',
      area: 'admin'
    } as never);
    await crearMatch(tx, actor, m, { origenTipo: 'gasto', origenId: String(g.id), monto: m.monto }, { generoGasto: true, nota: x.motivo });
    return;
  }
  await upsert(tx, movBanco, actor, metaMovBanco, { id: m.id, estado: 'diferencia', nota: x.motivo });
}
