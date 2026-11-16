/**
 * core/events.js — Event bus de dominio.
 *
 * Los módulos NUNCA se importan entre sí: publican y se suscriben a eventos
 * con nombre estable `<dominio>.<accion>` (catálogo en docs/api-hooks.md).
 *
 *   VG.events.on('venta.confirmada', payload => { ... });
 *   VG.events.emit('venta.confirmada', { venta });
 *
 * Además, la capa de datos emite automáticamente eventos genéricos:
 *   `data.saved` ({entity, record, isNew}), `data.removed` ({entity, id}),
 *   `<entidad>.saved` y `<entidad>.removed`.
 */
(function (VG) {
  'use strict';
  const handlers = new Map();
  const history = [];

  VG.events = {
    /** Suscribe un handler. Devuelve una función para desuscribir. */
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(fn);
      return () => VG.events.off(name, fn);
    },
    once(name, fn) {
      const off = VG.events.on(name, p => { off(); fn(p); });
      return off;
    },
    off(name, fn) { handlers.get(name)?.delete(fn); },
    /**
     * Publica un evento. Los errores de un handler no interrumpen a los demás.
     * Soporta comodín '*' para escuchar todo (útil para depuración).
     */
    emit(name, payload) {
      if (VG.DEV) { history.push({ name, at: Date.now() }); if (history.length > 200) history.shift(); VG.utils.log('evento', name, payload); }
      const run = (set) => set && set.forEach(fn => { try { fn(payload, name); } catch (e) { console.error('Error en handler de', name, e); } });
      run(handlers.get(name));
      run(handlers.get('*'));
    },
    /** Lista de eventos con suscriptores (para la página de ayuda/dev). */
    list() { return Array.from(handlers.keys()); },
    history() { return history.slice(); }
  };
})(window.VG);
