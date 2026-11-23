/**
 * Lotes, plan de vendimia y ventanas — port de js/modules/calendario (v1).
 * Diferencia con v1 (bug corregido): 0 días de guarda o de vendimia se respetan (v1 los convertía en 90 y 2 por usar `||`).
 */
import { z } from 'zod';
import { n } from '../num';

/** Estados del lote (v1: calendario/index.js:11, mismos textos). Los cambian las reacciones y, a mano, el enólogo. */
export const ESTADOS_LOTE = ['Planificado', 'En vendimia', 'En molienda', 'Fermentando', 'Macerando', 'FML', 'En guarda', 'Envasado', 'Finalizado'] as const;
export type EstadoLote = (typeof ESTADOS_LOTE)[number];

/** Fases del plan, en orden (el color de cada una es un token `fase-*`). */
export const FASES = ['Vendimia', 'FA', 'Maceración', 'FML', 'Guarda'] as const;
export type Fase = (typeof FASES)[number];

const fechaOpt = z.preprocess((v) => v || null, z.iso.date('Fecha inválida.').nullable()).optional();
const enteroOpt = (min: number) =>
  z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().min(min, `Debe ser ≥ ${min}.`).nullable()).optional();
const texto = (max = 120) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const loteInput = z
  .object({
    id: z.string().min(1).optional(),
    codigo: z.string().trim().min(1, 'Ingresa el código del lote.').max(40),
    temporadaId: z.string().min(1, 'Elige la temporada.'),
    /** Cuarteles de origen (v1: cuartelIds). */
    cuartelIds: z.array(z.string().min(1)).default([]),
    variedad: z.string().trim().min(1, 'Indica la variedad.').max(80),
    tipo: z.enum(['blanco', 'tinto']),
    valle: texto(80),
    estado: z.enum(ESTADOS_LOTE).default('Planificado'),
    litrosEstimados: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().min(0).nullable()).optional(),
    costoUvaComprada: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().min(0).nullable()).optional(),
    fechaVendimiaPlan: z.iso.date('Ingresa la fecha planificada de vendimia.'),
    diasVendimia: enteroOpt(1),
    diasFA: enteroOpt(1),
    diasMaceracion: enteroOpt(0),
    diasFML: enteroOpt(0),
    diasGuarda: enteroOpt(0),
    // Hitos reales: los escriben las reacciones (cosecha, entrada de bodega, fermentación).
    inicioVendimiaReal: fechaOpt,
    fechaMoliendaReal: fechaOpt,
    inicioFAReal: fechaOpt,
    finFAReal: fechaOpt
  })
  // Maceración y FML solo aplican a tintos (v1: showIf).
  .transform((l) => (l.tipo === 'tinto' ? l : { ...l, diasMaceracion: null, diasFML: null }));
export type LoteInput = z.input<typeof loteInput>;
export type Lote = z.output<typeof loteInput> & { id: string };

/** Valores por defecto de un lote nuevo (v1: calendario/index.js:81). */
export const LOTE_DEFAULTS = { estado: 'Planificado', tipo: 'tinto', diasVendimia: 2, diasFA: 10, diasMaceracion: 7, diasFML: 30, diasGuarda: 180 } as const;

const addDays = (d: string, dias: number) => new Date(Date.parse(`${d}T00:00:00Z`) + Math.round(dias) * 86_400_000).toISOString().slice(0, 10);
const nn = (v: unknown, def: number) => (v === '' || v == null || Number.isNaN(Number(v)) ? def : n(v));

export interface FasePlan {
  fase: Fase;
  desde: string;
  hasta: string;
}

/**
 * Plan de fases de un lote (v1: calendario `plan`):
 * molienda = vendimia + 1; inicio FA = molienda + 1; fin FA = inicio + díasFA (10 tinto / 18 blanco);
 * descube = máx(fin maceración, fin FA); FML desde descube + 2; guarda hasta (fin FML o descube) + díasGuarda (90).
 */
export function planLote(l: {
  fechaVendimiaPlan?: string | null;
  tipo?: string | null;
  diasVendimia?: unknown;
  diasFA?: unknown;
  diasMaceracion?: unknown;
  diasFML?: unknown;
  diasGuarda?: unknown;
}): FasePlan[] {
  const v = l.fechaVendimiaPlan;
  if (!v) return [];
  const tinto = l.tipo === 'tinto';
  const mol = addDays(v, 1);
  const faIni = addDays(mol, 1);
  const faFin = addDays(faIni, n(l.diasFA) || (tinto ? 10 : 18));
  const macFin = tinto ? addDays(mol, n(l.diasMaceracion)) : null;
  const descube = tinto && macFin! > faFin ? macFin! : faFin;
  const fmlIni = tinto && n(l.diasFML) ? addDays(descube, 2) : null;
  const fmlFin = fmlIni ? addDays(fmlIni, n(l.diasFML)) : null;
  const guarFin = addDays(fmlFin ?? descube, nn(l.diasGuarda, 90));
  const out: FasePlan[] = [
    { fase: 'Vendimia', desde: v, hasta: addDays(v, nn(l.diasVendimia, 2)) },
    { fase: 'FA', desde: faIni, hasta: faFin }
  ];
  if (tinto && n(l.diasMaceracion)) out.push({ fase: 'Maceración', desde: mol, hasta: macFin! });
  if (fmlIni) out.push({ fase: 'FML', desde: fmlIni, hasta: fmlFin! });
  out.push({ fase: 'Guarda', desde: fmlFin ?? descube, hasta: guarFin });
  return out;
}

export interface HitosReales {
  faIni?: string | null;
  faFin?: string | null;
  fmlIni?: string | null;
  fmlFin?: string | null;
}

