/**
 * data/schema.js — Definición de entidades, su módulo dueño y versión.
 *
 * Cada entidad declara:
 *  - module:   id del módulo dueño (usado para validar permisos en la capa de datos)
 *  - version:  versión del esquema de la entidad. Si sube, se ejecutan las migraciones.
 *  - label:    nombre legible (singular)
 *  - display:  función que devuelve el texto con que se muestra un registro
 *  - migrations: { [versionDestino]: (registro) => registro }  (ej. 2: r => ({...r, nuevoCampo: 0}))
 *  - sensitive: true para registrar cambios en el log de auditoría
 *
 * Para agregar un campo a una entidad existente: subir `version` y agregar la
 * migración correspondiente. La capa de datos (db.js) la ejecuta al iniciar si
 * detecta registros guardados con una versión anterior.
 */
(function (VG) {
  'use strict';
  const U = VG.utils;
  const E = {};
  /** Registra una entidad. Los módulos pueden registrar entidades nuevas en onInstall. */
  function def(name, o) { E[name] = Object.assign({ version: 1, migrations: {}, display: r => r.nombre || r.codigo || r.id, sensitive: false }, o, { name }); }

  // --- Sistema ---
  def('config', { module: 'configuracion', label: 'Configuración', display: () => 'Configuración', sensitive: true });
  def('usuario', { module: 'usuarios', label: 'Usuario', display: r => r.nombre, sensitive: true });
  def('rol', { module: 'usuarios', label: 'Rol', display: r => r.nombre, sensitive: true });
  def('auditoria', { module: 'usuarios', label: 'Registro de auditoría', display: r => r.accion });
  def('tarea', { module: 'usuarios', label: 'Tarea', display: r => r.titulo });

  // --- Operación agrícola ---
  def('cuartel', {
    module: 'catastro', label: 'Cuartel', version: 2, sensitive: false,
    display: r => r.codigo + ' · ' + (r.variedad || ''),
    // Ejemplo de migración: v1 → v2 agrega "valle" con valor por defecto
    migrations: { 2: r => Object.assign({ valle: 'Colchagua' }, r) }
  });
  def('variedad', { module: 'configuracion', label: 'Variedad', display: r => r.nombre });
  def('fenologia', { module: 'fenologia', label: 'Registro fenológico', display: r => r.temporada + ' · ' + r.cuartelId });
  def('clima', { module: 'fenologia', label: 'Registro de temperatura', display: r => r.fecha });
  def('insumo', { module: 'insumos', label: 'Insumo', display: r => r.nombre, sensitive: true });
  def('aplicacion', { module: 'insumos', label: 'Aplicación', display: r => r.fecha });
  def('labor', { module: 'insumos', label: 'Labor', display: r => r.tipo + ' ' + r.fecha });
  def('cosecha', { module: 'cosecha', label: 'Registro de cosecha', display: r => U.fmtDate(r.fecha) + ' · ' + r.kg + ' kg' });
  def('jornal', { module: 'cosecha', label: 'Jornal de cosecha', display: r => r.nombre });
  def('ventana', { module: 'calendario', label: 'Ventana de vendimia', display: r => r.variedad + ' · ' + r.valle });
  def('lote', { module: 'calendario', label: 'Lote', display: r => r.codigo + (r.variedad ? ' · ' + r.variedad : '') });
  def('analisis', { module: 'laboratorio', label: 'Análisis', display: r => U.fmtDate(r.fecha) });

  // --- Vinificación y bodega ---
  def('aditivo', { module: 'vinificacion', label: 'Aplicación de aditivo', display: r => r.producto });
  def('fermentacion', { module: 'fermentacion', label: 'Ficha de fermentación', display: r => r.codigo });
  def('seguimiento', { module: 'fermentacion', label: 'Seguimiento', display: r => U.fmtDate(r.fecha) });
  def('adicionSO2', { module: 'fermentacion', label: 'Adición de metabisulfito', display: r => U.fmtDate(r.fecha) });
  def('estanque', { module: 'bodega', label: 'Estanque', display: r => r.codigo });
  def('movBodega', { module: 'bodega', label: 'Movimiento de bodega', display: r => r.tipo + ' ' + r.litros + ' L' });

  // --- Comercial ---
  def('formato', { module: 'envasado', label: 'Formato', display: r => r.nombre });
  def('ordenEnvasado', { module: 'envasado', label: 'Orden de envasado', display: r => r.codigo });
  def('etiqueta', { module: 'marca', label: 'Etiqueta', display: r => r.nombre + ' v' + r.version });
  def('marca', { module: 'marca', label: 'Marca', display: r => r.nombre });
  def('venta', { module: 'ventas', label: 'Venta', display: r => r.codigo, sensitive: true });
  def('movInsumo', { module: 'inventarios', label: 'Movimiento de insumo', display: r => r.tipo });
  def('cliente', { module: 'clientes', label: 'Cliente', display: r => r.nombre });
  def('cobro', { module: 'clientes', label: 'Cobro', display: r => U.clp(r.monto) });

  // --- Finanzas ---
  def('trabajador', { module: 'administracion', label: 'Trabajador', display: r => r.nombre, sensitive: true });
  def('remuneracion', { module: 'administracion', label: 'Remuneración', display: r => r.periodo, sensitive: true });
  def('honorario', { module: 'administracion', label: 'Boleta de honorarios', display: r => r.nombre });
  def('gasto', { module: 'administracion', label: 'Gasto', display: r => r.descripcion, sensitive: true });
  def('presupuesto', { module: 'administracion', label: 'Presupuesto', display: r => r.categoria });
  def('activo', { module: 'costos', label: 'Activo fijo', display: r => r.nombre });
  def('proveedor', { module: 'proveedores', label: 'Proveedor', display: r => r.nombre });
  def('compra', { module: 'proveedores', label: 'Compra', display: r => r.documento + ' ' + (r.folio || ''), sensitive: true });
  def('pago', { module: 'proveedores', label: 'Pago a proveedor', display: r => U.clp(r.monto) });

  // --- Tributario y cumplimiento ---
  def('cumplimiento', { module: 'cumplimiento', label: 'Obligación normativa', display: r => r.nombre });
  def('dte', { module: 'dte', label: 'DTE', display: r => 'T' + r.tipo + ' N°' + r.folio, sensitive: true });
  def('caf', { module: 'dte', label: 'Rango de folios (CAF)', display: r => 'T' + r.tipo + ' ' + r.desde + '–' + r.hasta });
  def('cuentaBanco', { module: 'conciliacion', label: 'Cuenta bancaria', display: r => r.banco + ' ' + r.numero });
  def('movBanco', { module: 'conciliacion', label: 'Movimiento bancario', display: r => r.glosa });
  def('f29', { module: 'tributario', label: 'Formulario 29', display: r => 'F29 ' + r.periodo, sensitive: true });
  def('renta', { module: 'tributario', label: 'Declaración de Renta', display: r => 'Renta AT' + r.anioTributario, sensitive: true });
  def('pagoImpuesto', { module: 'tributario', label: 'Pago de impuesto', display: r => r.tipo + ' ' + r.periodo });
  def('obligacion', { module: 'tributario', label: 'Obligación tributaria', display: r => r.nombre });

  VG.schema = {
    entities: E,
    define: def,
    get(name) { return E[name]; },
    /** Mapa versión actual por entidad (se guarda en meta para detectar migraciones). */
    versions() { const v = {}; Object.values(E).forEach(e => v[e.name] = e.version); return v; }
  };
})(window.VG);
