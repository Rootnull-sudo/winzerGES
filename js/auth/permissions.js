/**
 * auth/permissions.js — Roles predefinidos y permisos granulares por módulo.
 *
 * Permisos por módulo como string de letras:
 *   v = ver, c = crear, e = editar, d = eliminar, x = exportar
 * Los roles personalizados se guardan en la entidad `rol` con la misma forma.
 */
(function (VG) {
  'use strict';
  const ALL = 'vcedx';
  const MODS = ['dashboard', 'catastro', 'fenologia', 'insumos', 'cosecha', 'calendario', 'laboratorio', 'vinificacion', 'fermentacion', 'bodega', 'historico', 'envasado', 'ventas', 'inventarios', 'marca', 'clientes', 'costos', 'financiero', 'administracion', 'proveedores', 'cumplimiento', 'dte', 'conciliacion', 'tributario', 'usuarios', 'configuracion', 'ayuda'];

  const fill = (mods, p) => mods.reduce((o, m) => (o[m] = p, o), {});

  const ROLES = {
    admin: {
      id: 'admin', nombre: 'Administrador', descripcion: 'Acceso total al sistema, usuarios y configuración.',
      permisos: fill(MODS, ALL)
    },
    enologo: {
      id: 'enologo', nombre: 'Enólogo', descripcion: 'Vinificación, fermentación, bodega, laboratorio y envasado. Sin finanzas ni precios.',
      permisos: Object.assign(fill(['vinificacion', 'fermentacion', 'bodega', 'laboratorio', 'envasado'], ALL),
        { calendario: 'vcex', historico: 'vx', catastro: 'v', cosecha: 'v', insumos: 'v', inventarios: 'v', marca: 'v', cumplimiento: 'v', dashboard: 'v', ayuda: 'v' })
    },
    agronomo: {
      id: 'agronomo', nombre: 'Agrónomo', descripcion: 'Catastro, fenología, insumos, cosecha y calendario. Sin finanzas ni ventas.',
      permisos: Object.assign(fill(['catastro', 'fenologia', 'insumos', 'cosecha', 'calendario'], ALL),
        { laboratorio: 'v', historico: 'vx', bodega: 'v', cumplimiento: 'v', dashboard: 'v', ayuda: 'v' })
    },
    administrativo: {
      id: 'administrativo', nombre: 'Administrativo / Contador', descripcion: 'Compras, proveedores, gastos, sueldos, tributario, financiero, conciliación y DTE. Sin operación.',
      permisos: Object.assign(fill(['proveedores', 'administracion', 'tributario', 'financiero', 'conciliacion', 'dte', 'costos', 'clientes', 'cumplimiento'], ALL),
        { inventarios: 'vcex', ventas: 'vx', marca: 'vcex', dashboard: 'v', ayuda: 'v', configuracion: 'vex', historico: 'vx' })
    },
    ventas: {
      id: 'ventas', nombre: 'Ventas', descripcion: 'Clientes, ventas, inventario de producto terminado y DTE de venta. Sin costos, sueldos ni tributario.',
      permisos: Object.assign(fill(['clientes', 'ventas'], 'vcex'), { inventarios: 'v', dte: 'vcx', dashboard: 'v', ayuda: 'v' })
    },
    auditor: {
      id: 'auditor', nombre: 'Solo lectura / Auditor', descripcion: 'Puede ver y exportar todo, sin modificar nada.',
      permisos: fill(MODS, 'vx')
    }
  };

  VG.permissions = {
    MODULES: MODS,
    ROLES,
    ACTIONS: { v: 'Ver', c: 'Crear', e: 'Editar', d: 'Eliminar', x: 'Exportar' },
    /** Devuelve la definición de rol (predefinido o personalizado). */
    role(id) {
      if (ROLES[id]) return ROLES[id];
      const custom = VG.db.get('rol', id);
      return custom || null;
    },
    allRoles() { return Object.values(ROLES).concat(VG.db.list('rol')); },
    /** ¿El rol permite la acción sobre el módulo? */
    check(roleId, moduleId, action = 'v') {
      const r = VG.permissions.role(roleId);
      if (!r) return false;
      const p = (r.permisos || {})[moduleId] || '';
      return p.includes(action);
    }
  };
})(window.VG);
