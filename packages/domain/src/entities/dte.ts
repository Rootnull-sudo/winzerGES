/**
 * Documentos tributarios electrónicos (F6-1) — port de js/integrations/dte.js y js/modules/dte (v1).
 *
 * ⚠ El sistema NO envía documentos al SII: genera el XML (sin timbre TED ni firma) para que el contribuyente lo
 * procese con su proveedor autorizado. La interfaz `ProveedorDTE` deja enchufar uno real sin tocar el modelo.
 *
 * Diferencias con v1 (bugs corregidos):
 *  - Folios por secuencia dentro de los rangos CAF: nunca se reutilizan (v1 rellenaba huecos y repetía folios).
 *  - Transiciones de estado validadas (v1 aceptaba cualquier cambio).
 *  - XML: se trunca antes de escapar (v1 truncaba después y podía cortar `&amp;`) y la descarga se codifica de
 *    verdad en ISO-8859-1 (v1 declaraba ISO-8859-1 y escribía UTF-8).
 *  - NC con los montos del documento original (v1 los recalculaba con las tasas vigentes); la guía 52 se anula sin NC.
 */
import { z } from 'zod';
import { n, rutClean, rutValid } from '../num';
import { DTE_TIPOS, type Totales } from '../tax';

export const ESTADOS_DTE = ['borrador', 'generado', 'enviado', 'aceptado', 'rechazado', 'anulado'] as const;
export type EstadoDte = (typeof ESTADOS_DTE)[number];
export const ESTADO_DTE_LABEL: Record<EstadoDte, string> = {
  borrador: 'Borrador',
  generado: 'Generado',
  enviado: 'Enviado al SII',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
  anulado: 'Anulado'
};
export const TIPOS_DTE = [33, 34, 39, 52, 56, 61] as const;
export type TipoDte = (typeof TIPOS_DTE)[number];
export const nombreDte = (tipo: number) => DTE_TIPOS[tipo]?.nombre ?? `DTE ${tipo}`;

/** Transiciones permitidas (v1: modules/dte:43-46). Recibidos: aceptado ↔ rechazado. */
const TRANSICIONES: Record<'emitido' | 'recibido', Partial<Record<EstadoDte, EstadoDte[]>>> = {
  emitido: { borrador: ['generado'], generado: ['enviado', 'anulado'], enviado: ['aceptado', 'rechazado'], rechazado: ['anulado'] },
  recibido: { aceptado: ['rechazado'], rechazado: ['aceptado'] }
};
export const transicionesDte = (direccion: string, estado: string): EstadoDte[] =>
  TRANSICIONES[direccion as 'emitido' | 'recibido']?.[estado as EstadoDte] ?? [];
export const puedeTransitar = (direccion: string, de: string, a: string) => transicionesDte(direccion, de).includes(a as EstadoDte);

const texto = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);
const fecha = z.iso.date('Fecha inválida.');
const tipoDte = z.coerce.number().refine((t) => (TIPOS_DTE as readonly number[]).includes(t), 'Tipo de DTE inválido.');

/* ---------- Emisor y folios ---------- */

export const AMBIENTES_DTE = [
  ['simulado', 'Simulado (sin proveedor)'],
  ['certificacion', 'Certificación SII'],
  ['produccion', 'Producción']
] as const;

export const emisorInput = z.object({
  giro: texto(80),
  acteco: texto(6),
  direccion: texto(70),
  comuna: texto(20),
  resolucionNumero: texto(10),
  resolucionFecha: fecha
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
  ambiente: z.enum(['simulado', 'certificacion', 'produccion']).default('simulado'),
  certificadoVence: fecha
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null))
});
export type EmisorInput = z.input<typeof emisorInput>;
export type Emisor = z.output<typeof emisorInput> & { rut: string | null; razonSocial: string | null };

