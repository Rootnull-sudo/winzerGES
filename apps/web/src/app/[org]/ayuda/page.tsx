import { can, MODULES } from '@winzer/domain';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page';
import { moduleHref } from '@/lib/routes';
import { requireOrg } from '@/lib/session';

export const metadata = { title: 'Ayuda' };

/** Guía por módulo (v1: modules/ayuda GUIAS), al día con v2. */
const GUIAS: Record<string, string> = {
  dashboard:
    'Resumen de la temporada elegida en la barra superior, comparada con la anterior: operación y bodega, comercial, finanzas y tributario según tu rol, con los avisos abiertos arriba. Imprímelo con "Imprimir".',
  catastro: 'Crea cada cuartel con su variedad, superficie y plantación. Funciona sin señal: los cambios se sincronizan al volver la conexión.',
  fenologia: 'Registra inicio, 50 % y fin del desborre por cuartel y temporada, y las temperaturas para calcular los grados día (Winkler).',
  insumos: 'Maestro de insumos (precio, carencia, vencimiento) y aplicaciones y labores de campo: descuentan stock y suman costo al cuartel.',
  cosecha: 'Registra kg y cajones por jornada y el personal con su tarifa por kg, cajón o día. Obtienes el costo total y por kilo.',
  calendario: 'Crea los lotes con su fecha de vendimia: se calculan FA, maceración, FML y guarda, y el estado avanza solo con cosecha, bodega y fermentación.',
  laboratorio:
    'Análisis por lote comparados con los rangos de la viña; marca si el laboratorio está autorizado por el SAG (necesario para la D.O.). Adjunta el informe.',
  vinificacion: 'Aditivos por lote (bentonita, tartárico, levaduras…): descuentan el insumo y suman al costo por litro del lote.',
  fermentacion: 'Ficha por lote con el seguimiento diario y las adiciones de metabisulfito: dosis en mg/L, SO₂ teórico y aviso de sobre-sulfitado.',
  bodega: 'Entradas (validan capacidad), trasiegos y mermas (validan stock), balance de masa por lote y ocupación. Funciona sin señal.',
  historico: 'Kg y litros por lote y temporada, con exportación CSV.',
  envasado:
    'Orden en borrador con su costo por botella en vivo; al confirmarla descuenta vino e insumos en una sola operación. Valida la etiqueta antes de imprimir.',
  ventas: 'Ventas con varias líneas, envasadas o a granel: se calculan IVA e ILA, se descuenta el stock y al confirmar se emite el DTE.',
  inventarios: 'Producto terminado, granel e insumos calculados desde los movimientos. Registra quiebres, muestras o un conteo físico como ajuste.',
  marca: 'Marca INAPI con su vigencia y cada versión de etiqueta: los costos de diseño se prorratean por botella.',
  clientes:
    'Maestro de clientes con RUT validado e historial. En "Por cobrar" ves la antigüedad de la deuda y registras cobros que se reparten entre sus ventas.',
  costos: 'Costo directo por lote y por formato (con su composición) y el costo total con los indirectos del período prorrateados por litro vendido.',
  financiero: 'Estado de resultados comparado con el período anterior, ratios, punto de equilibrio, simulador, flujo de caja, rankings y resumen ejecutivo.',
  administracion: 'Trabajadores, remuneraciones del mes con su liquidación, honorarios con retención, gastos, presupuesto vs real y activos fijos.',
  proveedores:
    'Compras con líneas: suben el stock, actualizan el precio del insumo y, con factura, generan el DTE recibido para el IVA crédito. Pagos aplicados a documentos.',
  cumplimiento: 'Obligaciones SAG, SII, patentes, INAPI, D.O. y certificaciones con sus vencimientos, verificaciones automáticas y libro de existencias.',
  dte: 'DTE emitidos y recibidos con su XML, estados, notas de crédito y débito, libros de compras y ventas, folios (CAF) y datos del emisor.',
  conciliacion: 'Importa la cartola CSV, concilia automáticamente por monto y fecha y resuelve el resto a mano o como diferencia (gasto financiero).',
  tributario: 'F29 mensual (IVA, ILA, PPM, retenciones) que se congela al declarar, PPM del año, pagos de impuesto, Renta y calendario.',
  usuarios: 'Invita al equipo por correo con un rol; define roles personalizados con permisos por módulo y revisa la auditoría.',
  configuracion: 'Datos de la viña, temporadas, parámetros con vigencia (tasas y umbrales) e importación del respaldo de la versión anterior.'
};

const PASOS: [string, string, string][] = [
  ['Configura la viña', 'configuracion', 'temporadas y parámetros; luego el emisor en DTE › Emisor.'],
  ['Carga lo básico', 'catastro', 'cuarteles, estanques (Bodega) e insumos. Si vienes de la versión anterior, importa tu respaldo en Configuración.'],
  ['Planifica los lotes', 'calendario', 'de la temporada con su fecha de vendimia.'],
  ['Durante la vendimia', 'cosecha', 'registra cosecha, entradas a bodega y el seguimiento de fermentación.'],
  ['Envasa, vende y revisa', 'financiero', 'tus finanzas y el F29 del mes.']
];

