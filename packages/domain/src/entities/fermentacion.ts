/**
 * Fermentación: fichas, seguimiento diario y adiciones de SO₂ — port de js/modules/fermentacion (v1).
 * Cálculos enológicos en ../oenology.ts (ya portados con paridad).
 * Diferencias con v1 (bugs corregidos): la temperatura sobre 32 °C es un aviso y no bloquea; el °Brix 0 cuenta como
 * dato; el SO₂ se descuenta en la unidad real del insumo (v1 asumía kg).
 */
import { z } from 'zod';
import { n } from '../num';
import { brixDesdeDensidad, dosisMgL, so2Teorico } from '../oenology';

export const ESTADOS_FICHA = [
  ['borrador', 'Borrador'],
  ['activa', 'Activa'],
  ['cerrada', 'Cerrada']
] as const;
export const MOTIVOS_SO2 = ['Protección del mosto', 'Encubado', 'Post FA', 'Post FML', 'Guarda', 'Ajuste previo a envasado'] as const;

const fechaOpt = z.preprocess((v) => v || null, z.iso.date('Fecha inválida.').nullable()).optional();
const numOpt = (min: number, max: number, msg?: string) =>
  z
    .preprocess(
      (v) => (v === '' || v == null ? null : v),
      z.coerce
        .number()
        .min(min, msg ?? `Debe ser mayor o igual a ${min}.`)
        .max(max, msg ?? `Debe ser menor o igual a ${max}.`)
        .nullable()
    )
    .optional();
const texto = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const fermentacionInput = z
  .object({
    id: z.string().min(1).optional(),
    codigo: z.string().trim().min(1, 'Ingresa el código de la ficha.').max(40),
    loteId: z.string().min(1, 'Elige el lote.'),
    estanqueId: z.preprocess((v) => v || null, z.string().nullable()).optional(),
    tipo: z.enum(['blanco', 'tinto']),
    variedad: texto(80),
    volumen: z.coerce.number({ message: 'Ingresa el volumen.' }).min(1, 'Debe ser mayor o igual a 1.'),
    brixInicial: numOpt(10, 32),
    phInicial: numOpt(2.8, 4.2),
    acidezInicial: numOpt(0, 30),
    levadura: texto(120),
    nutrientes: texto(200),
    temperaturaObjetivo: texto(40),
    diasPlanificados: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().min(1).nullable()).optional(),
    fechaMolienda: fechaOpt,
    inicioFA: fechaOpt,
    inicioTumultuosa: fechaOpt,
    fechaCorte: fechaOpt,
    finFA: fechaOpt,
    inicioMaceracion: fechaOpt,
    finMaceracion: fechaOpt,
    inicioFML: fechaOpt,
    finFML: fechaOpt,
    alcoholFinal: numOpt(0, 18),
    azucarResidual: numOpt(0, 400),
    estado: z.enum(['borrador', 'activa', 'cerrada']).default('activa')
  })
  .refine((f) => !f.finFA || !f.inicioFA || f.finFA >= f.inicioFA, { message: 'Debe ser posterior al inicio de FA.', path: ['finFA'] })
  .refine((f) => !f.finFML || !f.inicioFML || f.finFML >= f.inicioFML, { message: 'Debe ser posterior al inicio de la FML.', path: ['finFML'] })
  // Maceración y FML solo aplican a tintos (v1: showIf).
  .transform((f) => (f.tipo === 'tinto' ? f : { ...f, inicioMaceracion: null, finMaceracion: null, inicioFML: null, finFML: null }));
export type FermentacionInput = z.input<typeof fermentacionInput>;
export type Fermentacion = z.output<typeof fermentacionInput> & { id: string };

export const seguimientoInput = z
  .object({
    id: z.string().min(1).optional(),
    fermentacionId: z.string().min(1),
    fecha: z.iso.date('Fecha inválida.'),
    responsable: texto(120),
    densidad: numOpt(980, 1140),
    brix: numOpt(-3, 32),
    /** Sobre 32 °C hay riesgo de parada: se avisa en la pantalla, no se bloquea (v1 bloqueaba). */
    temperatura: numOpt(0, 40),
    ph: numOpt(2.8, 4.3),
    acidezVolatil: numOpt(0, 2),
    so2Libre: numOpt(0, 150),
    so2Total: numOpt(0, 400),
    observaciones: texto(1000)
  })
  .refine((s) => s.so2Total == null || s.so2Libre == null || s.so2Total >= s.so2Libre, {
    message: 'El SO₂ total no puede ser menor que el libre.',
    path: ['so2Total']
  })
  // Si no hay °Brix pero sí densidad, se calcula (v1: brixDesdeDensidad, redondeado a 1 decimal).
  .transform((s) => (s.brix == null && s.densidad != null ? { ...s, brix: Math.round(brixDesdeDensidad(s.densidad) * 10) / 10 } : s));
