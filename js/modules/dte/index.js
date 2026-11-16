/**
 * modules/dte/index.js — Módulo 21. Integración SII — Documentos Tributarios Electrónicos.
 * Documentos emitidos y recibidos (33, 34, 39, 52, 56, 61), XML con estructura SII,
 * control de folios (CAF) con alerta al 80%, estados, libro de compras y ventas y
 * configuración del emisor. ⚠ No envía al SII: genera XML para el proveedor autorizado.
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui, DTE = () => VG.integrations.dte;
  const db = () => VG.db;
  const tipoN = t => DTE().TIPOS[t] || 'Tipo ' + t;
  const AVISO = 'El sistema <b>no envía documentos al SII</b>. Genera el XML para que lo proceses y envíes mediante tu proveedor de facturación electrónica autorizado (que agrega timbre TED y firma). La responsabilidad legal de la emisión es del contribuyente.';

  function documentos(ctx) {
    const content = UI.page(ctx.el, {
      title: 'Documentos tributarios electrónicos', crumbs: [['Tributario']], tabs: UI.moduleTabs(ctx),
      desc: 'Emitidos desde ventas y recibidos desde compras y gastos. Descarga el XML y actualiza el estado según la respuesta del SII.',
      actions: [{ label: 'Descargar XML emitidos de la temporada', icon: 'download', perm: ['dte', 'x'], run: () => { const ds = (tbl && tbl.lastRows) || []; if (!ds.length) return UI.toast('No hay documentos para descargar.', 'warning'); DTE().descargarMasivo(ds.filter(d => d.direccion === 'emitido')); UI.toast('XML descargado.'); } }]
    });
    content.innerHTML = UI.legal(AVISO) + '<div data-k></div><div data-t style="margin-top:16px"></div>';
    const per = U.month(U.today());
    const em = db().list('dte', d => d.direccion === 'emitido' && U.month(d.fecha) === per), re = db().list('dte', d => d.direccion === 'recibido' && U.month(d.fecha) === per);
    content.querySelector('[data-k]').innerHTML = `<div class="grid grid-4">${UI.kpi({ label: 'Emitidos este mes', value: em.length, icon: 'receipt', micro: U.clp(U.sum(em, d => d.total)) })}${UI.kpi({ label: 'Recibidos este mes', value: re.length, icon: 'doc', micro: U.clp(U.sum(re, d => d.total)) })}${UI.kpi({ label: 'Rechazados', value: db().list('dte', d => d.estado === 'rechazado').length, icon: 'err', tone: db().find('dte', d => d.estado === 'rechazado') ? 'error' : 'success' })}${UI.kpi({ label: 'Por enviar (generados)', value: db().list('dte', d => d.estado === 'generado').length, icon: 'upload', tone: 'info' })}</div>`;
    const rows = db().list('dte', d => VG.store.inSeason(d));
    const tbl = UI.table(content.querySelector('[data-t]'), {
      rows, exportName: 'dte', exportPerm: 'dte', defaultSort: 'fecha',
      columns: [
        { key: 'fecha', label: 'Fecha', render: d => U.fmtDate(d.fecha) + UI.demoBadge(d) },
        { key: 'direccion', label: 'Flujo', render: d => UI.badge(d.direccion === 'emitido' ? 'Emitido' : 'Recibido', d.direccion === 'emitido' ? 'primary' : 'info') },
        { key: 'tipo', label: 'Tipo', value: d => tipoN(d.tipo), render: d => `<span title="${U.esc(tipoN(d.tipo))}">${d.tipo} · ${U.esc(tipoN(d.tipo).replace(' electrónica', '').replace(' electrónico', ''))}</span>` },
        { key: 'folio', label: 'Folio', num: true }, { key: 'contraparte', label: 'Contraparte', render: d => `${U.esc(d.contraparte || '')}<div class="text-xs muted">${U.esc(d.contraparteRut || '')}</div>` },
        { key: 'neto', label: 'Neto', num: true, render: d => U.clp(d.neto) }, { key: 'iva', label: 'IVA', num: true, render: d => U.clp(d.iva) }, { key: 'ila', label: 'ILA', num: true, render: d => U.clp(d.ila) }, { key: 'total', label: 'Total', num: true, render: d => `<b>${U.clp(d.total)}</b>` },
        { key: 'estado', label: 'Estado', render: d => UI.estadoBadge(d.estado) }
      ],
      filters: [{ key: 'direccion', label: 'Flujo', options: [['emitido', 'Emitidos'], ['recibido', 'Recibidos']] }, { key: 'tipo', label: 'Tipo', options: Object.entries(DTE().TIPOS).map(([k, v]) => [k, k + ' · ' + v]) }, { key: 'estado', label: 'Estado', options: DTE().ESTADOS }],
      onRowClick: d => ver(d, ctx),
      rowActions: d => [{ label: 'Ver documento y XML', icon: 'eye', run: () => ver(d, ctx) }, d.direccion === 'emitido' ? { label: 'Descargar XML', icon: 'download', run: () => DTE().descargarXML(d) } : null, ...(VG.auth.can('dte', 'e') ? estadosSiguientes(d).map(s => ({ label: 'Marcar ' + s, icon: s === 'rechazado' || s === 'anulado' ? 'x' : 'check', danger: s === 'rechazado' || s === 'anulado', run: async () => { await UI.run(() => DTE().cambiarEstado(d.id, s), 'Estado actualizado.'); ctx.refresh(); } })) : []), d.direccion === 'emitido' && [33, 34, 56].includes(Number(d.tipo)) && d.estado !== 'anulado' && VG.auth.can('dte', 'c') ? { label: 'Emitir nota de crédito', icon: 'receipt', run: () => nc(d, ctx) } : null].filter(Boolean),
      empty: { icon: '🧾', title: 'Sin documentos en la temporada', text: 'Los DTE se generan desde Ventas (emitidos) y Compras (recibidos).' }
    });
    const origRefresh = tbl.refresh; tbl.lastRows = rows; void origRefresh;
    if (ctx.query.id) { const d = db().get('dte', ctx.query.id); if (d) setTimeout(() => ver(d, ctx), 60); }
  }
  function estadosSiguientes(d) {
    if (d.direccion === 'recibido') return d.estado === 'aceptado' ? ['rechazado'] : ['aceptado'];
    return { borrador: ['generado'], generado: ['enviado', 'anulado'], enviado: ['aceptado', 'rechazado'], aceptado: [], rechazado: ['anulado'], anulado: [] }[d.estado] || [];
  }
  function ver(d, ctx) {
    const xml = d.xml || DTE().xml(d);
    const errs = d.direccion === 'emitido' ? DTE().validarXML(xml) : [];
    const body = U.html(`<div class="stack"><div class="grid grid-2">${UI.dl([['Tipo', d.tipo + ' · ' + U.esc(tipoN(d.tipo))], ['Folio', d.folio], ['Fecha', U.fmtDate(d.fecha)], ['Estado', UI.estadoBadge(d.estado)], d.referencia && ['Referencia', `T${d.referencia.tipo} N°${d.referencia.folio}`]])}${UI.dl([['Contraparte', U.esc(d.contraparte || '')], ['RUT', U.esc(d.contraparteRut || '')], ['Neto', U.clp(d.neto)], ['Exento', U.clp(d.exento)], ['IVA', U.clp(d.iva)], ['ILA (cód. 25)', U.clp(d.ila)], ['Total', `<b>${U.clp(d.total)}</b>`]])}</div>
      ${d.direccion === 'emitido' ? (errs.length ? UI.alert('warning', 'Revisa el XML', errs.map(U.esc).join(' · ')) : UI.alert('success', 'Estructura XML válida', 'Nodos obligatorios presentes y RUT con dígito verificador correcto. Falta el timbre (TED) y la firma, que agrega tu proveedor.')) : ''}
      <div><h3>XML</h3><pre class="xml">${U.esc(xml)}</pre></div></div>`);
    UI.modal({ title: `${tipoN(d.tipo)} N° ${d.folio}`, body, size: 'lg', foot: `<div class="right"><button class="btn" data-close>Cerrar</button>${d.direccion === 'emitido' ? '<button class="btn btn-primary" data-dl>⬇️ Descargar XML</button>' : ''}</div>` }).el.querySelector('[data-dl]')?.addEventListener('click', () => DTE().descargarXML(d));
  }
  async function nc(d, ctx) {
    const r = await UI.formModal({ title: 'Nota de crédito para T' + d.tipo + ' N°' + d.folio, values: { razon: 'Anula documento', parcial: false, monto: d.neto }, fields: [{ key: 'razon', label: 'Razón', required: true }, { key: 'parcial', label: 'Es una corrección de monto (parcial)', type: 'checkbox' }, { key: 'monto', label: 'Monto neto a acreditar', type: 'money', min: 1, max: U.n(d.neto), showIf: v => v.parcial }], onSave: v => DTE().notaCredito(d, v.razon, v.parcial ? v.monto : undefined) });
    if (r) { UI.toast(`Nota de crédito N°${r.folio} generada.`); ctx.refresh(); }
  }

  function libros(ctx) {
    const per = ctx.query.periodo || U.month(U.today());
    const content = UI.page(ctx.el, { title: 'Libro de compras y ventas', crumbs: [['Tributario'], ['DTE', '#/dte']], tabs: UI.moduleTabs(ctx), desc: 'Resumen de IVA del período: débito (ventas), crédito (compras) y resultado.', actions: [{ label: 'Imprimir / PDF', icon: 'print', run: () => window.print() }] });
    const T = VG.calc.tax, f = T.f29(per);
    content.innerHTML = `<div class="row" style="margin-bottom:16px"><label class="text-sm muted" for="per">Período</label><input type="month" class="input" id="per" value="${per}" style="width:auto"></div>
      <div class="grid grid-4">${UI.kpi({ label: 'IVA débito', value: U.clp(f.ivaDebito), icon: 'receipt', micro: f.ventas.documentos + ' documentos de venta' })}${UI.kpi({ label: 'IVA crédito', value: U.clp(f.ivaCredito), icon: 'doc', micro: f.compras.documentos + ' documentos de compra' })}${UI.kpi({ label: 'Remanente anterior', value: U.clp(f.remanenteAnterior), icon: 'history' })}${UI.kpi({ label: f.ivaPagar ? 'IVA a pagar' : 'Remanente siguiente', value: U.clp(f.ivaPagar || f.remanenteSiguiente), icon: 'scale', tone: f.ivaPagar ? 'warning' : 'success' })}</div>
      <h2 style="margin-top:24px">Libro de ventas</h2><div data-v></div><h2 style="margin-top:24px">Libro de compras</h2><div data-c></div>`;
    content.querySelector('#per').onchange = e => location.hash = '#/dte/libros?periodo=' + e.target.value;
    const cols = [{ key: 'fecha', label: 'Fecha', render: d => U.fmtDate(d.fecha) }, { key: 'tipo', label: 'Tipo', num: true }, { key: 'folio', label: 'Folio', num: true }, { key: 'contraparteRut', label: 'RUT' }, { key: 'contraparte', label: 'Razón social' }, { key: 'exento', label: 'Exento', num: true, render: d => U.clp(d.exento) }, { key: 'neto', label: 'Neto', num: true, render: d => U.clp(d.neto) }, { key: 'iva', label: 'IVA', num: true, render: d => U.clp(d.iva) }, { key: 'ila', label: 'ILA', num: true, render: d => U.clp(d.ila) }, { key: 'total', label: 'Total', num: true, render: d => U.clp(d.total) }];
    const foot = r => ({ exento: U.clp(r.exento), neto: U.clp(r.neto), iva: U.clp(r.iva), ila: U.clp(r.ila), total: U.clp(r.total), _label: 'Total (NC restan)' });
    UI.table(content.querySelector('[data-v]'), { rows: DTE().libro('emitido', per), columns: cols, exportName: 'libro_ventas_' + per, exportPerm: 'dte', footer: () => foot(f.ventas), empty: { icon: '🧾', title: 'Sin ventas en el período' } });
    UI.table(content.querySelector('[data-c]'), { rows: DTE().libro('recibido', per), columns: cols, exportName: 'libro_compras_' + per, exportPerm: 'dte', footer: () => foot(f.compras), empty: { icon: '🧾', title: 'Sin compras en el período' } });
  }

  function folios(ctx) {
    const content = UI.page(ctx.el, { title: 'Folios autorizados (CAF)', crumbs: [['Tributario'], ['DTE', '#/dte']], tabs: UI.moduleTabs(ctx), desc: 'Rangos de folios autorizados por el SII para cada tipo de documento. Se alerta al consumir el 80%.' });
    content.innerHTML = `<div class="grid grid-4">${[33, 39, 52, 61].map(t => { const f = DTE().folios(t); return `<div class="kpi ${f.pct >= 0.8 ? 'warning' : ''}"><div class="kpi-top"><span class="kpi-label">${t} · ${U.esc(tipoN(t))}</span></div><div class="kpi-value">${f.usados} / ${f.total}</div>${UI.progress(f.pct)}<div class="kpi-micro">${f.total ? (f.siguiente ? 'Próximo folio: ' + f.siguiente : 'Sin folios disponibles') : 'Sin CAF cargado'}</div></div>`; }).join('')}</div><div data-t style="margin-top:16px"></div>`;
    UI.crud(content.querySelector('[data-t]'), {
      embed: true, entity: 'caf', moduleId: 'dte', title: 'Rangos CAF', newLabel: 'Cargar rango de folios',
      fields: [{ key: 'tipo', label: 'Tipo de documento', type: 'select', options: Object.entries(DTE().TIPOS).map(([k, v]) => [k, k + ' · ' + v]), required: true }, { key: 'desde', label: 'Desde folio', type: 'number', min: 1, step: 1, required: true }, { key: 'hasta', label: 'Hasta folio', type: 'number', min: 1, step: 1, required: true, validate: (v, a) => U.n(v) < U.n(a.desde) ? 'Debe ser mayor o igual a "desde".' : '' }, { key: 'fechaAutorizacion', label: 'Fecha de autorización', type: 'date' }],
      beforeSave: d => { d.tipo = Number(d.tipo); return d; },
      columns: [{ key: 'tipo', label: 'Tipo', render: c => c.tipo + ' · ' + U.esc(tipoN(c.tipo)) }, { key: 'desde', label: 'Desde', num: true }, { key: 'hasta', label: 'Hasta', num: true }, { key: 'cant', label: 'Cantidad', num: true, value: c => c.hasta - c.desde + 1 }, { key: 'fechaAutorizacion', label: 'Autorización', render: c => U.fmtDate(c.fechaAutorizacion) }]
    });
  }

  function emisor(ctx) {
    const content = UI.page(ctx.el, { title: 'Configuración del emisor', crumbs: [['Tributario'], ['DTE', '#/dte']], tabs: UI.moduleTabs(ctx), desc: 'Datos del contribuyente usados en el XML de cada DTE.' });
    const e = VG.store.config().empresa;
    const can = VG.auth.can('configuracion', 'e') || VG.auth.can('dte', 'e');
    const form = UI.form([
      { key: 'rut', label: 'RUT emisor', type: 'rut', required: true, section: 'Contribuyente' }, { key: 'razonSocial', label: 'Razón social', required: true, section: 'Contribuyente' }, { key: 'giro', label: 'Giro', required: true, section: 'Contribuyente' }, { key: 'acteco', label: 'Actividad económica (código)', required: true, section: 'Contribuyente', help: 'Ej. 110200 Elaboración de vinos.' },
      { key: 'direccion', label: 'Dirección', required: true, section: 'Contribuyente' }, { key: 'comuna', label: 'Comuna', required: true, section: 'Contribuyente' },
      { key: 'resNumero', label: 'N° resolución SII', type: 'number', section: 'Autorización SII' }, { key: 'resFecha', label: 'Fecha resolución', type: 'date', section: 'Autorización SII' },
      { key: 'ambienteDTE', label: 'Ambiente', type: 'select', options: [['certificacion', 'Certificación (pruebas)'], ['produccion', 'Producción']], section: 'Autorización SII' },
      { key: 'certificadoVence', label: 'Vencimiento del certificado digital', type: 'date', section: 'Autorización SII', help: 'Solo referencia: el certificado no se almacena en el sistema.' }
    ], Object.assign({}, e, { resNumero: (e.resolucionSII || {}).numero, resFecha: (e.resolucionSII || {}).fecha }));
    const card = U.html('<div class="card"></div>'); card.appendChild(form.el);
    const b = U.html(`<div class="row" style="margin-top:16px"><button class="btn btn-primary" ${can ? '' : 'disabled'}>Guardar cambios</button></div>`);
    b.querySelector('button').onclick = async () => { if (!form.validate()) return UI.toast('Revisa los campos marcados.', 'warning'); const v = form.values(); await UI.run(() => VG.store.saveConfig({ empresa: { rut: v.rut, razonSocial: v.razonSocial, giro: v.giro, acteco: v.acteco, direccion: v.direccion, comuna: v.comuna, ambienteDTE: v.ambienteDTE, certificadoVence: v.certificadoVence, resolucionSII: { numero: v.resNumero, fecha: v.resFecha } } }), 'Datos del emisor guardados.'); };
    card.appendChild(b);
    content.innerHTML = UI.legal(AVISO);
    content.appendChild(card);
    if (e.certificadoVence && U.diffDays(U.today(), e.certificadoVence) < 60) content.prepend(U.html(UI.alert('warning', 'Certificado digital por vencer', 'Vence el ' + U.fmtDate(e.certificadoVence) + '.')));
  }

  VG.registry.implement('dte', { async onMount(ctx) { ({ libros, folios, emisor }[ctx.sub] || documentos)(ctx); } });
})(window.VG);
