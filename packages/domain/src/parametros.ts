/**
 * Parámetros con vigencia (ADR 0011, F0-2).
 *
 *  - `parametro_org` (por viña): tasas, umbrales de enología, finanzas y alertas. Cada cambio es una fila nueva con
 *    `vigenteDesde`; el valor de una fecha es el de la fila más reciente con vigenteDesde ≤ fecha.
 *  - `indicador` (global): UF, UTM, IMM y retención de honorarios por fecha. Mismo criterio de vigencia.
 *
 * `configEn(parametros, indicadores, fecha)` arma la `OrgConfig` que reciben los cálculos (tax, oenology…).
 * Recalcular un mes pasado usa los valores de ese mes, no los de hoy.
 */
import { z } from 'zod';
import { DEFAULT_CONFIG, type OrgConfig } from './config';
import { PARAMS_CON_RANGO } from './entities/analisis';

export type GrupoParametro = 'tributario' | 'remuneraciones' | 'enologia' | 'finanzas' | 'alertas';
export type TipoParametro = 'tasa' | 'clp' | 'numero' | 'entero' | 'si_no' | 'regimen' | 'rango_so2' | 'rangos_lab';

export interface ParametroDef {
  /** `grupo.campo` de OrgConfig. */
  clave: string;
  grupo: GrupoParametro;
  etiqueta: string;
  tipo: TipoParametro;
  unidad?: string;
  ayuda?: string;
}

export const GRUPOS_PARAMETRO: { id: GrupoParametro; nombre: string }[] = [
  { id: 'tributario', nombre: 'Tributario' },
  { id: 'remuneraciones', nombre: 'Remuneraciones' },
  { id: 'enologia', nombre: 'Enología' },
  { id: 'finanzas', nombre: 'Finanzas' },
  { id: 'alertas', nombre: 'Alertas' }
];

const p = (clave: string, etiqueta: string, tipo: TipoParametro, extra: Partial<ParametroDef> = {}): ParametroDef => ({
  clave,
  grupo: clave.split('.')[0] as GrupoParametro,
  etiqueta,
  tipo,
  ...extra
});

/** Catálogo de parámetros por viña. UF, UTM, IMM y retención de honorarios NO están aquí: son indicadores globales. */
export const PARAMETROS: readonly ParametroDef[] = [
  p('tributario.regimen', 'Régimen tributario', 'regimen'),
  p('tributario.tasaIVA', 'IVA', 'tasa'),
  p('tributario.tasaIDPC', 'Impuesto de primera categoría', 'tasa'),
  p('tributario.tasaPPM', 'PPM', 'tasa'),
  p('tributario.ilaActivo', 'Aplica ILA', 'si_no'),
  p('tributario.tasaILA', 'ILA vinos', 'tasa', { ayuda: 'Regla por graduación pendiente de confirmar con el contador.' }),
  p('tributario.diaF29', 'Día de vencimiento del F29', 'entero'),
  p('tributario.mesRenta', 'Mes de la renta anual', 'entero'),
  p('tributario.diaRenta', 'Día de la renta anual', 'entero'),
  p('tributario.remanenteInicial', 'Remanente de crédito inicial', 'clp'),
  p('remuneraciones.afp', 'Cotización AFP (trabajador)', 'tasa'),
  p('remuneraciones.salud', 'Salud', 'tasa'),
  p('remuneraciones.cesantiaTrabajador', 'Seguro de cesantía (trabajador)', 'tasa'),
  p('remuneraciones.cesantiaEmpleador', 'Seguro de cesantía (empleador)', 'tasa'),
  p('remuneraciones.sis', 'SIS', 'tasa'),
  p('remuneraciones.aporteEmpleadorPension', 'Aporte del empleador a pensión', 'tasa'),
  p('remuneraciones.valorJornada', 'Valor de la jornada de campo', 'clp', { ayuda: 'Valor por defecto al registrar labores.' }),
  p('enologia.so2Blanco', 'SO₂ libre en blancos', 'rango_so2', { unidad: 'mg/L' }),
  p('enologia.so2Tinto', 'SO₂ libre en tintos', 'rango_so2', { unidad: 'mg/L' }),
  p('enologia.labBlanco', 'Rangos de laboratorio en blancos', 'rangos_lab', { ayuda: 'El SO₂ libre usa el rango de SO₂ en blancos.' }),
  p('enologia.labTinto', 'Rangos de laboratorio en tintos', 'rangos_lab', { ayuda: 'El SO₂ libre usa el rango de SO₂ en tintos.' }),
  p('enologia.intervaloMinHoras', 'Intervalo mínimo entre adiciones de SO₂', 'numero', { unidad: 'h' }),
  p('enologia.desviacionDias', 'Desviación tolerada del calendario', 'entero', { unidad: 'días' }),
  p('enologia.kgCajonMin', 'Kilos por cajón (mínimo)', 'numero', { unidad: 'kg' }),
  p('enologia.kgCajonMax', 'Kilos por cajón (máximo)', 'numero', { unidad: 'kg' }),
  p('enologia.tempBaseGD', 'Temperatura base de grados-día', 'numero', { unidad: '°C' }),
  p('finanzas.margenMinimo', 'Margen mínimo', 'tasa'),
  p('finanzas.saldoInicialCaja', 'Saldo inicial de caja', 'clp'),
  p('finanzas.patrimonio', 'Patrimonio', 'clp'),
  p('finanzas.capitalInvertido', 'Capital invertido', 'clp'),
  p('alertas.stockMinimoDiasVencimiento', 'Aviso de vencimiento de insumos', 'entero', { unidad: 'días' }),
  p('alertas.foliosPct', 'Aviso de folios usados', 'tasa'),
  p('alertas.inactividadMin', 'Cierre de sesión por inactividad', 'entero', { unidad: 'min' })
];

