/**
 * Estanques y libro de movimientos de bodega — port de js/modules/bodega y js/calc/inventory.js (v1).
 * Los litros NO se guardan: litros de un estanque = Σ mov_bodega.litros (con signo). Mismas fórmulas en el cliente
 * (offline) y en las vistas SQL del servidor (v_stock_estanque, v_ocupacion, v_balance_lote).
 * Diferencias con v1 (bugs corregidos): la ocupación por tipo reparte un estanque mezclado por lote (v1 lo atribuía
 * entero al lote principal), y los ajustes también validan capacidad y stock.
 */
import { z } from 'zod';
import { n, sum } from '../num';

export const MATERIALES_ESTANQUE = ['Acero inoxidable', 'Hormigón epóxico', 'Fibra de vidrio', 'Madera (fudre)', 'Polietileno'] as const;
export const TIPOS_ESTANQUE = ['Fermentación con camisa de frío', 'Fermentación tintos', 'Guarda', 'Mezcla', 'Pulmón de embotellado'] as const;
export const ESTADOS_ESTANQUE = [
  ['operativo', 'Operativo'],
  ['mantencion', 'En mantención'],
  ['reservado', 'Reservado']
] as const;

/** Tipos de movimiento (v1: bodega/index.js:12). Las salidas van con signo negativo. */
export const TIPOS_MOV_BODEGA = [
  ['entrada', 'Entrada'],
  ['trasiego_salida', 'Trasiego (salida)'],
  ['trasiego_entrada', 'Trasiego (entrada)'],
  ['merma', 'Merma'],
  ['vinagre', 'Destino vinagre'],
  ['envasado', 'Envasado'],
  ['venta_granel', 'Venta granel'],
  ['ajuste', 'Ajuste']
] as const;
export type TipoMovBodega = (typeof TIPOS_MOV_BODEGA)[number][0];
export const ORIGENES_ENTRADA = [
  ['uva', 'Uva despalillada'],
  ['mosto', 'Mosto'],
  ['vino', 'Vino (compra o traslado)']
] as const;
export const MOTIVOS_SALIDA = ['Borras', 'Evaporación', 'Filtración', 'Derrame', 'Vino defectuoso', 'Diferencia de inventario'] as const;

/** Litros bajo este umbral se consideran estanque vacío / lote ausente (v1: 0,5 L). */
export const LITROS_MINIMOS = 0.5;

const texto = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const estanqueInput = z.object({
  id: z.string().min(1).optional(),
  codigo: z.string().trim().min(1, 'Ingresa el código del estanque.').max(40),
  capacidad: z.coerce.number({ message: 'Ingresa la capacidad.' }).min(1, 'Debe ser mayor o igual a 1.'),
  material: texto(60),
  tipo: texto(80),
  ubicacion: texto(80),
  estado: z.enum(['operativo', 'mantencion', 'reservado']).default('operativo'),
  costoMantencion: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().min(0).nullable()).optional()
});
export type EstanqueInput = z.input<typeof estanqueInput>;
export type Estanque = z.output<typeof estanqueInput> & { id: string };

export const movBodegaInput = z
  .object({
    id: z.string().min(1).optional(),
    fecha: z.iso.date('Fecha inválida.'),
    estanqueId: z.string().min(1, 'Selecciona un estanque válido.'),
    loteId: z.string().min(1, 'Elige el lote.'),
    /** Con signo: + entra, − sale. */
    litros: z.coerce.number({ message: 'Ingresa los litros.' }),
    tipo: z.enum(TIPOS_MOV_BODEGA.map((t) => t[0]) as [TipoMovBodega, ...TipoMovBodega[]]),
    origen: z.preprocess((v) => v || null, z.enum(['uva', 'mosto', 'vino']).nullable()).optional(),
    kgUva: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().min(0).nullable()).optional(),
    /** Movimientos de una misma operación (trasiego: salida + entrada + merma). */
    grupo: texto(60),
    motivo: texto(200),
    glosa: texto(300),
    origenTipo: texto(40),
    origenId: texto(100)
  })
  .refine((m) => m.litros !== 0, { message: 'Los litros no pueden ser 0.', path: ['litros'] })
  .refine((m) => (['entrada', 'trasiego_entrada'].includes(m.tipo) ? m.litros > 0 : true), { message: 'Una entrada suma litros.', path: ['litros'] })
  .refine((m) => (['trasiego_salida', 'merma', 'vinagre', 'envasado', 'venta_granel'].includes(m.tipo) ? m.litros < 0 : true), {
    message: 'Una salida resta litros.',
    path: ['litros']
  })
  // Envasado y venta a granel los escriben sus servicios (F5), siempre con su documento de origen.
  .refine((m) => !['envasado', 'venta_granel'].includes(m.tipo) || (!!m.origenTipo && !!m.origenId), {
    message: 'Los movimientos de envasado y venta se registran desde su módulo.',
    path: ['tipo']
  });
export type MovBodegaInput = z.input<typeof movBodegaInput>;
export type MovBodega = z.output<typeof movBodegaInput> & { id: string };

type Mov = { estanqueId: string; loteId?: string | null; litros: unknown; tipo?: string | null };

/** Litros en un estanque = Σ litros de sus movimientos (v1: inventory.litrosEstanque). */
export const litrosEstanque = (estanqueId: string, movs: readonly Mov[]) =>
  sum(
    movs.filter((m) => m.estanqueId === estanqueId),
    (m) => m.litros
  );