export const cafInput = z
  .object({
    id: z.string().min(1).optional(),
    tipo: tipoDte,
    desde: z.coerce.number({ message: 'Ingresa el folio inicial.' }).int('Folio entero.').min(1, 'Debe ser mayor a 0.'),
    hasta: z.coerce.number({ message: 'Ingresa el folio final.' }).int('Folio entero.').min(1, 'Debe ser mayor a 0.'),
    fechaAutorizacion: fecha,
    vence: fecha
      .optional()
      .nullable()
      .or(z.literal('').transform(() => null))
  })
  .refine((c) => c.hasta >= c.desde, { message: 'El folio final debe ser mayor o igual al inicial.', path: ['hasta'] });
export type CafInput = z.input<typeof cafInput>;

export interface RangoCaf {
  desde: number;
  hasta: number;
}

/**
 * Folio que corresponde al candidato de la secuencia según los CAF del tipo (ordenados por `desde`):
 * el mismo si cae en un rango; si cae en un hueco, el `desde` del rango siguiente; null si no quedan folios.
 * Sin CAF cargados devuelve el candidato (modo simulado).
 */
export function folioEnCaf(cafs: readonly RangoCaf[], candidato: number): number | null {
  if (!cafs.length) return candidato;
  const orden = [...cafs].sort((a, b) => a.desde - b.desde);
  for (const c of orden) {
    if (candidato <= c.hasta) return Math.max(candidato, c.desde);
  }
  return null;
}

/** Uso de folios: autorizados (Σ rangos), usados (emitidos dentro de los rangos) y % (v1: dte.folios). */
export function usoFolios(cafs: readonly RangoCaf[], folios: readonly number[]) {
  const total = cafs.reduce((s, c) => s + (c.hasta - c.desde + 1), 0);
  const usados = folios.filter((f) => cafs.some((c) => f >= c.desde && f <= c.hasta)).length;
  return { total, usados, disponibles: Math.max(0, total - usados), pct: total ? usados / total : 1 };
}

/* ---------- Notas de crédito y débito ---------- */

export const CODIGOS_REFERENCIA = [
  [1, 'Anula documento de referencia'],
  [2, 'Corrige texto'],
  [3, 'Corrige montos']
] as const;

/** NC (61) o ND (56) sobre un DTE emitido: total (anula, código 1) o parcial por un neto (corrige montos, código 3). */
export const notaInput = z
  .object({
    dteId: z.string().min(1),
    tipo: z.coerce.number().refine((t) => t === 61 || t === 56, 'Elige nota de crédito o de débito.'),
    fecha,
    razon: z.string().trim().min(1, 'Indica la razón.').max(90),
    /** Neto de la corrección; vacío = total del documento. */
    neto: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int('Monto entero.').positive('Debe ser mayor a 0.').nullable())
  })
  .refine((x) => x.tipo === 61 || x.neto != null, { message: 'La nota de débito necesita un monto.', path: ['neto'] });
export type NotaInput = z.input<typeof notaInput>;

export interface Referencia {
  tipo: number;
  folio: string;
  fecha: string;
  codigo: number;
  razon: string;
}

/**
 * Montos de una nota sobre un documento: la total copia los del original (v1 los recalculaba con las tasas
 * vigentes); la parcial prorratea IVA e ILA del original sobre el neto corregido.
 */
export function montosNota(orig: Pick<Totales, 'neto' | 'iva' | 'ila' | 'total'> & { exento: number }, neto: number | null) {
  if (neto == null) return { neto: n(orig.neto), exento: n(orig.exento), iva: n(orig.iva), ila: n(orig.ila), total: n(orig.total) };
  const base = n(orig.neto) || n(orig.exento);
  const f = base ? neto / base : 0;
  const exenta = !n(orig.neto) && n(orig.exento) > 0;
  const iva = exenta ? 0 : Math.round(n(orig.iva) * f);
  const ila = exenta ? 0 : Math.round(n(orig.ila) * f);
  return exenta ? { neto: 0, exento: neto, iva: 0, ila: 0, total: neto } : { neto, exento: 0, iva, ila, total: neto + iva + ila };
}

