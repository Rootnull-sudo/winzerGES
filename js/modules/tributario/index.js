/**
 * modules/tributario/index.js — Módulo 23. Planificación tributaria: F29, PPM y Renta.
 * Borradores calculados desde DTE emitidos/recibidos, remuneraciones y honorarios.
 * ⚠ Son borradores de apoyo: no reemplazan la declaración oficial ni la asesoría contable.
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui, T = () => VG.calc.tax;
  const db = () => VG.db;
  const AVISO = 'Borradores de apoyo calculados con los datos registrados. <b>No reemplazan la declaración oficial ante el SII ni la asesoría de tu contador.</b> Las tasas y plazos son configurables y deben validarse cada año.';
  const REG = { '14D3': 'Pro Pyme General (14 D N°3)', '14D8': 'Pro Pyme Transparente (14 D N°8)', '14A': 'Régimen General Semi Integrado (14 A)', '14B': 'Renta presunta / otro (14 B)' };

  function f29(ctx) {
    const per = ctx.query.periodo || T().periodoAnterior(U.month(U.today()));
    const f = T().f29(per);
    const rec = db().find('f29', x => x.periodo === per);
    const can = VG.auth.can('tributario', 'e') || VG.auth.can('tributario', 'c');
    const [y, m] = per.split('-').map(Number);
    const vence = (m === 12 ? y + 1 : y) + '-' + String(m === 12 ? 1 : m + 1).padStart(2, '0') + '-' + String(VG.store.config().tributario.diaF29).padStart(2, '0');
    const content = UI.page(ctx.el, { title: 'Formulario 29 mensual', crumbs: [['Tributario']], tabs: UI.moduleTabs(ctx), desc: `Declaración mensual de IVA, ILA, PPM y retenciones. Período ${U.monthName(per)} · vence el ${U.fmtDate(vence)}.`, actions: [{ label: 'Exportar CSV', icon: 'download', perm: ['tributario', 'x'], run: () => exportF29(f) }, { label: 'Imprimir / PDF', icon: 'print', run: () => window.print() }] });
    const line = (cod, l, v, cls = '') => `<tr class="${cls}"><td class="${cls === 'indent' ? 'indent' : ''}">${cod ? `<span class="badge" title="Código referencial F29">${cod}</span> ` : ''}${l}</td><td class="num">${U.clp(v)}</td></tr>`;
    content.innerHTML = UI.legal(AVISO) + `<div class="row" style="margin-bottom:16px"><label class="text-sm muted" for="per">Período tributario</label><input type="month" class="input" id="per" value="${per}" style="width:auto">${rec ? UI.estadoBadge(rec.estado) + (rec.folioSII ? ` <span class="text-sm muted">Folio SII ${U.esc(rec.folioSII)}</span>` : '') : UI.badge('Sin guardar', '')}<span class="grow"></span>${can ? '<button class="btn btn-primary" data-save>Guardar borrador</button>' : ''}${can && rec ? '<button class="btn" data-state>Cambiar estado</button>' : ''}</div>
      <div class="grid grid-4">${UI.kpi({ label: 'IVA débito', value: U.clp(f.ivaDebito), icon: 'receipt' })}${UI.kpi({ label: 'IVA crédito', value: U.clp(f.ivaCredito), icon: 'doc' })}${UI.kpi({ label: 'PPM', value: U.clp(f.ppm), icon: 'coins', micro: U.pct(f.tasaPPM, 2) + ' de ' + U.compactCLP(f.baseIngresosPPM) })}${UI.kpi({ label: f.total ? 'Total a pagar' : 'Sin pago', value: U.clp(f.total), icon: 'scale', tone: f.total ? 'warning' : 'success', micro: 'Vence ' + U.fmtDate(vence) })}</div>
      <div class="grid grid-2" style="margin-top:16px;align-items:start">
        <div class="card"><div class="card-head"><h3>Borrador F29 — ${U.esc(U.monthName(per))}</h3></div><table class="statement">
          <tr class="sub"><td>Débitos (ventas)</td><td></td></tr>${line('', `Ventas netas afectas (${f.ventas.documentos} docs.)`, f.ventas.neto, 'indent')}${line('', 'Ventas exentas', f.ventas.exento, 'indent')}${line('538', 'Total débito fiscal IVA', f.ivaDebito)}
          <tr class="sub"><td>Créditos (compras)</td><td></td></tr>${line('', `Compras netas afectas (${f.compras.documentos} docs.)`, f.compras.neto, 'indent')}${line('', 'Compras exentas', f.compras.exento, 'indent')}${line('537', 'Total crédito fiscal IVA', f.ivaCredito)}
          ${line('504', 'Remanente de crédito del período anterior', f.remanenteAnterior)}${line('', 'IVA determinado (débito − crédito − remanente)', f.ivaDeterminado, 'sub')}${line('89', 'IVA a pagar', f.ivaPagar)}${line('77', 'Remanente para el período siguiente', f.remanenteSiguiente)}
          ${line('', 'ILA vinos (débito − crédito)', f.ilaDebito)}${line('62', `PPM (${U.pct(f.tasaPPM, 2)} × ingresos)`, f.ppm)}${line('151', 'Retención honorarios', f.retencionHonorarios)}${line('48', 'Impuesto único trabajadores', f.impuestoUnico)}${line('91', 'Total a pagar', f.total, 'total')}
        </table><p class="text-xs muted" style="margin-top:10px">Códigos referenciales del formulario. El remanente no incluye reajuste por UTM.</p></div>
        <div class="card"><div class="card-head"><h3>F29 del año ${y}</h3></div><div data-t></div></div></div>`;
    content.querySelector('#per').onchange = e => location.hash = '#/tributario?periodo=' + e.target.value;
    const ms = U.monthsOfYear(y).filter(p => p <= U.month(U.today()));
    UI.table(content.querySelector('[data-t]'), { rows: ms.map(p => { const x = T().f29(p); const r = db().find('f29', z => z.periodo === p); return { id: p, periodo: p, iva: x.ivaPagar, ppm: x.ppm, total: x.total, estado: r ? r.estado : (db().find('obligacion', o => o.key === 'F29-' + p && o.estado === 'cumplida') ? 'declarado' : 'pendiente') }; }), search: false, pageSize: 12, onRowClick: r => location.hash = '#/tributario?periodo=' + r.periodo, columns: [{ key: 'periodo', label: 'Período', render: r => `<a href="#/tributario?periodo=${r.periodo}">${U.monthName(r.periodo)}</a>` }, { key: 'iva', label: 'IVA', num: true, render: r => U.clp(r.iva) }, { key: 'ppm', label: 'PPM', num: true, render: r => U.clp(r.ppm) }, { key: 'total', label: 'Total', num: true, render: r => U.clp(r.total) }, { key: 'estado', label: 'Estado', render: r => UI.estadoBadge(r.estado) }], footer: rs => ({ iva: U.clp(U.sum(rs, r => r.iva)), ppm: U.clp(U.sum(rs, r => r.ppm)), total: U.clp(U.sum(rs, r => r.total)) }) });
    const sb = content.querySelector('[data-save]');
    if (sb) sb.onclick = async () => { await UI.run(() => db().save('f29', Object.assign(rec || {}, { periodo: per, estado: rec ? rec.estado : 'borrador', snapshot: f })), 'Borrador F29 guardado.'); ctx.refresh(); };
    const stb = content.querySelector('[data-state]');
    if (stb) stb.onclick = async () => {
      const r = await UI.formModal({ title: 'Estado del F29 ' + U.monthName(per), values: { estado: rec.estado, folioSII: rec.folioSII, fechaPago: U.today() }, fields: [{ key: 'estado', label: 'Estado', type: 'select', options: [['borrador', 'Borrador'], ['revisado', 'Revisado por contador'], ['declarado', 'Declarado'], ['pagado', 'Pagado']], required: true }, { key: 'folioSII', label: 'Folio SII de la declaración', showIf: v => ['declarado', 'pagado'].includes(v.estado) }, { key: 'fechaPago', label: 'Fecha de pago', type: 'date', showIf: v => v.estado === 'pagado' }], onSave: async v => {
        const x = await db().save('f29', Object.assign({}, rec, { estado: v.estado, folioSII: v.folioSII, snapshot: f }));
        if (v.estado === 'pagado' && !db().find('pagoImpuesto', p => p.tipo === 'F29' && p.periodo === per)) { await db().save('pagoImpuesto', { tipo: 'F29', periodo: per, fecha: v.fechaPago, monto: f.total, folioSII: v.folioSII }); await db().save('pagoImpuesto', { tipo: 'PPM', periodo: per, fecha: v.fechaPago, monto: f.ppm, incluidoEnF29: true }); }
        if (['declarado', 'pagado'].includes(v.estado)) { const o = db().find('obligacion', z => z.key === 'F29-' + per); await db().save('obligacion', Object.assign(o || {}, { key: 'F29-' + per, estado: 'cumplida', folio: v.folioSII })); }
        return x;
      } });
      if (r) { UI.toast('Estado actualizado.'); ctx.refresh(); }
    };
  }
  function exportF29(f) {
    const rows = [['Concepto', 'Monto'], ['Período', f.periodo], ['Ventas netas', f.ventas.neto], ['IVA débito', f.ivaDebito], ['Compras netas', f.compras.neto], ['IVA crédito', f.ivaCredito], ['Remanente anterior', f.remanenteAnterior], ['IVA a pagar', f.ivaPagar], ['Remanente siguiente', f.remanenteSiguiente], ['ILA', f.ilaDebito], ['PPM', f.ppm], ['Retención honorarios', f.retencionHonorarios], ['Impuesto único', f.impuestoUnico], ['Total a pagar', f.total]];
    U.download('F29_' + f.periodo + '.csv', '﻿' + rows.map(r => r.join(';')).join('\r\n')); UI.toast('F29 exportado.');
  }

  function ppm(ctx) {
    const y = VG.store.state.season, p = T().ppmAnual(y);
    const content = UI.page(ctx.el, { title: 'Pagos provisionales mensuales (PPM)', crumbs: [['Tributario'], ['F29', '#/tributario']], tabs: UI.moduleTabs(ctx), desc: `PPM = ingresos netos del mes × tasa (${U.pct(VG.store.config().tributario.tasaPPM, 2)}). Se imputan como crédito contra el impuesto de primera categoría en la Renta.` });
    const proy = p.total / Math.max(1, p.porMes.filter(x => x).length) * 12;
    content.innerHTML = UI.legal(AVISO) + `<div class="grid grid-3">${UI.kpi({ label: 'PPM acumulado ' + y, value: U.clp(p.total), icon: 'coins' })}${UI.kpi({ label: 'PPM pagado', value: U.clp(p.pagados), icon: 'bank' })}${UI.kpi({ label: 'Proyección anual', value: U.clp(proy), icon: 'chart', micro: 'Promedio mensual × 12' })}</div><div class="card" style="margin-top:16px"><div class="card-head"><h3>PPM por mes</h3></div><div data-c></div></div><div data-t style="margin-top:16px"></div>`;
    VG.charts.bar(content.querySelector('[data-c]'), { labels: p.meses.map(U.monthName), series: [{ name: 'PPM', data: p.porMes }], yFmt: U.compactCLP, tipFmt: U.clp, height: 200 });
    UI.table(content.querySelector('[data-t]'), { rows: p.meses.map((m, i) => { const pg = db().find('pagoImpuesto', x => x.tipo === 'PPM' && x.periodo === m); return { id: m, mes: m, base: T().f29(m).baseIngresosPPM, ppm: p.porMes[i], pagado: pg ? pg.monto : 0, fecha: pg ? pg.fecha : '' }; }), search: false, pageSize: 12, columns: [{ key: 'mes', label: 'Período', render: r => U.monthName(r.mes) }, { key: 'base', label: 'Ingresos netos', num: true, render: r => U.clp(r.base) }, { key: 'ppm', label: 'PPM calculado', num: true, render: r => U.clp(r.ppm) }, { key: 'pagado', label: 'Pagado', num: true, render: r => r.pagado ? U.clp(r.pagado) : '—' }, { key: 'fecha', label: 'Fecha pago', render: r => U.fmtDate(r.fecha) }], footer: rs => ({ base: U.clp(U.sum(rs, r => r.base)), ppm: U.clp(U.sum(rs, r => r.ppm)), pagado: U.clp(U.sum(rs, r => r.pagado)) }) });
  }

  function renta(ctx) {
    const anio = Number(ctx.query.anio || (VG.store.state.season - (new Date().getMonth() < 4 ? 1 : 0)));
    const r = T().renta(anio);
    const rec = db().find('renta', x => Number(x.anioComercial) === anio);
    const t = VG.store.config().tributario;
    const content = UI.page(ctx.el, { title: 'Declaración de Renta anual', crumbs: [['Tributario'], ['F29', '#/tributario']], tabs: UI.moduleTabs(ctx), desc: `Año comercial ${anio} · Año tributario ${anio + 1} · ${REG[t.regimen] || t.regimen}. Plazo: ${t.diaRenta} de ${U.MESES[t.mesRenta - 1].toLowerCase()} de ${anio + 1}.`, actions: [{ label: 'Imprimir / PDF', icon: 'print', run: () => window.print() }] });
    content.innerHTML = UI.legal(AVISO) + `<div class="row" style="margin-bottom:16px"><label class="text-sm muted" for="an">Año comercial</label><select class="select" id="an" style="width:auto">${[anio + 1, anio, anio - 1, anio - 2].map(a => `<option ${a === anio ? 'selected' : ''}>${a}</option>`).join('')}</select>${rec ? UI.estadoBadge(rec.estado) + (rec.folioSII ? ` <span class="text-sm muted">${U.esc(rec.folioSII)}</span>` : '') : ''}<span class="grow"></span>${VG.auth.can('tributario', 'e') ? '<button class="btn btn-primary" data-save>Guardar borrador</button>' : ''}</div>
      <div class="grid grid-4">${UI.kpi({ label: 'Renta líquida imponible', value: U.compactCLP(r.rli), icon: 'scale' })}${UI.kpi({ label: 'IDPC (' + U.pct(r.tasa, 0) + ')', value: U.clp(r.idpc), icon: 'receipt' })}${UI.kpi({ label: 'Crédito por PPM', value: U.clp(r.ppm), icon: 'coins' })}${UI.kpi({ label: r.aPagar ? 'Impuesto a pagar' : 'Devolución estimada', value: U.clp(r.aPagar || r.devolucion), icon: 'money', tone: r.aPagar ? 'warning' : 'success' })}</div>
      <div class="grid grid-2" style="margin-top:16px;align-items:start"><div class="card"><div class="card-head"><h3>Determinación</h3></div><table class="statement"><tr><td>Resultado financiero antes de impuestos</td><td>${U.clp(r.resultadoFinanciero)}</td></tr><tr><td class="indent">+ Agregados (gastos rechazados / no deducibles)</td><td>${U.clp(r.agregados)}</td></tr><tr><td class="indent">− Deducciones</td><td>${U.clp(r.deducciones)}</td></tr><tr class="sub"><td>Renta líquida imponible (RLI)</td><td>${U.clp(r.rli)}</td></tr><tr><td>Impuesto de primera categoría (${U.pct(r.tasa, 0)})</td><td>${U.clp(r.idpc)}</td></tr><tr><td class="indent">− PPM del año</td><td>${U.clp(r.ppm)}</td></tr><tr class="total"><td>${r.resultado >= 0 ? 'Saldo a pagar' : 'Saldo a devolver'}</td><td>${U.clp(Math.abs(r.resultado))}</td></tr></table></div>
      <div class="card"><div class="card-head"><h3>Conciliación financiero / tributario</h3></div>${UI.dl([['Utilidad financiera (antes de impuestos)', U.clp(r.conciliacion.utilidadFinanciera)], ['+ Gastos rechazados', U.clp(r.conciliacion.masGastosRechazados)], ['= RLI', `<b>${U.clp(r.conciliacion.rentaLiquidaImponible)}</b>`], ['Provisión de impuesto en resultados', U.clp(VG.calc.financial.estadoResultados({ desde: anio + '-01-01', hasta: anio + '-12-31' }).impuesto)]])}<p class="text-xs muted" style="margin-top:12px">En el régimen Pro Pyme General la base es la renta efectiva; para retiros y dividendos, créditos por IDPC y otras partidas (corrección, depreciación instantánea, etc.) consulta a tu contador.</p></div></div>`;
    content.querySelector('#an').onchange = e => location.hash = '#/tributario/renta?anio=' + e.target.value;
    const sb = content.querySelector('[data-save]');
    if (sb) sb.onclick = async () => { await UI.run(() => db().save('renta', Object.assign(rec || {}, { anioComercial: anio, anioTributario: anio + 1, estado: rec ? rec.estado : 'borrador', snapshot: r })), 'Borrador de Renta guardado.'); ctx.refresh(); };
  }

  function calendario(ctx) {
    const y = Number(ctx.query.anio || new Date().getFullYear());
    const items = T().calendario(y);
    const content = UI.page(ctx.el, { title: 'Calendario tributario ' + y, crumbs: [['Tributario'], ['F29', '#/tributario']], tabs: UI.moduleTabs(ctx), desc: 'F29 y PPM, Renta, patentes municipal y de alcoholes, contribuciones y declaraciones SAG. Marca cada obligación al cumplirla.' });
    content.innerHTML = `<div class="row" style="margin-bottom:12px"><a class="btn btn-sm" href="#/tributario/calendario?anio=${y - 1}">‹ ${y - 1}</a><a class="btn btn-sm" href="#/tributario/calendario?anio=${y + 1}">${y + 1} ›</a></div><div class="card cal-list">${items.map(i => `<div class="cal-item"><div><b>${U.fmtDate(i.fecha)}</b><div class="text-xs muted">${i.estado === 'cumplida' ? 'Cumplida' : i.dias < 0 ? 'Hace ' + -i.dias + ' días' : 'En ' + i.dias + ' días'}</div></div><div>${UI.badge(i.tipo, 'primary')} ${U.esc(i.nombre)}${i.folio ? ` <span class="text-xs muted">Folio ${U.esc(i.folio)}</span>` : ''}</div><div class="row">${UI.estadoBadge(i.estado === 'pendiente' && i.dias <= 10 ? 'por vencer' : i.estado)}${VG.auth.can('tributario', 'e') ? `<button class="btn btn-sm" data-k="${U.esc(i.key)}">${i.estado === 'cumplida' ? 'Desmarcar' : 'Marcar cumplida'}</button>` : ''}</div></div>`).join('')}</div>`;
    content.querySelectorAll('[data-k]').forEach(b => b.onclick = async () => { const o = db().find('obligacion', x => x.key === b.dataset.k); await db().save('obligacion', Object.assign(o || {}, { key: b.dataset.k, estado: o && o.estado === 'cumplida' ? 'pendiente' : 'cumplida', fecha: U.today() })); ctx.refresh(); });
  }

  function config(ctx) {
    const content = UI.page(ctx.el, { title: 'Configuración tributaria', crumbs: [['Tributario'], ['F29', '#/tributario']], tabs: UI.moduleTabs(ctx), desc: 'Régimen, tasas y plazos. Revisa estos valores al inicio de cada año con tu contador.' });
    const t = VG.store.config().tributario, r = VG.store.config().remuneraciones;
    const form = UI.form([
      { key: 'regimen', label: 'Régimen tributario', type: 'select', options: Object.entries(REG), required: true, section: 'Régimen', onChangeSet: v => ({ tasaIDPC: v.regimen === '14A' ? 27 : 25, tasaPPM: v.regimen === '14D8' ? 0.2 : v.regimen === '14D3' ? 0.25 : v.tasaPPM }) },
      { key: 'tasaIDPC', label: 'Tasa impuesto primera categoría', type: 'number', unit: '%', min: 0, max: 40, step: 0.1, required: true, section: 'Régimen', help: 'Pro Pyme 25% (con rebajas transitorias según la ley vigente); general 27%.' },
      { key: 'tasaPPM', label: 'Tasa PPM', type: 'number', unit: '%', min: 0, max: 10, step: 0.01, required: true, section: 'Régimen', help: 'Referencial: 14 D N°3 0,25%; 14 D N°8 0,2%; 14 A según el año anterior.' },
      { key: 'tasaIVA', label: 'IVA', type: 'number', unit: '%', min: 0, max: 30, step: 0.1, required: true, section: 'Impuestos' },
      { key: 'ilaActivo', label: 'Aplicar ILA a ventas de vino', type: 'checkbox', section: 'Impuestos', help: 'Impuesto adicional a las bebidas alcohólicas (DL 825, art. 42), código 25 en el DTE.' },
      { key: 'tasaILA', label: 'Tasa ILA vinos', type: 'number', unit: '%', min: 0, max: 50, step: 0.1, section: 'Impuestos', showIf: v => v.ilaActivo },
      { key: 'retencionHonorarios', label: 'Retención boletas de honorarios', type: 'number', unit: '%', min: 0, max: 30, step: 0.01, section: 'Impuestos' },
      { key: 'diaF29', label: 'Día de vencimiento F29', type: 'select', options: [['20', '20 (facturación electrónica)'], ['12', '12 (papel)']], section: 'Plazos' },
      { key: 'remanenteInicial', label: 'Remanente de crédito fiscal inicial', type: 'money', min: 0, section: 'Plazos' },
      { key: 'utm', label: 'Valor UTM', type: 'money', min: 1, section: 'Remuneraciones' }, { key: 'uf', label: 'Valor UF', type: 'money', min: 1, section: 'Remuneraciones' }, { key: 'imm', label: 'Ingreso mínimo mensual', type: 'money', min: 1, section: 'Remuneraciones' },
      { key: 'afp', label: 'Tasa AFP por defecto (10% + comisión)', type: 'number', unit: '%', min: 10, max: 13, step: 0.01, section: 'Remuneraciones' }, { key: 'sis', label: 'Seguro de invalidez y sobrevivencia (SIS)', type: 'number', unit: '%', min: 0, max: 5, step: 0.01, section: 'Remuneraciones' }, { key: 'aporteEmpleadorPension', label: 'Aporte previsional del empleador', type: 'number', unit: '%', min: 0, max: 10, step: 0.01, section: 'Remuneraciones' }
    ], { regimen: t.regimen, tasaIDPC: t.tasaIDPC * 100, tasaPPM: U.round(t.tasaPPM * 100, 4), tasaIVA: t.tasaIVA * 100, ilaActivo: t.ilaActivo, tasaILA: t.tasaILA * 100, retencionHonorarios: U.round(t.retencionHonorarios * 100, 4), diaF29: String(t.diaF29), remanenteInicial: t.remanenteInicial, utm: r.utm, uf: r.uf, imm: r.imm, afp: U.round(r.afp * 100, 4), sis: U.round(r.sis * 100, 4), aporteEmpleadorPension: U.round(r.aporteEmpleadorPension * 100, 4) });
    const card = U.html('<div class="card"></div>'); card.appendChild(form.el);
    const can = VG.auth.can('tributario', 'e') || VG.auth.can('configuracion', 'e');
    const b = U.html(`<div class="row" style="margin-top:16px"><button class="btn btn-primary" ${can ? '' : 'disabled'}>Guardar configuración</button></div>`); card.appendChild(b);
    b.querySelector('button').onclick = async () => { if (!form.validate()) return; const v = form.values(); await UI.run(() => VG.store.saveConfig({ tributario: { regimen: v.regimen, tasaIDPC: v.tasaIDPC / 100, tasaPPM: v.tasaPPM / 100, tasaIVA: v.tasaIVA / 100, ilaActivo: v.ilaActivo, tasaILA: v.tasaILA / 100, retencionHonorarios: v.retencionHonorarios / 100, diaF29: Number(v.diaF29), remanenteInicial: v.remanenteInicial }, remuneraciones: { utm: v.utm, uf: v.uf, imm: v.imm, afp: v.afp / 100, sis: v.sis / 100, aporteEmpleadorPension: v.aporteEmpleadorPension / 100 } }), 'Configuración guardada. Los borradores se recalculan automáticamente.'); };
    content.innerHTML = UI.legal(AVISO); content.appendChild(card);
  }

  VG.registry.implement('tributario', { async onMount(ctx) { ({ ppm, renta, calendario, config }[ctx.sub] || f29)(ctx); } });
})(window.VG);
