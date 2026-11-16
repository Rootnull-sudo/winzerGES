/**
 * modules/dashboard/index.js — Módulo 25. Dashboard gerencial (pantalla de inicio).
 * KPIs operativos, comerciales, financieros y tributarios con variación vs la temporada
 * anterior; gráficos con texto explicativo; panel de alertas priorizado por color.
 * Cada bloque se muestra solo si el rol puede ver el módulo correspondiente.
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui, F = () => VG.calc.financial, T = () => VG.calc.tax, Inv = () => VG.calc.inventory, Oe = () => VG.calc.oenology;
  const db = () => VG.db;
  const can = m => VG.auth.can(m, 'v');
  const d = (a, b) => b ? (a - b) / Math.abs(b) : null;

  function opData(y) {
    const cos = db().list('cosecha', c => Number(c.temporada) === y);
    const lotes = db().list('lote', l => Number(l.temporada) === y);
    const bal = lotes.map(l => Inv().balanceLote(l.id));
    const movsY = db().list('movBodega', m => U.year(m.fecha) === y);
    const fichas = db().list('fermentacion', f => lotes.some(l => l.id === f.loteId));
    const diasFA = fichas.filter(f => f.inicioFA && f.finFA).map(f => U.diffDays(f.inicioFA, f.finFA));
    const meta = U.sum(db().list('adicionSO2', a => U.year(a.fecha) === y), a => a.gramos) / 1000 + U.sum(db().list('aditivo', a => a.tipo === 'so2' && U.year(a.fecha) === y), a => a.cantidad);
    return { kg: U.sum(cos, c => c.kg), litros: U.sum(bal, b => b.entradas), envasados: -U.sum(movsY.filter(m => m.tipo === 'envasado'), m => m.litros), granel: -U.sum(movsY.filter(m => m.tipo === 'venta_granel'), m => m.litros), vinagre: -U.sum(movsY.filter(m => m.tipo === 'vinagre'), m => m.litros), mermas: -U.sum(movsY.filter(m => m.tipo === 'merma'), m => m.litros), fermentando: db().list('lote', l => ['Fermentando', 'Macerando', 'FML'].includes(l.estado)).length, diasFA: diasFA.length ? U.avg(diasFA) : 0, meta };
  }

  VG.registry.implement('dashboard', {
    async onMount(ctx) {
      const y = VG.store.state.season, cfg = VG.store.config();
      const u = VG.auth.current();
      const content = UI.page(ctx.el, {
        title: `Hola, ${u.nombre.split(' ')[0]} 👋`, crumbs: [],
        desc: `Resumen de la temporada <b>${y}</b> de ${U.esc(cfg.empresa.nombreFantasia)}. Las flechas comparan con la temporada ${y - 1}.`,
        actions: [{ label: 'Exportar dashboard (PDF)', icon: 'print', run: () => window.print() }]
      });
      content.parentElement.querySelector('.breadcrumb').textContent = 'Inicio';
      const alerts = VG.alerts.compute();
      const parts = [];
      const p = F().periodoAnio(y), pp = F().periodoAnio(y - 1);

      // ---------------- KPIs operativos ----------------
      if (can('catastro') || can('bodega') || can('cosecha')) {
        const o = opData(y), op = opData(y - 1), oc = Inv().ocupacion();
        parts.push(`<div class="dash-section-title">Operación y bodega</div><div class="grid grid-4">
          ${UI.kpi({ label: 'Kg cosechados', value: U.int(o.kg), icon: 'grape', delta: d(o.kg, op.kg), micro: `${db().count('cuartel')} cuarteles`, href: '#/cosecha' })}
          ${UI.kpi({ label: 'Litros producidos', value: U.int(o.litros), icon: 'drop', delta: d(o.litros, op.litros), micro: o.kg ? U.dec2(o.litros / o.kg) + ' L/kg' : '', href: '#/historico' })}
          ${UI.kpi({ label: 'Litros envasados', value: U.int(o.envasados), icon: 'bottle', delta: d(o.envasados, op.envasados), micro: `A granel vendidos: ${U.int(o.granel)} L`, href: '#/envasado' })}
          ${UI.kpi({ label: 'Mermas y vinagre', value: U.int(o.mermas + o.vinagre) + ' L', icon: 'warn', tone: o.litros && (o.mermas + o.vinagre) / o.litros > 0.03 ? 'warning' : '', micro: o.litros ? U.pct((o.mermas + o.vinagre) / o.litros) + ' de lo producido' : '', href: '#/bodega/balance' })}
          ${UI.kpi({ label: 'Ocupación de bodega', value: U.pct(oc.pct, 0), icon: 'tank', tone: oc.pct > 0.9 ? 'warning' : '', micro: `${oc.ocupados} ocupados · ${oc.vacios} vacíos`, href: '#/bodega' })}
          ${UI.kpi({ label: 'Lotes en fermentación / FML', value: o.fermentando, icon: 'ferment', micro: o.diasFA ? 'FA promedio ' + U.dec1(o.diasFA) + ' días' : 'Sin FA cerradas', href: '#/fermentacion' })}
          ${UI.kpi({ label: 'Metabisulfito usado', value: U.dec2(o.meta) + ' kg', icon: 'flask', delta: d(o.meta, op.meta), micro: 'Adiciones de la temporada' })}
          ${UI.kpi({ label: 'Vino a granel en stock', value: U.lt(Inv().stockGranel()), icon: 'wine', micro: 'Blanco ' + U.int(oc.porTipo.blanco || 0) + ' · Tinto ' + U.int(oc.porTipo.tinto || 0) })}
        </div>`);
      }
      // ---------------- KPIs comerciales ----------------
      let er, erp;
      if (can('ventas') || can('financiero')) {
        er = F().estadoResultados(p); erp = F().estadoResultados(pp);
        const spf = Inv().stockPorFormato();
        parts.push(`<div class="dash-section-title">Comercial</div><div class="grid grid-4">
          ${UI.kpi({ label: 'Ingresos netos', value: U.compactCLP(er.ingresos), icon: 'money', delta: d(er.ingresos, erp.ingresos), micro: `${er.ventasN} ventas`, href: '#/ventas' })}
          ${UI.kpi({ label: 'Unidades vendidas', value: U.int(er.unidades), icon: 'bottle', delta: d(er.unidades, erp.unidades), micro: 'Todas las presentaciones' })}
          ${UI.kpi({ label: 'Litros a granel vendidos', value: U.int(U.sum(db().list('venta', v => v.tipo === 'granel' && v.estado !== 'anulada' && U.year(v.fecha) === y), v => v.litros)), icon: 'tank', micro: U.compactCLP(er.ingGranel) + ' neto' })}
          ${UI.kpi({ label: 'Ticket promedio', value: U.clp(er.ventasN ? er.ingresos / er.ventasN : 0), icon: 'receipt', micro: 'Neto por venta' })}
        </div><div class="grid grid-2" style="margin-top:16px"><div class="card"><div class="card-head"><h3>Ventas por formato</h3></div><p class="card-desc">Unidades vendidas en ${y} y stock disponible.</p><div data-ch="fmt"></div></div><div class="card"><div class="card-head"><h3>Ventas por canal</h3></div><p class="card-desc">Ingresos netos de ${y}.</p><div data-ch="canal"></div></div></div>`);
        ctx._spf = spf;
      }
      // ---------------- KPIs financieros ----------------
      if (can('financiero')) {
        const r = F().ratios(p), pe = F().puntoEquilibrio(p);
        const costoBot = Object.values(F().porFormato(p)).find(x => x.formato.id === 'fmt_075');
        parts.push(`<div class="dash-section-title">Finanzas</div><div class="grid grid-4">
          ${UI.kpi({ label: 'Margen bruto', value: U.pct(r.map.mb.value), icon: 'chart', tone: r.map.mb.estado === 'bad' ? 'error' : r.map.mb.estado === 'warn' ? 'warning' : 'success', micro: U.compactCLP(er.mb), href: '#/financiero' })}
          ${UI.kpi({ label: 'EBITDA', value: U.compactCLP(er.ebitda), icon: 'coins', delta: d(er.ebitda, erp.ebitda), micro: 'Utilidad operacional ' + U.compactCLP(er.ebit) })}
          ${UI.kpi({ label: 'Utilidad neta', value: U.compactCLP(er.un), icon: 'star', tone: er.un < 0 ? 'error' : 'success', delta: d(er.un, erp.un), micro: 'Margen neto ' + U.pct(r.map.mn.value) })}
          ${UI.kpi({ label: 'Punto de equilibrio', value: isFinite(pe.pePesos) ? U.compactCLP(pe.pePesos) : '—', icon: 'scale', tone: pe.alcanzado ? 'success' : 'warning', micro: (isFinite(pe.peLitros) ? U.int(pe.peLitros) + ' L · ' : '') + (pe.alcanzado ? 'alcanzado ✓' : 'no alcanzado'), href: '#/financiero/equilibrio' })}
          ${UI.kpi({ label: 'ROS', value: U.pct(r.map.ros.value), icon: 'chart', micro: 'Utilidad neta / ventas' })}
          ${UI.kpi({ label: 'ROC', value: U.pct(r.map.roc.value), icon: 'chart', micro: 'EBIT × (1 − t) / capital' })}
          ${UI.kpi({ label: 'Costo por botella 0,75 L', value: costoBot && costoBot.unidades ? U.clp(costoBot.costoProm) : '—', icon: 'bottle', micro: costoBot && costoBot.unidades ? 'Precio promedio ' + U.clp(costoBot.precioProm) : '', href: '#/costos' })}
          ${UI.kpi({ label: 'Saldo de caja proyectado', value: U.compactCLP(F().flujoCaja(y).saldoFinal), icon: 'bank', tone: F().flujoCaja(y).negativo ? 'error' : '', micro: 'A diciembre ' + y, href: '#/financiero/flujo' })}
        </div><div class="grid grid-2" style="margin-top:16px"><div class="card"><div class="card-head"><h3>Ingresos, costos y utilidad por mes</h3></div><p class="card-desc">Costos incluyen costo de ventas, gastos, sueldos, depreciación e intereses.</p><div data-ch="erm"></div></div><div class="card"><div class="card-head"><h3>Flujo de caja (IVA y PPM incluidos)</h3></div><p class="card-desc">Saldo acumulado mensual; meses futuros proyectados por vencimientos.</p><div data-ch="fc"></div></div>
          <div class="card"><div class="card-head"><h3>Composición del costo por botella 0,75 L</h3></div><p class="card-desc">Promedio ponderado de las órdenes confirmadas.</p><div data-ch="cbot"></div></div><div class="card"><div class="card-head"><h3>Rentabilidad por cuartel</h3></div><p class="card-desc">Ingresos atribuidos menos costo de campo y cosecha (${y}).</p><div data-ch="rc"></div></div></div>`);
      }
      // ---------------- KPIs tributarios ----------------
      if (can('tributario')) {
        const per = T().periodoAnterior(U.month(U.today())), f = T().f29(per), ppm = T().ppmAnual(y);
        const rec = db().find('f29', x => x.periodo === per);
        const rnt = db().find('renta', x => Number(x.anioTributario) === new Date().getFullYear());
        parts.push(`<div class="dash-section-title">Tributario</div><div class="grid grid-4">
          ${UI.kpi({ label: `IVA débito ${U.monthName(per)}`, value: U.clp(f.ivaDebito), icon: 'receipt', micro: 'Crédito ' + U.clp(f.ivaCredito), href: '#/dte/libros?periodo=' + per })}
          ${UI.kpi({ label: 'F29 a pagar', value: U.clp(f.total), icon: 'scale', tone: rec && ['declarado', 'pagado'].includes(rec.estado) ? 'success' : 'warning', micro: 'Estado: ' + (rec ? rec.estado : 'sin preparar') + ` · vence día ${cfg.tributario.diaF29}`, href: '#/tributario?periodo=' + per })}
          ${UI.kpi({ label: 'PPM acumulado ' + y, value: U.compactCLP(ppm.total), icon: 'coins', micro: 'Próximo: ' + U.clp(f.ppm), href: '#/tributario/ppm' })}
          ${UI.kpi({ label: 'Renta AT' + new Date().getFullYear(), value: rnt ? rnt.estado : 'pendiente', icon: 'doc', tone: rnt && rnt.estado === 'declarado' ? 'success' : 'warning', micro: 'Plazo 30 de abril', href: '#/tributario/renta' })}
        </div><div class="grid grid-2" style="margin-top:16px"><div class="card"><div class="card-head"><h3>Ingresos vs impuestos (F29) por mes</h3></div><p class="card-desc">Ventas netas del mes y total del F29 correspondiente (IVA + ILA + PPM + retenciones).</p><div data-ch="tax"></div></div><div class="card"><div class="card-head"><h3>DTE emitidos y recibidos por mes</h3></div><p class="card-desc">Cantidad de documentos (sin guías).</p><div data-ch="dte"></div></div></div>`);
      }
      // ---------------- Gráficos operativos y alertas ----------------
      parts.push(`<div class="dash-section-title">Producción y alertas</div><div class="grid grid-2" style="align-items:start">
        <div class="stack">${can('historico') || can('cosecha') ? '<div class="card"><div class="card-head"><h3>Kg y litros por temporada</h3></div><p class="card-desc">Uva cosechada y litros ingresados a bodega.</p><div data-ch="kgl"></div></div>' : ''}
        ${can('bodega') ? '<div class="card"><div class="card-head"><h3>Ocupación de bodega por estanque</h3></div><p class="card-desc">% de capacidad utilizada.</p><div data-ch="ocu"></div></div>' : ''}
        ${can('fermentacion') ? '<div class="card"><div class="card-head"><h3>Evolución de SO₂ libre (lotes de la temporada)</h3></div><p class="card-desc">Mediciones de seguimiento; la línea roja es el umbral de alerta más bajo (tintos).</p><div data-ch="so2"></div></div>' : ''}</div>
        <div class="card"><div class="card-head"><h3>Alertas (${alerts.length})</h3><span class="row text-xs"><span>🔴 ${alerts.filter(a => a.level === 'error').length}</span><span>🟡 ${alerts.filter(a => a.level === 'warning').length}</span><span>🔵 ${alerts.filter(a => a.level === 'info').length}</span></span></div><div class="alert-panel" style="max-height:760px">${alerts.length ? alerts.map(a => UI.alert(a.level, a.title, U.esc(a.body), a.href ? { href: a.href, label: 'Revisar' } : null)).join('') : UI.empty({ icon: '🎉', title: 'Todo en orden', text: 'No hay alertas para tu rol.' })}</div></div></div>`);
      content.innerHTML = parts.join('');
      const ch = k => content.querySelector(`[data-ch="${k}"]`);
      const meses = U.monthsOfYear(y);

      if (ch('fmt')) { const spf = ctx._spf; VG.charts.bar(ch('fmt'), { labels: db().list('formato').map(f => f.nombre), series: [{ name: 'Vendidas', data: db().list('formato').map(f => U.sum(db().list('venta', v => v.formatoId === f.id && v.estado !== 'anulada' && U.year(v.fecha) === y), v => v.cantidad)) }, { name: 'En stock', data: db().list('formato').map(f => (spf[f.id] || { unidades: 0 }).unidades) }], yFmt: U.compact, tipFmt: v => U.int(v) + ' un', height: 200 }); }
      if (ch('canal')) VG.charts.hbar(ch('canal'), { items: Object.entries(er.porCanal).map(([k, v]) => ({ label: { granel: 'Granel', distribuidor: 'Distribuidor', restaurante: 'Restaurante', directa: 'Directa / sala', ecommerce: 'E-commerce' }[k] || k, value: v })).sort((a, b) => b.value - a.value), fmt: U.compactCLP });
      if (ch('erm')) { const ms = meses.map(m => F().estadoResultados(F().periodoMes(m))); VG.charts.bar(ch('erm'), { labels: meses.map(U.monthName), series: [{ name: 'Ingresos', data: ms.map(x => x.ingresos) }, { name: 'Costos y gastos', data: ms.map(x => x.cogs + x.gav + x.indirectos + x.dep + x.amort + x.gFin) }, { name: 'Utilidad antes de imp.', data: ms.map(x => x.uai) }], yFmt: U.compactCLP, tipFmt: U.clp, height: 220 }); }
      if (ch('fc')) { const fc = F().flujoCaja(y); VG.charts.line(ch('fc'), { labels: fc.rows.map(r => U.monthName(r.mes) + (r.proyectado ? '*' : '')), series: [{ name: 'Saldo acumulado', data: fc.rows.map(r => r.saldo) }], refLines: [{ value: 0, label: '' }], yFmt: U.compactCLP, tipFmt: U.clp, height: 220 }); }
      if (ch('cbot')) { const os = db().list('ordenEnvasado', o => o.estado === 'confirmada' && o.formatoId === 'fmt_075' && o.costoPartes); const un = U.sum(os, o => o.unidades) || 1; const N = { vino: 'Vino', envase: 'Botella', etiqueta: 'Etiqueta', capsula: 'Cápsula', cierre: 'Corcho', caja: 'Caja', manoObra: 'Mano de obra', energia: 'Energía' }; VG.charts.stack(ch('cbot'), { items: Object.keys(N).map(k => ({ label: N[k], value: U.sum(os, o => U.n(o.costoPartes[k]) * o.unidades) / un })), fmt: U.clp, emptyText: 'Sin órdenes de 0,75 L confirmadas.' }); }
      if (ch('rc')) VG.charts.hbar(ch('rc'), { items: F().rentabilidadCuarteles(y).map(r => ({ label: r.cuartel.codigo + ' ' + r.cuartel.variedad, value: r.margen })), fmt: U.compactCLP });
      if (ch('tax')) VG.charts.bar(ch('tax'), { labels: meses.map(U.monthName), series: [{ name: 'Ventas netas', data: meses.map(m => T().f29(m).ventas.neto) }, { name: 'Total F29', data: meses.map(m => T().f29(m).total) }], yFmt: U.compactCLP, tipFmt: U.clp, height: 200 });
      if (ch('dte')) VG.charts.bar(ch('dte'), { labels: meses.map(U.monthName), series: [{ name: 'Emitidos', data: meses.map(m => db().list('dte', x => x.direccion === 'emitido' && U.month(x.fecha) === m && x.tipo !== 52).length) }, { name: 'Recibidos', data: meses.map(m => db().list('dte', x => x.direccion === 'recibido' && U.month(x.fecha) === m).length) }], yFmt: v => U.int(v), tipFmt: v => U.int(v) + ' docs', height: 200 });
      if (ch('kgl')) { const ts = Array.from(new Set(db().list('cosecha').map(c => Number(c.temporada)))).sort().slice(-5); VG.charts.bar(ch('kgl'), { labels: ts.map(String), series: [{ name: 'Kg uva', data: ts.map(t => U.sum(db().list('cosecha', c => Number(c.temporada) === t), c => c.kg)) }, { name: 'Litros', data: ts.map(t => U.sum(db().list('lote', l => Number(l.temporada) === t), l => Inv().litrosEntradaLote(l.id))) }], height: 200 }); }
      if (ch('ocu')) VG.charts.hbar(ch('ocu'), { items: db().list('estanque').sort((a, b) => a.codigo.localeCompare(b.codigo)).map(e => ({ label: e.codigo + ' (' + U.int(e.capacidad) + ' L)', value: Inv().litrosEstanque(e.id) / (U.n(e.capacidad) || 1) || 0.0001 })), fmt: v => U.pct(v, 0) });
      if (ch('so2')) {
        const fichas = db().list('fermentacion', f => { const l = db().get('lote', f.loteId); return l && Number(l.temporada) === y; }).slice(0, 4);
        const fechas = Array.from(new Set(fichas.flatMap(f => db().list('seguimiento', s => s.fermentacionId === f.id && s.so2Libre !== '' && s.so2Libre !== undefined).map(s => s.fecha)))).sort();
        VG.charts.line(ch('so2'), { labels: fechas.map(x => U.fmtDate(x).slice(0, 5)), series: fichas.map(f => { const ss = db().list('seguimiento', s => s.fermentacionId === f.id); return { name: f.codigo.replace('FA-', ''), data: fechas.map(x => { const s = ss.find(z => z.fecha === x && z.so2Libre !== '' && z.so2Libre !== undefined); return s ? s.so2Libre : null; }) }; }), refLines: [{ value: cfg.enologia.so2Tinto.alerta, label: 'Alerta ' + cfg.enologia.so2Tinto.alerta }], tipFmt: v => v === null || v === undefined ? '—' : U.dec1(v) + ' mg/L', height: 200 });
      }
    }
  });
})(window.VG);