/* ---------- Libros ---------- */

export interface DteLibro {
  direccion: string;
  tipo: number;
  fecha: string;
  estado: string;
  folio?: string | number | null;
  neto?: unknown;
  exento?: unknown;
  iva?: unknown;
  ila?: unknown;
  total?: unknown;
}

/**
 * Documentos válidos del libro de un período (v1: tax.dteEmitidos / dteRecibidos): sin guías 52; emitidos sin
 * borrador, rechazado ni anulado; recibidos sin rechazado ni anulado. El libro y sus totales usan este mismo filtro
 * (v1 listaba también los rechazados y anulados y los totales no cuadraban con las filas).
 */
export function docsLibro<T extends DteLibro>(dtes: readonly T[], direccion: 'emitido' | 'recibido', periodo: string): T[] {
  const fuera = direccion === 'emitido' ? ['borrador', 'rechazado', 'anulado'] : ['rechazado', 'anulado'];
  return dtes
    .filter((d) => d.direccion === direccion && d.fecha.slice(0, 7) === periodo && Number(d.tipo) !== 52 && !fuera.includes(d.estado))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || Number(a.folio) - Number(b.folio));
}

/* ---------- XML (EnvioDTE v10, sin TED ni firma) ---------- */

export interface DteXml {
  direccion: string;
  tipo: number;
  folio: string | number;
  fecha: string;
  formaPago?: number | null;
  vencimiento?: string | null;
  contraparteRut?: string | null;
  contraparte?: string | null;
  giro?: string | null;
  direccionContraparte?: string | null;
  comuna?: string | null;
  neto?: unknown;
  exento?: unknown;
  iva?: unknown;
  ila?: unknown;
  total?: unknown;
  referencia?: Referencia | null;
}
export interface LineaXml {
  nombre: string;
  cantidad: unknown;
  unidad?: string | null;
  precio: unknown;
  monto: unknown;
}

/** RUT en formato SII (sin puntos, con guion). */
export const rutSii = (r: unknown) => {
  const c = rutClean(r);
  return c ? `${c.slice(0, -1)}-${c.slice(-1)}` : '';
};
/** Trunca y luego escapa: el corte nunca parte una entidad (v1 escapaba y después truncaba). */
export const xmlTexto = (s: unknown, max = 100) =>
  String(s ?? '')
    .slice(0, max)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const r4 = (v: unknown) => Math.round(n(v) * 1e4) / 1e4;