/** Ayuda (F7-5; v1: modules/ayuda): primeros pasos, atajos, guía por módulo según el rol y advertencias legales. */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { actor } = await requireOrg(slug);
  const ok = (m: string) => can(actor.role, m, 'v', actor.customRoles, actor.acceso);
  const mods = MODULES.filter((m) => ok(m.id) && GUIAS[m.id]);
  const enlace = (id: string, texto: string) => {
    const m = MODULES.find((x) => x.id === id);
    return m && ok(id) ? (
      <Link href={moduleHref(slug, m)} className="font-semibold text-ink underline">
        {texto}
      </Link>
    ) : (
      <b>{texto}</b>
    );
  };
  return (
    <>
      <PageHeader area="Administración" title="Ayuda" description="Guía rápida de Winzer Gestión. Aparecen los módulos a los que tienes acceso." />
      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <section aria-label="Primeros pasos" className="rounded-card border border-rule bg-raised p-5">
          <h2 className="mb-3 font-label text-[20px]">Primeros pasos</h2>
          <ol className="grid list-decimal gap-2 pl-5 text-[14px]">
            {PASOS.map(([t, id, resto]) => (
              <li key={t}>
                {enlace(id, t)}: {resto}
              </li>
            ))}
          </ol>
        </section>
        <section aria-label="Atajos y flujo" className="rounded-card border border-rule bg-raised p-5 text-[14px]">
          <h2 className="mb-3 font-label text-[20px]">Atajos</h2>
          <ul className="mb-4 grid gap-1.5">
            <li>
              <kbd className="rounded border border-rule bg-sunken px-1.5 text-[12px]">Ctrl</kbd> /{' '}
              <kbd className="rounded border border-rule bg-sunken px-1.5 text-[12px]">⌘</kbd> +{' '}
              <kbd className="rounded border border-rule bg-sunken px-1.5 text-[12px]">K</kbd>: búsqueda global de módulos, cuarteles, clientes…
            </li>
            <li>
              <kbd className="rounded border border-rule bg-sunken px-1.5 text-[12px]">Esc</kbd>: cerrar ventanas
            </li>
            <li>
              <kbd className="rounded border border-rule bg-sunken px-1.5 text-[12px]">Tab</kbd> /{' '}
              <kbd className="rounded border border-rule bg-sunken px-1.5 text-[12px]">Shift</kbd> +{' '}
              <kbd className="rounded border border-rule bg-sunken px-1.5 text-[12px]">Tab</kbd>: moverse entre los campos
            </li>
          </ul>
          <h2 className="mb-2 font-label text-[20px]">Flujo integrado</h2>
          <p className="text-ink-2">
            Cosecha → bodega → fermentación → envasado → venta → DTE → IVA → F29 → Renta. Y compras → DTE recibido → IVA crédito → F29. Operación, bodega y
            vinificación funcionan sin señal: los cambios se guardan en el equipo y se sincronizan al volver la conexión.
          </p>
        </section>
      </div>

      <h2 className="mb-3 font-label text-[22px]">Guía por módulo</h2>
      <ul className="mb-8 grid gap-3 md:grid-cols-2" aria-label="Guía por módulo">
        {mods.map((m) => (
          <li key={m.id} className="rounded-card border border-rule bg-raised p-4">
            <h3 className="mb-1 text-[15px] font-semibold">
              <Link href={moduleHref(slug, m)} className="hover:underline">
                {m.name}
              </Link>
            </h3>
            <p className="text-[13px] text-ink-2">{GUIAS[m.id]}</p>
          </li>
        ))}
      </ul>

      <section aria-label="Advertencias legales" className="rounded-card border border-rule bg-raised p-5 text-[14px]">
        <h2 className="mb-3 font-label text-[20px]">Advertencias legales</h2>
        <ul className="grid list-disc gap-1.5 pl-5">
          <li>
            Es una <b>herramienta de apoyo</b>: no reemplaza a un contador, asesor legal o enólogo, ni las declaraciones oficiales ante el SII o el SAG.
          </li>
          <li>
            <b>No envía DTE al SII.</b> Genera el XML para que lo envíes con tu proveedor de facturación electrónica autorizado; la responsabilidad de la
            emisión es del contribuyente.
          </li>
          <li>Tasas, regímenes, plazos y normas cambian: revisa los parámetros con vigencia y valida con tu contador antes de declarar.</li>
          <li>Cada persona entra con su propia cuenta y solo ve lo que su rol permite; los cambios sensibles quedan en la auditoría.</li>
        </ul>
        <p className="mt-4 text-[12px] text-ink-3">Winzer Gestión v2</p>
      </section>
    </>
  );
}
