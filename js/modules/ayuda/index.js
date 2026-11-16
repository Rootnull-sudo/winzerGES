/**
 * modules/ayuda/index.js — Página de ayuda dentro de la app: guía rápida por módulo,
 * flujos principales, atajos, catálogo de eventos y advertencias legales.
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui;
  const GUIAS = {
    dashboard: 'Resumen de la temporada seleccionada: KPIs operativos, comerciales, financieros y tributarios, gráficos y alertas priorizadas por color. Exporta a PDF con "Exportar dashboard".',
    catastro: 'Crea cada cuartel con su variedad, superficie y plantación. Haz clic en un cuartel para ver su ficha con historial y rentabilidad.',
    fenologia: 'Registra inicio, 50% y fin del desborre por cuartel y temporada. En "Temperaturas y grados día" carga Tmáx/Tmín para calcular el índice de Winkler.',
    insumos: 'Mantén el maestro de insumos (precio, carencia, vencimiento). Registra aplicaciones (descuentan stock y suman costo al cuartel) y labores de campo.',
    cosecha: 'Registra kg y cajones por jornada (se valida 18–20 kg/cajón) y luego el personal con su tarifa por kg, cajón o día. Obtienes costo total y por kilo.',
    calendario: 'Crea lotes con su fecha de vendimia: el sistema calcula FA, maceración, FML y guarda. El estado se actualiza solo con cosecha, bodega y fermentación.',
    laboratorio: 'Registra análisis por lote. Se comparan con rangos objetivo y se marca si el laboratorio está autorizado por el SAG (necesario para D.O.).',
    vinificacion: 'Registra aditivos por lote (bentonita, tartárico, levaduras…). El costo se suma al costo por litro del lote.',
    fermentacion: 'Abre la ficha del lote, registra el seguimiento diario y las adiciones de metabisulfito: se calcula la dosis en mg/L, el SO₂ teórico y se alerta el sobre-sulfitado.',
    bodega: 'Registra entradas (valida capacidad), trasiegos y mermas (validan stock). Revisa el balance de masa por lote.',
    historico: 'Consolidado de kg y litros por lote y temporada, con exportación CSV/JSON.',
    envasado: 'Crea la orden en borrador, revisa el costo unitario en vivo y confírmala: descuenta vino e insumos. Usa el validador de etiqueta antes de imprimir.',
    ventas: 'Elige granel (desde estanque) o envasado (desde una orden). Se calculan IVA e ILA, se descuenta stock y se puede generar el DTE.',
    inventarios: 'Stock de producto terminado, granel e insumos calculado desde los movimientos. Usa "Ajuste de inventario" tras una toma física.',
    marca: 'Registra la marca INAPI (10 años) y cada versión de etiqueta: los costos de diseño se prorratean por botella.',
    clientes: 'Maestro de clientes con RUT validado e historial. En "Cuentas por cobrar" ves la antigüedad de la deuda y registras cobros.',
    costos: 'Costo directo por lote y costo unitario por formato con su composición; además, costo total con indirectos prorrateados.',
    financiero: 'Estado de resultados, ratios con semáforo, punto de equilibrio, simulador, flujo de caja, rankings y resumen ejecutivo imprimible.',
    administracion: 'Trabajadores, liquidaciones mensuales (AFP, salud, cesantía, impuesto único), honorarios con retención, gastos y presupuesto vs real.',
    proveedores: 'Registra compras: suben el stock, actualizan el precio del insumo y, con factura, generan el DTE recibido para el IVA crédito.',
    cumplimiento: 'Panel de obligaciones SAG, SII, patentes, INAPI, D.O. y certificaciones con sus vencimientos. Exporta el libro de existencias.',
    dte: 'DTE emitidos y recibidos con XML descargable, estados, notas de crédito, libro de compras y ventas, folios CAF y datos del emisor.',
    conciliacion: 'Importa la cartola CSV, concilia automáticamente por monto y fecha, y resuelve el resto a mano o como diferencia.',
    tributario: 'Borradores de F29 (IVA, ILA, PPM, retenciones), PPM anual, Renta (RLI, IDPC, créditos) y calendario tributario.',
    usuarios: 'Crea usuarios con PIN y rol. Puedes definir roles personalizados con permisos por módulo y revisar el log de auditoría.',
    configuracion: 'Datos de la empresa, umbrales de alertas, respaldos JSON/CSV y gestión de los datos de ejemplo.'
  };
  VG.registry.implement('ayuda', {
    async onMount(ctx) {
      const content = UI.page(ctx.el, { title: 'Ayuda', crumbs: [['Administración']], desc: 'Guía rápida de Winzer Gestión. Para la documentación técnica completa revisa README.md y la carpeta /docs del repositorio.', noDemoBanner: true });
      const mods = VG.registry.list().filter(m => VG.auth.can(m.id, 'v') && GUIAS[m.id]);
      content.innerHTML = `<div class="help-content">
        <div class="grid grid-2"><div class="card"><h3>🚀 Primeros pasos</h3><ol><li>Configura tu empresa en <a href="#/configuracion">Configuración</a> y el emisor en <a href="#/dte/emisor">DTE › Emisor</a>.</li><li>Crea tus <a href="#/catastro">cuarteles</a>, <a href="#/bodega">estanques</a> e <a href="#/insumos">insumos</a>.</li><li>Planifica los <a href="#/calendario">lotes</a> de la temporada.</li><li>Durante la vendimia registra <a href="#/cosecha">cosecha</a>, entradas a <a href="#/bodega">bodega</a> y el seguimiento de <a href="#/fermentacion">fermentación</a>.</li><li>Envasa, vende y revisa tus <a href="#/financiero">finanzas</a> y el <a href="#/tributario">F29</a>.</li></ol></div>
        <div class="card"><h3>⌨️ Atajos</h3><ul><li><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd>: búsqueda global (cuarteles, estanques, clientes, folios…)</li><li><kbd>Esc</kbd>: cerrar ventanas</li><li><kbd>Enter</kbd>: guardar formularios</li><li><kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd>: navegar por los controles</li></ul><h3>🔁 Flujo integrado</h3><p class="text-sm">Cosecha → bodega → fermentación → envasado → venta → DTE → IVA → F29 → Renta. Y compras → DTE recibido → IVA crédito → F29.</p></div></div>
        <h2>Guía por módulo</h2><div class="grid grid-2">${mods.map(m => `<div class="card pad-sm"><h4><a href="#${m.route}" style="text-decoration:none">${UI.icon(m.icon)} ${U.esc(m.name)}</a></h4><p class="text-sm" style="margin:0">${U.esc(GUIAS[m.id])}</p></div>`).join('')}</div>
        <h2>⚖️ Advertencias legales</h2><div class="card"><ul>
          <li>El sistema es una <b>herramienta de apoyo</b>. No reemplaza a un contador, asesor legal, enólogo certificado ni las declaraciones oficiales ante el SII o el SAG.</li>
          <li><b>No envía DTE al SII.</b> Genera el XML para que lo envíes mediante tu proveedor de facturación electrónica autorizado. La responsabilidad legal de la emisión es del contribuyente.</li>
          <li>Tasas, regímenes, plazos y normativas cambian: valida con tu contador antes de declarar.</li>
          <li>La autenticación es local y básica: no expongas la app en internet con datos reales.</li>
          <li>No subas datos reales a GitHub. Respalda con la exportación JSON en un lugar privado.</li>
          <li>La demo en GitHub Pages guarda los datos solo en el navegador de cada visitante; no hay sincronización.</li></ul></div>
        ${VG.DEV ? `<h2>🛠️ Modo desarrollo: eventos con suscriptores</h2><div class="card"><code>${VG.events.list().map(U.esc).join('</code> · <code>')}</code></div>` : ''}
        <p class="muted text-sm" style="margin-top:20px">Winzer Gestión v${VG.VERSION} · ${VG.BUILD_DATE}</p></div>`;
    }
  });
})(window.VG);
