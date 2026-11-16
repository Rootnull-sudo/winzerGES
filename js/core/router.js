/**
 * core/router.js — Navegación por hash (#/modulo/subruta?param=valor).
 * Usa hash para funcionar con file:// y GitHub Pages sin configuración de servidor.
 * Carga el módulo bajo demanda, verifica permisos y dependencias, y llama
 * onUnmount del módulo anterior antes de montar el siguiente.
 */
(function (VG) {
  'use strict';
  const U = VG.utils;
  let current = null; // { id, hooks, ctx }
  let token = 0;

  function parse() {
    const h = location.hash.replace(/^#/, '') || '/dashboard';
    const [path, qs] = h.split('?');
    const parts = path.split('/').filter(Boolean);
    return { id: parts[0] || 'dashboard', sub: parts[1] || '', rest: parts.slice(2), query: Object.fromEntries(new URLSearchParams(qs || '')) , path };
  }

  const R = {
    current() { return current; },
    go(hash) { if (location.hash === hash) R.render(); else location.hash = hash; },
    async render() {
      const my = ++token;
      const el = document.getElementById('content');
      if (!el || !VG.auth.current()) return;
      const r = parse();
      const m = VG.registry.get(r.id);
      VG.store.set({ route: r.path });
      if (current && current.hooks && current.hooks.onUnmount) { try { await current.hooks.onUnmount(current.ctx); } catch (e) { console.error(e); } }
      current = null;
      window.scrollTo(0, 0);
      if (!m) { el.innerHTML = VG.ui.empty({ icon: '🧭', title: 'Página no encontrada', text: 'La dirección no corresponde a ningún módulo. Usa el menú lateral para navegar.' }); return; }
      if (!VG.auth.can(m.id, 'v')) { el.innerHTML = VG.ui.empty({ icon: '🔒', title: 'Sin acceso', text: `Tu rol no tiene acceso a "${U.esc(m.name)}". Si lo necesitas, pide a un administrador que ajuste tus permisos.` }); return; }
      const missing = VG.registry.missingDeps(m.id);
      if (missing.length) { el.innerHTML = VG.ui.empty({ icon: '🧩', title: 'Falta un módulo requerido', text: `"${U.esc(m.name)}" necesita: ${missing.map(U.esc).join(', ')}. Instala esos módulos para usarlo.` }); return; }
      el.innerHTML = VG.ui.skeleton(6);
      document.title = m.name + ' · Winzer Gestión';
      let hooks;
      try { hooks = await VG.registry.load(m.id); }
      catch (e) { if (my === token) el.innerHTML = VG.ui.empty({ icon: '🧩', title: 'No se pudo cargar el módulo', text: U.esc(e.message) }); return; }
      if (my !== token) return; // el usuario ya navegó a otra parte
      const ctx = { el, id: m.id, sub: r.sub, rest: r.rest, query: r.query, manifest: m, navigate: R.go, refresh: () => R.render() };
      el.innerHTML = '';
      current = { id: m.id, hooks, ctx };
      try { await hooks.onMount(ctx); }
      catch (e) { console.error(e); el.innerHTML = VG.ui.empty({ icon: '⚠️', title: 'Algo salió mal al mostrar esta página', text: 'Intenta recargar. Si el problema persiste, exporta un respaldo de tus datos desde Configuración y abre la app con ?dev=1 para ver el detalle.' }); }
      VG.events.emit('route.changed', { id: m.id, sub: r.sub });
      // foco al título para lectores de pantalla
      const h1 = el.querySelector('h1'); if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    },
    start() { window.addEventListener('hashchange', () => R.render()); R.render(); },
    parse
  };
  VG.router = R;
})(window.VG);