export function xmlDte(d: DteXml, lineas: readonly LineaXml[], e: Partial<Emisor>, t: { tasaIVA: number; tasaILA: number }, generado = new Date()): string {
  const tipo = Number(d.tipo);
  const boleta = tipo === 39;
  const emitido = d.direccion === 'emitido';
  const L: string[] = [];
  const p = (s: string) => L.push(s);
  p('<?xml version="1.0" encoding="ISO-8859-1"?>');
  p('<!-- Generado por Winzer Gestión. Borrador sin timbre ni firma: enviar mediante proveedor autorizado. -->');
  p('<DTE version="1.0">');
  p(`  <Documento ID="F${xmlTexto(d.folio, 20)}T${tipo}">`);
  p('    <Encabezado>');
  p('      <IdDoc>');
  p(`        <TipoDTE>${tipo}</TipoDTE>`);
  p(`        <Folio>${xmlTexto(d.folio, 20)}</Folio>`);
  p(`        <FchEmis>${d.fecha}</FchEmis>`);
  if (boleta) p('        <IndServicio>3</IndServicio>');
  if (tipo === 52) {
    p('        <TipoDespacho>2</TipoDespacho>');
    p('        <IndTraslado>1</IndTraslado>');
  }
  if (!boleta && tipo !== 52) p(`        <FmaPago>${d.formaPago || 1}</FmaPago>`);
  if (d.vencimiento) p(`        <FchVenc>${d.vencimiento}</FchVenc>`);
  p('      </IdDoc>');
  p('      <Emisor>');
  p(`        <RUTEmisor>${rutSii(emitido ? e.rut : d.contraparteRut)}</RUTEmisor>`);
  if (boleta) {
    p(`        <RznSocEmisor>${xmlTexto(e.razonSocial)}</RznSocEmisor>`);
    p(`        <GiroEmisor>${xmlTexto(e.giro, 80)}</GiroEmisor>`);
  } else {
    p(`        <RznSoc>${xmlTexto(emitido ? e.razonSocial : d.contraparte)}</RznSoc>`);
    p(`        <GiroEmis>${xmlTexto(emitido ? e.giro : d.giro, 80)}</GiroEmis>`);
    if (emitido) p(`        <Acteco>${xmlTexto(e.acteco, 6)}</Acteco>`);
  }
  p(`        <DirOrigen>${xmlTexto(emitido ? e.direccion : d.direccionContraparte, 70)}</DirOrigen>`);
  p(`        <CmnaOrigen>${xmlTexto(emitido ? e.comuna : d.comuna, 20)}</CmnaOrigen>`);
  p('      </Emisor>');
  p('      <Receptor>');
  p(`        <RUTRecep>${rutSii(emitido ? d.contraparteRut : e.rut)}</RUTRecep>`);
  p(`        <RznSocRecep>${xmlTexto(emitido ? d.contraparte : e.razonSocial)}</RznSocRecep>`);
  if (!boleta) p(`        <GiroRecep>${xmlTexto(emitido ? d.giro || 'Particular' : e.giro, 40)}</GiroRecep>`);
  p(`        <DirRecep>${xmlTexto(emitido ? d.direccionContraparte : e.direccion, 70)}</DirRecep>`);
  p(`        <CmnaRecep>${xmlTexto(emitido ? d.comuna : e.comuna, 20)}</CmnaRecep>`);
  p('      </Receptor>');
  p('      <Totales>');
  if (n(d.neto)) p(`        <MntNeto>${Math.round(n(d.neto))}</MntNeto>`);
  if (n(d.exento)) p(`        <MntExe>${Math.round(n(d.exento))}</MntExe>`);
  if (n(d.neto) && !boleta) p(`        <TasaIVA>${(t.tasaIVA * 100).toFixed(0)}</TasaIVA>`);
  if (n(d.iva)) p(`        <IVA>${Math.round(n(d.iva))}</IVA>`);
  if (n(d.ila)) {
    p('        <ImptoReten>');
    p('          <TipoImp>25</TipoImp>');
    p(`          <TasaImp>${(t.tasaILA * 100).toFixed(1)}</TasaImp>`);
    p(`          <MontoImp>${Math.round(n(d.ila))}</MontoImp>`);
    p('        </ImptoReten>');
  }
  p(`        <MntTotal>${Math.round(n(d.total))}</MntTotal>`);
  p('      </Totales>');
  p('    </Encabezado>');
  lineas.forEach((it, i) => {
    p('    <Detalle>');
    p(`      <NroLinDet>${i + 1}</NroLinDet>`);
    if (tipo === 34) p('      <IndExe>1</IndExe>');
    p(`      <NmbItem>${xmlTexto(it.nombre, 80)}</NmbItem>`);
    p(`      <QtyItem>${r4(it.cantidad)}</QtyItem>`);
    p(`      <UnmdItem>${xmlTexto(it.unidad || 'UN', 4)}</UnmdItem>`);
    p(`      <PrcItem>${r4(it.precio)}</PrcItem>`);
    if (n(d.ila)) p('      <CodImpAdic>25</CodImpAdic>');
    p(`      <MontoItem>${Math.round(n(it.monto))}</MontoItem>`);
    p('    </Detalle>');
  });
  if (d.referencia) {
    p('    <Referencia>');
    p('      <NroLinRef>1</NroLinRef>');
    p(`      <TpoDocRef>${d.referencia.tipo}</TpoDocRef>`);
    p(`      <FolioRef>${xmlTexto(d.referencia.folio, 20)}</FolioRef>`);
    p(`      <FchRef>${d.referencia.fecha}</FchRef>`);
    p(`      <CodRef>${d.referencia.codigo || 1}</CodRef>`);
    p(`      <RazonRef>${xmlTexto(d.referencia.razon || 'Anula documento de referencia', 90)}</RazonRef>`);
    p('    </Referencia>');
  }
  p('    <!-- TED: timbre electrónico generado por el proveedor autorizado con el CAF -->');
  p(`    <TmstFirma>${generado.toISOString().slice(0, 19)}</TmstFirma>`);
  p('  </Documento>');
  p('</DTE>');
  return L.join('\n');
}

