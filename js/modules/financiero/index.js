/**
 * modules/financiero/index.js — Módulo 17. Financiero: estado de resultados, ratios con
 * semáforo, punto de equilibrio (litros, unidades, pesos), simulador "¿qué pasa si…?",
 * flujo de caja con IVA y PPM, rankings, matriz BCG simplificada y resumen ejecutivo.
 * Todas las fórmulas están documentadas en js/calc/financial.js.
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui, F = () => VG.calc.financial;
  const db = () => VG.db;

  /** Período seleccionado: año de la temporada o un mes (?mes=YYYY-MM). */
  function periodo(ctx) {
    const y = VG.store.state.season;
    if (ctx.query.mes) return { p: F().periodoMes(ctx.query.mes), label: U.monthName(ctx.query.mes), prev: F().periodoMes(VG.calc.tax.periodoAnterior(ctx.query.mes)) };
    return { p: F().periodoAnio(y), label: 'Año ' + y, prev: F().periodoAnio(y - 1) };
  }
  function selector(ctx) {
    const y = VG.store.state.season;
    return `<div class="row no-print" style="margin-bottom:16px"><label class="text-sm muted" for="per">Período</label><select class="select" id="per" style="width:auto"><option value="">Año ${y} completo</option>${U.monthsOfYear(y).map(m => `<option value="${m}" ${ctx.query.mes === m ? 'selected' : ''}>${U.MESES[Number(m.slice(5)) - 1]} ${y}</option>`).join('')}</select></div>`;
  }
  function bindSel(ctx, el) { const s = el.querySelector('#per'); if (s) s.onchange = () => { location.hash = '#/financiero' + (ctx.sub ? '/' + ctx.sub : '') + (s.value ? '?mes=' + s.value : ''); }; }
  const delta = (a, b) => b ? (a - b) / Math.abs(b) : null;

  function resultados(ctx) {
    const { p, label, prev } = periodo(ctx);
    const er = F().estadoResultados(p), ep = F().estadoResultados(prev);
    const content = UI.page(ctx.el, { title: 'Estado de resultados', crumbs: [['Finanzas']], tabs: UI.moduleTabs(ctx), desc: `${label}. Montos netos (sin IVA ni ILA). El costo de ventas usa el costo unitario real de cada venta.`, actions: [{ label: 'Exportar CSV', icon: 'download', perm: ['financiero', 'x'], run: () => exportER(er, label) }, { label: 'Imprimir / PDF', icon: 'print', run: () => window.print() }] });
    const pct = v => er.ingresos ? U.pct(v / er.ingresos) : '—';
    const row = (l, v, cls = '', vp) => `<tr class="${cls}"><td class="${cls === 'indent' ? 'indent' : ''}">${l}</td><td class="num">${U.clp(v)}</td><td class="num muted">${pct(v)}</td><td class="num muted">${vp !== undefined ? U.clp(vp) : ''}</td></tr>`;
    content.innerHTML = selector(ctx) + `<div class="grid grid-4">
      ${UI.kpi({ label: 'Ingresos', value: U.compactCLP(er.ingresos), icon: 'money', delta: delta(er.ingresos, ep.ingresos), micro: 'vs período anterior' })}
      ${UI.kpi({ label: 'Margen bruto', value: pct(er.mb), icon: 'chart', delta: delta(er.mb, ep.mb), micro: U.compactCLP(er.mb) })}
      ${UI.kpi({ label: 'EBITDA', value: U.compactCLP(er.ebitda), icon: 'coins', tone: er.ebitda < 0 ? 'error' : '', micro: pct(er.ebitda) + ' de los ingresos' })}
      ${UI.kpi({ label: 'Utilidad neta', value: U.compactCLP(er.un), icon: 'star', tone: er.un < 0 ? 'error' : 'success', delta: delta(er.un, ep.un), micro: pct(er.un) + ' margen neto' })}
    </div>
    <div class="grid grid-2" style="margin-top:16px;align-items:start">
      <div class="card"><table class="statement"><thead><tr><th style="text-align:left">Concepto</th><th class="num">${U.esc(label)}</th><th class="num">%</th><th class="num">Anterior</th></tr></thead><tbody>
        ${row('Ingresos por ventas', er.ingresos, 'sub', ep.ingresos)}${row('Envasado', er.ingEnv, 'indent', ep.ingEnv)}${row('Granel', er.ingGranel, 'indent', ep.ingGranel)}
        ${row('(−) Costo de ventas (COGS)', -er.cogs, '', -ep.cogs)}${row('Margen bruto', er.mb, 'sub', ep.mb)}
        ${row('(−) Gastos de administración y ventas', -er.gav, '', -ep.gav)}${row('Gastos generales', -er.gastosAdmin, 'indent')}${row('Remuneraciones adm. y ventas', -(er.remuneraciones.admin + er.remuneraciones.ventas), 'indent')}${row('Honorarios', -er.remuneraciones.honorarios, 'indent')}
        ${row('(−) Gastos indirectos de producción', -er.indirectos, '', -ep.indirectos)}${row('EBITDA', er.ebitda, 'sub', ep.ebitda)}
        ${row('(−) Depreciación y amortización', -(er.dep + er.amort), '', -(ep.dep + ep.amort))}${row('EBIT (resultado operacional)', er.ebit, 'sub', ep.ebit)}
        ${row('(−) Gastos financieros', -er.gFin, '', -ep.gFin)}${row('Utilidad antes de impuestos', er.uai, 'sub', ep.uai)}
        ${row(`(−) Impuesto a la renta (${U.pct(VG.store.config().tributario.tasaIDPC, 0)})`, -er.impuesto, '', -ep.impuesto)}${row('Utilidad neta', er.un, 'total', ep.un)}
      </tbody></table><p class="text-xs muted" style="margin:10px 0 0">El impuesto es una provisión financiera; el cálculo tributario (RLI, agregados) está en Tributario › Renta.</p></div>
      <div class="stack"><div class="card"><div class="card-head"><h3>Ingresos por canal</h3></div><div data-c1></div></div><div class="card"><div class="card-head"><h3>Ingresos, costos y utilidad por mes</h3></div><p class="card-desc">Utilidad operacional mensual = ingresos − costo de ventas − gastos del mes.</p><div data-c2></div></div></div>
    </div>`;
    bindSel(ctx, content);
    VG.charts.hbar(content.querySelector('[data-c1]'), { items: Object.entries(er.porCanal).map(([k, v]) => ({ label: { granel: 'Granel', distribuidor: 'Distribuidor', restaurante: 'Restaurante', directa: 'Directa', ecommerce: 'E-commerce' }[k] || k, value: v })).sort((a, b) => b.value - a.value), fmt: U.compactCLP });
    const y = VG.store.state.season, meses = U.monthsOfYear(y);
    const ms = meses.map(m => F().estadoResultados(F().periodoMes(m)));
    VG.charts.bar(content.querySelector('[data-c2]'), { labels: meses.map(U.monthName), series: [{ name: 'Ingresos', data: ms.map(x => x.ingresos) }, { name: 'Costos y gastos', data: ms.map(x => x.cogs + x.gav + x.indirectos + x.dep + x.amort + x.gFin) }, { name: 'Utilidad antes de impuestos', data: ms.map(x => x.uai) }], yFmt: U.compactCLP, tipFmt: U.clp, height: 220 });
  }
  function exportER(er, label) {
    const rows = [['Concepto', label], ['Ingresos', er.ingresos], ['Envasado', er.ingEnv], ['Granel', er.ingGranel], ['Costo de ventas', -er.cogs], ['Margen bruto', er.mb], ['Gastos adm. y ventas', -er.gav], ['Gastos indirectos', -er.indirectos], ['EBITDA', er.ebitda], ['Depreciación y amortización', -(er.dep + er.amort)], ['EBIT', er.ebit], ['Gastos financieros', -er.gFin], ['Utilidad antes de impuestos', er.uai], ['Impuesto', -er.impuesto], ['Utilidad neta', er.un]];
    U.download('estado_resultados.csv', '﻿' + rows.map(r => r.map(x => typeof x === 'number' ? Math.round(x) : x).join(';')).join('\r\n'));
    UI.toast('Estado de resultados exportado.');
  }

  function ratios(ctx) {
    const { p, label } = periodo(ctx);
    const r = F().ratios(p);
    const content = UI.page(ctx.el, { title: 'Ratios financieros', crumbs: [['Finanzas'], ['Financiero', '#/financiero']], tabs: UI.moduleTabs(ctx), desc: `${label}. Semáforo: verde = saludable, amarillo = atención, rojo = crítico. Pasa el cursor por el "?" para ver la fórmula.`, actions: [{ label: 'Exportar CSV', icon: 'download', perm: ['financiero', 'x'], run: () => { U.download('ratios.csv', U.toCSV(r.list, [{ label: 'Ratio', key: 'label' }, { label: 'Valor', csv: x => U.round(x.value, 4) }, { label: 'Estado', key: 'estado' }, { label: 'Interpretación', key: 'ayuda' }])); UI.toast('Ratios exportados.'); } }] });
    const fmt = x => x.fmt === 'pct' ? U.pct(x.value) : x.fmt === 'x' ? U.dec2(x.value) + '×' : x.fmt === 'dias' ? U.int(x.value) + ' días' : U.clp(x.value);
    const pf = F().porFormato(p);
    content.innerHTML = selector(ctx) + `<div class="grid grid-4">${r.list.map(x => `<div class="kpi"><div class="kpi-top"><span class="kpi-label"><span class="semaforo ${x.estado}" aria-label="${{ ok: 'Saludable', warn: 'Atención', bad: 'Crítico' }[x.estado]}"></span>${U.esc(x.label)}</span>${UI.tip(x.ayuda)}</div><div class="kpi-value">${fmt(x)}</div></div>`).join('')}</div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h3>Contribución marginal por formato</h3></div><p class="card-desc">Precio promedio neto − costo variable unitario. Indica cuánto aporta cada unidad a cubrir costos fijos.</p><div data-t></div></div>`;
    bindSel(ctx, content);
    UI.table(content.querySelector('[data-t]'), { rows: Object.values(pf).filter(x => x.unidades).map(x => Object.assign({ id: x.formato.id }, x)), search: false, columns: [{ key: 'f', label: 'Formato', value: x => x.formato.nombre }, { key: 'unidades', label: 'Unidades / L', num: true, render: x => U.int(x.unidades) }, { key: 'precioProm', label: 'Precio prom.', num: true, render: x => U.clp(x.precioProm) }, { key: 'costoProm', label: 'Costo var.', num: true, render: x => U.clp(x.costoProm) }, { key: 'contribucionUnit', label: 'Contrib. unit.', num: true, render: x => `<b>${U.clp(x.contribucionUnit)}</b>` }, { key: 'cl', label: 'Contrib./L', num: true, value: x => x.contribucionUnit / (U.n(x.formato.litros) || 1), render: x => U.clp(x.contribucionUnit / (U.n(x.formato.litros) || 1)) }, { key: 'margen', label: 'Margen %', num: true, render: x => U.pct(x.margen) }, { key: 'contribucion', label: 'Contribución total', num: true, render: x => U.clp(x.contribucion) }] });
  }

  function equilibrio(ctx) {
    const { p, label } = periodo(ctx);
    const pe = F().puntoEquilibrio(p);
    const content = UI.page(ctx.el, { title: 'Punto de equilibrio', crumbs: [['Finanzas'], ['Financiero', '#/financiero']], tabs: UI.moduleTabs(ctx), desc: `${label}. PE = costos fijos / contribución ponderada según la mezcla real de ventas.`, actions: [{ label: 'Imprimir / PDF', icon: 'print', run: () => window.print() }] });
    const fin = v => isFinite(v) ? v : 0;
    content.innerHTML = selector(ctx) + `<div class="grid grid-4">
      ${UI.kpi({ label: 'PE en pesos', value: isFinite(pe.pePesos) ? U.compactCLP(pe.pePesos) : 'No alcanzable', icon: 'money', micro: 'Ventas netas necesarias' })}
      ${UI.kpi({ label: 'PE en litros', value: isFinite(pe.peLitros) ? U.lt(pe.peLitros) : '—', icon: 'drop', micro: U.clp(pe.contribLitro) + ' de contribución por litro' })}
      ${UI.kpi({ label: 'Margen de seguridad', value: pe.margenSeguridad > -1 ? U.pct(pe.margenSeguridad) : '—', icon: 'shield', tone: pe.alcanzado ? 'success' : 'error', micro: pe.alcanzado ? 'Ventas sobre el PE' : 'Bajo el punto de equilibrio' })}
      ${UI.kpi({ label: 'Costos fijos', value: U.compactCLP(pe.fijos), icon: 'briefcase', micro: 'Sueldos, gastos fijos, dep., amortización' })}
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card"><div class="card-head"><h3>Ingresos vs costos totales</h3></div><p class="card-desc">El cruce de las líneas es el punto de equilibrio. Eje X: volumen como % de las ventas actuales.</p><div data-c></div></div>
      <div class="card"><div class="card-head"><h3>Unidades de equilibrio por formato</h3></div><p class="card-desc">Según la participación de cada formato en los litros vendidos.</p><div data-t></div></div>
    </div>`;
    bindSel(ctx, content);
    const steps = [0, 25, 50, 75, 100, 125, 150];
    VG.charts.line(content.querySelector('[data-c]'), { labels: steps.map(s => s + '%'), series: [{ name: 'Ingresos', data: steps.map(s => pe.ingresos * s / 100) }, { name: 'Costos totales', data: steps.map(s => pe.fijos + pe.costosVariables * s / 100) }, { name: 'Costos fijos', data: steps.map(() => pe.fijos) }], yFmt: U.compactCLP, tipFmt: U.clp, height: 230 });
    UI.table(content.querySelector('[data-t]'), { rows: pe.rows, search: false, columns: [{ key: 'nombre', label: 'Formato' }, { key: 'share', label: 'Part. litros', num: true, render: r => U.pct(r.share) }, { key: 'contribucionUnit', label: 'Contrib. unit.', num: true, render: r => U.clp(r.contribucionUnit) }, { key: 'unidades', label: 'Vendidas', num: true, render: r => U.int(r.unidades) }, { key: 'peUnidades', label: 'Unid. equilibrio', num: true, render: r => `<b>${isFinite(r.peUnidades) ? U.int(r.peUnidades) : '—'}</b>` }], empty: { icon: '📉', title: 'Sin ventas en el período' } });
    void fin;
  }

  function simulador(ctx) {
    const { p, label } = periodo(ctx);
    const content = UI.page(ctx.el, { title: 'Simulador "¿qué pasa si…?"', crumbs: [['Finanzas'], ['Financiero', '#/financiero']], tabs: UI.moduleTabs(ctx), desc: `Mueve los controles para ver el impacto sobre la utilidad y el punto de equilibrio (${label}). No modifica tus datos.` });
    const S = [['precio', 'Precio de venta', -30, 30], ['volumen', 'Volumen vendido', -50, 50], ['costoEnvase', 'Costo de envase', -30, 50], ['sueldos', 'Sueldos', -20, 40], ['tipoCambio', 'Tipo de cambio (USD)', -20, 30], ['exportShare', 'Ventas en dólares (%)', 0, 100]];
    const st = { precio: 0, volumen: 0, costoEnvase: 0, sueldos: 0, tipoCambio: 0, exportShare: 0 };
    const base = F().puntoEquilibrio(p);
    content.innerHTML = selector(ctx) + `<div class="grid grid-2" style="align-items:start"><div class="card"><div class="card-head"><h3>Supuestos</h3><button class="btn btn-sm" data-reset>Restablecer</button></div><div class="stack">${S.map(([k, l, mn, mx]) => `<div class="slider-row"><label for="s-${k}">${l}</label><input type="range" id="s-${k}" min="${mn}" max="${mx}" step="1" value="0" data-k="${k}"><output for="s-${k}" class="num" data-o="${k}">0%</output></div>`).join('')}</div><p class="text-xs muted" style="margin-top:12px">El tipo de cambio afecta solo la fracción de ventas en dólares. El costo de envase afecta su participación real en el costo unitario de cada formato.</p></div><div data-r></div></div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h3>Escenarios</h3></div><p class="card-desc">Pesimista: precio −8%, volumen −15%, envase +10%. Optimista: precio +5%, volumen +12%, envase −3%.</p><div data-e></div></div>`;
    bindSel(ctx, content);
    const draw = () => {
      const s = F().puntoEquilibrio(p, { precio: st.precio, volumen: st.volumen, costoEnvase: st.costoEnvase, sueldos: st.sueldos, tipoCambio: st.tipoCambio, exportShare: st.exportShare / 100 });
      const card = (l, a, b, f = U.clp) => `<tr><td>${l}</td><td class="num">${f(a)}</td><td class="num"><b>${f(b)}</b></td><td class="num ${b - a >= 0 ? 'text-success' : 'text-error'}">${b - a >= 0 ? '+' : ''}${f(b - a)}</td></tr>`;
      content.querySelector('[data-r]').innerHTML = `<div class="card"><div class="card-head"><h3>Resultado simulado</h3></div><table class="statement"><thead><tr><th style="text-align:left">Indicador</th><th class="num">Actual</th><th class="num">Simulado</th><th class="num">Diferencia</th></tr></thead><tbody>
        ${card('Ingresos netos', base.ingresos, s.ingresos)}${card('Contribución', base.contribucion, s.contribucion)}${card('Costos fijos', base.fijos, s.fijos)}${card('Utilidad operacional', base.utilidadOperacional, s.utilidadOperacional)}${card('Utilidad neta', base.utilidadNeta, s.utilidadNeta)}${card('PE en pesos', isFinite(base.pePesos) ? base.pePesos : 0, isFinite(s.pePesos) ? s.pePesos : 0)}${card('PE en litros', isFinite(base.peLitros) ? base.peLitros : 0, isFinite(s.peLitros) ? s.peLitros : 0, U.lt)}
      </tbody></table>${UI.alert(s.alcanzado ? 'success' : 'error', s.alcanzado ? 'Con estos supuestos se supera el punto de equilibrio' : 'Con estos supuestos NO se alcanza el punto de equilibrio', s.alcanzado ? `Margen de seguridad ${U.pct(s.margenSeguridad)}.` : `Faltarían ${U.clp(s.pePesos - s.ingresos)} en ventas.`)}</div>`;
    };
    content.querySelectorAll('[data-k]').forEach(i => i.oninput = () => { st[i.dataset.k] = Number(i.value); content.querySelector(`[data-o="${i.dataset.k}"]`).textContent = (Number(i.value) > 0 && i.dataset.k !== 'exportShare' ? '+' : '') + i.value + '%'; draw(); });
    content.querySelector('[data-reset]').onclick = () => { content.querySelectorAll('[data-k]').forEach(i => { i.value = 0; st[i.dataset.k] = 0; content.querySelector(`[data-o="${i.dataset.k}"]`).textContent = '0%'; }); draw(); };
    draw();
    const esc = F().escenarios(p);
    UI.table(content.querySelector('[data-e]'), { rows: esc.map((e, i) => Object.assign({ id: i }, e)), search: false, columns: [{ key: 'nombre', label: 'Escenario', render: e => `<b>${e.nombre}</b>` }, { key: 'ingresos', label: 'Ingresos', num: true, render: e => U.clp(e.ingresos) }, { key: 'utilidad', label: 'Utilidad operacional', num: true, render: e => `<span class="${e.utilidad < 0 ? 'text-error' : 'text-success'}">${U.clp(e.utilidad)}</span>` }, { key: 'utilidadNeta', label: 'Utilidad neta', num: true, render: e => U.clp(e.utilidadNeta) }, { key: 'pe', label: 'Punto de equilibrio', num: true, render: e => isFinite(e.pe) ? U.clp(e.pe) : '—' }] });
  }

  function flujo(ctx) {
    const y = VG.store.state.season, fc = F().flujoCaja(y);
    const content = UI.page(ctx.el, { title: 'Flujo de caja ' + y, crumbs: [['Finanzas'], ['Financiero', '#/financiero']], tabs: UI.moduleTabs(ctx), desc: 'Real (meses pasados) y proyectado (meses futuros, según vencimientos). Incluye IVA de ventas y compras, y el pago del F29 (IVA + ILA + PPM + retenciones) el día de vencimiento.', actions: [{ label: 'Exportar CSV', icon: 'download', perm: ['financiero', 'x'], run: () => { U.download('flujo_caja_' + y + '.csv', U.toCSV(fc.rows, [{ label: 'Mes', key: 'mes' }, { label: 'Tipo', csv: r => r.proyectado ? 'Proyectado' : 'Real' }, { label: 'Cobros', key: 'cobros' }, { label: 'Pagos proveedores', key: 'pagosProv' }, { label: 'Remuneraciones', key: 'sueldos' }, { label: 'Gastos', key: 'gastos' }, { label: 'Impuestos', key: 'impuestos' }, { label: 'Neto', csv: r => Math.round(r.neto) }, { label: 'Saldo', csv: r => Math.round(r.saldo) }])); UI.toast('Flujo exportado.'); } }] });
    content.innerHTML = `${fc.negativo ? UI.alert('error', 'Alerta de caja negativa', `El saldo proyectado queda en ${U.clp(fc.negativo.saldo)} en ${U.monthName(fc.negativo.mes)}.`) : UI.alert('success', 'Caja positiva todo el año', `Saldo proyectado a diciembre: ${U.clp(fc.saldoFinal)}.`)}
      <div class="grid grid-4" style="margin-top:16px">${UI.kpi({ label: 'Saldo inicial', value: U.compactCLP(VG.store.config().finanzas.saldoInicialCaja), icon: 'bank', micro: 'Configurable en Configuración' })}${UI.kpi({ label: 'Saldo final proyectado', value: U.compactCLP(fc.saldoFinal), icon: 'money', tone: fc.saldoFinal < 0 ? 'error' : 'success' })}${UI.kpi({ label: 'Cuentas por cobrar', value: U.compactCLP(fc.cxc), icon: 'users', micro: 'Con IVA e ILA' })}${UI.kpi({ label: 'Cuentas por pagar', value: U.compactCLP(fc.cxp), icon: 'truck', micro: 'Con IVA' })}</div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h3>Saldo acumulado y flujo neto mensual</h3></div><div data-c></div></div><div data-t style="margin-top:16px"></div>`;
    VG.charts.line(content.querySelector('[data-c]'), { labels: fc.rows.map(r => U.monthName(r.mes) + (r.proyectado ? '*' : '')), series: [{ name: 'Saldo acumulado', data: fc.rows.map(r => r.saldo) }, { name: 'Flujo neto del mes', data: fc.rows.map(r => r.neto) }], refLines: [{ value: 0, label: '' }], yFmt: U.compactCLP, tipFmt: U.clp, height: 240 });
    UI.table(content.querySelector('[data-t]'), { rows: fc.rows.map(r => Object.assign({ id: r.mes }, r)), search: false, pageSize: 12, columns: [{ key: 'mes', label: 'Mes', render: r => U.monthName(r.mes) + ' ' + (r.proyectado ? UI.badge('Proyectado', 'info') : UI.badge('Real', 'success')) }, { key: 'cobros', label: 'Cobros', num: true, render: r => U.clp(r.cobros) }, { key: 'pagosProv', label: 'Proveedores', num: true, render: r => U.clp(-r.pagosProv) }, { key: 'sueldos', label: 'Remuneraciones', num: true, render: r => U.clp(-r.sueldos) }, { key: 'gastos', label: 'Gastos', num: true, render: r => U.clp(-r.gastos) }, { key: 'impuestos', label: 'F29 (IVA+PPM)', num: true, render: r => U.clp(-r.impuestos) }, { key: 'neto', label: 'Neto', num: true, render: r => `<b class="${r.neto < 0 ? 'text-error' : 'text-success'}">${U.clp(r.neto)}</b>` }, { key: 'saldo', label: 'Saldo', num: true, render: r => `<b class="${r.saldo < 0 ? 'text-error' : ''}">${U.clp(r.saldo)}</b>` }] });
  }

  function rankings(ctx) {
    const { p, label } = periodo(ctx);
    const y = VG.store.state.season;
    const content = UI.page(ctx.el, { title: 'Rankings y matriz BCG', crumbs: [['Finanzas'], ['Financiero', '#/financiero']], tabs: UI.moduleTabs(ctx), desc: label + '. Rentabilidad por formato, canal y cuartel.' });
    const pf = Object.values(F().porFormato(p)).filter(x => x.unidades);
    const er = F().estadoResultados(p);
    const vs = db().list('venta', v => v.estado !== 'anulada' && v.fecha >= p.desde && v.fecha <= p.hasta);
    const canales = Object.entries(U.groupBy(vs, v => v.canal || 'directa')).map(([k, rs]) => ({ label: { granel: 'Granel', distribuidor: 'Distribuidor', restaurante: 'Restaurante', directa: 'Directa', ecommerce: 'E-commerce' }[k] || k, ingresos: U.sum(rs, v => v.neto), contrib: U.sum(rs, v => U.n(v.neto) - U.n(v.cantidad) * U.n(v.costoUnitario)) }));
    const cuart = F().rentabilidadCuarteles(y);
    // BCG simplificada: participación en ingresos (eje x) vs crecimiento vs período anterior (eje y)
    const prevPF = F().porFormato(F().periodoAnio(y - 1));
    const tot = U.sum(pf, x => x.ingresos) || 1;
    const bcg = pf.map(x => { const prev = (prevPF[x.formato.id] || {}).ingresos || 0; const g = prev ? (x.ingresos - prev) / prev : 1; const s = x.ingresos / tot; return { n: x.formato.nombre, s, g, q: s >= 1 / pf.length ? (g >= 0.1 ? 'star' : 'cow') : (g >= 0.1 ? 'q' : 'dog') }; });
    const Q = { star: ['q-star', '⭐ Estrellas', 'Alta participación y crecimiento: invertir'], q: ['q-q', '❓ Interrogantes', 'Crecen pero con baja participación: evaluar'], cow: ['q-cow', '🐄 Vacas lecheras', 'Alta participación, bajo crecimiento: rentabilizar'], dog: ['q-dog', '🐕 Perros', 'Baja participación y crecimiento: revisar'] };
    content.innerHTML = selector(ctx) + `<div class="grid grid-2">
      <div class="card"><div class="card-head"><h3>Contribución por formato</h3></div><div data-a></div></div>
      <div class="card"><div class="card-head"><h3>Contribución por canal</h3></div><div data-b></div></div>
      <div class="card"><div class="card-head"><h3>Margen por cuartel (${y})</h3></div><p class="card-desc">Ingresos atribuidos por kg aportado a cada lote menos el costo de campo y cosecha.</p><div data-c></div></div>
      <div class="card"><div class="card-head"><h3>Matriz BCG simplificada (formatos)</h3></div><p class="card-desc">Participación en ingresos vs crecimiento respecto del año anterior.</p><div class="bcg">${['q', 'star', 'dog', 'cow'].map(k => `<div class="${Q[k][0]}"><h5>${Q[k][1]}</h5><div class="text-xs muted">${Q[k][2]}</div><div style="margin-top:6px">${bcg.filter(b => b.q === k).map(b => `<div><b>${U.esc(b.n)}</b> · ${U.pct(b.s, 0)} · ${b.g >= 0 ? '↑' : '↓'}${U.pct(Math.abs(b.g), 0)}</div>`).join('') || '<span class="muted">—</span>'}</div></div>`).join('')}</div></div>
    </div>`;
    bindSel(ctx, content);
    VG.charts.hbar(content.querySelector('[data-a]'), { items: pf.map(x => ({ label: x.formato.nombre, value: x.contribucion })).sort((a, b) => b.value - a.value), fmt: U.compactCLP });
    VG.charts.hbar(content.querySelector('[data-b]'), { items: canales.map(c => ({ label: c.label, value: c.contrib })).sort((a, b) => b.value - a.value), fmt: U.compactCLP });
    VG.charts.hbar(content.querySelector('[data-c]'), { items: cuart.map(c => ({ label: c.cuartel.codigo + ' ' + c.cuartel.variedad, value: c.margen })).sort((a, b) => b.value - a.value), fmt: U.compactCLP });
    void er;
  }

  function resumenEjecutivo(ctx) {
    const { p, label } = periodo(ctx);
    const r = F().ratios(p), pe = F().puntoEquilibrio(p), er = r.er, rec = F().recomendaciones(p), fc = F().flujoCaja(VG.store.state.season);
    const content = UI.page(ctx.el, { title: 'Resumen ejecutivo', crumbs: [['Finanzas'], ['Financiero', '#/financiero']], tabs: UI.moduleTabs(ctx), desc: label + '. Síntesis para el directorio, con recomendaciones automáticas.', actions: [{ label: 'Imprimir / PDF', icon: 'print', primary: true, run: () => window.print() }] });
    const e = VG.store.config().empresa;
    content.innerHTML = selector(ctx) + `<div class="print-only"><h2>${U.esc(e.razonSocial)} — Resumen ejecutivo ${U.esc(label)}</h2></div>
      <div class="grid grid-4">${UI.kpi({ label: 'Ingresos netos', value: U.compactCLP(er.ingresos), icon: 'money' })}${UI.kpi({ label: 'Margen bruto', value: U.pct(r.map.mb.value), icon: 'chart' })}${UI.kpi({ label: 'Utilidad neta', value: U.compactCLP(er.un), icon: 'star', tone: er.un < 0 ? 'error' : 'success' })}${UI.kpi({ label: 'Punto de equilibrio', value: isFinite(pe.pePesos) ? U.compactCLP(pe.pePesos) : '—', icon: 'scale', tone: pe.alcanzado ? 'success' : 'warning', micro: pe.alcanzado ? 'Alcanzado' : 'No alcanzado' })}</div>
      <div class="grid grid-2" style="margin-top:16px;align-items:start"><div class="card"><div class="card-head"><h3>Recomendaciones</h3></div><ol style="margin:0;padding-left:18px">${rec.map(x => `<li style="margin-bottom:8px">${U.esc(x)}</li>`).join('')}</ol></div>
      <div class="card"><div class="card-head"><h3>Indicadores clave</h3></div><table class="statement">${r.list.slice(0, 9).map(x => `<tr><td><span class="semaforo ${x.estado}"></span>${U.esc(x.label)}</td><td>${x.fmt === 'pct' ? U.pct(x.value) : x.fmt === 'x' ? U.dec2(x.value) + '×' : x.fmt === 'dias' ? U.int(x.value) + ' días' : U.clp(x.value)}</td></tr>`).join('')}<tr><td>Saldo de caja proyectado a diciembre</td><td>${U.clp(fc.saldoFinal)}</td></tr></table></div></div>
      ${UI.legal('Indicadores calculados con los datos registrados. Herramienta de apoyo para la gestión; no reemplaza estados financieros auditados ni la asesoría de un contador.')}`;
    bindSel(ctx, content);
  }

  VG.registry.implement('financiero', {
    async onMount(ctx) { ({ ratios, equilibrio, simulador, flujo, rankings, resumen: resumenEjecutivo }[ctx.sub] || resultados)(ctx); }
  });
})(window.VG);