/** Lotes presentes en un estanque (> 0,5 L), de mayor a menor (v1: inventory.lotesEnEstanque, sin orden). */
export function lotesEnEstanque(estanqueId: string, movs: readonly Mov[]): { loteId: string; litros: number }[] {
  const por = new Map<string, number>();
  for (const m of movs) if (m.estanqueId === estanqueId) por.set(m.loteId || '—', (por.get(m.loteId || '—') ?? 0) + n(m.litros));
  return [...por.entries()]
    .filter(([, l]) => l > LITROS_MINIMOS)
    .map(([loteId, litros]) => ({ loteId, litros }))
    .sort((a, b) => b.litros - a.litros);
}

/** Lote principal de un estanque (el de más litros) o null. */
export const loteDeEstanque = (estanqueId: string, movs: readonly Mov[]) => lotesEnEstanque(estanqueId, movs)[0]?.loteId ?? null;

/** Litros de un lote en todos los estanques, y solo sus entradas. */
export const litrosLote = (loteId: string, movs: readonly Mov[]) =>
  sum(
    movs.filter((m) => m.loteId === loteId),
    (m) => m.litros
  );
export const litrosEntradaLote = (loteId: string, movs: readonly Mov[]) =>
  sum(
    movs.filter((m) => m.loteId === loteId && m.tipo === 'entrada'),
    (m) => m.litros
  );

/** Litros de un lote en un estanque. */
export const litrosLoteEnEstanque = (estanqueId: string, loteId: string, movs: readonly Mov[]) =>
  sum(
    movs.filter((m) => m.estanqueId === estanqueId && m.loteId === loteId),
    (m) => m.litros
  );

export type EstadoEstanque = 'ocupado' | 'vacio' | 'mantencion' | 'reservado';
/** Mantención y reservado los fija el usuario; ocupado / vacío se calcula (v1: inventory.estadoEstanque). */
export function estadoEstanque(e: { id: string; estado?: string | null }, movs: readonly Mov[]): EstadoEstanque {
  if (e.estado === 'mantencion' || e.estado === 'reservado') return e.estado;
  return litrosEstanque(e.id, movs) > LITROS_MINIMOS ? 'ocupado' : 'vacio';
}

/**
 * Ocupación de la bodega (v1: inventory.ocupacion). porTipo reparte cada estanque por los lotes que contiene
 * (v1 atribuía el estanque entero al tipo del lote principal).
 */
export function ocupacion(
  estanques: readonly { id: string; capacidad: unknown; estado?: string | null }[],
  movs: readonly Mov[],
  tipoDeLote: (loteId: string) => string | null
) {
  const capacidad = sum(estanques, (e) => e.capacidad);
  const usado = sum(estanques, (e) => Math.max(0, litrosEstanque(e.id, movs)));
  const porTipo: Record<string, number> = {};
  for (const e of estanques)
    for (const l of lotesEnEstanque(e.id, movs)) {
      const t = tipoDeLote(l.loteId) ?? 'sin tipo';
      porTipo[t] = (porTipo[t] ?? 0) + l.litros;
    }
  const ocupados = estanques.filter((e) => litrosEstanque(e.id, movs) > LITROS_MINIMOS).length;
  return { capacidad, usado, pct: capacidad ? usado / capacidad : 0, porTipo, ocupados, vacios: estanques.length - ocupados, total: estanques.length };
}

const int = (v: number) => Math.round(v).toLocaleString('es-CL');

/** Valida una entrada (v1: inventory.validarEntrada). null si está bien; si no, el mensaje de v1. */
export function validarEntrada(
  e: { id: string; codigo: string; capacidad: unknown; estado?: string | null } | null | undefined,
  litros: number,
  movs: readonly Mov[]
): string | null {
  if (!e) return 'Selecciona un estanque válido.';
  if (e.estado === 'mantencion') return `El estanque ${e.codigo} está en mantención.`;
  const libre = n(e.capacidad) - litrosEstanque(e.id, movs);
  if (litros > libre + 0.01) return `Sobrecapacidad: ${e.codigo} tiene ${int(libre)} L libres y se intentan ingresar ${int(litros)} L.`;
  return null;
}

/** Valida una salida de un lote desde un estanque (v1: inventory.validarSalida). */
export function validarSalida(
  e: { id: string; codigo: string } | null | undefined,
  litros: number,
  loteId: string | null,
  movs: readonly Mov[]
): string | null {
  if (!e) return 'Selecciona un estanque válido.';
  const disp = loteId ? litrosLoteEnEstanque(e.id, loteId, movs) : litrosEstanque(e.id, movs);
  if (litros > disp + 0.01) return `No hay suficiente vino en ${e.codigo}: disponibles ${int(disp)} L, solicitados ${int(litros)} L.`;
  return null;
}

/**
 * Balance de un lote (v1: inventory.balanceLote): entradas, salidas por tipo y stock. v1 además mostraba una
 * "diferencia" que siempre daba 0 (fórmula tautológica); v2 la reemplaza por el rendimiento L/kg contra los kg de uva.
 */
export function balanceLote(loteId: string, movs: readonly Mov[]) {
  const de = (tipo: string) =>
    sum(
      movs.filter((m) => m.loteId === loteId && m.tipo === tipo),
      (m) => m.litros
    );
  const entradas = de('entrada');
  const merma = -de('merma');
  return {
    entradas,
    envasado: -de('envasado'),
    ventaGranel: -de('venta_granel'),
    merma,
    vinagre: -de('vinagre'),
    ajustes: de('ajuste'),
    stock: litrosLote(loteId, movs),
    pctMerma: entradas ? merma / entradas : 0
  };
}

/** Rendimiento en litros por kg de uva (null sin kg). */
export const rendimientoLKg = (litros: unknown, kg: unknown) => (n(kg) ? n(litros) / n(kg) : null);