export type SeguimientoInput = z.input<typeof seguimientoInput>;
export type SeguimientoFA = z.output<typeof seguimientoInput> & { id: string };

export const adicionSO2Input = z
  .object({
    id: z.string().min(1).optional(),
    fermentacionId: z.string().min(1),
    fecha: z.iso.date('Fecha inválida.'),
    insumoId: z.string().min(1, 'Elige el metabisulfito.'),
    /** Nombre del producto al registrar (foto). */
    producto: texto(120),
    fraccion: z.coerce.number().positive().max(1),
    gramos: z.coerce.number({ message: 'Ingresa los gramos.' }).min(1, 'Debe ser mayor o igual a 1.'),
    volumen: z.coerce.number({ message: 'Ingresa el volumen.' }).min(1, 'Debe ser mayor o igual a 1.'),
    so2Previo: numOpt(0, 200),
    so2Medido: numOpt(0, 200),
    modo: z.enum(['suave', 'moderado']).default('suave'),
    motivo: texto(120),
    responsable: texto(120),
    /** Foto: gramos convertidos a la unidad del insumo × precio. */
    costo: z.coerce.number().int().min(0).default(0),
    dosisMgL: z.unknown().optional(),
    so2Teorico: z.unknown().optional()
  })
  // Dosis y SO₂ teórico se calculan siempre aquí (v1: oenology.dosisMgL / so2Teorico, redondeados a 1 decimal).
  .transform((a) => {
    const dosis = Math.round(dosisMgL(a.gramos, a.volumen, a.fraccion) * 10) / 10;
    return { ...a, dosisMgL: dosis, so2Teorico: Math.round(so2Teorico(a.so2Previo ?? 0, dosis) * 10) / 10 };
  });
export type AdicionSO2Input = z.input<typeof adicionSO2Input>;
export type AdicionSO2 = z.output<typeof adicionSO2Input> & { id: string };

/** Etapa visible de una ficha (v1: fermentacion/index.js:62). */
export function etapaFicha(f: { inicioFA?: string | null; finFA?: string | null; inicioFML?: string | null; finFML?: string | null }) {
  if (f.finFML) return 'FML terminada';
  if (f.inicioFML) return 'En FML';
  if (f.finFA) return 'FA terminada';
  if (f.inicioFA) return 'Fermentando';
  return 'Por iniciar';
}

/** Días de FA planificados por defecto (v1: 18 en blancos y 10 en tintos al crear la ficha automática). */
export const diasFAPorDefecto = (tipo: string | null | undefined) => (tipo === 'blanco' ? 18 : 10);

/**
 * Cantidad de producto en la unidad del insumo a partir de gramos. Solo unidades de masa: el metabisulfito y los
 * aditivos en polvo se pesan. null si la unidad no es de masa (el llamador debe rechazar o pedir otra unidad).
 */
export function gramosEnUnidad(gramos: unknown, unidad: string | null | undefined): number | null {
  if (unidad === 'g') return n(gramos);
  if (unidad === 'kg') return n(gramos) / 1000;
  return null;
}

/** Horas desde la última adición (v1 usa la fecha a mediodía, sin hora: se mantiene). null si no hay. */
export function horasDesdeUltimaAdicion(adiciones: readonly { fecha: string }[], ahora: Date = new Date()): number | null {
  const ultima = adiciones
    .map((a) => a.fecha)
    .sort()
    .at(-1);
  if (!ultima) return null;
  return (ahora.getTime() - Date.parse(`${ultima}T12:00:00`)) / 3_600_000;
}

/** Temperatura sobre la cual se avisa riesgo de parada de fermentación (v1: 32 °C). */
export const TEMPERATURA_RIESGO = 32;
/** Días de FML a partir de los cuales se avisa (v1: 45, fijo). */
export const FML_PROLONGADA_DIAS = 45;
