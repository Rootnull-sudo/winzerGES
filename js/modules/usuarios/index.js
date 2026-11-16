/**
 * modules/usuarios/index.js — Módulo 24. Usuarios, roles y permisos.
 * Maestro de usuarios con PIN (hash SHA-256), roles predefinidos y personalizados con
 * permisos granulares por módulo (ver/crear/editar/eliminar/exportar), log de auditoría
 * exportable y bandeja de tareas internas.
 * ⚠ Autenticación local básica: no apta para exposición pública.
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui, P = () => VG.permissions;
  const db = () => VG.db;
  const roleName = id => (P().role(id) || {}).nombre || id;

  function usuarios(ctx) {
    UI.crud(ctx.el, {
      entity: 'usuario', moduleId: 'usuarios', title: 'Usuarios y permisos', crumbs: [['Administración']], tabs: UI.moduleTabs(ctx),
      desc: 'Cada persona entra con su usuario y PIN. El menú y las acciones se adaptan a su rol, y los permisos también se validan al guardar datos.',
      newLabel: 'Nuevo usuario', emptyIcon: '👤',
      intro: () => UI.legal('Autenticación local básica: protege el uso cotidiano entre personas del equipo, pero no es apta para exponer la app en internet.'),
      fields: (v, isNew) => [
        { key: 'nombre', label: 'Nombre completo', required: true }, { key: 'rut', label: 'RUT', type: 'rut' }, { key: 'email', label: 'Correo', type: 'email' }, { key: 'cargo', label: 'Cargo' },
        { key: 'rol', label: 'Rol', type: 'select', options: () => P().allRoles().map(r => [r.id, r.nombre]), required: true, help: 'Define a qué módulos accede y qué puede hacer.' },
        { key: 'estado', label: 'Estado', type: 'select', options: [['activo', 'Activo'], ['inactivo', 'Inactivo']] },
        { key: 'pin', label: isNew ? 'PIN o contraseña' : 'Nuevo PIN (dejar vacío para mantener)', type: 'password', required: isNew, validate: x => x && x.length < 4 ? 'Usa al menos 4 caracteres.' : '' }
      ],
      defaults: () => ({ rol: 'enologo', estado: 'activo' }),
      beforeSave: async (d, isNew, before) => {
        if (before && before.rol === 'admin' && d.rol !== 'admin' && db().list('usuario', u => u.rol === 'admin' && u.estado !== 'inactivo').length < 2) throw new Error('Debe quedar al menos un administrador activo.');
        const pin = d.pin; delete d.pin;
        d.id = d.id || U.uid('usr_');
        if (pin) d.pinHash = await VG.auth.hashPin(d.id, pin);
        return d;
      },
      canDelete: u => u.id === VG.auth.current().id ? 'No puedes eliminar tu propio usuario.' : u.rol === 'admin' && db().list('usuario', x => x.rol === 'admin').length < 2 ? 'Debe quedar al menos un administrador.' : true,
      columns: [
        { key: 'nombre', label: 'Usuario', render: u => `<b>${U.esc(u.nombre)}</b>${u.id === VG.auth.current().id ? ' ' + UI.badge('Tú', 'info') : ''}${UI.demoBadge(u)}` }, { key: 'email', label: 'Correo' }, { key: 'cargo', label: 'Cargo' },
        { key: 'rol', label: 'Rol', value: u => roleName(u.rol), render: u => UI.badge(roleName(u.rol), u.rol === 'admin' ? 'primary' : '') },
        { key: 'estado', label: 'Estado', render: u => UI.estadoBadge(u.estado || 'activo') },
        { key: 'createdAt', label: 'Creado', render: u => U.fmtDate(u.createdAt) }, { key: 'ultimoAcceso', label: 'Último acceso', render: u => u.ultimoAcceso ? U.fmtDateTime(u.ultimoAcceso) : '—' }
      ],
      defaultSort: 'nombre', defaultDir: 'asc'
    });
  }

  function roles(ctx) {
    const content = UI.page(ctx.el, { title: 'Roles y permisos', crumbs: [['Administración'], ['Usuarios', '#/usuarios']], tabs: UI.moduleTabs(ctx), desc: 'Roles predefinidos (solo lectura) y roles personalizados con permisos por módulo: V = ver, C = crear, E = editar, D = eliminar, X = exportar.', actions: [{ label: 'Nuevo rol personalizado', icon: 'plus', primary: true, perm: ['usuarios', 'c'], run: () => editar(null) }] });
    const mods = VG.registry.list();
    const all = P().allRoles();
    content.innerHTML = `<div class="card table-card"><div class="table-wrap"><table class="data compact"><thead><tr><th class="sticky">Módulo</th>${all.map(r => `<th style="text-align:center">${U.esc(r.nombre)}${r.permisos && !P().ROLES[r.id] ? `<br><button class="btn btn-sm" data-edit="${r.id}">Editar</button>` : ''}</th>`).join('')}</tr></thead><tbody>
      ${mods.map(m => `<tr><td class="sticky">${VG.ui.icon(m.icon)} ${U.esc(m.name)}</td>${all.map(r => { const p = (r.permisos || {})[m.id] || ''; return `<td style="text-align:center" class="mono text-xs">${p ? p.toUpperCase().split('').join(' ') : '<span class="muted">—</span>'}</td>`; }).join('')}</tr>`).join('')}
    </tbody></table></div></div><div class="grid grid-3" style="margin-top:16px">${Object.values(P().ROLES).map(r => `<div class="card pad-sm"><b>${U.esc(r.nombre)}</b><p class="text-sm muted" style="margin:4px 0 0">${U.esc(r.descripcion)}</p></div>`).join('')}</div>`;
    content.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editar(db().get('rol', b.dataset.edit)));
    async function editar(rol) {
      const body = U.html(`<div class="stack"><div class="form-grid"><div class="field"><label for="rn">Nombre del rol</label><input class="input" id="rn" value="${U.esc(rol ? rol.nombre : '')}"></div><div class="field"><label for="rb">Basado en</label><select class="select" id="rb"><option value="">(vacío)</option>${Object.values(P().ROLES).map(r => `<option value="${r.id}">${U.esc(r.nombre)}</option>`).join('')}</select></div><div class="field full"><label for="rd">Descripción</label><input class="input" id="rd" value="${U.esc(rol ? rol.descripcion || '' : '')}"></div></div>
        <div class="table-wrap"><table class="data compact"><thead><tr><th>Módulo</th>${Object.entries(P().ACTIONS).map(([k, l]) => `<th style="text-align:center">${l}</th>`).join('')}</tr></thead><tbody>${mods.map(m => `<tr><td>${U.esc(m.name)}</td>${Object.keys(P().ACTIONS).map(a => `<td style="text-align:center"><input type="checkbox" aria-label="${U.esc(m.name)} ${a}" data-m="${m.id}" data-a="${a}" ${rol && ((rol.permisos || {})[m.id] || '').includes(a) ? 'checked' : ''}></td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`);
      body.querySelector('#rb').onchange = e => { const base = P().ROLES[e.target.value]; body.querySelectorAll('[data-m]').forEach(c => { c.checked = base ? ((base.permisos[c.dataset.m] || '').includes(c.dataset.a)) : false; }); };
      body.addEventListener('change', e => { if (e.target.dataset.a && e.target.dataset.a !== 'v' && e.target.checked) body.querySelector(`[data-m="${e.target.dataset.m}"][data-a="v"]`).checked = true; });
      const foot = U.html('<div class="right"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Guardar rol</button></div>');
      const m = UI.modal({ title: rol ? 'Editar rol ' + rol.nombre : 'Nuevo rol personalizado', body, foot, size: 'lg' });
      foot.querySelector('[data-ok]').onclick = async () => {
        const nombre = body.querySelector('#rn').value.trim(); if (!nombre) return UI.toast('Escribe un nombre para el rol.', 'warning');
        const permisos = {}; body.querySelectorAll('[data-m]:checked').forEach(c => permisos[c.dataset.m] = (permisos[c.dataset.m] || '') + c.dataset.a);
        await UI.run(() => db().save('rol', Object.assign(rol || {}, { nombre, descripcion: body.querySelector('#rd').value, permisos })), 'Rol guardado.');
        m.close(true); ctx.refresh();
      };
    }
  }

  function auditoria(ctx) {
    const content = UI.page(ctx.el, { title: 'Log de auditoría', crumbs: [['Administración'], ['Usuarios', '#/usuarios']], tabs: UI.moduleTabs(ctx), desc: 'Quién creó, modificó o eliminó registros sensibles (ventas, compras, gastos, sueldos, DTE, F29, usuarios, configuración) y los inicios de sesión.' });
    UI.table(content, { rows: db().list('auditoria'), exportName: 'auditoria', exportPerm: 'usuarios', defaultSort: 'fecha', pageSize: 25, columns: [{ key: 'fecha', label: 'Fecha y hora', render: a => U.fmtDateTime(a.fecha) }, { key: 'usuario', label: 'Usuario' }, { key: 'accion', label: 'Acción', render: a => UI.badge(a.accion, a.accion === 'eliminar' ? 'error' : a.accion === 'crear' ? 'success' : a.accion === 'editar' ? 'info' : '') }, { key: 'entidadLabel', label: 'Tipo de registro' }, { key: 'descripcion', label: 'Registro' }, { key: 'campos', label: 'Campos modificados' }], filters: [{ key: 'accion', label: 'Acción', options: ['crear', 'editar', 'eliminar', 'iniciar sesión', 'cerrar sesión'] }, { key: 'usuarioId', label: 'Usuario', options: () => db().list('usuario').map(u => [u.id, u.nombre]) }], empty: { icon: '📋', title: 'Sin registros de auditoría aún' } });
  }

  function tareas(ctx) {
    const u = VG.auth.current();
    UI.crud(ctx.el, {
      entity: 'tarea', moduleId: 'usuarios', title: 'Bandeja de tareas', crumbs: [['Administración'], ['Usuarios', '#/usuarios']], tabs: UI.moduleTabs(ctx),
      desc: 'Tareas y notificaciones internas. Las asignadas a tu rol o a ti aparecen en la campana de alertas.',
      filter: t => u.rol === 'admin' || !t.rol || t.rol === u.rol || t.usuarioId === u.id,
      newLabel: 'Nueva tarea', emptyIcon: '✅',
      fields: [{ key: 'titulo', label: 'Tarea', required: true }, { key: 'descripcion', label: 'Detalle', type: 'textarea' }, { key: 'fecha', label: 'Fecha límite', type: 'date' }, { key: 'rol', label: 'Asignar a rol', type: 'select', options: () => P().allRoles().map(r => [r.id, r.nombre]) }, { key: 'usuarioId', label: 'o a un usuario', type: 'ref', ref: 'usuario' }, { key: 'estado', label: 'Estado', type: 'select', options: [['pendiente', 'Pendiente'], ['hecha', 'Hecha']] }, { key: 'ruta', label: 'Enlace (opcional)', placeholder: '#/tributario' }],
      defaults: () => ({ estado: 'pendiente', fecha: U.today() }),
      rowActions: (t, { refresh }) => [t.estado === 'pendiente' ? { label: 'Marcar como hecha', icon: 'check', run: async () => { await db().save('tarea', Object.assign({}, t, { estado: 'hecha' }), { system: true }); refresh(); } } : null, t.ruta ? { label: 'Ir', icon: 'link', run: () => location.hash = t.ruta } : null].filter(Boolean),
      columns: [{ key: 'titulo', label: 'Tarea', render: t => `<b>${U.esc(t.titulo)}</b><div class="text-xs muted">${U.esc(t.descripcion || '')}</div>` }, { key: 'fecha', label: 'Fecha', render: t => U.fmtDate(t.fecha) }, { key: 'asig', label: 'Asignada a', value: t => t.usuarioId ? UI.refText('usuario', t.usuarioId) : roleName(t.rol || ''), render: t => t.usuarioId ? UI.ref('usuario', t.usuarioId) : U.esc(t.rol ? roleName(t.rol) : 'Todos') }, { key: 'estado', label: 'Estado', render: t => UI.badge(t.estado === 'hecha' ? 'Hecha' : 'Pendiente', t.estado === 'hecha' ? 'success' : 'warning') }],
      filters: [{ key: 'estado', label: 'Estado', options: [['pendiente', 'Pendiente'], ['hecha', 'Hecha']] }]
    });
  }

  VG.registry.implement('usuarios', { async onMount(ctx) { ({ roles, auditoria, tareas }[ctx.sub] || usuarios)(ctx); } });
})(window.VG);
