/**
 * core/ui.js — Componentes de interfaz reutilizables.
 *  - toast, modal, confirm, menú contextual, tooltips
 *  - formularios declarativos con validación en tiempo real, cálculos en vivo y borradores
 *  - tablas con filtros, orden, paginación, selección múltiple y acciones por fila
 *  - crudPage(): página CRUD completa a partir de una definición de campos/columnas
 *
 * Todos los mensajes al usuario son en español y sin jerga técnica.
 */
(function (VG) {
  'use strict';
  const U = VG.utils;
  const esc = U.esc;

  /** Íconos (emoji) — sin dependencias externas, funcionan offline. */
  const ICONS = {
    home: '🏠', map: '🗺️', sprout: '🌱', flask: '🧪', grape: '🍇', calendar: '📅', lab: '🔬', wine: '🍷', ferment: '🫧',
    tank: '🛢️', history: '📜', bottle: '🍾', cart: '🛒', box: '📦', tag: '🏷️', users: '👥', coins: '🪙', chart: '📊',
    briefcase: '💼', truck: '🚚', shield: '🛡️', receipt: '🧾', bank: '🏦', scale: '⚖️', user: '👤', gear: '⚙️', help: '❓',
    bell: '🔔', search: '🔍', moon: '🌙', sun: '☀️', logout: '🚪', switch: '🔄', plus: '+', edit: '✏️', trash: '🗑️',
    eye: '👁️', download: '⬇️', upload: '⬆️', check: '✓', x: '✕', warn: '⚠️', info: 'ℹ️', ok: '✅', err: '⛔', dots: '⋯',
    print: '🖨️', copy: '📋', link: '🔗', lock: '🔒', menu: '☰', star: '⭐', drop: '💧', temp: '🌡️', money: '💰', doc: '📄'
  };

  const UI = { ICONS };
  UI.icon = n => ICONS[n] || n || '';

  /* ===================== TOASTS ===================== */
  UI.toast = function (msg, type = 'success', ms) {
    let wrap = U.$('.toast-wrap');
    if (!wrap) { wrap = U.html('<div class="toast-wrap" role="status" aria-live="polite"></div>'); document.body.appendChild(wrap); }
    const ico = { success: '✅', error: '⛔', warning: '⚠️', info: 'ℹ️' }[type] || 'ℹ️';
    const t = U.html(`<div class="toast ${type}"><span class="t-ico" aria-hidden="true">${ico}</span><div>${esc(msg)}</div><button class="t-close" aria-label="Cerrar notificación">×</button></div>`);
    t.querySelector('.t-close').onclick = () => t.remove();
    wrap.appendChild(t);
    setTimeout(() => t.remove(), ms || (type === 'error' ? 6000 : 3500));
  };

  /** Ejecuta una acción mostrando errores amigables. */
  UI.run = async function (fn, okMsg) {
    try { const r = await fn(); if (okMsg) UI.toast(okMsg, 'success'); return r; }
    catch (e) {
      console.error(e);
      UI.toast(e && e.message && !/undefined|null|TypeError|ReferenceError/.test(e.message) ? e.message : 'Ocurrió un problema inesperado. Intenta nuevamente; si persiste, exporta un respaldo y revisa la consola en modo desarrollo.', 'error');
      return undefined;
    }
  };

  /* ===================== MODALES ===================== */
  const modalStack = [];
  /**
   * Abre un modal.
   * @param {{title:string, body:string|Element, size?:'sm'|'lg', foot?:string|Element, onClose?:Function, beforeClose?:()=>Promise<boolean>|boolean}} o
   */
  UI.modal = function (o) {
    const prevFocus = document.activeElement;
    const bd = U.html(`<div class="modal-backdrop"><div class="modal ${o.size || ''}" role="dialog" aria-modal="true" aria-labelledby="mh-${modalStack.length}">
      <div class="modal-head"><h2 id="mh-${modalStack.length}">${esc(o.title)}</h2>${o.closable === false ? '' : '<button class="icon-btn" data-close aria-label="Cerrar">✕</button>'}</div>
      <div class="modal-body"></div>${o.foot !== false ? '<div class="modal-foot"></div>' : ''}</div></div>`);
    const body = bd.querySelector('.modal-body');
    if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    const foot = bd.querySelector('.modal-foot');
    if (foot) { if (typeof o.foot === 'string') foot.innerHTML = o.foot; else if (o.foot) foot.appendChild(o.foot); else foot.innerHTML = '<div class="right"><button class="btn" data-close>Cerrar</button></div>'; }
    const ctl = {
      el: bd, body, foot,
      async close(force) {
        if (!force && o.beforeClose && !(await o.beforeClose())) return;
        bd.remove(); modalStack.splice(modalStack.indexOf(ctl), 1);
        document.removeEventListener('keydown', onKey, true);
        o.onClose && o.onClose();
        prevFocus && prevFocus.focus && prevFocus.focus();
      }
    };
    const onKey = e => {
      if (modalStack[modalStack.length - 1] !== ctl) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ctl.close(); }
      if (e.key === 'Tab') { // trampa de foco
        const f = U.$$('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', bd).filter(x => x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    bd.addEventListener('click', e => { if (e.target.closest('[data-close]')) ctl.close(); });
    bd.addEventListener('mousedown', e => { if (e.target === bd) bd.dataset.down = '1'; });
    bd.addEventListener('mouseup', e => { if (e.target === bd && bd.dataset.down) ctl.close(); bd.dataset.down = ''; });
    document.body.appendChild(bd);
    modalStack.push(ctl);
    setTimeout(() => { const f = bd.querySelector('[autofocus], .modal-body input:not([type=hidden]):not([readonly]), .modal-body select, .modal-body textarea, .modal-foot .btn-primary'); const t = f || bd.querySelector('[data-close], button, [tabindex]'); if (t) t.focus(); }, 30);
    return ctl;
  };

  /** Confirmación. Devuelve Promise<boolean>. */
  UI.confirm = function ({ title = '¿Estás seguro?', message = '', confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false } = {}) {
    return new Promise(resolve => {
      let done = false;
      const foot = U.html(`<div class="right"><button class="btn" data-no>${esc(cancelText)}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirmText)}</button></div>`);
      const m = UI.modal({ title, size: 'sm', body: `<p>${message}</p>`, foot, onClose: () => { if (!done) resolve(false); } });
      foot.querySelector('[data-no]').onclick = () => m.close();
      foot.querySelector('[data-yes]').onclick = () => { done = true; resolve(true); m.close(true); };
      setTimeout(() => foot.querySelector(danger ? '[data-no]' : '[data-yes]').focus(), 40);
    });
  };

  /* ===================== MENÚ CONTEXTUAL ===================== */
  UI.contextMenu = function (anchor, items) {
    U.$$('.ctx-menu').forEach(x => x.remove());
    const m = U.html('<div class="ctx-menu" role="menu"></div>');
    items.filter(Boolean).forEach(it => {
      const b = U.html(`<button role="menuitem" class="${it.danger ? 'danger' : ''}"><span aria-hidden="true">${UI.icon(it.icon)}</span>${esc(it.label)}</button>`);
      b.onclick = () => { m.remove(); it.run(); };
      m.appendChild(b);
    });
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    m.style.top = (r.bottom + h + 8 > window.innerHeight ? r.top - h - 4 : r.bottom + 4) + 'px';
    m.querySelector('button') && m.querySelector('button').focus();
    const close = e => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', close); } };
    setTimeout(() => document.addEventListener('mousedown', close), 0);
    m.addEventListener('keydown', e => {
      const bs = U.$$('button', m), i = bs.indexOf(document.activeElement);
      if (e.key === 'Escape') { m.remove(); anchor.focus(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
    });
  };

  /* ===================== PEQUEÑOS HELPERS ===================== */
  UI.tip = text => `<span class="tip" tabindex="0" role="note" aria-label="Ayuda: ${esc(text)}">?<span class="tip-text">${esc(text)}</span></span>`;
  UI.badge = (text, type = '') => `<span class="badge ${type}">${esc(text)}</span>`;
  UI.tipoBadge = t => t ? `<span class="badge ${t === 'blanco' ? 'blanco' : t === 'tinto' ? 'tinto' : ''}">${t === 'blanco' ? '🥂 Blanco' : t === 'tinto' ? '🍷 Tinto' : esc(t)}</span>` : '';
  UI.demoBadge = r => r && r._demo ? ' <span class="badge demo" title="Dato de ejemplo">demo</span>' : '';
  UI.estadoBadge = (estado, map = {}) => {
    const def = { pagado: 'success', pagada: 'success', aceptado: 'success', conciliado: 'success', ok: 'success', vigente: 'success', confirmada: 'success', activo: 'success', declarado: 'success', cumplida: 'success', Finalizado: 'success',
      pendiente: 'warning', borrador: '', generado: 'info', enviado: 'info', revisado: 'info', diferencia: 'warning', 'por vencer': 'warning', vencida: 'error', vencido: 'error', rechazado: 'error', anulado: 'error', anulada: 'error', inactivo: '', critico: 'error', alto: 'warning', bajo: 'info' };
    return UI.badge(estado || '—', map[estado] || def[estado] || '');
  };
  UI.alert = (type, title, body, action) => `<div class="alert ${type}" role="${type === 'error' ? 'alert' : 'status'}"><span aria-hidden="true">${{ error: '🔴', warning: '🟡', info: '🔵', success: '🟢' }[type]}</span><div class="a-body"><div class="a-title">${esc(title)}</div>${body ? `<div>${body}</div>` : ''}</div>${action ? `<a href="${action.href}">${esc(action.label)} →</a>` : ''}</div>`;
  UI.kpi = ({ label, value, icon, delta, micro, tone = '', href }) => {
    const d = delta === null || delta === undefined || !isFinite(delta) ? '' : `<span class="kpi-delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '↑' : '↓'} ${U.pct(Math.abs(delta))}</span>`;
    return `<${href ? `a href="${href}" style="text-decoration:none;color:inherit"` : 'div'} class="kpi ${tone}"><div class="kpi-top"><span class="kpi-label">${esc(label)}</span><span class="kpi-icon" aria-hidden="true">${UI.icon(icon)}</span></div><div class="kpi-value" title="${esc(value)}">${value}</div><div class="row" style="gap:8px">${d}${micro ? `<span class="kpi-micro">${micro}</span>` : ''}</div></${href ? 'a' : 'div'}>`;
  };
  UI.empty = ({ icon = '📭', title = 'No hay registros', text = '', action }) => `<div class="empty"><div class="empty-ico" aria-hidden="true">${icon}</div><h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}${action ? `<button class="btn btn-primary" data-empty-action>${esc(action)}</button>` : ''}</div>`;
  UI.skeleton = (n = 5) => '<div class="card">' + Array.from({ length: n }, (_, i) => `<div class="skeleton" style="width:${90 - i * 8}%"></div>`).join('') + '</div>';
  UI.legal = html => `<div class="legal-note" role="note">⚖️ ${html}</div>`;
  UI.progress = (pct, warnAt = 0.8, errAt = 0.95) => `<div class="progress ${pct >= errAt ? 'err' : pct >= warnAt ? 'warn' : ''}" role="progressbar" aria-valuenow="${Math.round(pct * 100)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.min(100, Math.max(0, pct * 100))}%"></span></div>`;
  /** Pestañas a partir del menú del manifiesto del módulo. */
  UI.moduleTabs = ctx => (ctx.manifest.menu || []).map(m => ({ label: m.label, href: '#' + m.route, active: ('/' + ctx.id + (ctx.sub ? '/' + ctx.sub : '')) === m.route }));
  /** Texto de un registro referenciado (o — si no existe). */
  UI.ref = (entity, id) => { const r = id && VG.db.get(entity, id); return r ? U.esc(VG.schema.get(entity).display(r)) : '<span class="muted">—</span>'; };
  UI.refText = (entity, id) => { const r = id && VG.db.get(entity, id); return r ? VG.schema.get(entity).display(r) : ''; };
  UI.dl = pairs => '<dl class="dl">' + pairs.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('') + '</dl>';

  /**
   * Encabezado de página estándar.
   * @param {Element} el contenedor
   * @param {{title, desc?, crumbs?:[[label,href]], actions?:[{label,icon,primary,run,perm}], tabs?:[{label,href,active}]}} o
   * @returns {Element} contenedor de contenido
   */
  UI.page = function (el, o) {
    const crumbs = [['Inicio', '#/dashboard']].concat(o.crumbs || []);
    el.innerHTML = `
      <nav class="breadcrumb" aria-label="Ruta de navegación">${crumbs.map(([l, h], i) => i < crumbs.length - 1 || !h ? (h ? `<a href="${h}">${esc(l)}</a>` : esc(l)) : esc(l)).join(' / ')}${o.title && crumbs.length ? ' / ' + esc(o.title) : ''}</nav>
      <div class="page-head"><div><h1>${esc(o.title)}</h1>${o.desc ? `<p class="desc">${o.desc}</p>` : ''}</div><div class="page-actions"></div></div>
      ${o.tabs ? `<nav class="tabs" role="tablist">${o.tabs.map(t => `<a role="tab" class="tab ${t.active ? 'active' : ''}" aria-selected="${!!t.active}" href="${t.href}">${esc(t.label)}</a>`).join('')}</nav>` : ''}
      ${VG.STORAGE_RISK ? `<div class="alert error no-print" style="margin-bottom:16px" role="alert"><span>⚠️</span><div class="a-body"><div class="a-title">Tus datos podrían no guardarse en este navegador</div>${esc(VG.STORAGE_RISK_MSG)}</div><a href="#/configuracion/datos">Exportar respaldo</a></div>` : ''}
      ${VG.db.hasDemo() && !o.noDemoBanner ? '<div class="demo-banner no-print">🧪 Estás viendo <b>datos de ejemplo</b> (marcados como "demo"). Puedes practicar sin miedo y borrarlos desde Configuración › Datos.</div>' : ''}
      <div class="page-content"></div>`;
    const acts = el.querySelector('.page-actions');
    (o.actions || []).filter(a => a && (!a.perm || VG.auth.can(a.perm[0], a.perm[1]))).forEach(a => {
      const b = U.html(`<button class="btn ${a.primary ? 'btn-primary' : ''}">${a.icon ? `<span aria-hidden="true">${UI.icon(a.icon)}</span>` : ''}${esc(a.label)}</button>`);
      b.onclick = a.run; acts.appendChild(b);
    });
    return el.querySelector('.page-content');
  };

  /* ===================== FORMULARIOS ===================== */
  /** Opciones para un campo select o ref. */
  function fieldOptions(f, vals) {
    if (f.type === 'ref') {
      const def = VG.schema.get(f.ref);
      let list = VG.db.list(f.ref);
      if (f.refFilter) list = list.filter(r => f.refFilter(r, vals));
      return list.map(r => [r.id, f.refLabel ? f.refLabel(r) : def.display(r)]).sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    }
    const opts = typeof f.options === 'function' ? f.options(vals) : f.options || [];
    return opts.map(o => Array.isArray(o) ? o : typeof o === 'object' ? [o.value, o.label] : [o, o]);
  }

  function fieldHTML(f, v, vals, id) {
    const req = f.required ? '<span class="req" aria-hidden="true">*</span>' : '';
    const label = `<label for="${id}">${esc(f.label)}${req}${f.help ? UI.tip(f.help) : ''}</label>`;
    const ro = f.readonly ? 'readonly' : '';
    const aria = `aria-describedby="${id}-err${f.hint ? ' ' + id + '-hint' : ''}" ${f.required ? 'aria-required="true"' : ''}`;
    let input;
    const val = v ?? '';
    switch (f.type) {
      case 'textarea': input = `<textarea class="textarea" id="${id}" name="${f.key}" ${ro} ${aria} placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea>`; break;
      case 'select': case 'ref': {
        const opts = fieldOptions(f, vals);
        input = `<select class="select" id="${id}" name="${f.key}" ${f.readonly ? 'disabled' : ''} ${aria}><option value="">${esc(f.placeholder || 'Selecciona…')}</option>${opts.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
        break;
      }
      case 'multiref': {
        const opts = fieldOptions(Object.assign({}, f, { type: 'ref' }), vals);
        const sel = Array.isArray(val) ? val : [];
        return `<div class="field full" data-key="${f.key}"><label>${esc(f.label)}${req}${f.help ? UI.tip(f.help) : ''}</label><div class="row" role="group" aria-label="${esc(f.label)}" style="gap:6px 16px">${opts.map(([k, l]) => `<label class="check"><input type="checkbox" name="${f.key}" value="${esc(k)}" ${sel.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('') || '<span class="muted text-sm">No hay opciones disponibles.</span>'}</div><div class="field-error" id="${id}-err"></div></div>`;
      }
      case 'checkbox': return `<div class="field ${f.full ? 'full' : ''}" data-key="${f.key}"><label class="check"><input type="checkbox" id="${id}" name="${f.key}" ${val ? 'checked' : ''} ${f.readonly ? 'disabled' : ''}> ${esc(f.label)} ${f.help ? UI.tip(f.help) : ''}</label><div class="field-error" id="${id}-err"></div></div>`;
      case 'number': case 'money': {
        const inp = `<input class="input num" style="text-align:left" type="number" inputmode="decimal" id="${id}" name="${f.key}" value="${esc(val)}" ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''} step="${f.step || (f.type === 'money' ? 1 : 'any')}" ${ro} ${aria} placeholder="${esc(f.placeholder || '')}">`;
        input = f.unit || f.type === 'money' ? `<div class="input-group">${inp}<span class="addon">${esc(f.unit || '$')}</span></div>` : inp; break;
      }
      case 'date': input = `<input class="input" type="date" id="${id}" name="${f.key}" value="${esc(val)}" ${ro} ${aria}>`; break;
      case 'month': input = `<input class="input" type="month" id="${id}" name="${f.key}" value="${esc(val)}" ${ro} ${aria}>`; break;
      case 'password': input = `<input class="input" type="password" id="${id}" name="${f.key}" value="" autocomplete="new-password" ${aria} placeholder="${esc(f.placeholder || '')}">`; break;
      case 'rut': input = `<input class="input" type="text" id="${id}" name="${f.key}" value="${esc(val)}" ${ro} ${aria} placeholder="12.345.678-9" autocomplete="off">`; break;
      case 'computed': input = `<input class="input" type="text" id="${id}" name="${f.key}" value="" readonly tabindex="-1" style="background:var(--color-surface-2)">`; break;
      default: input = `<input class="input" type="${f.type === 'email' ? 'email' : 'text'}" id="${id}" name="${f.key}" value="${esc(val)}" ${ro} ${aria} placeholder="${esc(f.placeholder || '')}" ${f.list ? `list="${id}-dl"` : ''}>${f.list ? `<datalist id="${id}-dl">${(typeof f.list === 'function' ? f.list() : f.list).map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}`;
    }
    return `<div class="field ${f.full || f.type === 'textarea' ? 'full' : ''}" data-key="${f.key}">${label}${input}${f.hint ? `<div class="field-hint" id="${id}-hint">${f.hint}</div>` : ''}<div class="field-error" id="${id}-err" aria-live="polite"></div></div>`;
  }

  /**
   * Construye un formulario declarativo.
   * @param {Array} fields definiciones de campo
   * @param {object} values valores iniciales
   * @param {{liveCalc?:(vals)=>string, onChange?:(vals, form)=>void}} o
   * @returns {{el, values():object, validate():boolean, setErrors(map), refresh()}}
   */
  UI.form = function (fields, values = {}, o = {}) {
    const fid = 'f' + Math.random().toString(36).slice(2, 7);
    const wrap = U.html('<div></div>');
    const formEl = U.html('<form class="form" novalidate></form>');
    const calcEl = o.liveCalc ? U.html('<aside class="live-calc" aria-live="polite"></aside>') : null;
    wrap.appendChild(o.liveCalc ? U.html('<div class="modal-split"></div>') : formEl);
    if (o.liveCalc) { wrap.firstChild.appendChild(formEl); wrap.firstChild.appendChild(calcEl); }
    let cur = Object.assign({}, values);
    const touched = new Set();

    function render() {
      const sections = [];
      fields.forEach(f => {
        if (f.showIf && !f.showIf(cur)) return;
        const s = f.section || '';
        let sec = sections.find(x => x.name === s);
        if (!sec) { sec = { name: s, fields: [] }; sections.push(sec); }
        sec.fields.push(f);
      });
      lastSig = signature(cur);
      formEl.innerHTML = sections.map(s => `<fieldset class="form-section">${s.name ? `<legend>${esc(s.name)}</legend>` : ''}<div class="form-grid">${s.fields.map(f => fieldHTML(f, cur[f.key], cur, fid + '-' + f.key)).join('')}</div></fieldset>`).join('');
      updateComputed();
    }
    /** Firma de la estructura visible (campos y opciones). Si no cambia, no se re-renderiza. */
    function signature(v) {
      return fields.filter(f => !f.showIf || f.showIf(v)).map(f => f.key + ((f.type === 'select' || f.type === 'ref' || f.type === 'multiref') ? ':' + fieldOptions(f.type === 'multiref' ? Object.assign({}, f, { type: 'ref' }) : f, v).map(o => o[0]).join(',') : '')).join('|');
    }
    let lastSig = '';
    /** Aplica valores al DOM sin re-render; re-renderiza (diferido, conservando el foco) solo si cambia la estructura. */
    function refreshStructure() {
      const sig = signature(cur);
      if (sig === lastSig) {
        fields.forEach(f => {
          if (f.type === 'computed' || f.type === 'password' || f.type === 'multiref') return;
          const inp = formEl.querySelector(`[name="${f.key}"]`); if (!inp || inp === document.activeElement) return;
          const v = cur[f.key] ?? '';
          if (f.type === 'checkbox') inp.checked = !!v; else if (String(inp.value) !== String(v)) inp.value = v;
        });
        return;
      }
      setTimeout(() => {
        const a = document.activeElement && formEl.contains(document.activeElement) ? document.activeElement : null;
        const name = a && a.name, selS = a && a.selectionStart, selE = a && a.selectionEnd;
        cur = read();
        render();
        const el = name && formEl.querySelector(`[name="${name}"]`);
        if (el) { el.focus(); try { if (selS !== null && selS !== undefined) el.setSelectionRange(selS, selE); } catch (e) { } }
      }, 0);
    }
    function read() {
      const v = Object.assign({}, cur);
      fields.forEach(f => {
        if (f.type === 'multiref') { const cbs = U.$$(`[name="${f.key}"]`, formEl); if (cbs.length) v[f.key] = cbs.filter(c => c.checked).map(c => c.value); return; }
        const inp = formEl.querySelector(`[name="${f.key}"]`);
        if (!inp || f.type === 'computed') return;
        if (f.type === 'checkbox') v[f.key] = inp.checked;
        else if (f.type === 'number' || f.type === 'money') v[f.key] = inp.value === '' ? '' : U.n(inp.value);
        else if (f.type === 'rut') v[f.key] = inp.value ? U.rutFormat(inp.value) : '';
        else if (f.type === 'password') v[f.key] = inp.value;
        else v[f.key] = inp.value;
      });
      return v;
    }
    function validateField(f, v) {
      if (f.showIf && !f.showIf(v)) return '';
      const x = v[f.key];
      const empty = x === '' || x === null || x === undefined || (Array.isArray(x) && !x.length);
      if (f.required && empty) return `Completa "${f.label}".`;
      if (empty) return '';
      if ((f.type === 'number' || f.type === 'money')) {
        if (f.min !== undefined && U.n(x) < f.min) return `Debe ser mayor o igual a ${U.dec2(f.min).replace(/,00$/, '')}.`;
        if (f.max !== undefined && U.n(x) > f.max) return `Debe ser menor o igual a ${U.dec2(f.max).replace(/,00$/, '')}.`;
      }
      if (f.type === 'rut' && !U.rutValid(x)) return 'El RUT no es válido. Verifica el dígito verificador.';
      if (f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)) return 'Escribe un correo válido (ej. nombre@dominio.cl).';
      if (f.validate) return f.validate(x, v) || '';
      return '';
    }
    function showError(key, msg) {
      const fe = formEl.querySelector(`.field[data-key="${key}"]`);
      if (!fe) return;
      fe.classList.toggle('invalid', !!msg);
      const er = fe.querySelector('.field-error'); if (er) er.textContent = msg || '';
      const inp = fe.querySelector('input,select,textarea'); if (inp) inp.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }
    function updateComputed() {
      fields.filter(f => f.type === 'computed').forEach(f => { const i = formEl.querySelector(`[name="${f.key}"]`); if (i) { try { i.value = f.calc(cur) ?? ''; } catch (e) { i.value = ''; } } });
      if (calcEl) { try { calcEl.innerHTML = o.liveCalc(cur) || ''; } catch (e) { calcEl.innerHTML = '<span class="muted">Completa los datos para ver el cálculo.</span>'; console.error(e); } }
    }
    const structural = new Set(fields.filter(f => ['ref', 'select', 'checkbox', 'multiref'].includes(f.type) || f.onChangeSet).map(f => f.key));
    formEl.addEventListener('input', e => {
      const k = e.target.name; if (!k) return;
      cur = read(); touched.add(k);
      const f = fields.find(x => x.key === k);
      if (f && touched.has(k)) showError(k, validateField(f, cur));
      updateComputed();
      o.onChange && o.onChange(cur, ctl);
    });
    formEl.addEventListener('change', e => {
      const k = e.target.name; if (!k) return;
      cur = read(); touched.add(k);
      const f = fields.find(x => x.key === k);
      if (f && f.type === 'rut') e.target.value = cur[k];
      // re-render solo si cambia un campo "estructural" (select, referencia, casilla o con onChangeSet),
      // que puede afectar visibilidad u opciones de otros campos. Se conserva el foco del usuario.
      if (f && f.onChangeSet) { Object.assign(cur, f.onChangeSet(cur) || {}); }
      if (structural.has(k)) refreshStructure();
      if (f) showError(k, validateField(f, cur));
      updateComputed();
      o.onChange && o.onChange(cur, ctl);
    });
    formEl.addEventListener('focusout', e => { const k = e.target.name; if (!k) return; touched.add(k); const f = fields.find(x => x.key === k); if (f) showError(k, validateField(f, read())); });
    formEl.addEventListener('submit', e => { e.preventDefault(); o.onSubmit && o.onSubmit(); });

    render();
    const ctl = {
      el: wrap, form: formEl,
      values() { cur = read(); return Object.assign({}, cur); },
      set(patch) { cur = Object.assign(read(), patch); render(); },
      validate() {
        cur = read();
        let first = null;
        fields.forEach(f => { const m = validateField(f, cur); showError(f.key, m); if (m && !first) first = f.key; });
        if (first) { const i = formEl.querySelector(`[name="${first}"]`); i && i.focus(); }
        return !first;
      },
      setErrors(map) { Object.entries(map).forEach(([k, m]) => showError(k, m)); },
      refresh: render
    };
    return ctl;
  };

  /**
   * Abre un formulario en un modal con: borradores persistidos, advertencia al
   * cerrar con cambios, validación y botón Guardar.
   * @returns Promise<object|null> valores guardados (resultado de onSave) o null
   */
  UI.formModal = function ({ title, fields, values = {}, onSave, liveCalc, size, draftKey, saveLabel = 'Guardar cambios', extraFoot, intro, onChange }) {
    return new Promise(resolve => {
      const dk = draftKey ? 'vg:draft:' + draftKey : null;
      let initial = Object.assign({}, values);
      let draft = null;
      if (dk) { try { draft = JSON.parse(localStorage.getItem(dk) || 'null'); } catch (e) { } }
      const form = UI.form(fields, initial, { liveCalc, onChange: (v, f) => { if (dk) localStorage.setItem(dk, JSON.stringify({ at: Date.now(), v })); onChange && onChange(v, f); }, onSubmit: () => save() });
      const body = U.html('<div></div>');
      if (intro) body.appendChild(U.html(`<div style="margin-bottom:14px">${intro}</div>`));
      if (draft && draft.v) {
        const bn = U.html(`<div class="alert info" style="margin-bottom:14px"><span>💾</span><div class="a-body"><div class="a-title">Encontramos un borrador sin guardar</div><div>Del ${U.fmtDateTime(draft.at)}. ¿Quieres recuperarlo?</div></div><button class="btn btn-sm" data-r>Recuperar</button><button class="btn btn-sm btn-ghost" data-d>Descartar</button></div>`);
        bn.querySelector('[data-r]').onclick = () => { form.set(draft.v); bn.remove(); };
        bn.querySelector('[data-d]').onclick = () => { localStorage.removeItem(dk); bn.remove(); };
        body.appendChild(bn);
      }
      body.appendChild(form.el);
      const foot = U.html(`<div style="display:contents"><span class="text-xs muted">${dk ? '💾 Se guarda un borrador automáticamente' : '<span class="req">*</span> Campos obligatorios'}</span><div class="right"><button class="btn" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>${esc(saveLabel)}</button></div></div>`);
      if (extraFoot) foot.querySelector('.right').prepend(extraFoot);
      let saved = false, busy = false;
      function stripPw(v) { const o = Object.assign({}, v); fields.filter(f => f.type === 'password' || f.type === 'computed').forEach(f => delete o[f.key]); Object.keys(o).forEach(k => { if (o[k] === '' || o[k] === undefined || o[k] === null || o[k] === false) delete o[k]; }); return o; }
      const snap = JSON.stringify(stripPw(form.values()));
      const isDirty = () => JSON.stringify(stripPw(form.values())) !== snap;
      const m = UI.modal({
        title, body, foot, size: size || (liveCalc ? 'lg' : ''),
        beforeClose: async () => {
          if (saved || !isDirty()) return true;
          return UI.confirm({ title: 'Tienes cambios sin guardar', message: 'Si cierras ahora perderás los cambios (el borrador queda guardado si está disponible). ¿Cerrar de todas formas?', confirmText: 'Cerrar sin guardar', danger: true });
        },
        onClose: () => { if (!saved) resolve(null); }
      });
      async function save() {
        if (busy) return;
        if (!form.validate()) { UI.toast('Revisa los campos marcados en rojo.', 'warning'); return; }
        busy = true;
        const btn = foot.querySelector('[data-save]'); btn.disabled = true; btn.textContent = 'Guardando…';
        try {
          const r = await onSave(form.values(), form);
          if (r === false) return;
          saved = true;
          if (dk) localStorage.removeItem(dk);
          m.close(true);
          resolve(r);
        } catch (e) {
          if (e.field) form.setErrors({ [e.field]: e.message });
          UI.toast(e.message || 'No se pudo guardar.', 'error');
          if (!(e instanceof Error) || e.field || /insuficiente|permiso|no se puede|ya fue/i.test(e.message)) U.warn(e); else console.error(e);
        } finally { busy = false; btn.disabled = false; btn.textContent = saveLabel; }
      }
      foot.querySelector('[data-cancel]').onclick = () => m.close();
      foot.querySelector('[data-save]').onclick = save;
    });
  };

  /* ===================== TABLAS ===================== */
  /**
   * Tabla de datos con búsqueda, filtros, orden, paginación, selección y acciones.
   * @param {Element} el
   * @param {{rows:Array, columns:Array<{key,label,render?,sort?,num?,csv?,sticky?}>, rowActions?:(r)=>Array, filters?:Array<{key,label,options,fn?}>, pageSize?:number, selectable?:boolean, bulk?:Array<{label,run(rows)}>, empty?:object, onRowClick?:(r)=>void, exportName?:string, search?:boolean, footer?:(rows)=>string}} o
   */
  UI.table = function (el, o) {
    const st = { q: '', sort: o.defaultSort || null, dir: o.defaultDir || 'desc', page: 0, filters: {}, sel: new Set() };
    const pageSize = o.pageSize || 15;
    function cellText(r, c) { const v = c.csv ? c.csv(r) : (c.value ? c.value(r) : r[c.key]); return v === undefined || v === null ? '' : String(v); }
    function filtered() {
      let rows = o.rows.slice();
      (o.filters || []).forEach(f => { const v = st.filters[f.key]; if (v) rows = rows.filter(r => f.fn ? f.fn(r, v) : String(r[f.key]) === v); });
      if (st.q) { const q = st.q.toLowerCase(); rows = rows.filter(r => o.columns.some(c => cellText(r, c).toLowerCase().includes(q))); }
      if (st.sort) {
        const c = o.columns.find(x => x.key === st.sort);
        const val = r => c && c.sort ? c.sort(r) : (c && c.value ? c.value(r) : r[st.sort]);
        rows.sort((a, b) => { const x = val(a), y = val(b); const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'es', { numeric: true }); return st.dir === 'asc' ? r : -r; });
      }
      return rows;
    }
    /** El pie puede ser un string (fila completa) o un objeto {colKey: html} alineado a las columnas. */
    function footRow(f) {
      if (typeof f === 'string') return f;
      return `<tr>${o.selectable ? '<td></td>' : ''}${o.columns.map((c, i) => `<td class="${c.num ? 'num' : ''}">${f[c.key] !== undefined ? f[c.key] : (i === 0 ? (f._label || 'Total') : '')}</td>`).join('')}${o.rowActions ? '<td></td>' : ''}</tr>`;
    }
    function render() {
      const rows = filtered();
      const pages = Math.max(1, Math.ceil(rows.length / pageSize));
      st.page = Math.min(st.page, pages - 1);
      const view = rows.slice(st.page * pageSize, st.page * pageSize + pageSize);
      const hasActions = !!o.rowActions;
      const sel = o.selectable;
      const toolbar = (o.search !== false || (o.filters || []).length || o.exportName) ? `<div class="table-toolbar">
        ${o.search !== false ? `<input class="input search" type="search" placeholder="Buscar…" aria-label="Buscar en la tabla" value="${esc(st.q)}">` : ''}
        ${(o.filters || []).map(f => `<select class="select" data-filter="${f.key}" aria-label="${esc(f.label)}"><option value="">${esc(f.label)}: todos</option>${(typeof f.options === 'function' ? f.options() : f.options).map(op => { const [k, l] = Array.isArray(op) ? op : [op, op]; return `<option value="${esc(k)}" ${st.filters[f.key] === String(k) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`).join('')}
        <span class="grow"></span>
        ${o.toolbarExtra || ''}
        ${o.exportName && (!o.exportPerm || VG.auth.can(o.exportPerm, 'x')) ? '<button class="btn btn-sm" data-export title="Exportar a CSV (Excel)">⬇️ CSV</button>' : ''}
      </div>` : '';
      const bulk = sel && st.sel.size ? `<div class="bulk-bar"><b>${st.sel.size}</b> seleccionados ${(o.bulk || []).map((b, i) => `<button class="btn btn-sm ${b.danger ? 'btn-danger' : ''}" data-bulk="${i}">${esc(b.label)}</button>`).join('')}<button class="btn btn-sm btn-ghost" data-clear>Quitar selección</button></div>` : '';
      let body;
      if (!o.rows.length && o.empty) body = UI.empty(o.empty);
      else if (!rows.length) body = UI.empty({ icon: '🔎', title: 'Sin resultados', text: 'No hay registros que coincidan con la búsqueda o los filtros.' });
      else body = `<div class="table-wrap"><table class="data"><thead><tr>
          ${sel ? `<th class="chk"><input type="checkbox" aria-label="Seleccionar todos" data-all ${view.every(r => st.sel.has(r.id)) ? 'checked' : ''}></th>` : ''}
          ${o.columns.map(c => `<th class="${c.sort !== false ? 'sortable' : ''} ${c.sticky ? 'sticky' : ''} ${c.num ? 'num' : ''}" data-sort="${c.key}" ${c.sort !== false ? `tabindex="0" aria-sort="${st.sort === c.key ? (st.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"` : ''}>${esc(c.label)}${st.sort === c.key ? `<span class="sort">${st.dir === 'asc' ? '▲' : '▼'}</span>` : ''}</th>`).join('')}
          ${hasActions ? '<th style="width:48px"><span class="sr-only">Acciones</span></th>' : ''}
        </tr></thead><tbody>
        ${view.map(r => `<tr data-id="${esc(r.id)}" ${o.onRowClick ? 'style="cursor:pointer"' : ''}>
          ${sel ? `<td class="chk"><input type="checkbox" aria-label="Seleccionar fila" data-sel="${esc(r.id)}" ${st.sel.has(r.id) ? 'checked' : ''}></td>` : ''}
          ${o.columns.map(c => `<td class="${c.num ? 'num' : ''} ${c.sticky ? 'sticky' : ''}">${c.render ? c.render(r) : esc(r[c.key] ?? '')}</td>`).join('')}
          ${hasActions ? `<td class="row-actions"><button class="icon-btn" data-actions="${esc(r.id)}" aria-label="Acciones" aria-haspopup="menu">⋯</button></td>` : ''}
        </tr>`).join('')}
        </tbody>${o.footer ? `<tfoot>${footRow(o.footer(rows))}</tfoot>` : ''}</table></div>
        <div class="pager"><span>${rows.length} registro${rows.length === 1 ? '' : 's'}${rows.length > pageSize ? ` · página ${st.page + 1} de ${pages}` : ''}</span>
        ${pages > 1 ? `<div class="btns"><button class="btn btn-sm" data-page="prev" ${st.page === 0 ? 'disabled' : ''} aria-label="Página anterior">‹ Anterior</button><button class="btn btn-sm" data-page="next" ${st.page >= pages - 1 ? 'disabled' : ''} aria-label="Página siguiente">Siguiente ›</button></div>` : ''}</div>`;
      const hadFocusSearch = document.activeElement && document.activeElement.classList.contains('search') && el.contains(document.activeElement);
      el.innerHTML = `<div class="card table-card">${toolbar}${bulk}${body}</div>`;
      if (hadFocusSearch) { const s = el.querySelector('.search'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    }
    el.addEventListener('input', U.debounce(e => { if (e.target.classList.contains('search')) { st.q = e.target.value; st.page = 0; render(); } }, 180));
    el.addEventListener('change', e => {
      const f = e.target.dataset.filter; if (f !== undefined) { st.filters[f] = e.target.value; st.page = 0; render(); }
      if (e.target.dataset.sel) { e.target.checked ? st.sel.add(e.target.dataset.sel) : st.sel.delete(e.target.dataset.sel); render(); }
      if (e.target.dataset.all !== undefined) { const ids = filtered().slice(st.page * pageSize, st.page * pageSize + pageSize).map(r => r.id); ids.forEach(id => e.target.checked ? st.sel.add(id) : st.sel.delete(id)); render(); }
    });
    const sortBy = th => { const k = th.dataset.sort; const c = o.columns.find(x => x.key === k); if (!c || c.sort === false) return; if (st.sort === k) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = k; st.dir = 'asc'; } render(); };
    el.addEventListener('keydown', e => { const th = e.target.closest('th[data-sort]'); if (th && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); sortBy(th); } });
    el.addEventListener('click', e => {
      const th = e.target.closest('th[data-sort]'); if (th) return sortBy(th);
      const pg = e.target.closest('[data-page]'); if (pg) { st.page += pg.dataset.page === 'next' ? 1 : -1; render(); return; }
      const ab = e.target.closest('[data-actions]');
      if (ab) { const r = o.rows.find(x => String(x.id) === ab.dataset.actions); UI.contextMenu(ab, o.rowActions(r)); return; }
      if (e.target.closest('[data-export]')) { U.download(o.exportName + '_' + U.today() + '.csv', U.toCSV(filtered(), o.columns.filter(c => c.csv !== false))); UI.toast('Exportación lista. Revisa tus descargas.'); return; }
      const bb = e.target.closest('[data-bulk]'); if (bb) { const rows = o.rows.filter(r => st.sel.has(r.id)); o.bulk[bb.dataset.bulk].run(rows).then?.(() => { st.sel.clear(); }); return; }
      if (e.target.closest('[data-clear]')) { st.sel.clear(); render(); return; }
      if (e.target.closest('[data-empty-action]')) { o.empty.run && o.empty.run(); return; }
      const tr = e.target.closest('tbody tr');
      if (tr && o.onRowClick && !e.target.closest('button, input, a, select')) { const r = o.rows.find(x => String(x.id) === tr.dataset.id); r && o.onRowClick(r); }
    });
    render();
    return { refresh(rows) { if (rows) o.rows = rows; render(); }, state: st };
  };

  /* ===================== PÁGINA CRUD ===================== */
  /**
   * Página CRUD completa a partir de una definición. Ver docs/modules.md.
   * @param {Element} el contenedor
   * @param {object} o opciones (entity, moduleId, title, fields, columns, ...)
   */
  UI.crud = function (el, o) {
    const mod = o.moduleId;
    const def = VG.schema.get(o.entity);
    const can = a => VG.auth.can(mod, a);
    const rows = () => {
      let r = VG.db.list(o.entity);
      if (o.filter) r = r.filter(o.filter);
      if (o.season) r = r.filter(x => VG.store.inSeason(x, o.seasonField || 'fecha'));
      return r;
    };
    async function openForm(rec) {
      if (rec && !can('e')) return UI.toast('Tu rol no permite editar este registro.', 'warning');
      if (!rec && !can('c')) return UI.toast('Tu rol no permite crear registros aquí.', 'warning');
      const isNew = !rec;
      const values = rec ? Object.assign({}, rec) : Object.assign({}, typeof o.defaults === 'function' ? o.defaults() : o.defaults || {});
      const fields = typeof o.fields === 'function' ? o.fields(values, isNew) : o.fields;
      const r = await UI.formModal({
        title: (isNew ? (o.newTitle || 'Nuevo ' + def.label.toLowerCase()) : 'Editar ' + def.label.toLowerCase()) + (rec && def.display ? ' · ' + def.display(rec) : ''),
        fields, values, liveCalc: o.liveCalc, size: o.modalSize, intro: o.intro && o.intro(values, isNew),
        draftKey: o.entity + ':' + (rec ? rec.id : 'nuevo'),
        onSave: async (vals) => {
          let data = Object.assign({}, rec || {}, vals);
          if (o.beforeSave) data = await o.beforeSave(data, isNew, rec);
          const saved = await VG.db.save(o.entity, data);
          if (o.afterSave) await o.afterSave(saved, isNew, rec);
          return saved;
        }
      });
      if (r) { UI.toast(isNew ? `${def.label} creado correctamente.` : 'Cambios guardados.'); refresh(); }
      return r;
    }
    async function remove(rec) {
      if (!can('d')) return UI.toast('Tu rol no permite eliminar registros.', 'warning');
      if (o.canDelete) { const why = o.canDelete(rec); if (why !== true) return UI.toast(why, 'warning'); }
      const ok = await UI.confirm({ title: `Eliminar ${def.label.toLowerCase()}`, message: `Se eliminará <b>${esc(def.display(rec))}</b>. Esta acción no se puede deshacer.`, confirmText: 'Sí, eliminar', danger: true });
      if (!ok) return;
      await UI.run(async () => { await VG.db.remove(o.entity, rec.id); o.afterRemove && await o.afterRemove(rec); }, 'Registro eliminado.');
      refresh();
    }
    const actions = r => [
      o.view ? { label: 'Ver detalle', icon: 'eye', run: () => o.view(r) } : null,
      can('e') && (!o.canEdit || o.canEdit(r)) ? { label: 'Editar', icon: 'edit', run: () => openForm(r) } : null,
      ...(o.rowActions ? o.rowActions(r, { refresh, openForm }) : []),
      can('d') ? { label: 'Eliminar', icon: 'trash', danger: true, run: () => remove(r) } : null
    ].filter(Boolean);

    const content = o.embed ? el : UI.page(el, {
      title: o.title, desc: o.desc, crumbs: o.crumbs, tabs: o.tabs,
      actions: (o.headerActions || []).concat(o.noCreate ? [] : [{ label: o.newLabel || 'Nuevo ' + def.label.toLowerCase(), icon: 'plus', primary: true, run: () => openForm(), perm: [mod, 'c'] }])
    });
    if (o.embed && !o.noCreate && can('c')) {
      const b = U.html(`<div class="row between" style="margin-bottom:12px"><h3 style="margin:0">${esc(o.title || '')}</h3><button class="btn btn-primary btn-sm">+ ${esc(o.newLabel || 'Nuevo')}</button></div>`);
      b.querySelector('button').onclick = () => openForm(); el.appendChild(b);
    }
    const top = U.html('<div class="stack"></div>'); content.appendChild(top);
    const tblEl = U.html('<div style="margin-top:16px"></div>'); content.appendChild(tblEl);
    const tbl = UI.table(tblEl, {
      rows: rows(), columns: o.columns, rowActions: actions, filters: o.filters, selectable: can('d') && o.bulkDelete !== false,
      bulk: [{ label: 'Eliminar seleccionados', danger: true, run: async rs => { const ok = await UI.confirm({ title: 'Eliminar registros', message: `Se eliminarán <b>${rs.length}</b> registros. Esta acción no se puede deshacer.`, confirmText: 'Eliminar', danger: true }); if (!ok) return; await UI.run(async () => { for (const r of rs) { if (o.canDelete && o.canDelete(r) !== true) continue; await VG.db.remove(o.entity, r.id); } }, 'Registros eliminados.'); refresh(); } }],
      exportName: o.exportName || o.entity, exportPerm: mod, defaultSort: o.defaultSort || (o.columns.find(c => c.key === 'fecha') ? 'fecha' : null), defaultDir: o.defaultDir || 'desc',
      onRowClick: o.view || (can('e') ? r => openForm(r) : null),
      footer: o.footer,
      empty: { icon: o.emptyIcon || '📭', title: o.emptyTitle || `Aún no hay ${def.label.toLowerCase()}s`, text: o.emptyText || 'Crea el primero para comenzar.', action: can('c') && !o.noCreate ? (o.newLabel || '+ Crear el primero') : null, run: () => openForm() }
    });
    function refresh() { tbl.refresh(rows()); if (o.renderTop) o.renderTop(top, rows()); }
    if (o.renderTop) o.renderTop(top, rows());
    if (o.query && o.query.id) { const r0 = VG.db.get(o.entity, o.query.id); if (r0) setTimeout(() => (o.view ? o.view(r0) : openForm(r0)), 60); }
    const ctl = { refresh, openForm, remove, table: tbl };
    return ctl;
  };

  VG.ui = UI;
})(window.VG);
