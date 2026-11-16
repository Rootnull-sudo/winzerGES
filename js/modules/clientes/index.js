/**
 * modules/clientes/index.js — Módulo 15. Clientes, documentos y cobranza.
 * Maestro de clientes con RUT validado, historial de compras, cuentas por cobrar
 * con antigüedad y alertas de mora. Los cobros se concilian con la cartola bancaria.
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui;
  const db = () => VG.db;
  const ventasDe = c => db().list('venta', v => v.clienteId === c.id && v.estado !== 'anulada');
  const saldo = c => U.sum(ventasDe(c).filter(v => v.estadoPago !== 'pagado'), v => U.n(v.total) - U.n(v.pagado));

  function maestro(ctx) {
    UI.crud(ctx.el, {
      entity: 'cliente', moduleId: 'clientes', query: ctx.query, title: 'Clientes y cobranza', crumbs: [['Comercial']], tabs: UI.moduleTabs(ctx),
      desc: 'Maestro de clientes con su historial de compras y saldo pendiente.',
      newLabel: 'Nuevo cliente', emptyIcon: '👥',
      fields: [
        { key: 'nombre', label: 'Nombre o razón social', required: true }, { key: 'rut', label: 'RUT', type: 'rut', required: true, help: 'Para boletas a consumidor final usa 66.666.666-6.' },
        { key: 'tipo', label: 'Tipo', type: 'select', options: ['Empresa', 'Persona'], required: true }, { key: 'giro', label: 'Giro', showIf: v => v.tipo === 'Empresa' },
        { key: 'canal', label: 'Canal habitual', type: 'select', options: [['distribuidor', 'Distribuidor'], ['restaurante', 'Restaurante / HORECA'], ['directa', 'Venta directa'], ['ecommerce', 'E-commerce'], ['granel', 'Granel']] },
        { key: 'contacto', label: 'Contacto' }, { key: 'email', label: 'Correo', type: 'email' }, { key: 'telefono', label: 'Teléfono' },
        { key: 'direccion', label: 'Dirección' }, { key: 'comuna', label: 'Comuna' },
        { key: 'condiciones', label: 'Condiciones comerciales', list: ['Contado', '15 días', '30 días', '45 días', '60 días'] }, { key: 'plazo', label: 'Plazo de pago', type: 'number', unit: 'días', min: 0, step: 1 }
      ],
      defaults: () => ({ tipo: 'Empresa', canal: 'distribuidor', plazo: 30, condiciones: '30 días' }),
      view: c => ficha(c),
      columns: [
        { key: 'nombre', label: 'Cliente', sticky: true, render: c => `<b>${U.esc(c.nombre)}</b>${UI.demoBadge(c)}` }, { key: 'rut', label: 'RUT' },
        { key: 'canal', label: 'Canal' }, { key: 'comuna', label: 'Comuna' }, { key: 'condiciones', label: 'Condiciones' },
        { key: 'compras', label: 'Compras (neto)', num: true, value: c => U.sum(ventasDe(c), v => v.neto), render: c => U.clp(U.sum(ventasDe(c), v => v.neto)) },
        { key: 'ultima', label: 'Última compra', value: c => ventasDe(c).map(v => v.fecha).sort().pop() || '', render: c => U.fmtDate(ventasDe(c).map(v => v.fecha).sort().pop()) },
        { key: 'saldo', label: 'Saldo por cobrar', num: true, value: saldo, render: c => { const s = saldo(c); return s ? `<b class="text-warning">${U.clp(s)}</b>` : U.clp(0); } }
      ],
      filters: [{ key: 'canal', label: 'Canal', options: [['distribuidor', 'Distribuidor'], ['restaurante', 'Restaurante'], ['directa', 'Directa'], ['ecommerce', 'E-commerce'], ['granel', 'Granel']] }],
      canDelete: c => ventasDe(c).length ? 'No se puede eliminar: el cliente tiene ventas registradas.' : true
    });
  }

  function ficha(c) {
    const vs = ventasDe(c).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const body = U.html(`<div class="stack"><div class="grid grid-2"><div>${UI.dl([['RUT', U.esc(c.rut)], ['Tipo', U.esc(c.tipo)], ['Giro', U.esc(c.giro || '—')], ['Canal', U.esc(c.canal || '—')]])}</div><div>${UI.dl([['Contacto', U.esc(c.contacto || '—')], ['Correo', U.esc(c.email || '—')], ['Dirección', U.esc([c.direccion, c.comuna].filter(Boolean).join(', ') || '—')], ['Condiciones', U.esc(c.condiciones || '—')]])}</div></div>
      <div class="grid grid-3">${UI.kpi({ label: 'Compras totales', value: U.compactCLP(U.sum(vs, v => v.neto)), icon: 'cart' })}${UI.kpi({ label: 'N° de compras', value: vs.length, icon: 'receipt' })}${UI.kpi({ label: 'Saldo por cobrar', value: U.clp(saldo(c)), icon: 'money', tone: saldo(c) ? 'warning' : 'success' })}</div><div data-t></div></div>`);
    UI.modal({ title: c.nombre, body, size: 'lg', foot: `<div class="right"><button class="btn" data-close>Cerrar</button>${VG.auth.can('ventas', 'c') ? `<a class="btn btn-primary" href="#/ventas" data-close>Nueva venta</a>` : ''}</div>` });
    UI.table(body.querySelector('[data-t]'), { rows: vs, search: false, pageSize: 8, columns: [{ key: 'codigo', label: 'Venta' }, { key: 'fecha', label: 'Fecha', render: v => U.fmtDate(v.fecha) }, { key: 'prod', label: 'Producto', render: v => v.tipo === 'granel' ? 'Granel ' + UI.ref('lote', v.loteId) : UI.ref('formato', v.formatoId) }, { key: 'cantidad', label: 'Cant.', num: true, render: v => U.int(v.cantidad) }, { key: 'total', label: 'Total', num: true, render: v => U.clp(v.total) }, { key: 'folio', label: 'Doc.', render: v => v.folio ? v.documento + ' ' + v.folio : '—' }, { key: 'estadoPago', label: 'Pago', render: v => UI.estadoBadge(v.estadoPago) }], empty: { icon: '🛒', title: 'Sin compras' } });
  }

  function cobranza(ctx) {
    const hoy = U.today();
    const content = UI.page(ctx.el, { title: 'Cuentas por cobrar', crumbs: [['Comercial'], ['Clientes', '#/clientes']], tabs: UI.moduleTabs(ctx), desc: 'Ventas pendientes de pago con su antigüedad. Registrar el cobro lo deja disponible para la conciliación bancaria.' });
    const rows = db().list('venta', v => v.estado !== 'anulada' && v.estadoPago !== 'pagado').map(v => Object.assign({}, v, { saldo: U.n(v.total) - U.n(v.pagado), dias: v.vencimiento ? U.diffDays(v.vencimiento, hoy) : 0 }));
    const tramo = d => d <= 0 ? 'Por vencer' : d <= 30 ? '1–30 días' : d <= 60 ? '31–60 días' : 'Más de 60 días';
    const tramos = ['Por vencer', '1–30 días', '31–60 días', 'Más de 60 días'];
    const top = U.html(`<div class="grid grid-4" style="margin-bottom:16px">${tramos.map((t, i) => UI.kpi({ label: t, value: U.compactCLP(U.sum(rows.filter(r => tramo(r.dias) === t), r => r.saldo)), icon: i === 0 ? 'calendar' : 'warn', tone: i === 0 ? '' : i === 1 ? 'warning' : 'error', micro: rows.filter(r => tramo(r.dias) === t).length + ' documentos' })).join('')}</div>`);
    content.appendChild(top);
    const t = U.html('<div></div>'); content.appendChild(t);
    UI.table(t, {
      rows, exportName: 'cuentas_por_cobrar', exportPerm: 'clientes', defaultSort: 'dias',
      columns: [{ key: 'codigo', label: 'Venta', render: v => `<b>${U.esc(v.codigo)}</b>` }, { key: 'cliente', label: 'Cliente', value: v => UI.refText('cliente', v.clienteId), render: v => UI.ref('cliente', v.clienteId) }, { key: 'doc', label: 'Documento', value: v => v.documento + ' ' + (v.folio || ''), render: v => U.esc(v.documento) + (v.folio ? ' N°' + v.folio : '') }, { key: 'fecha', label: 'Emisión', render: v => U.fmtDate(v.fecha) }, { key: 'vencimiento', label: 'Vencimiento', render: v => U.fmtDate(v.vencimiento) }, { key: 'dias', label: 'Días de mora', num: true, render: v => v.dias > 0 ? `<b class="text-error">${v.dias}</b>` : '—' }, { key: 'tramo', label: 'Tramo', value: v => tramo(v.dias), render: v => UI.badge(tramo(v.dias), v.dias <= 0 ? '' : v.dias <= 30 ? 'warning' : 'error') }, { key: 'saldo', label: 'Saldo', num: true, render: v => `<b>${U.clp(v.saldo)}</b>` }],
      rowActions: VG.auth.can('clientes', 'e') || VG.auth.can('ventas', 'e') ? v => [{ label: 'Registrar cobro', icon: 'money', run: async () => {
        const r = await UI.formModal({ title: 'Registrar cobro · ' + v.codigo, values: { fecha: hoy, monto: v.saldo, medio: 'transferencia' }, fields: [{ key: 'fecha', label: 'Fecha', type: 'date', required: true }, { key: 'monto', label: 'Monto', type: 'money', min: 1, required: true, validate: x => U.n(x) > v.saldo ? 'El monto supera el saldo.' : '' }, { key: 'medio', label: 'Medio', type: 'select', options: ['transferencia', 'efectivo', 'tarjeta', 'cheque'] }], onSave: async x => { const pag = U.n(v.pagado) + U.n(x.monto); const orig = db().get('venta', v.id); await db().save('venta', Object.assign({}, orig, { pagado: pag, estadoPago: pag >= U.n(v.total) ? 'pagado' : 'pendiente', fechaPago: x.fecha }), { system: true }); await db().save('cobro', { fecha: x.fecha, clienteId: v.clienteId, ventaId: v.id, monto: x.monto, medio: x.medio }); VG.events.emit('cobro.registrado', { venta: v, monto: x.monto }); return true; } });
        if (r) { UI.toast('Cobro registrado.'); ctx.refresh(); }
      } }, { label: 'Ver venta', icon: 'eye', run: () => location.hash = '#/ventas?id=' + v.id }] : null,
      footer: rs => ({ saldo: `<b>${U.clp(U.sum(rs, r => r.saldo))}</b>` }),
      empty: { icon: '🎉', title: 'No hay cuentas por cobrar', text: 'Todas las ventas están pagadas.' }
    });
  }

  VG.registry.implement('clientes', { async onMount(ctx) { (ctx.sub === 'cobranza' ? cobranza : maestro)(ctx); } });
})(window.VG);
