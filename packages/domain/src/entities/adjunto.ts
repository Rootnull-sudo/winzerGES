/**
 * Archivos adjuntos (ADR 0013). Reglas puras compartidas por servidor e interfaz: qué entidades aceptan adjuntos
 * (y qué módulo da el permiso), tipos y tamaño permitidos, y la clave del objeto en el almacenamiento.
 */
import { z } from 'zod';

/** Entidad → módulo dueño. Subir o borrar exige `e` en ese módulo; ver y descargar, `v`. Agregar al migrar un módulo. */
export const ADJUNTABLES: Record<string, string> = {
  cliente: 'clientes',
  cuartel: 'catastro',
  analisis: 'laboratorio',
  proveedor: 'proveedores',
  compra: 'proveedores',
  gasto: 'administracion'
};

/** 20 MB por archivo. */
export const MAX_BYTES_ADJUNTO = 20 * 1024 * 1024;

/** Tipos permitidos: documentos, planillas, imágenes, XML (DTE) y texto (cartolas CSV). */
export const MIME_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'text/csv',
  'text/plain',
  'application/xml',
  'text/xml',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
] as const;

/** Nombre de archivo seguro para la clave: sin rutas ni caracteres raros, máx. 80. */
export function nombreSeguro(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? 'archivo';
  const limpio = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (limpio || 'archivo').slice(-80);
}

/** Clave del objeto: siempre bajo el prefijo de la viña. */
export const claveObjeto = (orgId: string, entidad: string, registroId: string, id: string, nombre: string) =>
  `${orgId}/${entidad}/${registroId}/${id}-${nombreSeguro(nombre)}`;

export const subidaInput = z.object({
  entidad: z.string().refine((e) => e in ADJUNTABLES, 'Esta entidad no acepta adjuntos.'),
  registroId: z.string().min(1).max(100),
  nombre: z.string().trim().min(1).max(200),
  mime: z.enum(MIME_PERMITIDOS, { message: 'Tipo de archivo no permitido. Usa PDF, imagen, planilla, XML o texto.' }),
  bytes: z
    .number()
    .int()
    .positive('El archivo está vacío.')
    .max(MAX_BYTES_ADJUNTO, `El archivo supera los ${MAX_BYTES_ADJUNTO / 1024 / 1024} MB.`)
});
export type SubidaInput = z.input<typeof subidaInput>;