/** Hitos reales del lote: los de su ficha de fermentación si existe; si no, los que registraron las reacciones. */
export function hitosReales(
  l: { inicioFAReal?: string | null; finFAReal?: string | null },
  ficha?: { inicioFA?: string | null; finFA?: string | null; inicioFML?: string | null; finFML?: string | null } | null
): HitosReales {
  return ficha ? { faIni: ficha.inicioFA, faFin: ficha.finFA, fmlIni: ficha.inicioFML, fmlFin: ficha.finFML } : { faIni: l.inicioFAReal, faFin: l.finFAReal };
}

/** Desviaciones plan vs. real mayores al umbral (v1: calendario `desvios`): "Inicio FA +N d", "Fin FA −N d", "Fin FML +N d". */
export function desviosLote(plan: FasePlan[], real: HitosReales, umbralDias: number): string[] {
  const out: string[] = [];
  const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
  const fa = plan.find((p) => p.fase === 'FA');
  const fml = plan.find((p) => p.fase === 'FML');
  const add = (etiqueta: string, planeado?: string, efectivo?: string | null) => {
    if (!planeado || !efectivo) return;
    const d = dias(planeado, efectivo);
    if (Math.abs(d) > umbralDias) out.push(`${etiqueta} ${d > 0 ? '+' : '−'}${Math.abs(d)} d`);
  };
  add('Inicio FA', fa?.desde, real.faIni);
  add('Fin FA', fa?.hasta, real.faFin);
  add('Fin FML', fml?.hasta, real.fmlFin);
  return out;
}

/* ------------------------------ Ventanas de vendimia ------------------------------ */

const mmdd = z.string().regex(/^\d{2}-\d{2}$/, 'Usa el formato mm-dd, ej. 03-15.');
export const ventanaInput = z
  .object({
    id: z.string().min(1).optional(),
    variedad: z.string().trim().min(1, 'Indica la variedad.').max(80),
    valle: z.string().trim().min(1, 'Indica el valle.').max(80),
    desde: mmdd,
    hasta: mmdd,
    fuente: texto(200)
  })
  .refine((w) => w.hasta >= w.desde, { message: 'Debe ser posterior a "desde".', path: ['hasta'] });
export type VentanaInput = z.input<typeof ventanaInput>;
export type Ventana = z.output<typeof ventanaInput> & { id: string };

/** ¿La fecha planificada cae dentro de la ventana de su variedad y valle? null si no hay ventana para ese par. */
export function enVentana(
  fecha: string | null | undefined,
  variedad: string | null | undefined,
  valle: string | null | undefined,
  ventanas: readonly Ventana[]
) {
  if (!fecha || !variedad || !valle) return null;
  const w = ventanas.find((x) => x.variedad.toLowerCase() === variedad.toLowerCase() && x.valle.toLowerCase() === valle.toLowerCase());
  if (!w) return null;
  const md = fecha.slice(5);
  return { ventana: w, dentro: md >= w.desde && md <= w.hasta };
}

/** Ventanas referenciales de v1 (rangos típicos ODEPA/SAG), editables por la viña. */
export const VENTANAS_BASE: readonly [string, string, string, string][] = [
  ['Sauvignon Blanc', 'Casablanca', '02-20', '03-20'],
  ['Sauvignon Blanc', 'Leyda', '03-01', '03-30'],
  ['Sauvignon Blanc', 'Colchagua', '02-15', '03-15'],
  ['Sauvignon Blanc', 'Curicó', '02-15', '03-10'],
  ['Chardonnay', 'Casablanca', '02-25', '03-25'],
  ['Chardonnay', 'Leyda', '03-05', '04-05'],
  ['Chardonnay', 'Maipo', '02-15', '03-10'],
  ['Chardonnay', 'Bío Bío', '03-10', '04-05'],
  ['Pinot Noir', 'Casablanca', '02-25', '03-20'],
  ['Pinot Noir', 'Leyda', '03-01', '03-30'],
  ['Pinot Noir', 'Bío Bío', '03-10', '04-05'],
  ['Merlot', 'Colchagua', '03-10', '04-05'],
  ['Merlot', 'Maipo', '03-10', '04-05'],
  ['Merlot', 'Curicó', '03-10', '04-10'],
  ['Syrah', 'Colchagua', '03-15', '04-15'],
  ['Syrah', 'Maipo', '03-20', '04-20'],
  ['Cabernet Sauvignon', 'Maipo', '03-25', '04-30'],
  ['Cabernet Sauvignon', 'Colchagua', '03-20', '04-25'],
  ['Cabernet Sauvignon', 'Curicó', '03-25', '04-30'],
  ['Cabernet Sauvignon', 'Maule', '03-25', '04-30'],
  ['Carménère', 'Colchagua', '04-05', '05-10'],
  ['Carménère', 'Maipo', '04-10', '05-10'],
  ['Carménère', 'Maule', '04-10', '05-15'],
  ['País', 'Maule', '03-15', '04-20'],
  ['País', 'Itata', '03-20', '04-25'],
  ['País', 'Bío Bío', '03-25', '04-30'],
  ['Cinsault', 'Itata', '03-15', '04-15'],
  ['Moscatel de Alejandría', 'Itata', '03-01', '04-10'],
  ['Carignan', 'Maule', '03-25', '04-30'],
  ['Malbec', 'Maule', '03-20', '04-20']
];
export const FUENTE_VENTANAS_BASE = 'Referencial (rangos típicos ODEPA/SAG)';

/** Días de una ventana (mm-dd), en un año no bisiesto (v1 usaba 2026 fijo). */
export const diasVentana = (desde: string, hasta: string) => Math.round((Date.parse(`2001-${hasta}`) - Date.parse(`2001-${desde}`)) / 86_400_000);