export const parametroDef = (clave: string) => PARAMETROS.find((d) => d.clave === clave);

/** Indicadores globales: clave → campo de OrgConfig que alimentan. */
export const INDICADORES = {
  uf: { etiqueta: 'UF', campo: 'remuneraciones.uf', periodicidad: 'diaria' },
  utm: { etiqueta: 'UTM', campo: 'remuneraciones.utm', periodicidad: 'mensual' },
  imm: { etiqueta: 'Ingreso mínimo mensual', campo: 'remuneraciones.imm', periodicidad: 'cuando cambia por ley' },
  retencion_honorarios: { etiqueta: 'Retención de honorarios', campo: 'tributario.retencionHonorarios', periodicidad: 'anual' }
} as const;
export type ClaveIndicador = keyof typeof INDICADORES;

const rangoSO2 = z
  .object({ min: z.coerce.number().min(0), max: z.coerce.number().min(0), alerta: z.coerce.number().min(0) })
  .refine((r) => r.min <= r.max && r.max <= r.alerta, { message: 'Debe cumplirse mínimo ≤ máximo ≤ alerta.' });

const rango = z
  .object({ min: z.coerce.number().min(0), max: z.coerce.number().min(0) })
  .refine((r) => r.min <= r.max, { message: 'El mínimo no puede superar al máximo.' });
const rangosLab = z.object(Object.fromEntries(PARAMS_CON_RANGO.map((k) => [k, rango])) as Record<(typeof PARAMS_CON_RANGO)[number], typeof rango>);

/** Validación del valor según el tipo del parámetro. */
export function esquemaValor(tipo: TipoParametro): z.ZodType {
  switch (tipo) {
    case 'tasa':
      return z.coerce.number().min(0, 'No puede ser negativa.').max(1, 'Una tasa va entre 0 y 100 %.');
    case 'clp':
      return z.coerce.number().int('El monto es en pesos, sin decimales.');
    case 'numero':
      return z.coerce.number().min(0, 'No puede ser negativo.');
    case 'entero':
      return z.coerce.number().int('Debe ser un número entero.').min(0, 'No puede ser negativo.');
    case 'si_no':
      return z.boolean();
    case 'regimen':
      return z.enum(['14D3', '14D8', '14A']);
    case 'rango_so2':
      return rangoSO2;
    case 'rangos_lab':
      return rangosLab;
  }
}

export const parametroInput = z
  .object({
    clave: z.string().refine((c) => !!parametroDef(c), 'Parámetro desconocido.'),
    valor: z.unknown(),
    vigenteDesde: z.iso.date('Fecha inválida.')
  })
  .transform((x, ctx) => {
    const r = esquemaValor(parametroDef(x.clave)!.tipo).safeParse(x.valor);
    if (!r.success) {
      r.error.issues.forEach((i) => ctx.addIssue({ code: 'custom', message: i.message, path: ['valor'] }));
      return z.NEVER;
    }
    return { ...x, valor: r.data };
  });
export type ParametroInput = z.input<typeof parametroInput>;

export interface ValorVigente {
  clave: string;
  valor: unknown;
  /** Fecha desde la que rige (yyyy-mm-dd). */
  desde: string;
}

/** Valor de `clave` vigente en `fecha`: la fila más reciente con desde ≤ fecha. */
export function vigenteEn<T extends ValorVigente>(filas: readonly T[], clave: string, fecha: string): T | undefined {
  let mejor: T | undefined;
  for (const f of filas) if (f.clave === clave && f.desde <= fecha && (!mejor || f.desde > mejor.desde)) mejor = f;
  return mejor;
}

function fijar(cfg: OrgConfig, campo: string, valor: unknown) {
  const [g, k] = campo.split('.') as [keyof OrgConfig, string];
  (cfg[g] as Record<string, unknown>)[k] = valor;
}

/**
 * Configuración vigente en `fecha`: valores por defecto, luego los parámetros de la viña y los indicadores
 * vigentes en esa fecha. Lo que no tiene fila usa el valor por defecto de `DEFAULT_CONFIG`.
 */
export function configEn(parametros: readonly ValorVigente[], indicadores: readonly ValorVigente[], fecha: string): OrgConfig {
  const cfg = structuredClone(DEFAULT_CONFIG);
  for (const d of PARAMETROS) {
    const v = vigenteEn(parametros, d.clave, fecha);
    if (v) fijar(cfg, d.clave, v.valor);
  }
  for (const [clave, ind] of Object.entries(INDICADORES)) {
    const v = vigenteEn(indicadores, clave, fecha);
    if (v) fijar(cfg, ind.campo, Number(v.valor));
  }
  return cfg;
}

/** Valor por defecto de un parámetro o indicador (`grupo.campo`). */
export function valorPorDefecto(campo: string): unknown {
  const [g, k] = campo.split('.') as [keyof OrgConfig, string];
  return (DEFAULT_CONFIG[g] as Record<string, unknown>)[k];
}
