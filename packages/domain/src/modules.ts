/**
 * Catálogo de módulos — port de js/modules/_registry.js (v1).
 * `offline: true` = el módulo se puede usar sin conexión (sus entidades se sincronizan a IndexedDB).
 * Áreas offline: Operación, Vinificación y bodega, Administración (esta última solo lectura sin red).
 * `status: 'v2'` = ya migrado a la nueva plataforma; 'pendiente' = solo existe en v1 (legacy).
 */
export const AREAS = [
  { id: 'inicio', name: 'Inicio', offline: false },
  { id: 'operacion', name: 'Operación', offline: true },
  { id: 'bodega', name: 'Vinificación y bodega', offline: true },
  { id: 'comercial', name: 'Comercial', offline: false },
  { id: 'finanzas', name: 'Finanzas', offline: false },
  { id: 'tributario', name: 'Tributario', offline: false },
  { id: 'administracion', name: 'Administración', offline: true }
] as const;

export type AreaId = (typeof AREAS)[number]['id'];

export interface ModuleDef {
  id: string;
  name: string;
  area: AreaId;
  icon: string;
  status: 'v2' | 'pendiente';
}

const m = (id: string, name: string, area: AreaId, icon: string, status: ModuleDef['status'] = 'pendiente'): ModuleDef => ({ id, name, area, icon, status });

export const MODULES: readonly ModuleDef[] = [
  m('dashboard', 'Dashboard', 'inicio', 'layout-dashboard'),
  m('catastro', 'Catastro vitícola', 'operacion', 'map', 'v2'),
  m('fenologia', 'Desborre y fenología', 'operacion', 'sprout', 'v2'),
  m('insumos', 'Insumos y labores', 'operacion', 'flask-conical', 'v2'),
  m('cosecha', 'Cosecha', 'operacion', 'grape', 'v2'),
  m('calendario', 'Calendario de vendimia', 'operacion', 'calendar', 'v2'),
  m('laboratorio', 'Laboratorio', 'operacion', 'test-tube'),
  m('vinificacion', 'Vinificación y aditivos', 'bodega', 'beaker'),
  m('fermentacion', 'Fermentación', 'bodega', 'thermometer'),
  m('bodega', 'Control de bodega', 'bodega', 'container'),
  m('historico', 'Histórico kg y litros', 'bodega', 'history'),
  m('envasado', 'Envasado y etiquetado', 'comercial', 'wine'),
  m('ventas', 'Ventas', 'comercial', 'shopping-cart'),
  m('inventarios', 'Inventarios', 'comercial', 'boxes'),
  m('marca', 'Marca y etiquetas', 'comercial', 'tag'),
  m('clientes', 'Clientes y cobranza', 'comercial', 'users', 'v2'),
  m('costos', 'Costos por botella/litro', 'finanzas', 'calculator'),
  m('financiero', 'Financiero', 'finanzas', 'line-chart'),
  m('administracion', 'Sueldos y gastos', 'finanzas', 'wallet'),
  m('proveedores', 'Proveedores y compras', 'finanzas', 'truck'),
  m('cumplimiento', 'Cumplimiento normativo', 'tributario', 'shield-check'),
  m('dte', 'DTE (SII)', 'tributario', 'receipt'),
  m('conciliacion', 'Conciliación bancaria', 'tributario', 'landmark'),
  m('tributario', 'Tributario (F29, PPM, Renta)', 'tributario', 'file-text'),
  m('usuarios', 'Usuarios y permisos', 'administracion', 'user-cog', 'v2'),
  m('configuracion', 'Configuración y datos', 'administracion', 'settings', 'v2'),
  m('ayuda', 'Ayuda', 'administracion', 'life-buoy')
];

export const MODULE_IDS = MODULES.map((x) => x.id);
export const moduleById = (id: string) => MODULES.find((x) => x.id === id);
export const isOfflineModule = (id: string) => {
  const mod = moduleById(id);
  return !!mod && AREAS.find((a) => a.id === mod.area)!.offline;
};
