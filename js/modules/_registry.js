/**
 * modules/_registry.js — Registro central de módulos.
 *
 * Cada entrada es el MANIFIESTO liviano del módulo (lo necesario para construir
 * el menú y el router sin cargar su código). La implementación (hooks onInstall,
 * onMount, onUnmount) vive en js/modules/<id>/index.js y se carga bajo demanda
 * la primera vez que se navega a su ruta.
 *
 * ➕ Agregar un módulo nuevo = crear la carpeta js/modules/<id>/ con index.js,
 *    y añadir su manifiesto a la lista de abajo. No se modifica el núcleo.
 *    Guía paso a paso: docs/modules.md
 */
(function (VG) {
  'use strict';
  const AREAS = [
    { id: 'inicio', name: 'Inicio' },
    { id: 'operacion', name: 'Operación' },
    { id: 'bodega', name: 'Vinificación y bodega' },
    { id: 'comercial', name: 'Comercial' },
    { id: 'finanzas', name: 'Finanzas' },
    { id: 'tributario', name: 'Tributario' },
    { id: 'administracion', name: 'Administración' }
  ];

  /** Manifiestos. `files` permite separar la vista en varios archivos (se cargan en orden). */
  const MODULES = [
    { id: 'dashboard', name: 'Dashboard', icon: 'home', area: 'inicio', route: '/dashboard', dependencies: [], consumes: ['*'], provides: [] },

    { id: 'catastro', name: 'Catastro vitícola', icon: 'map', area: 'operacion', route: '/catastro', files: ['schema.js', 'view.js', 'index.js'], dependencies: [],
      requiredRole: ['admin', 'agronomo'], provides: ['catastro.cuartelCreado'], consumes: [] },
    { id: 'fenologia', name: 'Desborre y fenología', icon: 'sprout', area: 'operacion', route: '/fenologia', dependencies: ['catastro'], provides: [], consumes: ['catastro.cuartelCreado'] },
    { id: 'insumos', name: 'Insumos y labores', icon: 'flask', area: 'operacion', route: '/insumos', dependencies: ['catastro'],
      menu: [{ label: 'Maestro de insumos', route: '/insumos' }, { label: 'Aplicaciones', route: '/insumos/aplicaciones' }, { label: 'Labores de campo', route: '/insumos/labores' }], provides: ['insumos.aplicacionRegistrada'], consumes: [] },
    { id: 'cosecha', name: 'Cosecha', icon: 'grape', area: 'operacion', route: '/cosecha', dependencies: ['catastro'],
      menu: [{ label: 'Registro de cosecha', route: '/cosecha' }, { label: 'Personal y pagos', route: '/cosecha/personal' }], provides: ['cosecha.registroCreado', 'cosecha.costoCalculado'], consumes: ['catastro.cuartelCreado'] },
    { id: 'calendario', name: 'Calendario de vendimia', icon: 'calendar', area: 'operacion', route: '/calendario', dependencies: ['catastro'],
      menu: [{ label: 'Lotes y planificación', route: '/calendario' }, { label: 'Vista Gantt', route: '/calendario/gantt' }, { label: 'Ventanas por valle', route: '/calendario/ventanas' }], provides: ['lote.estadoCambiado'], consumes: ['cosecha.registroCreado', 'bodega.entradaRegistrada', 'fermentacion.faFinalizada'] },
    { id: 'laboratorio', name: 'Laboratorio', icon: 'lab', area: 'operacion', route: '/laboratorio', dependencies: ['calendario'], provides: ['laboratorio.analisisRegistrado'], consumes: [] },

    { id: 'vinificacion', name: 'Vinificación y aditivos', icon: 'wine', area: 'bodega', route: '/vinificacion', dependencies: ['calendario', 'insumos'], provides: ['vinificacion.aditivoAplicado'], consumes: [] },
    { id: 'fermentacion', name: 'Fermentación', icon: 'ferment', area: 'bodega', route: '/fermentacion', dependencies: ['calendario', 'bodega'], provides: ['fermentacion.faIniciada', 'fermentacion.faFinalizada', 'fermentacion.so2Agregado'], consumes: ['bodega.entradaRegistrada'] },
    { id: 'bodega', name: 'Control de bodega', icon: 'tank', area: 'bodega', route: '/bodega', dependencies: ['calendario'],
      menu: [{ label: 'Estanques', route: '/bodega' }, { label: 'Movimientos', route: '/bodega/movimientos' }, { label: 'Balance de masa', route: '/bodega/balance' }], provides: ['bodega.entradaRegistrada', 'bodega.trasiegoRegistrado'], consumes: ['fermentacion.faFinalizada', 'envasado.confirmado', 'venta.confirmada'] },
    { id: 'historico', name: 'Histórico kg y litros', icon: 'history', area: 'bodega', route: '/historico', dependencies: ['cosecha', 'bodega'], provides: [], consumes: ['cosecha.registroCreado', 'bodega.entradaRegistrada'] },

    { id: 'envasado', name: 'Envasado y etiquetado', icon: 'bottle', area: 'comercial', route: '/envasado', dependencies: ['bodega', 'insumos'],
      menu: [{ label: 'Órdenes de envasado', route: '/envasado' }, { label: 'Formatos', route: '/envasado/formatos' }, { label: 'Validador de etiqueta', route: '/envasado/validador' }], provides: ['envasado.confirmado'], consumes: [] },
    { id: 'ventas', name: 'Ventas', icon: 'cart', area: 'comercial', route: '/ventas', dependencies: ['clientes'],
      menu: [{ label: 'Registro de ventas', route: '/ventas' }, { label: 'Reportes y conciliación de litros', route: '/ventas/reportes' }], provides: ['venta.confirmada', 'venta.anulada'], consumes: [] },
    { id: 'inventarios', name: 'Inventarios', icon: 'box', area: 'comercial', route: '/inventarios', dependencies: [], provides: [], consumes: ['venta.confirmada', 'compra.registrada', 'envasado.confirmado'] },
    { id: 'marca', name: 'Marca y etiquetas', icon: 'tag', area: 'comercial', route: '/marca', dependencies: [], provides: [], consumes: [] },
    { id: 'clientes', name: 'Clientes y cobranza', icon: 'users', area: 'comercial', route: '/clientes',
      menu: [{ label: 'Clientes', route: '/clientes' }, { label: 'Cuentas por cobrar', route: '/clientes/cobranza' }], dependencies: [], provides: ['cobro.registrado'], consumes: ['venta.confirmada'] },

    { id: 'costos', name: 'Costos por botella/litro', icon: 'coins', area: 'finanzas', route: '/costos',
      menu: [{ label: 'Costo por lote y formato', route: '/costos' }, { label: 'Activos y depreciación', route: '/costos/activos' }], dependencies: ['envasado'], provides: [], consumes: [] },
    { id: 'financiero', name: 'Financiero', icon: 'chart', area: 'finanzas', route: '/financiero',
      menu: [{ label: 'Estado de resultados', route: '/financiero' }, { label: 'Ratios', route: '/financiero/ratios' }, { label: 'Punto de equilibrio', route: '/financiero/equilibrio' }, { label: 'Simulador', route: '/financiero/simulador' }, { label: 'Flujo de caja', route: '/financiero/flujo' }, { label: 'Rankings y BCG', route: '/financiero/rankings' }, { label: 'Resumen ejecutivo', route: '/financiero/resumen' }], dependencies: ['ventas'], provides: [], consumes: [] },
    { id: 'administracion', name: 'Sueldos y gastos', icon: 'briefcase', area: 'finanzas', route: '/administracion',
      menu: [{ label: 'Trabajadores', route: '/administracion' }, { label: 'Remuneraciones', route: '/administracion/remuneraciones' }, { label: 'Honorarios', route: '/administracion/honorarios' }, { label: 'Gastos', route: '/administracion/gastos' }, { label: 'Presupuesto vs real', route: '/administracion/presupuesto' }], dependencies: [], provides: ['gasto.registrado', 'remuneracion.calculada'], consumes: [] },
    { id: 'proveedores', name: 'Proveedores y compras', icon: 'truck', area: 'finanzas', route: '/proveedores',
      menu: [{ label: 'Compras', route: '/proveedores' }, { label: 'Proveedores', route: '/proveedores/maestro' }, { label: 'Cuentas por pagar', route: '/proveedores/pagar' }, { label: 'Evolución de precios', route: '/proveedores/precios' }], dependencies: [], provides: ['compra.registrada'], consumes: [] },

    { id: 'cumplimiento', name: 'Cumplimiento normativo', icon: 'shield', area: 'tributario', route: '/cumplimiento', dependencies: [], provides: [], consumes: [] },
    { id: 'dte', name: 'DTE (SII)', icon: 'receipt', area: 'tributario', route: '/dte',
      menu: [{ label: 'Documentos', route: '/dte' }, { label: 'Libro de compras y ventas', route: '/dte/libros' }, { label: 'Folios (CAF)', route: '/dte/folios' }, { label: 'Emisor', route: '/dte/emisor' }], dependencies: [], provides: ['dte.emitido', 'dte.estadoCambiado'], consumes: ['venta.confirmada', 'compra.registrada'] },
    { id: 'conciliacion', name: 'Conciliación bancaria', icon: 'bank', area: 'tributario', route: '/conciliacion', dependencies: [], provides: ['conciliacion.actualizada'], consumes: [] },
    { id: 'tributario', name: 'Tributario (F29, PPM, Renta)', icon: 'scale', area: 'tributario', route: '/tributario',
      menu: [{ label: 'F29 mensual', route: '/tributario' }, { label: 'PPM', route: '/tributario/ppm' }, { label: 'Renta anual', route: '/tributario/renta' }, { label: 'Calendario tributario', route: '/tributario/calendario' }, { label: 'Configuración', route: '/tributario/config' }], dependencies: ['dte'], provides: [], consumes: ['dte.emitido'] },

    { id: 'usuarios', name: 'Usuarios y permisos', icon: 'user', area: 'administracion', route: '/usuarios',
      menu: [{ label: 'Usuarios', route: '/usuarios' }, { label: 'Roles y permisos', route: '/usuarios/roles' }, { label: 'Log de auditoría', route: '/usuarios/auditoria' }, { label: 'Tareas', route: '/usuarios/tareas' }], dependencies: [], provides: [], consumes: [] },
    { id: 'configuracion', name: 'Configuración y datos', icon: 'gear', area: 'administracion', route: '/configuracion', dependencies: [], provides: [], consumes: [] },
    { id: 'ayuda', name: 'Ayuda', icon: 'help', area: 'administracion', route: '/ayuda', dependencies: [], provides: [], consumes: [] }
  ];

  const impl = {};
  const loading = {};

  VG.registry = {
    AREAS,
    list() { return MODULES.slice(); },
    get(id) { return MODULES.find(m => m.id === id) || null; },
    /** Permite registrar manifiestos adicionales en tiempo de ejecución (plugins). */
    add(manifest) { if (!VG.registry.get(manifest.id)) MODULES.push(manifest); VG.events.emit('registry.changed', { id: manifest.id }); },
    /** Llamado por js/modules/<id>/index.js para registrar sus hooks. */
    implement(id, hooks) { impl[id] = hooks; },
    impl(id) { return impl[id] || null; },
    /** Carga perezosa del código del módulo (inyecta <script>; funciona con file://). */
    load(id) {
      if (impl[id]) return Promise.resolve(impl[id]);
      if (loading[id]) return loading[id];
      const m = VG.registry.get(id);
      if (!m) return Promise.reject(new Error(`El módulo "${id}" no está registrado.`));
      const files = m.files || ['index.js'];
      loading[id] = files.reduce((p, f) => p.then(() => new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = `js/modules/${id}/${f}?v=${VG.VERSION}`;
        s.onload = res;
        s.onerror = () => rej(new Error(`No se encontró el archivo del módulo "${m.name}" (js/modules/${id}/${f}). Puede que no esté instalado.`));
        document.head.appendChild(s);
      })), Promise.resolve()).then(async () => {
        const h = impl[id];
        if (!h) throw new Error(`El módulo "${m.name}" no se registró correctamente.`);
        const installed = VG.db.getMeta('installed', []);
        if (!installed.includes(id)) {
          if (h.onInstall) await h.onInstall({ db: VG.db, manifest: m });
          await VG.db.setMeta('installed', installed.concat(id));
        }
        return h;
      }).catch(e => { delete loading[id]; throw e; });
      return loading[id];
    },
    /** Dependencias faltantes de un módulo (no registradas). */
    missingDeps(id) { const m = VG.registry.get(id); return (m && m.dependencies || []).filter(d => !VG.registry.get(d)); }
  };
})(window.VG);
