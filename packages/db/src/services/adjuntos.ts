/**
 * Adjuntos (ADR 0013, F0-6). El archivo va directo del navegador al almacenamiento S3 (R2) con una URL firmada;
 * Postgres guarda solo los metadatos en `adjunto`.
 *
 * Flujo: prepararSubida (permiso + validación + URL PUT de 5 min) → el navegador sube → confirmarSubida (el
 * servidor mira el objeto real con HEAD: tamaño, tipo y cuota del plan, y recién entonces guarda la fila).
 * Descarga: URL GET firmada de 5 min, después de verificar el permiso de ver. El bucket nunca es público.
 */
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ADJUNTABLES, assertCan, claveObjeto, MAX_BYTES_ADJUNTO, MIME_PERMITIDOS, PermissionError, subidaInput, type SubidaInput } from '@winzer/domain';
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../client';
import { softDelete, upsert, type Actor, type EntityMeta } from '../repo';
import { adjunto } from '../schema';
import { withOrg } from '../tenancy';

const URL_SEGUNDOS = 300;

export class AdjuntoError extends Error {
  readonly status = 422;
}

/* ---------------- Almacenamiento ---------------- */

const g = globalThis as unknown as { __winzerS3?: { client: S3Client; bucket: string; listo?: Promise<void> } };

/** Cliente S3 desde las variables de entorno (S3_ENDPOINT, S3_BUCKET…). Error claro si faltan. */
export function almacenamiento() {
  if (!g.__winzerS3) {
    const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
    if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
      throw new AdjuntoError('Los adjuntos no están configurados en este servidor (faltan las variables S3_*).');
    }
    const client = new S3Client({
      endpoint: S3_ENDPOINT || undefined,
      region: S3_REGION || 'auto',
      forcePathStyle: !!S3_ENDPOINT,
      credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY }
    });
    g.__winzerS3 = { client, bucket: S3_BUCKET };
  }
  const s = g.__winzerS3;
  // Solo desarrollo/CI: crear el bucket si no existe (en R2 se crea a mano con su CORS).
  if (process.env.S3_CREAR_BUCKET === '1')
    s.listo ??= s.client
      .send(new HeadBucketCommand({ Bucket: s.bucket }))
      .then(() => undefined)
      .catch(() => s.client.send(new CreateBucketCommand({ Bucket: s.bucket })).then(() => undefined));
  return s;
}

async function s3() {
  const s = almacenamiento();
  await s.listo;
  return s;
}

/* ---------------- Permisos ---------------- */

const meta = (entidad: string): EntityMeta => ({
  entity: 'adjunto',
  module: ADJUNTABLES[entidad] ?? '__ninguno__',
  label: 'adjuntos',
  sensitive: true,
  display: (r) => `${r.entidad}/${r.registroId}: ${r.nombre}`
});

function exigir(actor: Actor, entidad: string, accion: 'v' | 'e') {
  const modulo = ADJUNTABLES[entidad];
  if (!modulo) throw new AdjuntoError('Esta entidad no acepta adjuntos.');
  assertCan(actor.role, modulo, accion, 'adjuntos de este registro', actor.customRoles, actor.acceso);
}

/** Bytes usados por la viña (adjuntos no borrados). */
export async function usoAlmacenamiento(tx: Tx): Promise<number> {
  const [r] = await tx
    .select({ n: sql<string>`coalesce(sum(${adjunto.bytes}), 0)` })
    .from(adjunto)
    .where(isNull(adjunto.deletedAt));
  return Number(r?.n ?? 0);
}

async function verificarCuota(tx: Tx, actor: Actor, bytes: number) {
  if (!actor.acceso) return;
  const limite = actor.acceso.maxGb * 1024 ** 3;
  if ((await usoAlmacenamiento(tx)) + bytes > limite)
    throw new AdjuntoError(`Se alcanzó el espacio del plan ${actor.acceso.planNombre} (${actor.acceso.maxGb} GB). Borra adjuntos o cambia de plan.`);
}

/* ---------------- Operaciones ---------------- */

export interface SubidaPreparada {
  id: string;
  clave: string;
  url: string;
}

/** Valida y firma una URL PUT de 5 minutos. No guarda nada todavía. */
export async function prepararSubida(tx: Tx, actor: Actor, input: SubidaInput): Promise<SubidaPreparada> {
  const d = subidaInput.parse(input);
  exigir(actor, d.entidad, 'e');
  await verificarCuota(tx, actor, d.bytes);
  const id = randomUUID();
  const clave = claveObjeto(actor.orgId, d.entidad, d.registroId, id, d.nombre);
  const { client, bucket } = await s3();
  const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: clave, ContentType: d.mime }), { expiresIn: URL_SEGUNDOS });
  return { id, clave, url };
}

