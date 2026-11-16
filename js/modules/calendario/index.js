/**
 * modules/calendario/index.js — Módulo 5. Calendario de vendimia y planificación de procesos (Chile).
 * - Ventanas de cosecha por variedad y valle (base editable referencial, basada en rangos típicos ODEPA/SAG).
 * - Lotes con planificación: vendimia → molienda → FA → maceración → descube → FML → guarda.
 * - Estados del lote actualizados por eventos reales (cosecha, entrada a bodega, fermentación).
 * - Vista Gantt mensual/semanal, alertas de solapamiento, desviaciones > 3 días y hitos próximos.
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui;
  const ESTADOS = ['Planificado', 'En vendimia', 'En molienda', 'Fermentando', 'Macerando', 'FML', 'En guarda', 'Envasado', 'Finalizado'];
  const COLORS = { Vendimia: 'var(--chart-5)', FA: 'var(--chart-1)', Maceración: 'var(--chart-4)', FML: 'var(--chart-2)', Guarda: 'var(--chart-3)' };

  /** Ventanas base (referenciales, editables). Fechas mm-dd. */
  const VENTANAS_BASE = [
    ['Sauvignon Blanc', 'Casablanca', '02-20', '03-20'], ['Sauvignon Blanc', 'Leyda', '03-01', '03-30'], ['Sauvignon Blanc', 'Colchagua', '02-15', '03-15'], ['Sauvignon Blanc', 'Curicó', '02-15', '03-10'],
    ['Chardonnay', 'Casablanca', '02-25', '03-25'], ['Chardonnay', 'Leyda', '03-05', '04-05'], ['Chardonnay', 'Maipo', '02-15', '03-10'], ['Chardonnay', 'Bío Bío', '03-10', '04-05'],
    ['Pinot Noir', 'Casablanca', '02-25', '03-20'], ['Pinot Noir', 'Leyda', '03-01', '03-30'], ['Pinot Noir', 'Bío Bío', '03-10', '04-05'],
    ['Merlot', 'Colchagua', '03-10', '04-05'], ['Merlot', 'Maipo', '03-10', '04-05'], ['Merlot', 'Curicó', '03-10', '04-10'],
    ['Syrah', 'Colchagua', '03-15', '04-15'], ['Syrah', 'Maipo', '03-20', '04-20'],
    ['Cabernet Sauvignon', 'Maipo', '03-25', '04-30'], ['Cabernet Sauvignon', 'Colchagua', '03-20', '04-25'], ['Cabernet Sauvignon', 'Curicó', '03-25', '04-30'], ['Cabernet Sauvignon', 'Maule', '03-25', '04-30'],
    ['Carménère', 'Colchagua', '04-05', '05-10'], ['Carménère', 'Maipo', '04-10', '05-10'], ['Carménère', 'Maule', '04-10', '05-15'],
    ['País', 'Maule', '03-15', '04-20'], ['País', 'Itata', '03-20', '04-25'], ['País', 'Bío Bío', '03-25', '04-30'],
    ['Cinsault', 'Itata', '03-15', '04-15'], ['Moscatel de Alejandría', 'Itata', '03-01', '04-10'], ['Carignan', 'Maule', '03-25', '04-30'], ['Malbec', 'Maule', '03-20', '04-20']
  ];

  /** Fases planificadas de un lote. */
  function plan(l) {
    const v = l.fechaVendimiaPlan; if (!v) return [];
    const tinto = l.tipo === 'tinto';
    const mol = U.addDays(v, 1), faIni = U.addDays(mol, 1), faFin = U.addDays(faIni, U.n(l.diasFA) || (tinto ? 10 : 18));
    const macFin = tinto ? U.addDays(mol, U.n(l.diasMaceracion) || 0) : null;
    const descube = tinto && macFin > faFin ? macFin : faFin;
    const fmlIni = tinto && U.n(l.diasFML) ? U.addDays(descube, 2) : null;
    const fmlFin = fmlIni ? U.addDays(fmlIni, U.n(l.diasFML)) : null;
    const guarFin = U.addDays(fmlFin || descube, U.n(l.diasGuarda) || 90);
    const out = [{ fase: 'Vendimia', from: v, to: U.addDays(v, U.n(l.diasVendimia) || 2) }, { fase: 'FA', from: faIni, to: faFin }];
    if (tinto && U.n(l.diasMaceracion)) out.push({ fase: 'Maceración', from: mol, to: macFin });
    if (fmlIni) out.push({ fase: 'FML', from: fmlIni, to: fmlFin });
    out.push({ fase: 'Guarda', from: fmlFin || descube, to: guarFin });
    return out.map(x => Object.assign(x, { color: COLORS[x.fase] }));
  }
  /** Fechas reales desde fermentación (para comparar con lo planificado). */
  function real(l) {
    const f = VG.db.find('fermentacion', x => x.loteId === l.id);
    return f ? { faIni: f.inicioFA, faFin: f.finFA, fmlIni: f.inicioFML, fmlFin: f.finFML } : {};
  }
  function desvios(l) {
    const p = plan(l), r = real(l), out = [];
    const fa = p.find(x => x.fase === 'FA'), fml = p.find(x => x.fase === 'FML');
    const lim = VG.store.config().enologia.desviacionDias;
    if (fa && r.faIni) { const d = U.diffDays(fa.from, r.faIni); if (Math.abs(d) > lim) out.push(`Inicio FA ${d > 0 ? '+' : ''}${d} d`); }
    if (fa && r.faFin) { const d = U.diffDays(fa.to, r.faFin); if (Math.abs(d) > lim) out.push(`Fin FA ${d > 0 ? '+' : ''}${d} d`); }
    if (fml && r.fmlFin) { const d = U.diffDays(fml.to, r.fmlFin); if (Math.abs(d) > lim) out.push(`Fin FML ${d > 0 ? '+' : ''}${d} d`); }
    return out;
  }

  function lotes(ctx) {
    UI.crud(ctx.el, {
      entity: 'lote', moduleId: 'calendario', query: ctx.query, title: 'Calendario de vendimia', crumbs: [['Operación']], tabs: UI.moduleTabs(ctx),
      filter: r => Number(r.temporada) === VG.store.state.season || Number(r.temporada) === VG.store.state.season + 1,
      desc: 'Planifica cada lote desde la vendimia hasta la guarda. Las fechas se calculan solas y el estado se actualiza con los registros reales de cosecha, bodega y fermentación.',
      newLabel: 'Nuevo lote', emptyIcon: '📅', emptyTitle: 'No hay lotes en esta temporada',
      fields: [
        { key: 'codigo', label: 'Código del lote', required: true, placeholder: 'L-2027-SB', section: 'Lote' },
        { key: 'temporada', label: 'Temporada', type: 'number', required: true, step: 1, section: 'Lote' },
        { key: 'cuartelIds', label: 'Cuarteles de origen', type: 'multiref', ref: 'cuartel', section: 'Lote', onChangeSet: v => { const c = VG.db.get('cuartel', (v.cuartelIds || [])[0]); return c ? { variedad: v.variedad || c.variedad, tipo: c.tipo, valle: v.valle || c.valle } : {}; } },
        { key: 'variedad', label: 'Variedad', required: true, section: 'Lote', list: () => VG.mod && VG.mod.catastro ? VG.mod.catastro.VARIEDADES : [] },
        { key: 'tipo', label: 'Tipo', type: 'select', options: [['blanco', 'Blanco'], ['tinto', 'Tinto']], required: true, section: 'Lote' },
        { key: 'valle', label: 'Valle', section: 'Lote' },
        { key: 'estado', label: 'Estado', type: 'select', options: ESTADOS, required: true, section: 'Lote', help: 'Se actualiza automáticamente con eventos reales; puedes corregirlo a mano.' },
        { key: 'litrosEstimados', label: 'Litros estimados', type: 'number', min: 0, section: 'Lote' },
        { key: 'costoUvaComprada', label: 'Costo de uva/vino comprado a terceros', type: 'money', min: 0, section: 'Lote' },
        { key: 'fechaVendimiaPlan', label: 'Fecha planificada de vendimia', type: 'date', required: true, section: 'Planificación', help: 'Usa las ventanas por valle como referencia.' },
        { key: 'diasVendimia', label: 'Días de vendimia', type: 'number', min: 1, step: 1, section: 'Planificación' },
        { key: 'diasFA', label: 'Duración FA', type: 'number', unit: 'días', min: 1, step: 1, section: 'Planificación' },
        { key: 'diasMaceracion', label: 'Maceración', type: 'number', unit: 'días', min: 0, step: 1, section: 'Planificación', showIf: v => v.tipo === 'tinto' },
        { key: 'diasFML', label: 'Duración FML', type: 'number', unit: 'días', min: 0, step: 1, section: 'Planificación', showIf: v => v.tipo === 'tinto' },
        { key: 'diasGuarda', label: 'Guarda', type: 'number', unit: 'días', min: 0, step: 1, section: 'Planificación' }
      ],
      defaults: () => ({ temporada: VG.store.state.season, estado: 'Planificado', tipo: 'tinto', diasVendimia: 2, diasFA: 10, diasMaceracion: 7, diasFML: 30, diasGuarda: 180 }),
      liveCalc: v => {
        const p = plan(v);
        const w = VG.db.find('ventana', x => x.variedad === v.variedad && x.valle === v.valle);
        const inW = w && v.fechaVendimiaPlan ? (v.fechaVendimiaPlan.slice(5) >= w.desde && v.fechaVendimiaPlan.slice(5) <= w.hasta) : null;
        return `<h4>Fechas calculadas</h4><dl>${p.map(x => `<dt>${x.fase}</dt><dd>${U.fmtDate(x.from).slice(0, 5)} → ${U.fmtDate(x.to).slice(0, 5)}</dd>`).join('') || '<dt>Ingresa la fecha de vendimia</dt><dd></dd>'}</dl>
          ${w ? `<p class="text-xs" style="margin:8px 0 0">Ventana típica ${U.esc(v.variedad)} en ${U.esc(v.valle)}: <b>${w.desde.split('-').reverse().join('/')} – ${w.hasta.split('-').reverse().join('/')}</b> ${inW === false ? '<span class="text-warning">⚠ fuera de ventana</span>' : inW ? '✓' : ''}</p>` : ''}`;
      },
      afterSave: (l, isNew, before) => { if (before && before.estado !== l.estado) VG.events.emit('lote.estadoCambiado', { lote: l, anterior: before.estado }); },
      canDelete: l => VG.db.find('movBodega', m => m.loteId === l.id) || VG.db.find('cosecha', c => c.loteId === l.id) ? 'No se puede eliminar: el lote tiene cosechas o movimientos de bodega.' : true,
      columns: [
        { key: 'codigo', label: 'Lote', sticky: true, render: l => `<b>${U.esc(l.codigo)}</b>${UI.demoBadge(l)}` },
        { key: 'variedad', label: 'Variedad' }, { key: 'tipo', label: 'Tipo', render: l => UI.tipoBadge(l.tipo) },
        { key: 'temporada', label: 'Temp.', num: true },
        { key: 'estado', label: 'Estado', render: l => UI.badge(l.estado, ['Finalizado', 'Envasado'].includes(l.estado) ? 'success' : l.estado === 'Planificado' ? '' : ['Fermentando', 'Macerando', 'FML'].includes(l.estado) ? 'primary' : 'info') },
        { key: 'fechaVendimiaPlan', label: 'Vendimia plan', render: l => U.fmtDate(l.fechaVendimiaPlan) },
        { key: 'faFin', label: 'Fin FA plan', value: l => (plan(l).find(x => x.fase === 'FA') || {}).to || '', render: l => U.fmtDate((plan(l).find(x => x.fase === 'FA') || {}).to) },
        { key: 'litros', label: 'Litros actuales', num: true, value: l => VG.calc.inventory.litrosLote(l.id), render: l => U.int(VG.calc.inventory.litrosLote(l.id)) },
        { key: 'desv', label: 'Desviaciones', value: l => desvios(l).join(', '), render: l => desvios(l).map(d => UI.badge(d, 'warning')).join(' ') || '<span class="muted">—</span>' }
      ],
      defaultSort: 'fechaVendimiaPlan', defaultDir: 'asc',
      renderTop: (top, rows) => {
        const hoy = U.today(), al = [];
        rows.forEach(l => {
          desvios(l).forEach(d => al.push(UI.alert('warning', `${l.codigo}: desviación ${d}`, 'Respecto de lo planificado (umbral ±' + VG.store.config().enologia.desviacionDias + ' días).')));
          plan(l).forEach(p => { const d = U.diffDays(hoy, p.from); if (d >= 0 && d <= 7) al.push(UI.alert('info', `${l.codigo}: ${p.fase} comienza en ${d} días`, U.fmtDate(p.from))); });
        });
        // solapamientos de vendimia/molienda (más de 2 lotes el mismo día)
        const dias = {};
        rows.forEach(l => { const v = plan(l)[0]; if (!v) return; for (let d = v.from; d <= v.to; d = U.addDays(d, 1)) (dias[d] = dias[d] || []).push(l.codigo); });
        Object.entries(dias).filter(([, ls]) => ls.length > 2).slice(0, 3).forEach(([d, ls]) => al.push(UI.alert('warning', `Solapamiento de vendimia el ${U.fmtDate(d)}`, `${ls.join(', ')} coinciden. Revisa capacidad de recepción y estanques.`)));
        const y = VG.store.state.season;
        top.innerHTML = `<div class="grid grid-2"><div class="card"><div class="card-head"><h3>Alertas de planificación</h3></div>${al.join('') || '<p class="muted">Sin solapamientos ni desviaciones relevantes.</p>'}</div>
          <div class="card"><div class="card-head"><h3>Recordatorios SAG</h3></div>
            ${UI.alert(hoy.slice(5) >= '06-01' && hoy.slice(5) <= '07-15' ? 'warning' : 'info', 'Declaración de cosecha', `Entre el 1 y el 30 de junio de ${y} (correcciones hasta el 15 de julio). Kg cosechados de la temporada: <b>${U.int(U.sum(VG.db.list('cosecha', c => Number(c.temporada) === y), c => c.kg))}</b>.`)}
            ${UI.alert(hoy.slice(5) <= '01-19' ? 'warning' : 'info', 'Declaración de existencias', `Entre el 1 y el 19 de enero. Existencias actuales a granel: <b>${U.lt(VG.calc.inventory.stockGranel())}</b>.`, { href: '#/cumplimiento', label: 'Libro de existencias' })}
          </div></div>`;
      }
    });
  }

  function gantt(ctx) {
    const content = UI.page(ctx.el, { title: 'Vista Gantt de procesos', crumbs: [['Operación'], ['Calendario', '#/calendario']], tabs: UI.moduleTabs(ctx), desc: 'Planificación (barras) e hitos reales (marcas) por lote. Cambia entre vista mensual (temporada) y semanal (próximas 12 semanas).' });
    const modo = ctx.query.modo || 'mensual';
    const y = VG.store.state.season;
    const desde = modo === 'semanal' ? U.addDays(U.today(), -14) : y + '-02-01';
    const hasta = modo === 'semanal' ? U.addDays(desde, 84) : (y + 1) + '-01-31';
    const span = U.diffDays(desde, hasta);
    const pos = d => U.clamp(U.diffDays(desde, d) / span * 100, 0, 100);
    const lotes = VG.db.list('lote', l => Number(l.temporada) === y).sort((a, b) => String(a.fechaVendimiaPlan).localeCompare(String(b.fechaVendimiaPlan)));
    const heads = [];
    if (modo === 'semanal') for (let i = 0; i < 12; i++) heads.push('Sem ' + U.fmtDate(U.addDays(desde, i * 7)).slice(0, 5));
    else for (let i = 0; i < 12; i++) heads.push(U.monthName(U.addDays(desde, i * 30.5).slice(0, 7)));
    const hoyX = pos(U.today());
    content.innerHTML = `<div class="row" style="margin-bottom:12px"><a class="btn btn-sm ${modo === 'mensual' ? 'btn-primary' : ''}" href="#/calendario/gantt?modo=mensual">Mensual</a><a class="btn btn-sm ${modo === 'semanal' ? 'btn-primary' : ''}" href="#/calendario/gantt?modo=semanal">Semanal</a>
      <span class="grow"></span><div class="chart-legend">${Object.entries(COLORS).map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join('')}<span><i style="background:var(--color-text);width:3px"></i>Hito real</span><span><i style="background:var(--color-error);width:2px"></i>Hoy</span></div></div>
      ${lotes.length ? `<div class="gantt card" style="padding:0"><div class="gantt-row gantt-head"><div class="gantt-label"><b>Lote</b></div><div class="gantt-track">${heads.map(h => `<span>${h}</span>`).join('')}</div></div>
      ${lotes.map(l => { const r = real(l); return `<div class="gantt-row"><div class="gantt-label" title="${U.esc(l.codigo)}"><a href="#/calendario?id=${l.id}">${U.esc(l.codigo)}</a> <span class="text-xs muted">${U.esc(l.estado)}</span></div><div class="gantt-track">
        ${plan(l).map(p => { const a = pos(p.from), b = pos(p.to); return b > a ? `<div class="gantt-bar" style="left:${a}%;width:${Math.max(0.6, b - a)}%;background:${p.color}" title="${p.fase}: ${U.fmtDate(p.from)} → ${U.fmtDate(p.to)}">${b - a > 6 ? p.fase : ''}</div>` : ''; }).join('')}
        ${[r.faIni, r.faFin, r.fmlIni, r.fmlFin].filter(Boolean).map(d => `<div style="position:absolute;top:4px;bottom:4px;width:3px;left:${pos(d)}%;background:var(--color-text);border-radius:2px" title="Real: ${U.fmtDate(d)}"></div>`).join('')}
        ${hoyX > 0 && hoyX < 100 ? `<div class="gantt-today" style="left:${hoyX}%"></div>` : ''}</div></div>`; }).join('')}</div>` : UI.empty({ icon: '📅', title: 'No hay lotes en la temporada ' + y, text: 'Crea lotes en "Lotes y planificación" para verlos aquí.' })}`;
  }

  function ventanas(ctx) {
    UI.crud(ctx.el, {
      entity: 'ventana', moduleId: 'calendario', title: 'Ventanas de cosecha por variedad y valle', crumbs: [['Operación'], ['Calendario', '#/calendario']], tabs: UI.moduleTabs(ctx),
      desc: 'Base editable de ventanas típicas de cosecha en Chile (referencial, basada en rangos usuales informados por ODEPA y SAG). Ajústala a la realidad de tu viña.',
      newLabel: 'Nueva ventana', emptyIcon: '🗓️',
      fields: [{ key: 'variedad', label: 'Variedad', required: true }, { key: 'valle', label: 'Valle', required: true }, { key: 'desde', label: 'Desde (mm-dd)', required: true, placeholder: '03-15', validate: v => /^\d{2}-\d{2}$/.test(v) ? '' : 'Usa el formato mm-dd, ej. 03-15.' }, { key: 'hasta', label: 'Hasta (mm-dd)', required: true, placeholder: '04-20', validate: (v, a) => !/^\d{2}-\d{2}$/.test(v) ? 'Usa el formato mm-dd.' : v < a.desde ? 'Debe ser posterior a "desde".' : '' }, { key: 'fuente', label: 'Fuente / nota' }],
      columns: [{ key: 'variedad', label: 'Variedad' }, { key: 'valle', label: 'Valle' }, { key: 'desde', label: 'Desde', render: r => r.desde.split('-').reverse().join('/') }, { key: 'hasta', label: 'Hasta', render: r => r.hasta.split('-').reverse().join('/') }, { key: 'dias', label: 'Días', num: true, value: r => U.diffDays('2026-' + r.desde, '2026-' + r.hasta) }, { key: 'fuente', label: 'Fuente' }],
      defaultSort: 'variedad', defaultDir: 'asc',
      filters: [{ key: 'valle', label: 'Valle', options: () => Array.from(new Set(VG.db.list('ventana').map(v => v.valle))).sort() }, { key: 'variedad', label: 'Variedad', options: () => Array.from(new Set(VG.db.list('ventana').map(v => v.variedad))).sort() }]
    });
  }

  VG.registry.implement('calendario', {
    /** Instala la base de ventanas de vendimia la primera vez. */
    async onInstall() {
      if (VG.db.count('ventana')) return;
      await VG.db.saveMany('ventana', VENTANAS_BASE.map(([variedad, valle, desde, hasta]) => ({ variedad, valle, desde, hasta, fuente: 'Referencial (rangos típicos ODEPA/SAG)' })), { system: true, silent: true });
    },
    async onMount(ctx) { (ctx.sub === 'gantt' ? gantt : ctx.sub === 'ventanas' ? ventanas : lotes)(ctx); },
    plan, ESTADOS
  });
})(window.VG);
