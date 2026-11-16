/**
 * modules/costos/index.js — Módulo 16. Costos y estructura por botella / litro.
 * Costo directo del vino por lote (uva, cosecha, insumos agrícolas prorrateados por kg,
 * insumos enológicos), costo de envasado por formato con desglose %, costos indirectos
 * del período y costo promedio ponderado por litro. Activos fijos y depreciación.
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui, F = () => VG.calc.financial;
  const db = () => VG.db;

  function resumen(ctx) {
    const y = VG.store.state.season, p = F().periodoAnio(y);
    const content = UI.page(ctx.el, { title: 'Costos por botella y litro', crumbs: [['Finanzas']], tabs: UI.moduleTabs(ctx), desc: 'Costo directo de cada lote y costo unitario por formato. Los costos indirectos (sueldos, gastos generales, depreciación) se muestran por separado y se prorratean por litro vendido.', actions: [{ label: 'Imprimir / PDF', icon: 'print', run: () => window.print() }] });
    const lotes = db().list('lote').filter(l => F().costoLitroLote(l.id).litros > 0).sort((a, b) => b.temporada - a.temporada);
    const ords = db().list('ordenEnvasado', o => o.estado === 'confirmada');
    const er = F().estadoResultados(p);
    const indirectos = er.gav + er.indirectos + er.dep + er.amort + er.gFin;
    const litrosV = er.litros || 1;
    const formatos = db().list('formato').map(f => {
      const os = ords.filter(o => o.formatoId === f.id); const u = U.sum(os, o => o.unidades);
      const partes = {}; ['vino', 'envase', 'etiqueta', 'capsula', 'cierre', 'caja', 'manoObra', 'energia'].forEach(k => partes[k] = u ? U.sum(os, o => U.n((o.costoPartes || {})[k]) * o.unidades) / u : 0);
      const unit = U.sum(Object.values(partes));
      const ind = indirectos / litrosV * U.n(f.litros);
      const pf = F().porFormato(p)[f.id] || {};
      return { f, u, partes, unit, ind, full: unit + ind, precio: pf.precioProm || 0 };
    }).filter(x => x.u);
    const totLitros = U.sum(lotes, l => F().costoLitroLote(l.id).litros), totCosto = U.sum(lotes, l => F().costoLitroLote(l.id).total);
    content.innerHTML = `<div class="grid grid-4">
        ${UI.kpi({ label: 'Costo promedio ponderado', value: U.clp(totLitros ? totCosto / totLitros : 0) + '/L', icon: 'drop', micro: 'Costo directo de todos los lotes' })}
        ${UI.kpi({ label: 'Costos indirectos ' + y, value: U.compactCLP(indirectos), icon: 'briefcase', micro: 'GAV + indirectos + dep. + financieros' })}
        ${UI.kpi({ label: 'Indirecto por litro vendido', value: U.clp(indirectos / litrosV), icon: 'chart', micro: U.int(er.litros) + ' L vendidos en ' + y })}
        ${UI.kpi({ label: 'Costo de ventas ' + y, value: U.compactCLP(er.cogs), icon: 'coins', micro: 'Costo directo de lo vendido' })}
      </div>
      <h2 style="margin-top:24px">Costo por formato</h2>
      <div class="grid grid-2" data-fmts></div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h3>Comparativa entre formatos (por litro)</h3></div><p class="card-desc">Costo directo y costo total (con indirectos prorrateados) por litro, frente al precio promedio de venta por litro.</p><div data-cmp></div></div>
      <h2 style="margin-top:24px">Costo directo por lote</h2><div data-lotes></div>`;
    const wrap = content.querySelector('[data-fmts]');
    const NAMES = { vino: 'Vino', envase: 'Envase', etiqueta: 'Etiqueta', capsula: 'Cápsula', cierre: 'Cierre', caja: 'Caja', manoObra: 'Mano de obra', energia: 'Energía/agua' };
    formatos.forEach(x => {
      const c = U.html(`<div class="card"><div class="card-head"><h3>${U.esc(x.f.nombre)}</h3>${UI.badge(U.int(x.u) + ' unidades', 'info')}</div>
        <div class="grid grid-3" style="margin-bottom:12px"><div><div class="kpi-label">Costo directo</div><div class="kpi-value" style="font-size:20px">${U.clp(x.unit)}</div></div><div><div class="kpi-label">+ Indirectos</div><div class="kpi-value" style="font-size:20px">${U.clp(x.ind)}</div></div><div><div class="kpi-label">Costo total</div><div class="kpi-value" style="font-size:20px">${U.clp(x.full)}</div></div></div>
        <div data-s></div>${x.precio ? `<p class="text-sm" style="margin:10px 0 0">Precio promedio neto: <b>${U.clp(x.precio)}</b> · Margen sobre costo total: <b class="${x.precio - x.full < 0 ? 'text-error' : 'text-success'}">${U.pct((x.precio - x.full) / x.precio)}</b></p>` : ''}</div>`);
      wrap.appendChild(c);
      VG.charts.stack(c.querySelector('[data-s]'), { items: Object.entries(x.partes).map(([k, v]) => ({ label: NAMES[k], value: v })), fmt: U.clp });
    });
    if (!formatos.length) wrap.innerHTML = '<div class="card">' + UI.empty({ icon: '🍾', title: 'Sin órdenes de envasado confirmadas', text: 'Confirma órdenes para ver el costo por formato.' }) + '</div>';
    VG.charts.bar(content.querySelector('[data-cmp]'), { labels: formatos.map(x => x.f.nombre), series: [{ name: 'Costo directo/L', data: formatos.map(x => x.unit / x.f.litros) }, { name: 'Costo total/L', data: formatos.map(x => x.full / x.f.litros) }, { name: 'Precio/L', data: formatos.map(x => x.precio / x.f.litros) }], yFmt: U.compactCLP, tipFmt: U.clp, height: 220 });
    UI.table(content.querySelector('[data-lotes]'), {
      rows: lotes.map(l => Object.assign({ id: l.id, lote: l }, F().costoLitroLote(l.id))), exportName: 'costo_por_lote', exportPerm: 'costos', search: false,
      columns: [{ key: 'lote', label: 'Lote', value: r => r.lote.codigo, render: r => `<b>${U.esc(r.lote.codigo)}</b> ${UI.tipoBadge(r.lote.tipo)}` }, { key: 'litros', label: 'Litros', num: true, render: r => U.int(r.litros) }, { key: 'cosecha', label: 'Cosecha', num: true, value: r => r.partes.cosecha, render: r => U.clp(r.partes.cosecha) }, { key: 'agricola', label: 'Campo (prorrateado)', num: true, value: r => r.partes.agricola, render: r => U.clp(r.partes.agricola) }, { key: 'enologico', label: 'Enológico', num: true, value: r => r.partes.enologico, render: r => U.clp(r.partes.enologico) }, { key: 'comprada', label: 'Uva comprada', num: true, value: r => r.partes.comprada, render: r => U.clp(r.partes.comprada) }, { key: 'total', label: 'Total', num: true, render: r => U.clp(r.total) }, { key: 'costoLitro', label: '$/L', num: true, render: r => `<b>${U.clp(r.costoLitro)}</b>` }, { key: 'pct', label: 'Campo/Cosecha/Enol.', sort: false, render: r => `<div class="cost-bar" style="width:140px">${[['agricola', 'var(--chart-5)'], ['cosecha', 'var(--chart-3)'], ['enologico', 'var(--chart-1)'], ['comprada', 'var(--chart-2)']].map(([k, c]) => r.total ? `<span style="width:${r.partes[k] / r.total * 100}%;background:${c}" title="${k} ${U.pct(r.partes[k] / r.total)}"></span>` : '').join('')}</div>` }]
    });
  }

  function activos(ctx) {
    UI.crud(ctx.el, {
      entity: 'activo', moduleId: 'costos', title: 'Activos fijos y depreciación', crumbs: [['Finanzas'], ['Costos', '#/costos']], tabs: UI.moduleTabs(ctx),
      desc: 'Depreciación lineal: valor / vida útil. Se incluye en el estado de resultados como costo indirecto.',
      newLabel: 'Nuevo activo', emptyIcon: '🏭',
      fields: [{ key: 'nombre', label: 'Activo', required: true }, { key: 'valor', label: 'Valor de compra (neto)', type: 'money', min: 0, required: true }, { key: 'vidaUtil', label: 'Vida útil', type: 'number', unit: 'años', min: 1, max: 80, required: true, help: 'Referencia: tabla de vida útil del SII (normal).' }, { key: 'fechaCompra', label: 'Fecha de compra', type: 'date', required: true }],
      columns: [{ key: 'nombre', label: 'Activo', render: a => `<b>${U.esc(a.nombre)}</b>${UI.demoBadge(a)}` }, { key: 'fechaCompra', label: 'Compra', render: a => U.fmtDate(a.fechaCompra) }, { key: 'valor', label: 'Valor', num: true, render: a => U.clp(a.valor) }, { key: 'vidaUtil', label: 'Vida útil', num: true, render: a => a.vidaUtil + ' años' }, { key: 'anual', label: 'Dep. anual', num: true, value: a => U.n(a.valor) / U.n(a.vidaUtil), render: a => U.clp(U.n(a.valor) / U.n(a.vidaUtil)) }, { key: 'acum', label: 'Dep. acumulada', num: true, value: a => Math.min(U.n(a.valor), U.n(a.valor) / U.n(a.vidaUtil) * (U.diffDays(a.fechaCompra, U.today()) / 365)), render: a => U.clp(Math.min(U.n(a.valor), U.n(a.valor) / U.n(a.vidaUtil) * (U.diffDays(a.fechaCompra, U.today()) / 365))) }, { key: 'neto', label: 'Valor libro', num: true, value: a => Math.max(0, U.n(a.valor) - U.n(a.valor) / U.n(a.vidaUtil) * (U.diffDays(a.fechaCompra, U.today()) / 365)), render: a => U.clp(Math.max(0, U.n(a.valor) - U.n(a.valor) / U.n(a.vidaUtil) * (U.diffDays(a.fechaCompra, U.today()) / 365))) }],
      footer: rs => ({ valor: U.clp(U.sum(rs, a => a.valor)), anual: U.clp(U.sum(rs, a => U.n(a.valor) / U.n(a.vidaUtil))) })
    });
  }

  VG.registry.implement('costos', { async onMount(ctx) { (ctx.sub === 'activos' ? activos : resumen)(ctx); } });
})(window.VG);
