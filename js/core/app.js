/**
 * core/app.js — Arranque de la aplicación, layout (header, sidebar, footer),
 * login local, onboarding, búsqueda global (Ctrl/Cmd+K), notificaciones,
 * modo oscuro y bloqueo por inactividad.
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = () => VG.ui;
  const esc = U.esc;
  const root = () => document.getElementById('app');

  /* ===================== TEMA ===================== */
  function applyTheme(t) { document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light'); }
  async function toggleTheme() {
    const u = VG.auth.current();
    const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(t);
    if (u) await VG.db.save('usuario', Object.assign({}, u, { tema: t }), { system: true, silent: true });
    VG.store.set({ theme: t });
    renderHeader();
    VG.router.render();
  }

  /* ===================== LOGIN ===================== */
  function renderLogin() {
    applyTheme(VG.db.getMeta('lastTheme', 'light'));
    const last = VG.db.getMeta('lastUser');
    const users = VG.auth.users().sort((a, b) => (b.id === last) - (a.id === last) || (b.rol === 'admin') - (a.rol === 'admin'));
    const cfg = VG.store.config();
    root().innerHTML = `<main class="login-wrap"><div class="login-card">
      <div class="brand-logo" aria-hidden="true">W</div>
      <h1 style="font-size:24px">Winzer Gestión</h1>
      <p class="muted"><b>${esc(cfg.empresa.nombreFantasia)}</b> · Selecciona tu usuario e ingresa tu PIN.</p>
      ${VG.STORAGE_RISK ? UI().alert('error', 'Tus datos podrían no guardarse aquí', U.esc(VG.STORAGE_RISK_MSG)) : ''}
      <form id="login-form" class="form" novalidate style="margin-top:12px">
        <div class="user-pick" role="radiogroup" aria-label="Usuario">${users.map((u, i) => `<button type="button" role="radio" aria-pressed="${i === 0}" aria-checked="${i === 0}" data-u="${u.id}"><span class="avatar">${esc(initials(u.nombre))}</span><span><b>${esc(u.nombre)}</b><br><span class="text-xs muted">${esc((VG.permissions.role(u.rol) || {}).nombre || u.rol)}</span></span></button>`).join('')}</div>
        <div class="field"><label for="pin">PIN o contraseña</label><input class="input" id="pin" type="password" autocomplete="current-password" inputmode="text" required aria-describedby="pin-err"><div class="field-error" id="pin-err" aria-live="polite"></div></div>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Ingresar</button>
      </form>
      ${VG.db.hasDemo() ? '<p class="text-xs muted" style="margin-top:14px">🧪 Datos demo: todos los usuarios de ejemplo usan el PIN <b>1234</b>.</p>' : ''}
      <p class="text-xs muted" style="margin-top:10px">🔒 Autenticación local básica: no expongas esta app en internet con datos reales.</p>
      <p class="text-xs" style="margin-top:6px"><a href="#" data-help-datos>¿No ves tu viña o tu usuario?</a></p>
      <p class="text-xs muted">v${VG.VERSION}</p>
    </div></main>`;
    let sel = users[0] && users[0].id;
    root().querySelectorAll('[data-u]').forEach(b => b.onclick = () => {
      sel = b.dataset.u;
      root().querySelectorAll('[data-u]').forEach(x => { x.setAttribute('aria-pressed', x === b); x.setAttribute('aria-checked', x === b); });
      U.$('#pin').focus();
    });
    U.$('#pin').focus();
    U.$('[data-help-datos]').onclick = e => {
      e.preventDefault();
      const body = U.html(`<div class="stack"><p>Winzer Gestión guarda los datos <b>en el navegador</b> del computador donde los creaste:</p><ul><li><b>Chrome y Edge guardan por separado.</b> Abre <code>index.html</code> con el mismo navegador que usaste al crear tu viña (clic derecho › Abrir con).</li><li>Usa el mismo perfil del navegador y no uses ventanas de incógnito.</li><li>Si cargaste y luego borraste los datos de ejemplo con una versión anterior, el nombre de tu viña pudo volver al valor por defecto: corrígelo en Configuración (tus demás registros se conservan).</li><li>Si tienes un respaldo (.json), puedes restaurarlo aquí. <b>Reemplaza</b> los datos actuales de este navegador.</li></ul><p class="text-xs muted">Datos en este navegador: ${U.int(VG.db.count())} registros · ${VG.db.count('usuario')} usuarios · almacenamiento ${VG.db.backend === 'indexeddb' ? 'IndexedDB' : 'localStorage'}${VG.db.persisted ? ' persistente' : ''}.</p><label class="btn">Restaurar respaldo…<input type="file" accept=".json,application/json" hidden data-r></label></div>`);
      const mm = UI().modal({ title: '¿No ves tus datos?', body, size: 'sm' });
      body.querySelector('[data-r]').onchange = async ev => {
        const f = ev.target.files[0]; if (!f) return;
        if (!(await UI().confirm({ title: 'Restaurar respaldo', message: `Se reemplazarán los datos de este navegador por los de <b>${U.esc(f.name)}</b>.`, confirmText: 'Restaurar', danger: true }))) return;
        try { const n = await VG.backup.importJSON(f); mm.close(true); UI().toast(`Respaldo restaurado: ${U.int(n)} registros.`); renderLogin(); }
        catch (err) { UI().toast(err.message || 'No se pudo leer el respaldo.', 'error'); }
      };
    };
    U.$('#login-form').onsubmit = async e => {
      e.preventDefault();
      const pin = U.$('#pin').value;
      if (!pin) { U.$('#pin-err').textContent = 'Ingresa tu PIN.'; return; }
      try { await VG.auth.login(sel, pin); await VG.db.setMeta('lastTheme', VG.auth.current().tema || 'light'); await VG.db.setMeta('lastUser', sel); boot2(); }
      catch (err) { U.$('#pin-err').textContent = err.message; U.$('#pin').closest('.field').classList.add('invalid'); U.$('#pin').select(); }
    };
  }
  const initials = n => String(n || '?').split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();

  /* ===================== ONBOARDING ===================== */
  function onboarding() {
    return new Promise(resolve => {
      applyTheme('light');
      root().innerHTML = '<main class="login-wrap"></main>';
      const body = `${VG.STORAGE_RISK ? UI().alert('error', 'Este navegador puede no guardar tus datos', U.esc(VG.STORAGE_RISK_MSG)) + '<div style="height:12px"></div>' : ''}
        <p>Esta app cubre toda la cadena de una viña boutique: desde el cuartel hasta la botella vendida, con costos, finanzas y obligaciones tributarias. Funciona <b>100% en tu navegador</b>, sin internet y sin instalar nada.</p>
        <div class="onb-modules">
          <div><b>🌱 Operación</b>Catastro, fenología, insumos, cosecha, calendario y laboratorio.</div>
          <div><b>🛢️ Bodega</b>Vinificación, fermentación con control de SO₂, estanques e histórico.</div>
          <div><b>🍾 Comercial</b>Envasado con costo por botella, ventas, inventarios, marca y clientes.</div>
          <div><b>📊 Finanzas</b>Costos, estado de resultados, ratios, punto de equilibrio y flujo de caja.</div>
          <div><b>🧾 Tributario</b>DTE (XML SII), conciliación bancaria, F29, PPM, Renta y cumplimiento SAG.</div>
          <div><b>👥 Equipo</b>Usuarios con roles, permisos por módulo y log de auditoría.</div>
        </div>
        ${UI().legal('Herramienta de apoyo: no reemplaza a tu contador, asesor legal ni las declaraciones oficiales ante SII o SAG. No envía documentos al SII.')}
        <h3>¿Cómo quieres empezar?</h3>
        <div class="grid grid-2">
          <button class="card" data-demo style="text-align:left;cursor:pointer"><h3>🧪 Cargar datos de ejemplo</h3><p class="muted text-sm" style="margin:0">Recomendado para conocer el sistema. Incluye cuarteles, lotes, ventas, DTE, F29 y usuarios (PIN 1234). Se pueden borrar después.</p></button>
          <button class="card" data-empty style="text-align:left;cursor:pointer"><h3>✨ Empezar desde cero</h3><p class="muted text-sm" style="margin:0">Crea tu usuario administrador e ingresa tus propios datos.</p></button>
        </div>
        <div class="alert info" style="margin-top:14px"><span>💾</span><div class="a-body"><div class="a-title">¿Ya usabas Winzer Gestión?</div>Tus datos quedan guardados en el navegador donde los creaste. Si no los ves, ábrela en ese mismo navegador (Chrome y Edge guardan por separado) o restaura tu respaldo.</div><label class="btn btn-sm">Restaurar respaldo<input type="file" accept=".json,application/json" data-restore hidden></label></div>`;
      const m = UI().modal({ title: '¡Bienvenido a Winzer Gestión!', body, size: 'lg', foot: false, closable: false, beforeClose: () => false });
      m.body.querySelector('[data-demo]').onclick = async () => {
        m.body.innerHTML = UI().skeleton(4) + '<p class="muted">Cargando datos de ejemplo…</p>';
        await loadSeed();
        await VG.db.setMeta('onboarded', true);
        m.close(true); UI().toast('Datos de ejemplo cargados. Ingresa con cualquier usuario y PIN 1234.'); resolve();
      };
      m.body.querySelector('[data-restore]').onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        try { const n = await VG.backup.importJSON(f); await VG.db.setMeta('onboarded', true); m.close(true); UI().toast(`Respaldo restaurado: ${U.int(n)} registros. Ingresa con tu usuario y PIN.`); resolve(); }
        catch (err) { UI().toast(err.message || 'No se pudo leer el respaldo.', 'error'); }
      };
      m.body.querySelector('[data-empty]').onclick = async () => {
        m.close(true);
        const r = await UI().formModal({
          title: 'Crea tu usuario administrador', saveLabel: 'Crear y entrar',
          fields: [
            { key: 'nombre', label: 'Nombre completo', required: true },
            { key: 'rut', label: 'RUT', type: 'rut' },
            { key: 'email', label: 'Correo', type: 'email' },
            { key: 'empresa', label: 'Nombre de la viña', required: true },
            { key: 'pin', label: 'PIN o contraseña', type: 'password', required: true, validate: v => String(v).length < 4 ? 'Usa al menos 4 caracteres.' : '' },
            { key: 'pin2', label: 'Repite el PIN', type: 'password', required: true, validate: (v, all) => v !== all.pin ? 'Los PIN no coinciden.' : '' }
          ],
          onSave: async v => {
            await VG.store.saveConfig({ empresa: { nombreFantasia: v.empresa, razonSocial: v.empresa } });
            const u = await VG.auth.createUser({ nombre: v.nombre, rut: v.rut, email: v.email, rol: 'admin', cargo: 'Administrador' }, v.pin, { system: true });
            await VG.db.setMeta('onboarded', true);
            await VG.auth.login(u.id, v.pin);
            return u;
          }
        });
        if (!r) return onboarding().then(resolve);
        resolve();
      };
    });
  }
  async function loadSeed() {
    if (!VG.seed) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'js/data/seed.js?v=' + VG.VERSION; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    await VG.seed.load();
  }
  VG.app = { loadSeed };

  /* ===================== LAYOUT ===================== */
  function renderLayout() {
    const collapsed = VG.db.getMeta('sidebarCollapsed', false);
    root().innerHTML = `<a href="#content" class="sr-only">Saltar al contenido</a>
      <div class="app ${collapsed ? 'collapsed' : ''}" id="shell">
        <aside class="sidebar" aria-label="Menú principal"><div class="brand"><div class="brand-logo" aria-hidden="true">W</div><div class="brand-text"><div class="brand-name">Winzer Gestión</div><div class="brand-sub">${esc(VG.store.config().empresa.nombreFantasia)}</div></div></div><nav class="nav" id="nav"></nav><button class="collapse-btn no-print" id="collapse" aria-label="Contraer o expandir menú">${collapsed ? '»' : '« Contraer'}</button></aside>
        <header class="header" id="header"></header>
        <main class="main" id="content" tabindex="-1"></main>
        <footer class="footer" id="footer"></footer>
      </div>`;
    renderNav(); renderHeader(); renderFooter();
    U.$('#collapse').onclick = async () => { const s = U.$('#shell'); s.classList.toggle('collapsed'); const c = s.classList.contains('collapsed'); U.$('#collapse').textContent = c ? '»' : '« Contraer'; await VG.db.setMeta('sidebarCollapsed', c); };
    U.$('#content').addEventListener('click', () => U.$('#shell').classList.remove('mobile-open'));
  }

  function renderNav() {
    const nav = U.$('#nav'); if (!nav) return;
    const r = VG.router.parse();
    const open = VG.db.getMeta('navOpen', {});
    nav.innerHTML = VG.registry.AREAS.map(a => {
      const mods = VG.registry.list().filter(m => m.area === a.id && VG.auth.can(m.id, 'v'));
      if (!mods.length) return '';
      return `<div class="nav-area">${a.id !== 'inicio' ? `<div class="nav-area-title">${esc(a.name)}</div>` : ''}${mods.map(m => {
        const active = r.id === m.id;
        const hasSub = m.menu && m.menu.length > 1;
        const isOpen = hasSub && (open[m.id] ?? active);
        return `<a class="nav-item ${active ? 'active' : ''}" href="#${m.route}" ${active ? 'aria-current="page"' : ''} title="${esc(m.name)}" ${hasSub ? `aria-expanded="${!!isOpen}" data-toggle="${m.id}"` : ''}><span class="ico" aria-hidden="true">${VG.ui.icon(m.icon)}</span><span class="nav-label">${esc(m.name)}</span>${hasSub ? '<span class="chev" aria-hidden="true">▶</span>' : ''}</a>
          ${hasSub && isOpen ? `<div class="nav-sub">${m.menu.map(s => `<a class="nav-item ${'/' + r.path.replace(/^\//, '') === s.route ? 'active' : ''}" href="#${s.route}"><span class="nav-label">${esc(s.label)}</span></a>`).join('')}</div>` : ''}`;
      }).join('')}</div>`;
    }).join('');
    nav.querySelectorAll('[data-toggle]').forEach(a => a.addEventListener('click', async e => {
      const id = a.dataset.toggle;
      if (VG.router.parse().id === id) { e.preventDefault(); const o = VG.db.getMeta('navOpen', {}); o[id] = !(a.getAttribute('aria-expanded') === 'true'); await VG.db.setMeta('navOpen', o); renderNav(); }
    }));
  }

  function renderHeader() {
    const h = U.$('#header'); if (!h) return;
    const u = VG.auth.current();
    const alerts = VG.alerts.compute();
    const crit = alerts.filter(a => a.level !== 'info').length;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    h.innerHTML = `
      <button class="icon-btn menu-toggle" id="menu-toggle" aria-label="Abrir menú">☰</button>
      <div class="season-select"><label for="season">Temporada</label><select class="select" id="season" style="width:auto;min-height:36px" aria-label="Seleccionar temporada">${VG.store.seasons().map(y => `<option value="${y}" ${y === VG.store.state.season ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
      <button class="search-trigger" id="search-btn" aria-label="Buscar (Ctrl+K)">🔍 <span>Buscar cuarteles, estanques, clientes, folios…</span><kbd>Ctrl K</kbd></button>
      <span class="spacer"></span>
      <button class="icon-btn" id="theme-btn" aria-label="${dark ? 'Activar modo claro' : 'Activar modo oscuro'}" title="${dark ? 'Modo claro' : 'Modo oscuro'}">${dark ? '☀️' : '🌙'}</button>
      <button class="icon-btn" id="bell" aria-label="Notificaciones: ${alerts.length}" title="Alertas">🔔${alerts.length ? `<span class="badge-dot" style="${crit ? '' : 'background:var(--color-info)'}">${alerts.length > 99 ? '99+' : alerts.length}</span>` : ''}</button>
      <div class="user-menu"><button class="user-btn" id="user-btn" aria-haspopup="menu" aria-expanded="false"><span class="avatar">${esc(initials(u.nombre))}</span><span class="nav-label text-sm" style="text-align:left;line-height:1.2"><b>${esc(u.nombre.split(' ')[0])}</b><br><span class="muted text-xs">${esc((VG.permissions.role(u.rol) || {}).nombre || u.rol)}</span></span></button></div>`;
    U.$('#season').onchange = e => { VG.store.set({ season: Number(e.target.value) }); VG.router.render(); renderHeader(); };
    U.$('#search-btn').onclick = openSearch;
    U.$('#theme-btn').onclick = toggleTheme;
    U.$('#menu-toggle').onclick = () => U.$('#shell').classList.toggle('mobile-open');
    U.$('#bell').onclick = () => openNotifications(alerts);
    U.$('#user-btn').onclick = e => {
      e.stopPropagation();
      const existing = U.$('.user-menu .dropdown'); if (existing) { existing.remove(); return; }
      const dd = U.html(`<div class="dropdown" role="menu"><div class="dd-head"><b>${esc(u.nombre)}</b><div class="text-xs muted">${esc(u.email || '')}</div></div>
        <button role="menuitem" data-a="perfil">👤 Mi perfil y PIN</button>
        <button role="menuitem" data-a="switch">🔄 Cambiar de usuario</button>
        <button role="menuitem" data-a="theme">${dark ? '☀️ Modo claro' : '🌙 Modo oscuro'}</button>
        <button role="menuitem" data-a="help">❓ Ayuda</button>
        <button role="menuitem" data-a="logout">🚪 Cerrar sesión</button></div>`);
      U.$('.user-menu').appendChild(dd); U.$('#user-btn').setAttribute('aria-expanded', 'true');
      dd.querySelector('button').focus();
      dd.onclick = ev => {
        const a = ev.target.closest('[data-a]'); if (!a) return; dd.remove();
        ({ perfil: openProfile, switch: () => { VG.auth.logout(); renderLogin(); }, theme: toggleTheme, help: () => VG.router.go('#/ayuda'), logout: () => { VG.auth.logout(); renderLogin(); UI().toast('Sesión cerrada.', 'info'); } })[a.dataset.a]();
      };
      dd.addEventListener('keydown', ev => { if (ev.key === 'Escape') { dd.remove(); U.$('#user-btn').focus(); } });
      setTimeout(() => document.addEventListener('click', function f(ev) { if (!dd.contains(ev.target)) { dd.remove(); U.$('#user-btn') && U.$('#user-btn').setAttribute('aria-expanded', 'false'); } document.removeEventListener('click', f); }), 0);
    };
  }

  function renderFooter() {
    const f = U.$('#footer'); if (!f) return;
    const last = VG.db.list('auditoria').map(a => a.fecha).sort().pop();
    f.innerHTML = `<span>Winzer Gestión v${VG.VERSION}</span><a href="#/ayuda">Ayuda y README</a><span>Datos: ${VG.db.backend === 'indexeddb' ? 'IndexedDB' : 'localStorage'} · ${U.int(VG.db.count())} registros</span><span>Última actualización: ${last ? U.fmtDateTime(last) : '—'}</span>${VG.DEV ? '<span class="badge warning">modo desarrollo</span>' : ''}`;
  }

  function openNotifications(alerts) {
    const body = alerts.length ? `<div class="alert-panel">${alerts.map(a => UI().alert(a.level, a.title, U.esc(a.body), a.href ? { href: a.href, label: 'Ver' } : null)).join('')}</div>` : UI().empty({ icon: '🎉', title: 'Todo en orden', text: 'No hay alertas pendientes para tu rol.' });
    const m = UI().modal({ title: `Alertas y notificaciones (${alerts.length})`, body });
    m.body.addEventListener('click', e => { if (e.target.closest('a')) m.close(true); });
  }

  async function openProfile() {
    const u = VG.auth.current();
    await UI().formModal({
      title: 'Mi perfil', values: { nombre: u.nombre, email: u.email, cargo: u.cargo },
      fields: [
        { key: 'nombre', label: 'Nombre', required: true }, { key: 'email', label: 'Correo', type: 'email' }, { key: 'cargo', label: 'Cargo' },
        { key: 'pinActual', label: 'PIN actual (solo para cambiarlo)', type: 'password', section: 'Cambiar PIN' },
        { key: 'pin', label: 'Nuevo PIN', type: 'password', section: 'Cambiar PIN', validate: v => v && v.length < 4 ? 'Usa al menos 4 caracteres.' : '' },
        { key: 'pin2', label: 'Repite el nuevo PIN', type: 'password', section: 'Cambiar PIN', validate: (v, a) => a.pin && v !== a.pin ? 'Los PIN no coinciden.' : '' }
      ],
      onSave: async v => {
        let rec = Object.assign({}, u, { nombre: v.nombre, email: v.email, cargo: v.cargo });
        if (v.pin) {
          if (await VG.auth.hashPin(u.id, v.pinActual) !== u.pinHash) { const e = new Error('El PIN actual no es correcto.'); e.field = 'pinActual'; throw e; }
          rec.pinHash = await VG.auth.hashPin(u.id, v.pin);
        }
        await VG.db.save('usuario', rec, { system: true });
        Object.assign(u, rec); renderHeader(); UI().toast('Perfil actualizado.'); return true;
      }
    });
  }

  /* ===================== BÚSQUEDA GLOBAL ===================== */
  function searchIndex() {
    const out = [];
    VG.registry.list().filter(m => VG.auth.can(m.id, 'v')).forEach(m => { out.push({ t: m.name, s: 'Módulo', h: '#' + m.route, i: VG.ui.icon(m.icon) }); (m.menu || []).forEach(s => out.push({ t: s.label, s: m.name, h: '#' + s.route, i: '↳' })); });
    const add = (ent, mod, hrefFn, sub) => { if (!VG.auth.can(mod, 'v')) return; const d = VG.schema.get(ent); VG.db.list(ent).forEach(r => out.push({ t: d.display(r), s: d.label + (sub ? ' · ' + sub(r) : ''), h: hrefFn(r), i: '•', k: [r.rut, r.folio, r.codigo].filter(Boolean).join(' ') })); };
    add('cuartel', 'catastro', r => '#/catastro?id=' + r.id);
    add('estanque', 'bodega', r => '#/bodega?id=' + r.id);
    add('lote', 'calendario', r => '#/calendario?id=' + r.id, r => r.estado);
    add('cliente', 'clientes', r => '#/clientes?id=' + r.id, r => r.rut || '');
    add('proveedor', 'proveedores', r => '#/proveedores/maestro?id=' + r.id, r => r.rut || '');
    add('dte', 'dte', r => '#/dte?id=' + r.id, r => (r.contraparte || '') + ' ' + U.clp(r.total));
    add('venta', 'ventas', r => '#/ventas?id=' + r.id, r => U.fmtDate(r.fecha));
    add('trabajador', 'administracion', r => '#/administracion?id=' + r.id);
    add('fermentacion', 'fermentacion', r => '#/fermentacion?id=' + r.id);
    add('insumo', 'insumos', r => '#/insumos?id=' + r.id);
    return out;
  }
  function openSearch() {
    if (U.$('.palette')) return;
    const idx = searchIndex();
    const body = U.html('<div><input class="input" type="search" placeholder="Escribe para buscar… (ej. E-01, 76.123, Cabernet, folio 105)" aria-label="Búsqueda global" autofocus><div class="palette-results" role="listbox"></div><p class="text-xs muted" style="margin:8px 0 0">↑↓ para moverte · Enter para abrir · Esc para cerrar</p></div>');
    const m = UI().modal({ title: 'Buscar', body, foot: false });
    m.el.querySelector('.modal').classList.add('palette');
    const inp = body.querySelector('input'), res = body.querySelector('.palette-results');
    let sel = 0, list = [];
    const draw = () => {
      const q = inp.value.trim().toLowerCase();
      list = (q ? idx.filter(x => (x.t + ' ' + x.s + ' ' + (x.k || '')).toLowerCase().includes(q)) : idx.filter(x => x.s === 'Módulo')).slice(0, 40);
      sel = Math.min(sel, Math.max(0, list.length - 1));
      res.innerHTML = list.length ? list.map((x, i) => `<button role="option" aria-selected="${i === sel}" class="${i === sel ? 'sel' : ''}" data-i="${i}"><span aria-hidden="true">${x.i}</span><span>${esc(x.t)}</span><span class="ptype">${esc(x.s)}</span></button>`).join('') : '<p class="muted" style="padding:10px">Sin resultados.</p>';
    };
    const go = i => { const x = list[i]; if (!x) return; m.close(true); location.hash = x.h.replace(/^#/, ''); };
    inp.addEventListener('input', () => { sel = 0; draw(); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(list.length - 1, sel + 1); draw(); res.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); res.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'Enter') { e.preventDefault(); go(sel); }
    });
    res.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) go(+b.dataset.i); });
    draw();
  }

  /* ===================== BLOQUEO ===================== */
  function showLock() {
    const u = VG.auth.current();
    const body = U.html(`<form class="form"><p>Por seguridad, la sesión de <b>${esc(u.nombre)}</b> se bloqueó por inactividad. Ingresa tu PIN para continuar.</p><div class="field"><label for="unlock-pin">PIN</label><input class="input" id="unlock-pin" type="password" autocomplete="current-password"><div class="field-error" aria-live="polite"></div></div><div class="row"><button class="btn btn-primary" type="submit">Desbloquear</button><button class="btn" type="button" data-switch>Cambiar de usuario</button></div></form>`);
    const m = UI().modal({ title: '🔒 Sesión bloqueada', body, size: 'sm', foot: false, closable: false, beforeClose: () => !VG.auth.isLocked() });
    m.el.style.backdropFilter = 'blur(8px)';
    body.onsubmit = async e => { e.preventDefault(); try { await VG.auth.unlock(body.querySelector('input').value); m.close(true); } catch (err) { body.querySelector('.field-error').textContent = err.message; } };
    body.querySelector('[data-switch]').onclick = () => { m.close(true); VG.auth.logout(); renderLogin(); };
  }

  /* ===================== ARRANQUE ===================== */
  function boot2() {
    applyTheme(VG.auth.current().tema || 'light');
    renderLayout();
    VG.router.start();
  }

  let refreshT;
  async function boot() {
    try { await VG.db.init(); }
    catch (e) { root().innerHTML = '<div class="empty"><h3>No se pudo iniciar el almacenamiento local</h3><p>Tu navegador bloquea IndexedDB y localStorage (¿modo privado estricto?). Prueba con otro navegador.</p></div>'; return; }
    VG.store.state.season = Number(VG.db.getMeta('season', new Date().getFullYear()));
    applyTheme(VG.db.getMeta('lastTheme', 'light'));
    if (VG.DEV && new URLSearchParams(location.search).get('seed') === '1' && !VG.db.count('usuario')) await loadSeed();
    if (!VG.db.count('usuario')) await onboarding();
    if (VG.auth.current() || VG.auth.restore()) boot2(); else renderLogin();

    // refrescos reactivos del layout
    VG.events.on('data.saved', () => { clearTimeout(refreshT); refreshT = setTimeout(() => { if (VG.auth.current() && U.$('#header')) { renderHeader(); renderFooter(); } }, 250); });
    VG.events.on('data.removed', () => { clearTimeout(refreshT); refreshT = setTimeout(() => { if (VG.auth.current() && U.$('#header')) { renderHeader(); renderFooter(); } }, 250); });
    VG.events.on('route.changed', () => { renderNav(); const sh = U.$('#shell'); if (sh) sh.classList.remove('mobile-open'); });
    VG.events.on('auth.locked', showLock);
    VG.events.on('db.restored', () => { if (VG.auth.current()) { const u = VG.db.get('usuario', VG.auth.current().id); if (!u) { VG.auth.logout(); location.reload(); } else boot2(); } });

    // atajos de teclado
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && VG.auth.current()) { e.preventDefault(); openSearch(); }
    });
  }

  VG.app.boot = boot;
  VG.app.renderLogin = renderLogin;
  VG.app.refreshLayout = () => { renderNav(); renderHeader(); renderFooter(); };
  document.addEventListener('DOMContentLoaded', boot);
})(window.VG);
