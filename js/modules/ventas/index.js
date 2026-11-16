/**
 * modules/ventas/index.js — Módulo 12. Ventas (granel y envasado).
 * Valida stock, calcula neto + IVA 19% + ILA 20,5% (vinos), congela el costo unitario
 * para el COGS, y al confirmar publica venta.confirmada (descuenta inventario y puede
 * emitir el DTE). Reportes por período, canal y formato, y conciliación de litros.
 * Publica: venta.confirmada { venta }, venta.anulada { venta }
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui, Inv = () => VG.calc.inventory, T = () => VG.calc.tax;
  const db = () => VG.db;
  const CANALES = [['directa', 'Venta directa / sala'], ['distribuidor', 'Distribuidor'], ['ecommerce', 'E-commerce'], ['restaurante', 'Restaurante / HORECA'], ['granel', 'Granel']];
  const canal = k => (CANALES.find(c => c[0] === k) || [k, k])[1];

  function totales(v) {
    const neto = U.n(v.cantidad) * U.n(v.precio);
    return T().totales(neto, { ila: v.afectoILA !== false });
  }

  function registro(ctx) {
    const canSeeCost = VG.auth.can('costos', 'v');
    UI.crud(ctx.el, {
      entity: 'venta', moduleId: 'ventas', query: ctx.query, title: 'Ventas', crumbs: [['Comercial']], tabs: UI.moduleTabs(ctx), season: true,
      desc: 'Venta a granel (desde estanque) o envasada (desde una orden de envasado). Al guardar se descuenta el stock y, si lo marcas, se genera el DTE.',
      newLabel: 'Registrar venta', emptyIcon: '🛒', modalSize: 'lg',
      fields: [
        { key: 'tipo', label: 'Tipo de venta', type: 'select', options: [['envasado', 'Envasado'], ['granel', 'Granel']], required: true, section: 'Venta' },
        { key: 'fecha', label: 'Fecha', type: 'date', required: true, section: 'Venta' },
        { key: 'clienteId', label: 'Cliente', type: 'ref', ref: 'cliente', required: true, section: 'Venta', onChangeSet: v => { const c = db().get('cliente', v.clienteId) || {}; return { canal: c.canal === 'granel' ? v.canal : (c.canal || v.canal), documento: c.tipo === 'Persona' ? 'boleta' : 'factura', vencimiento: U.addDays(v.fecha || U.today(), c.plazo || 0) }; } },
        { key: 'canal', label: 'Canal', type: 'select', options: CANALES.filter(c => c[0] !== 'granel'), showIf: v => v.tipo !== 'granel', section: 'Venta' },
        { key: 'ordenEnvasadoId', label: 'Producto (orden de envasado)', type: 'ref', ref: 'ordenEnvasado', section: 'Producto', showIf: v => v.tipo !== 'granel', required: true, refFilter: (o, v) => o.estado === 'confirmada' && (Inv().stockOrden(o.id) > 0 || o.id === v.ordenEnvasadoId), refLabel: o => `${UI.refText('formato', o.formatoId)} · ${UI.refText('lote', o.loteId).split(' · ')[0]} · stock ${U.int(Inv().stockOrden(o.id))}` },
        { key: 'estanqueId', label: 'Estanque', type: 'ref', ref: 'estanque', section: 'Producto', showIf: v => v.tipo === 'granel', required: true, refFilter: e => Inv().litrosEstanque(e.id) > 0.5, refLabel: e => `${e.codigo} · ${U.int(Inv().litrosEstanque(e.id))} L`, onChangeSet: v => { const l = Inv().loteDeEstanque(v.estanqueId); return { loteId: l ? l.id : '' }; } },
        { key: 'loteId', label: 'Lote', type: 'ref', ref: 'lote', section: 'Producto', showIf: v => v.tipo === 'granel', required: true },
        { key: 'cantidad', label: 'Cantidad', type: 'number', min: 0.01, required: true, section: 'Producto', hint: 'Unidades (envasado) o litros (granel).' },
        { key: 'precio', label: 'Precio unitario neto', type: 'money', min: 1, required: true, section: 'Producto', help: 'Sin IVA ni ILA. Por unidad (envasado) o por litro (granel).' },
        { key: 'graduacion', label: 'Graduación', type: 'number', unit: '% vol', min: 0, max: 18, step: 0.1, section: 'Producto' },
        { key: 'afectoILA', label: 'Afecto a ILA vinos (20,5%)', type: 'checkbox', section: 'Producto' },
        { key: 'documento', label: 'Documento', type: 'select', options: [['factura', 'Factura'], ['boleta', 'Boleta'], ['guia', 'Guía de despacho']], required: true, section: 'Documento y pago' },
        { key: 'generarDTE', label: 'Generar DTE (XML) al guardar', type: 'checkbox', section: 'Documento y pago', help: 'Crea el documento con folio correlativo para enviarlo vía tu proveedor de facturación.' },
        { key: 'estadoPago', label: 'Estado de pago', type: 'select', options: [['pendiente', 'Pendiente'], ['pagado', 'Pagado']], section: 'Documento y pago' },
        { key: 'vencimiento', label: 'Vencimiento', type: 'date', section: 'Documento y pago' },
        { key: 'descripcion', label: 'Glosa / observación', section: 'Documento y pago' }
      ],
      defaults: () => ({ tipo: 'envasado', fecha: U.today(), canal: 'distribuidor', documento: 'factura', estadoPago: 'pendiente', afectoILA: true, generarDTE: true, graduacion: 13.5 }),
      liveCalc: v => {
        const t = totales(v);
        let stock = 0, costo = 0;
        if (v.tipo === 'granel') { stock = v.estanqueId && v.loteId ? U.sum(db().list('movBodega', m => m.estanqueId === v.estanqueId && m.loteId === v.loteId), m => m.litros) : 0; costo = VG.calc.financial.costoLitroLote(v.loteId).costoLitro; }
        else { const o = db().get('ordenEnvasado', v.ordenEnvasadoId); stock = o ? Inv().stockOrden(o.id) + (v.id ? U.n((db().get('venta', v.id) || {}).cantidad) : 0) : 0; costo = o ? U.n(o.costoUnitario) : 0; }
        const falta = U.n(v.cantidad) > stock + 1e-6;
        return `<h4>Totales</h4><dl><dt>Neto</dt><dd>${U.clp(t.neto)}</dd><dt>IVA 19%</dt><dd>${U.clp(t.iva)}</dd><dt>ILA ${U.pct(VG.store.config().tributario.tasaILA)}</dt><dd>${U.clp(t.ila)}</dd><dt class="total">Total</dt><dd class="total">${U.clp(t.total)}</dd><dt>Stock disponible</dt><dd class="${falta ? 'text-error' : ''}">${U.int(stock)} ${v.tipo === 'granel' ? 'L' : 'un.'}</dd>
          ${canSeeCost ? `<dt>Costo unitario</dt><dd>${U.clp(costo)}</dd><dt>Margen</dt><dd class="${U.n(v.precio) < costo ? 'text-error' : 'text-success'}">${U.clp((U.n(v.precio) - costo) * U.n(v.cantidad))} (${U.pct(U.n(v.precio) ? (U.n(v.precio) - costo) / U.n(v.precio) : 0)})</dd>` : ''}</dl>${falta ? '<p class="text-xs text-error" style="margin:6px 0 0">⚠ Stock insuficiente.</p>' : ''}${v.tipo === 'granel' ? '<p class="text-xs muted" style="margin:6px 0 0">La guía/factura de granel debe indicar producto, cantidad de envases y graduación (campos SAG).</p>' : ''}`;
      },
      beforeSave: (d, isNew, before) => {
        if (before && before.estado === 'anulada') throw new Error('La venta está anulada y no se puede modificar.');
        if (before && before.dteId && (U.n(d.cantidad) !== U.n(before.cantidad) || U.n(d.precio) !== U.n(before.precio))) throw new Error('La venta ya tiene DTE: para cambiar cantidad o precio emite una nota de crédito y registra una nueva venta.');
        if (d.tipo === 'granel') {
          d.ordenEnvasadoId = ''; d.formatoId = ''; d.canal = 'granel'; d.litros = U.n(d.cantidad);
          const disp = U.sum(db().list('movBodega', m => m.estanqueId === d.estanqueId && m.loteId === d.loteId && m.ref !== 'venta:' + d.id), m => m.litros);
          if (U.n(d.cantidad) > disp + 0.01) throw Object.assign(new Error(`Stock insuficiente: el lote tiene ${U.int(disp)} L en el estanque.`), { field: 'cantidad' });
          d.costoUnitario = Math.round(VG.calc.financial.costoLitroLote(d.loteId).costoLitro);
        } else {
          const o = db().get('ordenEnvasado', d.ordenEnvasadoId);
          const disp = Inv().stockOrden(o.id) + (before && before.ordenEnvasadoId === o.id ? U.n(before.cantidad) : 0);
          if (U.n(d.cantidad) > disp) throw Object.assign(new Error(`Stock insuficiente: quedan ${U.int(disp)} unidades de esta orden.`), { field: 'cantidad' });
          const fmt = db().get('formato', o.formatoId) || { litros: 0 };
          Object.assign(d, { formatoId: o.formatoId, loteId: o.loteId, estanqueId: '', litros: U.n(d.cantidad) * U.n(fmt.litros), costoUnitario: o.costoUnitario });
        }
        Object.assign(d, totales(d));
        if (isNew) d.codigo = 'V-' + String(db().count('venta') + 1).padStart(4, '0');
        d.estado = d.estado || 'confirmada';
        if (d.estadoPago === 'pagado' && !d.fechaPago) d.fechaPago = d.fecha;
        return d;
      },
      afterSave: async (v, isNew, before) => {
        if (before) { db().list('movBodega', m => m.ref === 'venta:' + v.id).forEach(m => db().remove('movBodega', m.id, { system: true })); }
        VG.events.emit('venta.confirmada', { venta: v, isNew });
        if (v.estadoPago === 'pagado' && (!before || before.estadoPago !== 'pagado')) await db().save('cobro', { fecha: v.fechaPago || v.fecha, clienteId: v.clienteId, ventaId: v.id, monto: v.total, medio: 'transferencia' }, { system: true, silent: true });
      },
      canDelete: v => v.dteId ? 'La venta tiene DTE emitido: usa "Anular venta" para generar la nota de crédito.' : true,
      afterRemove: v => db().list('movBodega', m => m.ref === 'venta:' + v.id).forEach(m => db().remove('movBodega', m.id, { system: true })),
      rowActions: (v, { refresh }) => [
        v.estadoPago !== 'pagado' && v.estado !== 'anulada' && VG.auth.can('ventas', 'e') ? { label: 'Marcar como pagada', icon: 'money', run: () => marcarPagada(v, refresh) } : null,
        !v.dteId && v.estado !== 'anulada' && VG.auth.can('dte', 'c') ? { label: 'Emitir DTE', icon: 'receipt', run: async () => { await UI.run(() => VG.integrations.dte.emitirDesdeVenta(v), 'DTE generado.'); refresh(); } } : null,
        v.dteId ? { label: 'Ver DTE', icon: 'doc', run: () => location.hash = '#/dte?id=' + v.dteId } : null,
        { label: 'Borrador de guía/factura (imprimir)', icon: 'print', run: () => borrador(v) },
        v.estado !== 'anulada' && VG.auth.can('ventas', 'e') ? { label: 'Anular venta', icon: 'x', danger: true, run: () => anular(v, refresh) } : null
      ].filter(Boolean),
      canEdit: v => v.estado !== 'anulada',
      columns: [
        { key: 'codigo', label: 'Venta', sticky: true, render: v => `<b>${U.esc(v.codigo)}</b>${UI.demoBadge(v)}` },
        { key: 'fecha', label: 'Fecha', render: v => U.fmtDate(v.fecha) },
        { key: 'cliente', label: 'Cliente', value: v => UI.refText('cliente', v.clienteId), render: v => UI.ref('cliente', v.clienteId) },
        { key: 'tipo', label: 'Producto', value: v => v.tipo === 'granel' ? 'Granel ' + UI.refText('lote', v.loteId) : UI.refText('formato', v.formatoId), render: v => v.tipo === 'granel' ? `${UI.badge('Granel', 'info')} ${UI.ref('lote', v.loteId)}` : `${UI.ref('formato', v.formatoId)} <span class="muted text-xs">${U.esc(UI.refText('lote', v.loteId).split(' · ')[0])}</span>` },
        { key: 'canal', label: 'Canal', value: v => canal(v.canal), render: v => canal(v.canal) },
        { key: 'cantidad', label: 'Cantidad', num: true, render: v => U.int(v.cantidad) + (v.tipo === 'granel' ? ' L' : ' un') },
        { key: 'neto', label: 'Neto', num: true, render: v => U.clp(v.neto) },
        { key: 'total', label: 'Total', num: true, render: v => U.clp(v.total) },
        canSeeCost ? { key: 'margen', label: 'Margen', num: true, value: v => v.neto ? (U.n(v.neto) - U.n(v.cantidad) * U.n(v.costoUnitario)) / v.neto : 0, render: v => U.pct(v.neto ? (U.n(v.neto) - U.n(v.cantidad) * U.n(v.costoUnitario)) / v.neto : 0) } : null,
        { key: 'doc', label: 'Documento', value: v => v.documento + ' ' + (v.folio || ''), render: v => v.folio ? `${U.esc(v.documento)} N°${v.folio}` : `<span class="muted">${U.esc(v.documento)} (sin DTE)</span>` },
        { key: 'estadoPago', label: 'Pago', render: v => v.estado === 'anulada' ? UI.estadoBadge('anulada') : v.estadoPago === 'pagado' ? UI.estadoBadge('pagado') : v.vencimiento && v.vencimiento < U.today() ? UI.badge('Vencida', 'error') : UI.estadoBadge('pendiente') }
      ].filter(Boolean),
      filters: [{ key: 'tipo', label: 'Tipo', options: [['envasado', 'Envasado'], ['granel', 'Granel']] }, { key: 'canal', label: 'Canal', options: CANALES }, { key: 'estadoPago', label: 'Pago', options: [['pendiente', 'Pendiente'], ['pagado', 'Pagado']] }, { key: 'clienteId', label: 'Cliente', options: () => db().list('cliente').map(c => [c.id, c.nombre]) }],
      footer: rows => ({ neto: U.clp(U.sum(rows.filter(v => v.estado !== 'anulada'), v => v.neto)), total: U.clp(U.sum(rows.filter(v => v.estado !== 'anulada'), v => v.total)) }),
      renderTop: (top, rows) => {
        const ok = rows.filter(v => v.estado !== 'anulada');
        const neto = U.sum(ok, v => v.neto), gr = ok.filter(v => v.tipo === 'granel'), env = ok.filter(v => v.tipo !== 'granel');
        top.innerHTML = `<div class="grid grid-4">${UI.kpi({ label: 'Ventas netas', value: U.compactCLP(neto), icon: 'money', micro: `${ok.length} ventas · temporada ${VG.store.state.season}` })}${UI.kpi({ label: 'Unidades envasadas', value: U.int(U.sum(env, v => v.cantidad)), icon: 'bottle', micro: U.compactCLP(U.sum(env, v => v.neto)) + ' neto' })}${UI.kpi({ label: 'Litros a granel', value: U.lt(U.sum(gr, v => v.litros)), icon: 'tank', micro: U.compactCLP(U.sum(gr, v => v.neto)) + ' neto' })}${UI.kpi({ label: 'Ticket promedio', value: U.clp(ok.length ? neto / ok.length : 0), icon: 'receipt', micro: 'Neto por venta' })}</div>`;
      }
    });
  }

  async function marcarPagada(v, refresh) {
    const r = await UI.formModal({ title: 'Registrar pago de ' + v.codigo, values: { fechaPago: U.today(), medio: 'transferencia', monto: v.total }, fields: [{ key: 'fechaPago', label: 'Fecha de pago', type: 'date', required: true }, { key: 'monto', label: 'Monto recibido', type: 'money', required: true, min: 1 }, { key: 'medio', label: 'Medio de pago', type: 'select', options: ['transferencia', 'efectivo', 'tarjeta', 'cheque'] }], onSave: async x => { await db().save('venta', Object.assign({}, v, { estadoPago: U.n(x.monto) >= U.n(v.total) ? 'pagado' : 'pendiente', fechaPago: x.fechaPago, pagado: U.n(v.pagado) + U.n(x.monto) })); await db().save('cobro', { fecha: x.fechaPago, clienteId: v.clienteId, ventaId: v.id, monto: x.monto, medio: x.medio }); VG.events.emit('cobro.registrado', { venta: v, monto: x.monto }); return true; } });
    if (r) { UI.toast('Pago registrado. Podrás conciliarlo con la cartola bancaria.'); refresh(); }
  }

  async function anular(v, refresh) {
    const ok = await UI.confirm({ title: 'Anular venta ' + v.codigo, message: `Se devolverá el stock${v.dteId ? ' y se generará una <b>nota de crédito</b> (DTE 61) que anula el documento' : ''}. Esta acción queda registrada en la auditoría.`, confirmText: 'Anular venta', danger: true });
    if (!ok) return;
    await UI.run(async () => {
      if (v.dteId) { const d = db().get('dte', v.dteId); if (d && d.tipo !== 39) await VG.integrations.dte.notaCredito(d, 'Anula venta ' + v.codigo); else if (d) await VG.integrations.dte.cambiarEstado(d.id, 'anulado'); }
      const r = await db().save('venta', Object.assign({}, v, { estado: 'anulada', anuladaEn: new Date().toISOString() }));
      VG.events.emit('venta.anulada', { venta: r });
    }, 'Venta anulada.');
    refresh();
  }

  function borrador(v) {
    const c = db().get('cliente', v.clienteId) || {}, e = VG.store.config().empresa;
    const w = U.html(`<div><div class="print-only"><h2>${U.esc(e.razonSocial)}</h2></div>
      <div class="grid grid-2"><div>${UI.dl([['Emisor', U.esc(e.razonSocial)], ['RUT', U.esc(e.rut)], ['Giro', U.esc(e.giro)], ['Dirección', U.esc(e.direccion + ', ' + e.comuna)], ['Inscripción SAG', U.esc(e.inscripcionSAG)]])}</div><div>${UI.dl([['Documento', U.esc(v.documento) + (v.folio ? ' N°' + v.folio : ' (borrador)')], ['Fecha', U.fmtDate(v.fecha)], ['Cliente', U.esc(c.nombre || '')], ['RUT', U.esc(c.rut || '')], ['Dirección', U.esc([c.direccion, c.comuna].filter(Boolean).join(', '))]])}</div></div>
      <table class="data compact" style="margin-top:14px"><thead><tr><th>Producto</th><th class="num">Envases / litros</th><th class="num">Graduación</th><th class="num">Precio</th><th class="num">Total neto</th></tr></thead><tbody><tr><td>${v.tipo === 'granel' ? 'Vino a granel ' + U.esc(UI.refText('lote', v.loteId)) : 'Vino ' + U.esc(UI.refText('formato', v.formatoId)) + ' ' + U.esc(UI.refText('lote', v.loteId))}</td><td class="num">${U.int(v.cantidad)} ${v.tipo === 'granel' ? 'L' : 'unidades'}</td><td class="num">${U.dec1(v.graduacion || 0)}% vol</td><td class="num">${U.clp(v.precio)}</td><td class="num">${U.clp(v.neto)}</td></tr></tbody>
      <tfoot><tr><td colspan="4">IVA 19%</td><td class="num">${U.clp(v.iva)}</td></tr><tr><td colspan="4">ILA vinos</td><td class="num">${U.clp(v.ila)}</td></tr><tr><td colspan="4">Total</td><td class="num">${U.clp(v.total)}</td></tr></tfoot></table>
      <p class="text-xs muted" style="margin-top:10px">Campos SAG: producto, cantidad de envases y graduación alcohólica. Borrador de apoyo; el documento tributario válido es el DTE emitido a través de un proveedor autorizado.</p></div>`);
    UI.modal({ title: 'Borrador de ' + v.documento + ' · ' + v.codigo, body: w, size: 'lg', foot: '<div class="right"><button class="btn" data-close>Cerrar</button><button class="btn btn-primary" onclick="window.print()">🖨️ Imprimir</button></div>' });
  }

  function reportes(ctx) {
    const y = VG.store.state.season;
    const content = UI.page(ctx.el, { title: 'Reportes de ventas', crumbs: [['Comercial'], ['Ventas', '#/ventas']], tabs: UI.moduleTabs(ctx), desc: `Temporada ${y}: ventas por mes, canal y formato, y conciliación de litros producidos → envasados → vendidos → mermas.`, actions: [{ label: 'Imprimir / PDF', icon: 'print', run: () => window.print() }] });
    const vs = db().list('venta', v => v.estado !== 'anulada' && U.year(v.fecha) === y);
    const meses = U.monthsOfYear(y);
    const ex = VG.calc.inventory;
    const lotes = db().list('lote', l => Number(l.temporada) <= y);
    const prod = U.sum(lotes, l => ex.balanceLote(l.id).entradas), env = U.sum(lotes, l => ex.balanceLote(l.id).envasado), gr = U.sum(lotes, l => ex.balanceLote(l.id).ventaGranel), me = U.sum(lotes, l => ex.balanceLote(l.id).merma) + U.sum(lotes, l => ex.balanceLote(l.id).vinagre);
    const litrosEnvVendidos = U.sum(db().list('venta', v => v.estado !== 'anulada' && v.tipo !== 'granel'), v => v.litros);
    content.innerHTML = `<div class="grid grid-2">
      <div class="card"><div class="card-head"><h3>Ventas netas por mes</h3></div><div data-c1></div></div>
      <div class="card"><div class="card-head"><h3>Por canal</h3></div><div data-c2></div></div>
      <div class="card"><div class="card-head"><h3>Unidades por formato</h3></div><div data-c3></div></div>
      <div class="card"><div class="card-head"><h3>Conciliación de litros (histórico acumulado)</h3></div>
        <table class="statement"><tr><td>Litros producidos (entradas a bodega)</td><td>${U.int(prod)}</td></tr><tr><td class="indent">− Envasados</td><td>${U.int(env)}</td></tr><tr><td class="indent">− Vendidos a granel</td><td>${U.int(gr)}</td></tr><tr><td class="indent">− Mermas y vinagre</td><td>${U.int(me)}</td></tr><tr class="sub"><td>= Stock a granel</td><td>${U.int(prod - env - gr - me)}</td></tr><tr><td>Litros envasados vendidos</td><td>${U.int(litrosEnvVendidos)}</td></tr><tr class="sub"><td>Litros envasados en bodega (producto terminado)</td><td>${U.int(env / 1.015 - litrosEnvVendidos)}</td></tr></table>
        <p class="text-xs muted">El envasado incluye la merma de llenado declarada en cada orden.</p></div></div>`;
    VG.charts.bar(content.querySelector('[data-c1]'), { labels: meses.map(U.monthName), series: [{ name: 'Envasado', data: meses.map(m => U.sum(vs.filter(v => v.tipo !== 'granel' && U.month(v.fecha) === m), v => v.neto)) }, { name: 'Granel', data: meses.map(m => U.sum(vs.filter(v => v.tipo === 'granel' && U.month(v.fecha) === m), v => v.neto)) }], yFmt: U.compactCLP, tipFmt: U.clp });
    VG.charts.hbar(content.querySelector('[data-c2]'), { items: CANALES.map(([k, l]) => ({ label: l, value: U.sum(vs.filter(v => v.canal === k), v => v.neto) })).sort((a, b) => b.value - a.value), fmt: U.compactCLP });
    VG.charts.hbar(content.querySelector('[data-c3]'), { items: db().list('formato').map(f => ({ label: f.nombre, value: U.sum(vs.filter(v => v.formatoId === f.id), v => v.cantidad) })), fmt: v => U.int(v) + ' un' });
  }

  VG.registry.implement('ventas', { async onMount(ctx) { (ctx.sub === 'reportes' ? reportes : registro)(ctx); } });
})(window.VG);