/** Lote de varios DTE en un SetDTE (v1: descargarMasivo). */
export function xmlLote(xmls: readonly string[]): string {
  const cuerpo = xmls.map((x) => x.replace(/^<\?xml[^>]*\?>\n?/, '').replace(/^<!--.*-->\n?/, '')).join('\n');
  return `<?xml version="1.0" encoding="ISO-8859-1"?>\n<!-- Lote de DTE para envío vía proveedor autorizado -->\n<SetDTE>\n${cuerpo}\n</SetDTE>`;
}

/** Bytes ISO-8859-1 del XML (los caracteres fuera de Latin-1 pasan a '?'): la declaración y el archivo coinciden. */
export function aLatin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[i] = c <= 0xff ? c : 0x3f;
  }
  return out;
}

/** Validación básica de estructura (v1: validarXML), sin DOM: nodos obligatorios y RUT. */
export function validarXmlDte(xml: string): string[] {
  const errs: string[] = [];
  const nodo = (t: string) => xml.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1];
  for (const t of ['TipoDTE', 'Folio', 'FchEmis', 'RUTEmisor', 'RUTRecep', 'MntTotal']) if (nodo(t) == null) errs.push(`Falta el nodo ${t}`);
  if (nodo('RUTEmisor') != null && !rutValid(nodo('RUTEmisor'))) errs.push('RUT emisor inválido');
  if (nodo('RUTRecep') != null && !rutValid(nodo('RUTRecep'))) errs.push('RUT receptor inválido');
  return errs;
}

/* ---------- Proveedor ---------- */

/** Proveedor de facturación electrónica. `simulado` reproduce v1: no envía nada, el XML se genera al descargar. */
export interface ProveedorDTE {
  nombre: string;
  emitir(dte: DteXml, lineas: readonly LineaXml[]): Promise<{ estado: EstadoDte; idExterno: string | null }>;
  consultarEstado(idExterno: string): Promise<EstadoDte | null>;
  anular(dte: DteXml): Promise<{ estado: EstadoDte }>;
}

export const proveedorSimulado: ProveedorDTE = {
  nombre: 'simulado',
  emitir: async () => ({ estado: 'generado', idExterno: null }),
  consultarEstado: async () => null,
  anular: async () => ({ estado: 'anulado' })
};

/** RUT genérico de boleta sin receptor identificado (SII). */
export const RUT_BOLETA = '66.666.666-6';

/** DTE de un respaldo v1 (importador): solo lo que se valida antes de mapearlo; el resto pasa tal cual. */
export const dteV1Input = z
  .object({
    id: z.string().min(1),
    direccion: z.enum(['emitido', 'recibido']),
    tipo: tipoDte,
    folio: z.union([z.string(), z.number()]).transform(String),
    fecha: fecha,
    estado: z.enum(ESTADOS_DTE).default('generado')
  })
  .passthrough();
