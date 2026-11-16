/**
 * modules/proveedores/index.js — Módulo 19. Proveedores y compras.
 * Registro de compras (impacta inventario y cuentas por pagar). Con factura, se
 * registra el DTE recibido y alimenta el IVA crédito del F29. Análisis de evolución
 * de precios (crítico para vidrio/PET, etiquetas, corchos).
 * Publica: compra.registrada { compra }
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui, T = () => VG.calc.tax;
  const db = () => VG.db;
  const DOCS = [['factura', 'Factura afecta'], ['factura_exenta', 'Factura exenta'], ['boleta', 'Boleta'], ['guia', 'Guía de despacho'], ['nota_credito', 'Nota de crédito']];

  function compras(ctx) {
    UI.crud(ctx.el, {
      entity: 'compra', moduleId: 'proveedores', query: ctx.query, title: 'Proveedores y compras', crumbs: [['Finanzas']], tabs: UI.moduleTabs(ctx), season: true,
      desc: 'Cada compra suma stock al insumo, actualiza su precio y queda en cuentas por pagar. Con factura, se registra el DTE recibido (IVA crédito).',
      newLabel: 'Registrar compra', emptyIcon: '🚚',
      fields: [
        { key: 'fecha', label: 'Fecha', type: 'date', required: true, section: 'Documento' },
        { key: 'proveedorId', label: 'Proveedor', type: 'ref', ref: 'proveedor', required: true, section: 'Documento', onChangeSet: v => ({ vencimiento: U.addDays(v.fecha || U.today(), (db().get('proveedor', v.proveedorId) || {}).plazo || 30) }) },
        { key: 'documento', label: 'Tipo de documento', type: 'select', options: DOCS, required: true, section: 'Documento' },
        { key: 'folio', label: 'Folio', section: 'Documento', validate: (v, a) => v && db().find('compra', c => c.proveedorId === a.proveedorId && String(c.folio) === String(v) && c.documento === a.documento && c.id !== a.id) ? 'Ya registraste este folio para este proveedor.' : '' },
        { key: 'insumoId', label: 'Insumo (si va a inventario)', type: 'ref', ref: 'insumo', section: 'Detalle', onChangeSet: v => { const i = db().get('insumo', v.insumoId); return i ? { precioUnitario: v.precioUnitario || i.precio, descripcion: v.descripcion || i.nombre } : {}; } },
        { key: 'descripcion', label: 'Descripción', required: true, section: 'Detalle' },
        { key: 'cantidad', label: 'Cantidad', type: 'number', min: 0.001, required: true, section: 'Detalle' },
        { key: 'precioUnitario', label: 'Precio unitario neto', type: 'money', min: 0, required: true, section: 'Detalle' },
        { key: 'exento', label: 'Monto exento', type: 'money', min: 0, section: 'Detalle' },
        { key: 'estadoPago', label: 'Estado de pago', type: 'select', options: [['pendiente', 'Pendiente'], ['pagado', 'Pagado']], section: 'Pago' },
        { key: 'vencimiento', label: 'Vencimiento', type: 'date', section: 'Pago' },
        { key: 'fechaPago', label: 'Fecha de pago', type: 'date', section: 'Pago', showIf: v => v.estadoPago === 'pagado' }
      ],
      defaults: () => ({ fecha: U.today(), documento: 'factura', estadoPago: 'pendiente', cantidad: 1 }),
      liveCalc: v => { const neto = U.n(v.cantidad) * U.n(v.precioUnitario); const iva = v.documento === 'factura' ? T().iva(neto) : 0; const i = db().get('insumo', v.insumoId); const var_ = i && U.n(i.precio) ? (U.n(v.precioUnitario) - U.n(i.precio)) / U.n(i.precio) : null; return `<h4>Totales</h4><dl><dt>Neto</dt><dd>${U.clp(neto)}</dd><dt>Exento</dt><dd>${U.clp(v.exento)}</dd><dt>IVA crédito</dt><dd>${U.clp(iva)}</dd><dt class="total">Total</dt><dd class="total">${U.clp(neto + iva + U.n(v.exento))}</dd>${i ? `<dt>Stock actual</dt><dd>${U.dec2(VG.calc.inventory.stockInsumo(i.id))}</dd><dt>Precio anterior</dt><dd>${U.clp(i.precio)}</dd><dt>Variación</dt><dd class="${var_ > 0.05 ? 'text-error' : var_ < 0 ? 'text-success' : ''}">${var_ === null ? '—' : (var_ >= 0 ? '+' : '') + U.pct(var_)}</dd>` : ''}</dl>`; },
      beforeSave: d => { const neto = Math.round(U.n(d.cantidad) * U.n(d.precioUnitario)); d.neto = neto; d.iva = d.documento === 'factura' ? T().iva(neto) : 0; d.total = neto + d.iva + U.n(d.exento); if (d.documento === 'nota_credito') { d.neto = -Math.abs(d.neto); d.iva = -Math.abs(d.iva); d.total = -Math.abs(d.total); } return d; },
      afterSave: c => VG.events.emit('compra.registrada', { compra: c }),
      afterRemove: c => { db().list('movInsumo', m => m.ref === 'compra:' + c.id).forEach(m => db().remove('movInsumo', m.id, { system: true })); db().list('dte', d => d.compraId === c.id).forEach(d => db().remove('dte', d.id, { system: true })); },
      rowActions: (c, { refresh }) => [c.estadoPago !== 'pagado' && VG.auth.can('proveedores', 'e') ? { label: 'Registrar pago', icon: 'money', run: () => pagar(c, refresh) } : null].filter(Boolean),
      columns: [
        { key: 'fecha', label: 'Fecha', sticky: true, render: c => U.fmtDate(c.fecha) + UI.demoBadge(c) },
        { key: 'proveedor', label: 'Proveedor', value: c => UI.refText('proveedor', c.proveedorId), render: c => UI.ref('proveedor', c.proveedorId) },
        { key: 'documento', label: 'Documento', value: c => c.documento + ' ' + (c.folio || ''), render: c => `${(DOCS.find(d => d[0] === c.documento) || [0, c.documento])[1]} ${c.folio ? 'N°' + U.esc(c.folio) : ''}` },
        { key: 'descripcion', label: 'Detalle' }, { key: 'cantidad', label: 'Cant.', num: true, render: c => U.dec2(c.cantidad).replace(/,00$/, '') }, { key: 'precioUnitario', label: 'P. unit.', num: true, render: c => U.clp(c.precioUnitario) },
        { key: 'neto', label: 'Neto', num: true, render: c => U.clp(c.neto) }, { key: 'iva', label: 'IVA', num: true, render: c => U.clp(c.iva) }, { key: 'total', label: 'Total', num: true, render: c => U.clp(c.total) },
        { key: 'estadoPago', label: 'Pago', render: c => c.estadoPago === 'pagado' ? UI.estadoBadge('pagado') : c.vencimiento < U.today() ? UI.badge('Vencida', 'error') : UI.estadoBadge('pendiente') }
      ],
      filters: [{ key: 'proveedorId', label: 'Proveedor', options: () => db().list('proveedor').map(p => [p.id, p.nombre]) }, { key: 'estadoPago', label: 'Pago', options: [['pendiente', 'Pendiente'], ['pagado', 'Pagado']] }],
      footer: rs => ({ neto: U.clp(U.sum(rs, c => c.neto)), iva: U.clp(U.sum(rs, c => c.iva)), total: U.clp(U.sum(rs, c => c.total)) })
    });
  }
  async function pagar(c, refresh) {
    const r = await UI.formModal({ title: 'Pago a proveedor', values: { fecha: U.today(), monto: c.total, medio: 'transferencia' }, fields: [{ key: 'fecha', label: 'Fecha de pago', type: 'date', required: true }, { key: 'monto', label: 'Monto', type: 'money', required: true, min: 1 }, { key: 'medio', label: 'Medio', type: 'select', options: ['transferencia', 'cheque', 'efectivo', 'tarjeta'] }], onSave: async v => { await db().save('compra', Object.assign({}, c, { estadoPago: 'pagado', fechaPago: v.fecha })); await db().save('pago', { fecha: v.fecha, proveedorId: c.proveedorId, compraId: c.id, monto: v.monto, medio: v.medio }); return true; } });
    if (r) { UI.toast('Pago registrado. Disponible para conciliación bancaria.'); refresh(); }
  }

  function maestro(ctx) {
    UI.crud(ctx.el, {
      entity: 'proveedor', moduleId: 'proveedores', query: ctx.query, title: 'Maestro de proveedores', crumbs: [['Finanzas'], ['Compras', '#/proveedores']], tabs: UI.moduleTabs(ctx),
      newLabel: 'Nuevo proveedor', emptyIcon: '🏭',
      fields: [{ key: 'nombre', label: 'Razón social', required: true }, { key: 'rut', label: 'RUT', type: 'rut', required: true }, { key: 'categoria', label: 'Categoría', list: ['Envases vidrio', 'Envases PET', 'Corchos y cápsulas', 'Etiquetas', 'Insumos agrícolas', 'Insumos enológicos', 'Servicios básicos', 'Transporte', 'Servicios profesionales'] }, { key: 'contacto', label: 'Contacto' }, { key: 'email', label: 'Correo', type: 'email' }, { key: 'telefono', label: 'Teléfono' }, { key: 'condiciones', label: 'Condiciones', list: ['Contado', '30 días', '45 días', '60 días'] }, { key: 'plazo', label: 'Plazo de pago', type: 'number', unit: 'días', min: 0, step: 1 }],
      defaults: () => ({ plazo: 30, condiciones: '30 días' }),
      columns: [{ key: 'nombre', label: 'Proveedor', render: p => `<b>${U.esc(p.nombre)}</b>${UI.demoBadge(p)}` }, { key: 'rut', label: 'RUT' }, { key: 'categoria', label: 'Categoría' }, { key: 'contacto', label: 'Contacto' }, { key: 'condiciones', label: 'Condiciones' }, { key: 'compras', label: 'Compras (neto)', num: true, value: p => U.sum(db().list('compra', c => c.proveedorId === p.id), c => c.neto), render: p => U.clp(U.sum(db().list('compra', c => c.proveedorId === p.id), c => c.neto)) }, { key: 'deuda', label: 'Por pagar', num: true, value: p => U.sum(db().list('compra', c => c.proveedorId === p.id && c.estadoPago !== 'pagado'), c => c.total), render: p => U.clp(U.sum(db().list('compra', c => c.proveedorId === p.id && c.estadoPago !== 'pagado'), c => c.total)) }],
      filters: [{ key: 'categoria', label: 'Categoría', options: () => Array.from(new Set(db().list('proveedor').map(p => p.categoria).filter(Boolean))) }],
      canDelete: p => db().find('compra', c => c.proveedorId === p.id) ? 'No se puede eliminar: tiene compras registradas.' : true
    });
  }

  function porPagar(ctx) {
    const hoy = U.today();
    const content = UI.page(ctx.el, { title: 'Cuentas por pagar', crumbs: [['Finanzas'], ['Compras', '#/proveedores']], tabs: UI.moduleTabs(ctx), desc: 'Facturas pendientes ordenadas por vencimiento.' });
    const rows = db().list('compra', c => c.estadoPago !== 'pagado').map(c => Object.assign({}, c, { dias: U.diffDays(hoy, c.vencimiento || hoy) }));
    content.innerHTML = `<div class="grid grid-3">${UI.kpi({ label: 'Total por pagar', value: U.compactCLP(U.sum(rows, r => r.total)), icon: 'truck' })}${UI.kpi({ label: 'Vencido', value: U.compactCLP(U.sum(rows.filter(r => r.dias < 0), r => r.total)), icon: 'warn', tone: rows.some(r => r.dias < 0) ? 'error' : 'success' })}${UI.kpi({ label: 'Vence en 7 días', value: U.compactCLP(U.sum(rows.filter(r => r.dias >= 0 && r.dias <= 7), r => r.total)), icon: 'calendar', tone: 'warning' })}</div><div data-t style="margin-top:16px"></div>`;
    UI.table(content.querySelector('[data-t]'), { rows, exportName: 'cuentas_por_pagar', exportPerm: 'proveedores', defaultSort: 'dias', defaultDir: 'asc', columns: [{ key: 'proveedor', label: 'Proveedor', value: c => UI.refText('proveedor', c.proveedorId), render: c => UI.ref('proveedor', c.proveedorId) }, { key: 'folio', label: 'Folio' }, { key: 'descripcion', label: 'Detalle' }, { key: 'fecha', label: 'Emisión', render: c => U.fmtDate(c.fecha) }, { key: 'vencimiento', label: 'Vence', render: c => U.fmtDate(c.vencimiento) }, { key: 'dias', label: 'Días', num: true, render: c => c.dias < 0 ? `<b class="text-error">Vencida hace ${-c.dias}</b>` : c.dias <= 7 ? `<span class="text-warning">${c.dias}</span>` : c.dias }, { key: 'total', label: 'Total', num: true, render: c => `<b>${U.clp(c.total)}</b>` }], rowActions: VG.auth.can('proveedores', 'e') ? c => [{ label: 'Registrar pago', icon: 'money', run: () => pagar(db().get('compra', c.id), () => ctx.refresh()) }] : null, footer: rs => ({ total: `<b>${U.clp(U.sum(rs, c => c.total))}</b>` }), empty: { icon: '🎉', title: 'No hay cuentas por pagar' } });
  }

  function precios(ctx) {
    const content = UI.page(ctx.el, { title: 'Evolución de precios', crumbs: [['Finanzas'], ['Compras', '#/proveedores']], tabs: UI.moduleTabs(ctx), desc: 'Precio unitario de cada compra por insumo. Útil para negociar vidrio, PET, corchos y etiquetas.' });
    const ins = db().list('insumo').filter(i => db().find('compra', c => c.insumoId === i.id));
    const sel = ctx.query.insumo || (ins.find(i => i.categoria === 'envasado') || ins[0] || {}).id;
    content.innerHTML = `<div class="row" style="margin-bottom:12px"><label class="text-sm muted" for="ins">Insumo</label><select class="select" id="ins" style="width:auto">${ins.map(i => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${U.esc(i.nombre)}</option>`).join('')}</select></div><div class="grid grid-2"><div class="card"><div class="card-head"><h3>Precio unitario por compra</h3></div><div data-c></div></div><div class="card"><div class="card-head"><h3>Variación de precio por insumo</h3></div><p class="card-desc">Primera vs última compra registrada.</p><div data-v></div></div></div>`;
    content.querySelector('#ins').onchange = e => location.hash = '#/proveedores/precios?insumo=' + e.target.value;
    const cs = db().list('compra', c => c.insumoId === sel).sort((a, b) => a.fecha.localeCompare(b.fecha));
    VG.charts.line(content.querySelector('[data-c]'), { labels: cs.map(c => U.fmtDate(c.fecha)), series: [{ name: 'Precio unitario', data: cs.map(c => c.precioUnitario) }], yFmt: U.clp, tipFmt: U.clp, height: 220, emptyText: 'Sin compras de este insumo.' });
    VG.charts.hbar(content.querySelector('[data-v]'), { items: ins.map(i => { const c = db().list('compra', x => x.insumoId === i.id).sort((a, b) => a.fecha.localeCompare(b.fecha)); return { label: i.nombre, value: c.length > 1 && c[0].precioUnitario ? (c[c.length - 1].precioUnitario - c[0].precioUnitario) / c[0].precioUnitario : 0 }; }).filter(x => x.value).sort((a, b) => b.value - a.value), fmt: v => (v > 0 ? '+' : '') + U.pct(v), color: 'var(--chart-3)' });
  }

  VG.registry.implement('proveedores', { async onMount(ctx) { ({ maestro, pagar: porPagar, precios }[ctx.sub] || compras)(ctx); } });
})(window.VG);
