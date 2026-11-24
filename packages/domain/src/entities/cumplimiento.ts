/**
 * Cumplimiento normativo (F6-4) — port de js/modules/cumplimiento (v1): registro de obligaciones con vencimiento,
 * recordatorios SAG, verificaciones automáticas y libro de existencias. Referencias: Ley 18.455 y Decreto 78 (SAG),
 * Ley 19.925 (patentes de alcoholes), INAPI (marcas), SII.
 */
import { z } from 'zod';

export const TIPOS_CUMPLIMIENTO = ['SAG', 'SII', 'Patente', 'INAPI', 'D.O.', 'Certificación', 'Municipal', 'Otro'] as const;
export const ESTADOS_CUMPLIMIENTO = ['vigente', 'por vencer', 'vencido', 'pendiente'] as const;
export type EstadoCumplimiento = (typeof ESTADOS_CUMPLIMIENTO)[number];

const texto = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);
const fechaOpc = z.preprocess((v) => (v === '' ? null : v), z.iso.date('Fecha inválida.').nullable().optional());

export const cumplimientoInput = z.object({
  id: z.string().min(1).optional(),
  nombre: z.string().trim().min(1, 'Indica la obligación.').max(160),
  tipo: z.enum(TIPOS_CUMPLIMIENTO).default('SAG'),
  numero: texto(60),
  /** vigente = obtenida o cumplida; pendiente = en trámite. */
  estado: z.enum(['vigente', 'pendiente']).default('vigente'),
  fecha: fechaOpc,
  vencimiento: fechaOpc,
  avisoDias: z.coerce.number().int('Días enteros.').min(0).max(730).default(30),
  responsable: texto(80),
  notas: texto(500)
});
export type CumplimientoInput = z.input<typeof cumplimientoInput>;

/**
 * Estado derivado (v1: estadoDe): pendiente si está en trámite; sin vencimiento, vigente; vencido si ya pasó; por
 * vencer dentro de los días de aviso.
 */
export function estadoCumplimiento(c: { estado: string; vencimiento?: string | null; avisoDias?: number | null }, hoy: string): EstadoCumplimiento {
  if (c.estado === 'pendiente') return 'pendiente';
  if (!c.vencimiento) return 'vigente';
  const d = Math.round((Date.parse(c.vencimiento) - Date.parse(hoy)) / 86_400_000);
  return d < 0 ? 'vencido' : d <= (c.avisoDias ?? 30) ? 'por vencer' : 'vigente';
}

/** Declaraciones SAG del año: cosecha (1–30 de junio, correcciones al 15 de julio) y existencias (1–19 de enero). */
export function recordatoriosSag(hoy: string) {
  const y = hoy.slice(0, 4);
  return {
    cosecha: { activa: hoy >= `${y}-06-01` && hoy <= `${y}-07-15`, texto: 'Del 1 al 30 de junio (correcciones hasta el 15 de julio).' },
    existencias: { activa: hoy.slice(5) <= '01-19', texto: 'Del 1 al 19 de enero.' }
  };
}

/** Se registra la inscripción de productos ante el SAG (todo vino se inscribe antes de comercializarse). */
export const esInscripcionProductos = (nombre: string) => /inscripci[oó]n de productos/i.test(nombre);

export interface FilaExistencias {
  ubicacion: string;
  lote: string;
  variedad: string;
  tipo: string;
  anada: number | string;
  estado: string;
  litros: number;
}

/**
 * Libro de existencias para la declaración SAG (v1: libroExistencias): granel por estanque y lote, y producto
 * terminado por orden ("Bodega PT", litros = unidades × litros del formato). Mismas columnas que v1.
 */
export function libroExistencias(
  granel: readonly { estanque: string; lote: string; variedad: string | null; tipo: string | null; anada: number | null; litros: number }[],
  producto: readonly {
    lote: string;
    variedad: string | null;
    tipo: string | null;
    anada: number | null;
    formato: string;
    litrosFormato: number;
    stock: number;
  }[]
): FilaExistencias[] {
  return [
    ...granel.map((g) => ({
      ubicacion: g.estanque,
      lote: g.lote,
      variedad: g.variedad ?? '',
      tipo: g.tipo ?? '',
      anada: g.anada ?? '',
      estado: 'Granel',
      litros: Math.round(g.litros)
    })),
    ...producto
      .filter((p) => p.stock > 0)
      .map((p) => ({
        ubicacion: 'Bodega PT',
        lote: p.lote,
        variedad: p.variedad ?? '',
        tipo: p.tipo ?? '',
        anada: p.anada ?? '',
        estado: `Envasado ${p.formato} (${p.stock.toLocaleString('es-CL')} un)`,
        litros: Math.round(p.stock * p.litrosFormato)
      }))
  ];
}

export const COLUMNAS_EXISTENCIAS: [keyof FilaExistencias, string][] = [
  ['ubicacion', 'Ubicación'],
  ['lote', 'Lote'],
  ['variedad', 'Variedad'],
  ['tipo', 'Tipo'],
  ['anada', 'Añada'],
  ['estado', 'Estado'],
  ['litros', 'Litros']
];

/** CSV del libro (separador `;` y BOM, como las exportaciones de v1 y v2). */
export function csvExistencias(filas: readonly FilaExistencias[]): string {
  const q = (v: unknown) => {
    const s = String(v ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [COLUMNAS_EXISTENCIAS.map(([, l]) => l), ...filas.map((f) => COLUMNAS_EXISTENCIAS.map(([k]) => q(f[k])))].map((r) => r.join(';')).join('\r\n');
}
