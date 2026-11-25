/**
 * Tareas manuales de v1 (F7-4, importador). Las que crean las reacciones y servicios se regeneran solas; estas son
 * las que el usuario anotó a mano para un rol o para toda la viña.
 */
import { z } from 'zod';

const texto = (max = 300) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const tareaV1Input = z.object({
  id: z.string().min(1),
  titulo: z.string().trim().min(1).max(200),
  descripcion: texto(500),
  fecha: z.iso.date(),
  rol: texto(40),
  /** v1 usaba rutas con hash (`#/tributario`); v2, relativas a la viña (`tributario`). */
  ruta: z.preprocess((v) => (typeof v === 'string' ? v.replace(/^#\//, '') : v), texto(200)),
  modulo: texto(40),
  estado: z.preprocess((v) => (v === 'hecha' || v === 'completada' || v === 'lista' ? 'hecha' : 'pendiente'), z.enum(['pendiente', 'hecha']))
});
export type TareaV1Input = z.input<typeof tareaV1Input>;