/**
 * Registra el adjunto ya subido. Lee el objeto real (HEAD): el tamaño y el tipo que cuentan son los del archivo,
 * no los que declaró el navegador. Si algo no calza, borra el objeto y rechaza.
 */
export async function confirmarSubida(tx: Tx, actor: Actor, input: { id: string; clave: string; entidad: string; registroId: string; nombre: string }) {
  exigir(actor, input.entidad, 'e');
  const esperado = claveObjeto(actor.orgId, input.entidad, input.registroId, input.id, input.nombre);
  if (input.clave !== esperado) throw new PermissionError('La clave del archivo no corresponde a este registro.');
  const { client, bucket } = await s3();
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: input.clave })).catch(() => null);
  if (!head) throw new AdjuntoError('No se encontró el archivo subido. Vuelve a intentarlo.');
  const bytes = Number(head.ContentLength ?? 0);
  const mime = String(head.ContentType ?? '').split(';')[0]!;
  try {
    if (bytes <= 0 || bytes > MAX_BYTES_ADJUNTO) throw new AdjuntoError(`El archivo supera los ${MAX_BYTES_ADJUNTO / 1024 / 1024} MB.`);
    if (!(MIME_PERMITIDOS as readonly string[]).includes(mime)) throw new AdjuntoError('Tipo de archivo no permitido.');
    await verificarCuota(tx, actor, bytes);
  } catch (e) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: input.clave })).catch(() => {});
    throw e;
  }
  return upsert(tx, adjunto, actor, meta(input.entidad), {
    id: input.id,
    entidad: input.entidad,
    registroId: input.registroId,
    claveObjeto: input.clave,
    nombre: input.nombre,
    mime,
    bytes
  });
}

export interface AdjuntoRow {
  id: string;
  nombre: string;
  mime: string;
  bytes: number;
  createdAt: Date;
}

/** Adjuntos de un registro, del más reciente al más antiguo. */
export async function listarAdjuntos(tx: Tx, actor: Actor, entidad: string, registroId: string): Promise<AdjuntoRow[]> {
  exigir(actor, entidad, 'v');
  return tx
    .select({ id: adjunto.id, nombre: adjunto.nombre, mime: adjunto.mime, bytes: adjunto.bytes, createdAt: adjunto.createdAt })
    .from(adjunto)
    .where(and(eq(adjunto.entidad, entidad), eq(adjunto.registroId, registroId), isNull(adjunto.deletedAt)))
    .orderBy(desc(adjunto.createdAt));
}

/** URL GET firmada de 5 minutos, con el nombre original al descargar. */
export async function urlDescarga(tx: Tx, actor: Actor, id: string): Promise<string> {
  const [a] = await tx
    .select()
    .from(adjunto)
    .where(and(eq(adjunto.id, id), isNull(adjunto.deletedAt)));
  if (!a) throw new AdjuntoError('El adjunto no existe o fue eliminado.');
  exigir(actor, a.entidad, 'v');
  const { client, bucket } = await s3();
  const disposicion = `attachment; filename*=UTF-8''${encodeURIComponent(a.nombre)}`;
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: a.claveObjeto, ResponseContentDisposition: disposicion }), {
    expiresIn: URL_SEGUNDOS
  });
}

/** Borrado lógico (permiso `d` del módulo dueño): el archivo queda 30 días por si hay que recuperarlo; luego lo elimina `purgarAdjuntos`. */
export async function eliminarAdjunto(tx: Tx, actor: Actor, id: string) {
  const [a] = await tx.select({ entidad: adjunto.entidad }).from(adjunto).where(eq(adjunto.id, id));
  if (!a) return null;
  exigir(actor, a.entidad, 'e');
  return softDelete(tx, adjunto, actor, meta(a.entidad), id);
}

/** Job semanal: elimina del almacenamiento y de la tabla los adjuntos borrados hace más de `dias` días. */
export async function purgarAdjuntos(orgId: string, dias = 30): Promise<number> {
  const limite = new Date(Date.now() - dias * 86_400_000);
  const { client, bucket } = await s3();
  return withOrg(orgId, async (tx) => {
    const viejos = await tx.select({ id: adjunto.id, clave: adjunto.claveObjeto }).from(adjunto).where(lt(adjunto.deletedAt, limite));
    for (const v of viejos) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: v.clave }));
      await tx.delete(adjunto).where(eq(adjunto.id, v.id));
    }
    return viejos.length;
  });
}
