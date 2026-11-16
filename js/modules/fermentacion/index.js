/**
 * modules/fermentacion/index.js — Módulo 8. Gestión de fermentación.
 * Ficha por lote, seguimiento diario, control de metabisulfito (dosis g → mg/L,
 * SO₂ teórico vs medido, modo suave con umbrales), tiempos (latencia, días FA,
 * velocidad), FML para tintos, gráficos y reporte de cierre.
 * Publica: fermentacion.faIniciada, fermentacion.faFinalizada, fermentacion.so2Agregado
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui, Oe = () => VG.calc.oenology;
  const db = () => VG.db;
  const segsDe = id => db().list('seguimiento', s => s.fermentacionId === id).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const so2De = id => db().list('adicionSO2', s => s.fermentacionId === id).sort((a, b) => a.fecha.localeCompare(b.fecha));

  const fichaFields = [
    { key: 'codigo', label: 'Código de la ficha', required: true, section: 'Datos iniciales' },
    { key: 'loteId', label: 'Lote', type: 'ref', ref: 'lote', required: true, section: 'Datos iniciales', onChangeSet: v => { const l = db().get('lote', v.loteId) || {}; return { tipo: l.tipo, variedad: l.variedad, codigo: v.codigo || 'FA-' + (l.codigo || '') }; } },
    { key: 'estanqueId', label: 'Estanque', type: 'ref', ref: 'estanque', section: 'Datos iniciales' },
    { key: 'tipo', label: 'Tipo', type: 'select', options: [['blanco', 'Blanco'], ['tinto', 'Tinto']], required: true, section: 'Datos iniciales' },
    { key: 'variedad', label: 'Variedad', section: 'Datos iniciales' },
    { key: 'volumen', label: 'Volumen', type: 'number', unit: 'L', min: 1, required: true, section: 'Datos iniciales' },
    { key: 'brixInicial', label: '°Brix inicial', type: 'number', min: 10, max: 32, step: 0.1, section: 'Datos iniciales' },
    { key: 'phInicial', label: 'pH inicial', type: 'number', min: 2.8, max: 4.2, step: 0.01, section: 'Datos iniciales' },
    { key: 'acidezInicial', label: 'Acidez total inicial', type: 'number', unit: 'g/L', min: 0, section: 'Datos iniciales' },
    { key: 'levadura', label: 'Levadura', section: 'Datos iniciales' },
    { key: 'nutrientes', label: 'Nutrientes', section: 'Datos iniciales' },
    { key: 'temperaturaObjetivo', label: 'Temperatura objetivo', section: 'Datos iniciales', placeholder: '14–16 °C' },
    { key: 'diasPlanificados', label: 'Días de FA planificados', type: 'number', min: 1, step: 1, section: 'Hitos', help: 'Se usa para alertar desviaciones mayores a 3 días.' },
    { key: 'fechaMolienda', label: 'Molienda', type: 'date', section: 'Hitos' },
    { key: 'inicioFA', label: 'Inicio FA', type: 'date', section: 'Hitos' },
    { key: 'inicioTumultuosa', label: 'Inicio fase tumultuosa', type: 'date', section: 'Hitos' },
    { key: 'fechaCorte', label: 'Corte / enfriado', type: 'date', section: 'Hitos' },
    { key: 'finFA', label: 'Fin FA', type: 'date', section: 'Hitos', validate: (v, a) => a.inicioFA && v && v < a.inicioFA ? 'Debe ser posterior al inicio de FA.' : '' },
    { key: 'inicioMaceracion', label: 'Inicio maceración', type: 'date', section: 'Tintos: maceración y FML', showIf: v => v.tipo === 'tinto' },
    { key: 'finMaceracion', label: 'Descube', type: 'date', section: 'Tintos: maceración y FML', showIf: v => v.tipo === 'tinto' },
    { key: 'inicioFML', label: 'Inicio FML', type: 'date', section: 'Tintos: maceración y FML', showIf: v => v.tipo === 'tinto' },
    { key: 'finFML', label: 'Fin FML', type: 'date', section: 'Tintos: maceración y FML', showIf: v => v.tipo === 'tinto' },
    { key: 'alcoholFinal', label: 'Alcohol final', type: 'number', unit: '% vol', min: 0, max: 18, section: 'Parámetros finales' },
    { key: 'azucarResidual', label: 'Azúcar residual', type: 'number', unit: 'g/L', min: 0, section: 'Parámetros finales' },
    { key: 'estado', label: 'Estado de la ficha', type: 'select', options: [['borrador', 'Borrador'], ['activa', 'Activa'], ['cerrada', 'Cerrada']], section: 'Parámetros finales' }
  ];

  async function saveFicha(rec, before) {
    const r = await db().save('fermentacion', rec);
    if (r.inicioFA && (!before || !before.inicioFA)) VG.events.emit('fermentacion.faIniciada', { ficha: r });
    if (r.finFA && (!before || !before.finFA)) VG.events.emit('fermentacion.faFinalizada', { ficha: r });
    return r;
  }

  function lista(ctx) {
    const content = UI.page(ctx.el, {
      title: 'Gestión de fermentación', crumbs: [['Vinificación y bodega']],
      desc: 'Fichas por lote con seguimiento diario, control de metabisulfito en modo suave y tiempos de fermentación. Al registrar una entrada de mosto en bodega se crea la ficha automáticamente.',
      actions: [{ label: 'Nueva ficha', icon: 'plus', primary: true, perm: ['fermentacion', 'c'], run: async () => { const r = await UI.formModal({ title: 'Nueva ficha de fermentación', fields: fichaFields, values: { estado: 'activa', diasPlanificados: 12, fechaMolienda: U.today() }, draftKey: 'fermentacion:nueva', onSave: v => saveFicha(v) }); if (r) { UI.toast('Ficha creada.'); location.hash = '#/fermentacion/ficha/' + r.id; } } }]
    });
    const fichas = db().list('fermentacion', f => VG.store.inSeason(db().get('lote', f.loteId) || {}, 'x') || !f.loteId).sort((a, b) => String(b.inicioFA || b.fechaMolienda).localeCompare(String(a.inicioFA || a.fechaMolienda)));
    if (!fichas.length) { content.innerHTML = UI.empty({ icon: '🫧', title: 'No hay fichas en esta temporada', text: 'Crea una ficha o registra una entrada de mosto en Control de bodega.' }); return; }
    content.innerHTML = `<div class="grid grid-3">${fichas.map(f => {
      const segs = segsDe(f.id), t = Oe().tiempos(f, segs);
      const lastSO2 = segs.slice().reverse().find(s => s.so2Libre !== '' && s.so2Libre !== undefined);
      const st = lastSO2 ? Oe().estadoSO2(lastSO2.so2Libre, f.tipo) : null;
      const etapa = f.finFML ? 'FML terminada' : f.inicioFML ? 'En FML' : f.finFA ? 'FA terminada' : f.inicioFA ? 'Fermentando' : 'Por iniciar';
      return `<a class="card" href="#/fermentacion/ficha/${f.id}" style="text-decoration:none;color:inherit;display:block">
        <div class="card-head"><h3>${U.esc(f.codigo)}${UI.demoBadge(f)}</h3>${UI.tipoBadge(f.tipo)}</div>
        <p class="muted text-sm" style="margin-top:-6px">${UI.ref('lote', f.loteId)} · ${UI.ref('estanque', f.estanqueId)} · ${U.lt(f.volumen)}</p>
        <div class="row" style="gap:6px;margin-bottom:10px">${UI.badge(etapa, f.finFA ? 'success' : f.inicioFA ? 'primary' : '')}${t.alertaDesvio ? UI.badge(`Desvío ${t.desvio > 0 ? '+' : ''}${t.desvio} d`, 'warning') : ''}${st ? UI.badge('SO₂ ' + U.dec1(lastSO2.so2Libre) + ' mg/L', st === 'ok' ? 'success' : st === 'critico' ? 'error' : st === 'alto' ? 'warning' : 'info') : ''}</div>
        ${UI.dl([['Días de FA', t.diasFA !== null ? t.diasFA + (f.diasPlanificados ? ' / ' + f.diasPlanificados + ' plan.' : '') : '—'], ['Latencia', t.latencia !== null ? t.latencia + ' d' : '—'], ['Velocidad', t.velocidad ? U.dec1(t.velocidad) + ' g/L/día' : '—'], ['°Brix actual', t.brixActual !== null ? U.dec1(t.brixActual) : '—']])}
      </a>`;
    }).join('')}</div>`;
  }

  function ficha(ctx, id) {
    const f = db().get('fermentacion', id);
    if (!f) { ctx.el.innerHTML = UI.empty({ icon: '🔎', title: 'Ficha no encontrada' }); return; }
    const segs = segsDe(f.id), adds = so2De(f.id), t = Oe().tiempos(f, segs), r = Oe().rangoSO2(f.tipo);
    const canE = VG.auth.can('fermentacion', 'e'), canC = VG.auth.can('fermentacion', 'c');
    const content = UI.page(ctx.el, {
      title: f.codigo, crumbs: [['Vinificación y bodega'], ['Fermentación', '#/fermentacion']],
      desc: `${UI.ref('lote', f.loteId)} · ${U.esc(f.variedad || '')} · ${UI.ref('estanque', f.estanqueId)} · ${U.lt(f.volumen)} · Modo suave SO₂ libre ${r.min}–${r.max} mg/L (alerta > ${r.alerta})`,
      actions: [
        canC && { label: 'Registrar seguimiento', icon: 'plus', primary: true, run: () => addSeg(f) },
        canC && { label: 'Adición de metabisulfito', icon: 'drop', run: () => addSO2(f) },
        canE && { label: 'Editar hitos y datos', icon: 'edit', run: async () => { const x = await UI.formModal({ title: 'Editar ficha ' + f.codigo, fields: fichaFields, values: f, size: 'lg', draftKey: 'fermentacion:' + f.id, onSave: v => saveFicha(Object.assign({}, f, v), f) }); if (x) { UI.toast('Ficha actualizada.'); ctx.refresh(); } } },
        { label: 'Reporte de cierre (CSV)', icon: 'download', run: () => reporteCSV(f) },
        { label: 'Imprimir / PDF', icon: 'print', run: () => window.print() }
      ]
    });
    const lastSO2 = segs.slice().reverse().find(s => s.so2Libre !== '' && s.so2Libre !== undefined);
    const lastAdd = adds[adds.length - 1];
    const sinceAdd = lastAdd ? (Date.now() - new Date(lastAdd.fecha + 'T12:00:00')) / 3600000 : Infinity;
    content.innerHTML = `
      <div class="grid grid-4">
        ${UI.kpi({ label: 'Días de FA', value: t.diasFA ?? '—', icon: 'calendar', micro: f.diasPlanificados ? `Planificados: ${f.diasPlanificados}` : '', tone: t.alertaDesvio ? 'warning' : '' })}
        ${UI.kpi({ label: 'Latencia', value: t.latencia !== null ? t.latencia + ' d' : '—', icon: 'temp', micro: 'Inicio FA → fase tumultuosa' })}
        ${UI.kpi({ label: 'Velocidad media', value: t.velocidad ? U.dec1(t.velocidad) : '—', icon: 'chart', micro: 'g/L/día de azúcar consumida' })}
        ${UI.kpi({ label: 'SO₂ libre actual', value: lastSO2 ? U.dec1(lastSO2.so2Libre) + ' mg/L' : '—', icon: 'drop', tone: lastSO2 ? { ok: 'success', alto: 'warning', critico: 'error', bajo: 'info' }[Oe().estadoSO2(lastSO2.so2Libre, f.tipo)] : '', micro: lastSO2 ? 'Medido el ' + U.fmtDate(lastSO2.fecha) : 'Sin mediciones' })}
      </div>
      <div class="stack" style="margin-top:16px" data-alerts></div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><div class="card-head"><h3>Curva de fermentación</h3></div><p class="card-desc">°Brix y densidad (g/L − 990) por día. Una caída sostenida indica fermentación activa.</p><div data-c1></div></div>
        <div class="card"><div class="card-head"><h3>Temperatura</h3></div><p class="card-desc">°C durante el seguimiento.</p><div data-c2></div></div>
        <div class="card"><div class="card-head"><h3>Evolución del SO₂ libre</h3></div><p class="card-desc">La franja verde es el rango del modo suave; la línea roja, el umbral de alerta.</p><div data-c3></div></div>
        <div class="card"><div class="card-head"><h3>Hitos</h3></div>${UI.dl([['Molienda', U.fmtDate(f.fechaMolienda)], ['Inicio FA', U.fmtDate(f.inicioFA)], ['Inicio tumultuosa', U.fmtDate(f.inicioTumultuosa)], ['Corte', U.fmtDate(f.fechaCorte)], ['Fin FA', U.fmtDate(f.finFA)], f.tipo === 'tinto' && ['Maceración', `${U.fmtDate(f.inicioMaceracion)} → ${U.fmtDate(f.finMaceracion)}`], f.tipo === 'tinto' && ['FML', `${U.fmtDate(f.inicioFML)} → ${U.fmtDate(f.finFML)}${t.diasFML !== null ? ' (' + t.diasFML + ' d)' : ''}`], ['Alcohol probable inicial', f.brixInicial ? U.dec1(Oe().alcoholProbable(f.brixInicial)) + ' % vol' : '—'], ['Alcohol final', f.alcoholFinal ? U.dec1(f.alcoholFinal) + ' % vol' : '—'], ['Azúcar residual', f.azucarResidual ? U.dec1(f.azucarResidual) + ' g/L' : '—']])}</div>
      </div>
      <h2 style="margin-top:28px">Adiciones de metabisulfito</h2><div data-t2></div>
      <h2 style="margin-top:28px">Seguimiento</h2><div data-t1></div>`;
    // alertas
    const al = [];
    if (lastSO2) { const st = Oe().estadoSO2(lastSO2.so2Libre, f.tipo); if (st === 'critico') al.push(UI.alert('error', 'Sobre-sulfitado', `SO₂ libre ${U.dec1(lastSO2.so2Libre)} mg/L supera el umbral de alerta (${r.alerta} mg/L). No agregues más metabisulfito; evalúa airear o mezclar.`)); else if (st === 'alto') al.push(UI.alert('warning', 'SO₂ libre sobre el rango suave', `${U.dec1(lastSO2.so2Libre)} mg/L (rango ${r.min}–${r.max}).`)); else if (st === 'bajo' && f.finFA) al.push(UI.alert('info', 'SO₂ libre bajo el rango', `${U.dec1(lastSO2.so2Libre)} mg/L. Evalúa una adición para proteger el vino.`)); }
    if (t.alertaDesvio) al.push(UI.alert('warning', `Desviación de ${t.desvio > 0 ? '+' : ''}${t.desvio} días`, `La FA ${t.enCurso ? 'lleva' : 'duró'} ${t.diasFA} días vs ${f.diasPlanificados} planificados.`));
    if (sinceAdd < VG.store.config().enologia.intervaloMinHoras) al.push(UI.alert('info', 'Intervalo mínimo entre adiciones', `La última adición fue hace menos de ${VG.store.config().enologia.intervaloMinHoras} h. Espera antes de una nueva.`));
    if (t.enCurso && segs.length && U.diffDays(segs[segs.length - 1].fecha, U.today()) > 2) al.push(UI.alert('warning', 'Seguimiento atrasado', `El último registro es del ${U.fmtDate(segs[segs.length - 1].fecha)}.`));
    content.querySelector('[data-alerts]').innerHTML = al.join('');
    // gráficos
    const fa = segs.filter(s => s.brix !== '' && s.brix !== undefined);
    VG.charts.line(content.querySelector('[data-c1]'), { labels: fa.map(s => U.fmtDate(s.fecha).slice(0, 5)), series: [{ name: '°Brix', data: fa.map(s => s.brix) }, { name: 'Densidad − 990', data: fa.map(s => U.n(s.densidad) ? U.n(s.densidad) - 990 : null) }], height: 200, tipFmt: v => U.dec1(v) });
    const tt = segs.filter(s => s.temperatura !== '' && s.temperatura !== undefined);
    VG.charts.line(content.querySelector('[data-c2]'), { labels: tt.map(s => U.fmtDate(s.fecha).slice(0, 5)), series: [{ name: 'Temperatura °C', data: tt.map(s => s.temperatura) }], height: 200, tipFmt: v => U.dec1(v) + ' °C' });
    const ss = segs.filter(s => s.so2Libre !== '' && s.so2Libre !== undefined);
    VG.charts.line(content.querySelector('[data-c3]'), { labels: ss.map(s => U.fmtDate(s.fecha).slice(0, 5)), series: [{ name: 'SO₂ libre mg/L', data: ss.map(s => s.so2Libre) }], bands: [{ from: r.min, to: r.max, label: 'Rango suave' }], refLines: [{ value: r.alerta, label: 'Alerta ' + r.alerta }], height: 200, tipFmt: v => U.dec1(v) + ' mg/L' });
    // tablas
    UI.table(content.querySelector('[data-t2]'), {
      rows: adds, search: false, exportName: 'adiciones_so2_' + f.codigo,
      columns: [{ key: 'fecha', label: 'Fecha', render: a => U.fmtDate(a.fecha) }, { key: 'producto', label: 'Producto' }, { key: 'gramos', label: 'Gramos', num: true, render: a => U.int(a.gramos) }, { key: 'volumen', label: 'Volumen', num: true, render: a => U.lt(a.volumen) }, { key: 'dosisMgL', label: 'Dosis', num: true, render: a => U.dec1(a.dosisMgL) + ' mg/L' }, { key: 'so2Previo', label: 'SO₂ previo', num: true }, { key: 'so2Teorico', label: 'Teórico', num: true, render: a => U.dec1(a.so2Teorico) }, { key: 'so2Medido', label: 'Medido', num: true }, { key: 'dif', label: 'Diferencia', num: true, value: a => U.n(a.so2Medido) - U.n(a.so2Teorico), render: a => a.so2Medido !== '' && a.so2Medido !== undefined ? `<span class="${U.n(a.so2Medido) - U.n(a.so2Teorico) < -10 ? 'text-warning' : ''}">${U.dec1(U.n(a.so2Medido) - U.n(a.so2Teorico))}</span>` : '—' }, { key: 'costo', label: 'Costo', num: true, render: a => U.clp(a.costo) }],
      rowActions: VG.auth.can('fermentacion', 'd') ? a => [{ label: 'Eliminar', icon: 'trash', danger: true, run: async () => { if (await UI.confirm({ title: 'Eliminar adición', message: 'Se eliminará la adición y su consumo de insumo.', danger: true, confirmText: 'Eliminar' })) { await db().remove('adicionSO2', a.id); db().list('movInsumo', m => m.ref === 'so2:' + a.id).forEach(m => db().remove('movInsumo', m.id, { system: true })); ctx.refresh(); } } }] : null,
      footer: rows => ({ gramos: U.int(U.sum(rows, a => a.gramos)), costo: U.clp(U.sum(rows, a => a.costo)) }),
      empty: { icon: '💧', title: 'Sin adiciones', text: 'Registra adiciones con el botón "Adición de metabisulfito".' }
    });
    UI.table(content.querySelector('[data-t1]'), {
      rows: segs.slice().reverse(), exportName: 'seguimiento_' + f.codigo, pageSize: 20,
      columns: [{ key: 'fecha', label: 'Fecha', render: s => U.fmtDate(s.fecha) }, { key: 'densidad', label: 'Densidad', num: true, render: s => s.densidad ? U.dec1(s.densidad) : '—' }, { key: 'brix', label: '°Brix', num: true, render: s => s.brix !== '' && s.brix !== undefined ? U.dec1(s.brix) : '—' }, { key: 'temperatura', label: 'T° °C', num: true, render: s => s.temperatura !== '' && s.temperatura !== undefined ? U.dec1(s.temperatura) : '—' }, { key: 'ph', label: 'pH', num: true, render: s => s.ph ? U.dec2(s.ph) : '—' }, { key: 'acidezVolatil', label: 'AV', num: true, render: s => s.acidezVolatil ? U.dec2(s.acidezVolatil) : '—' }, { key: 'so2Libre', label: 'SO₂ L', num: true, render: s => s.so2Libre !== '' && s.so2Libre !== undefined ? `<span class="${{ ok: '', alto: 'text-warning', critico: 'text-error', bajo: 'text-info' }[Oe().estadoSO2(s.so2Libre, f.tipo)]}">${U.dec1(s.so2Libre)}</span>` : '—' }, { key: 'so2Total', label: 'SO₂ T', num: true }, { key: 'responsable', label: 'Responsable' }, { key: 'observaciones', label: 'Observaciones' }],
      rowActions: canE ? s => [{ label: 'Editar', icon: 'edit', run: () => addSeg(f, s) }, { label: 'Eliminar', icon: 'trash', danger: true, run: async () => { if (await UI.confirm({ title: 'Eliminar registro', message: 'Se eliminará el registro de seguimiento.', danger: true, confirmText: 'Eliminar' })) { await db().remove('seguimiento', s.id); ctx.refresh(); } } }] : null,
      empty: { icon: '📈', title: 'Sin seguimiento', text: 'Registra densidad, °Brix y temperatura a diario durante la FA.' }
    });

    async function addSeg(f, rec) {
      const r2 = await UI.formModal({
        title: (rec ? 'Editar' : 'Registrar') + ' seguimiento · ' + f.codigo, values: rec || { fecha: U.today(), responsable: VG.auth.current().nombre },
        fields: [
          { key: 'fecha', label: 'Fecha', type: 'date', required: true }, { key: 'responsable', label: 'Responsable' },
          { key: 'densidad', label: 'Densidad', type: 'number', unit: 'g/L', min: 980, max: 1140, step: 0.1 },
          { key: 'brix', label: '°Brix', type: 'number', min: -3, max: 32, step: 0.1, hint: 'Si lo dejas vacío y hay densidad, se calcula.' },
          { key: 'temperatura', label: 'Temperatura', type: 'number', unit: '°C', min: 0, max: 40, step: 0.1, validate: v => U.n(v) > 32 ? 'Temperatura muy alta: riesgo de parada de fermentación.' : '' },
          { key: 'ph', label: 'pH', type: 'number', min: 2.8, max: 4.3, step: 0.01 },
          { key: 'acidezVolatil', label: 'Acidez volátil', type: 'number', unit: 'g/L', min: 0, max: 2, step: 0.01 },
          { key: 'so2Libre', label: 'SO₂ libre', type: 'number', unit: 'mg/L', min: 0, max: 150 },
          { key: 'so2Total', label: 'SO₂ total', type: 'number', unit: 'mg/L', min: 0, max: 400, validate: (v, a) => v !== '' && a.so2Libre !== '' && U.n(v) < U.n(a.so2Libre) ? 'El SO₂ total no puede ser menor que el libre.' : '' },
          { key: 'observaciones', label: 'Observaciones', type: 'textarea' }
        ],
        liveCalc: v => { const b = v.brix !== '' && v.brix !== undefined ? U.n(v.brix) : U.n(v.densidad) ? Oe().brixDesdeDensidad(v.densidad) : null; const st = v.so2Libre !== '' && v.so2Libre !== undefined ? Oe().estadoSO2(v.so2Libre, f.tipo) : null; return `<h4>Lectura</h4><dl><dt>°Brix (calc.)</dt><dd>${b !== null ? U.dec1(b) : '—'}</dd><dt>Alcohol potencial restante</dt><dd>${b !== null ? U.dec1(Oe().alcoholProbable(Math.max(0, b))) + ' %' : '—'}</dd><dt>Estado SO₂</dt><dd class="${{ ok: 'text-success', alto: 'text-warning', critico: 'text-error', bajo: 'text-info' }[st] || ''}">${st ? { ok: 'En rango', alto: 'Alto', critico: 'Crítico', bajo: 'Bajo' }[st] : '—'}</dd></dl>`; },
        onSave: v => { if ((v.brix === '' || v.brix === undefined) && U.n(v.densidad)) v.brix = U.round(Oe().brixDesdeDensidad(v.densidad), 1); return db().save('seguimiento', Object.assign({}, rec || {}, v, { fermentacionId: f.id })); }
      });
      if (r2) { UI.toast('Seguimiento guardado.'); if (U.n(r2.brix) <= 0 && !f.finFA && f.inicioFA) UI.toast('El °Brix indica fin de FA. Registra la fecha de término en "Editar hitos".', 'info'); ctx.refresh(); }
    }
    async function addSO2(f) {
      const metas = db().list('insumo', i => i.tipo === 'Sulfitante');
      const vol = Math.round(VG.calc.inventory.litrosLote(f.loteId)) || f.volumen;
      const prev = lastSO2 ? U.n(lastSO2.so2Libre) : 0;
      if (sinceAdd < VG.store.config().enologia.intervaloMinHoras && !(await UI.confirm({ title: 'Intervalo mínimo no cumplido', message: `La última adición fue hace ${Math.round(sinceAdd)} horas (mínimo recomendado ${VG.store.config().enologia.intervaloMinHoras} h). ¿Registrar de todas formas?`, confirmText: 'Registrar igual' }))) return;
      const r2 = await UI.formModal({
        title: 'Adición de metabisulfito · ' + f.codigo, size: 'lg',
        values: { fecha: U.today(), insumoId: (metas[0] || {}).id, volumen: vol, so2Previo: prev, objetivo: Math.max(0, Math.round((r.min + r.max) / 2 - prev)), modo: 'suave' },
        fields: [
          { key: 'fecha', label: 'Fecha', type: 'date', required: true },
          { key: 'insumoId', label: 'Producto', type: 'ref', ref: 'insumo', refFilter: i => i.tipo === 'Sulfitante', required: true, help: 'K₂S₂O₅ ≈ 57% SO₂; Na₂S₂O₅ ≈ 67% SO₂.' },
          { key: 'volumen', label: 'Volumen del lote', type: 'number', unit: 'L', min: 1, required: true },
          { key: 'so2Previo', label: 'SO₂ libre antes de la adición', type: 'number', unit: 'mg/L', min: 0 },
          { key: 'objetivo', label: 'Aporte deseado', type: 'number', unit: 'mg/L', min: 0, max: 60, help: 'Cuánto SO₂ quieres aportar. Se sugieren los gramos de producto.' },
          { key: 'gramos', label: 'Gramos a agregar', type: 'number', unit: 'g', min: 1, required: true },
          { key: 'modo', label: 'Modo', type: 'select', options: [['suave', 'Suave'], ['moderado', 'Moderado']] },
          { key: 'so2Medido', label: 'SO₂ libre medido después (opcional)', type: 'number', unit: 'mg/L', min: 0 },
          { key: 'motivo', label: 'Motivo', list: ['Protección del mosto', 'Encubado', 'Post FA', 'Post FML', 'Guarda', 'Ajuste previo a envasado'] }
        ],
        liveCalc: v => {
          const i = db().get('insumo', v.insumoId), fr = Oe().fraccionSO2(i);
          const sug = Oe().gramosParaDosis(v.objetivo, v.volumen, fr), dosis = Oe().dosisMgL(v.gramos, v.volumen, fr);
          const teo = Oe().so2Teorico(v.so2Previo, dosis), st = Oe().estadoSO2(teo, f.tipo);
          const ef = v.so2Medido !== '' && v.so2Medido !== undefined ? Oe().eficienciaSO2(v.so2Previo, v.so2Medido, dosis) : null;
          return `<h4>Cálculo automático</h4><dl><dt>Fracción SO₂</dt><dd>${U.pct(fr, 0)}</dd><dt>Gramos sugeridos</dt><dd><b>${U.dec1(sug)} g</b></dd><dt>Dosis aportada</dt><dd>${U.dec1(dosis)} mg/L</dd><dt>SO₂ teórico esperado</dt><dd class="${{ ok: 'text-success', alto: 'text-warning', critico: 'text-error', bajo: 'text-info' }[st]}">${U.dec1(teo)} mg/L</dd><dt>Rango suave</dt><dd>${r.min}–${r.max}</dd>${ef !== null ? `<dt>Diferencia medido − teórico</dt><dd>${U.dec1(U.n(v.so2Medido) - teo)} mg/L</dd><dt>Fracción que quedó libre</dt><dd>${U.pct(ef, 0)}</dd>` : ''}<dt class="total">Costo</dt><dd class="total">${U.clp(U.n(v.gramos) / 1000 * U.n(i && i.precio))}</dd></dl>${st === 'critico' ? '<p class="text-xs text-error" style="margin:6px 0 0">⚠ Con esta dosis se superaría el umbral de alerta (sobre-sulfitado).</p>' : st === 'alto' ? '<p class="text-xs text-warning" style="margin:6px 0 0">⚠ Quedaría sobre el rango suave.</p>' : ''}`;
        },
        onSave: async v => {
          const i = db().get('insumo', v.insumoId), fr = Oe().fraccionSO2(i);
          const dosis = Oe().dosisMgL(v.gramos, v.volumen, fr);
          const teo = Oe().so2Teorico(v.so2Previo, dosis);
          if (Oe().estadoSO2(teo, f.tipo) === 'critico' && !(await UI.confirm({ title: 'Riesgo de sobre-sulfitado', message: `El SO₂ libre teórico quedaría en ${U.dec1(teo)} mg/L, sobre el umbral de alerta (${r.alerta}). ¿Confirmas la adición?`, confirmText: 'Sí, registrar', danger: true }))) return false;
          const a = await db().save('adicionSO2', { fermentacionId: f.id, fecha: v.fecha, insumoId: v.insumoId, producto: i ? i.nombre : '', fraccion: fr, gramos: v.gramos, volumen: v.volumen, dosisMgL: U.round(dosis, 1), so2Previo: v.so2Previo, so2Medido: v.so2Medido, so2Teorico: U.round(teo, 1), costo: Math.round(U.n(v.gramos) / 1000 * U.n(i && i.precio)), motivo: v.motivo, modo: v.modo, responsable: VG.auth.current().nombre });
          await db().save('movInsumo', { fecha: v.fecha, insumoId: v.insumoId, cantidad: -U.n(v.gramos) / 1000, tipo: 'so2', ref: 'so2:' + a.id }, { system: true, silent: true });
          if (v.so2Medido !== '' && v.so2Medido !== undefined) await db().save('seguimiento', { fermentacionId: f.id, fecha: v.fecha, so2Libre: v.so2Medido, responsable: VG.auth.current().nombre, observaciones: 'Medición post adición de SO₂' });
          VG.events.emit('fermentacion.so2Agregado', { ficha: f, adicion: a });
          return a;
        }
      });
      if (r2) { UI.toast('Adición registrada.'); ctx.refresh(); }
    }
  }

  function reporteCSV(f) {
    const segs = segsDe(f.id), adds = so2De(f.id), t = Oe().tiempos(f, segs);
    const lines = [['Reporte de cierre de lote', f.codigo], ['Lote', U.esc(VG.ui.refText('lote', f.loteId))], ['Variedad', f.variedad], ['Tipo', f.tipo], ['Volumen (L)', f.volumen], ['Inicio FA', f.inicioFA], ['Fin FA', f.finFA], ['Días FA', t.diasFA], ['Latencia (d)', t.latencia], ['Velocidad (g/L/día)', U.round(t.velocidad, 2)], ['FML', (f.inicioFML || '') + ' → ' + (f.finFML || '')], ['Alcohol final', f.alcoholFinal], ['Azúcar residual', f.azucarResidual], ['SO₂ agregado total (g)', U.sum(adds, a => a.gramos)], ['Costo SO₂', U.sum(adds, a => a.costo)], [], ['Fecha', 'Densidad', 'Brix', 'Temp', 'pH', 'AV', 'SO2 libre', 'SO2 total', 'Observaciones']]
      .concat(segs.map(s => [s.fecha, s.densidad, s.brix, s.temperatura, s.ph, s.acidezVolatil, s.so2Libre, s.so2Total, s.observaciones || '']));
    U.download(`cierre_${f.codigo}.csv`, '﻿' + lines.map(l => l.map(x => { const v = String(x ?? ''); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';')).join('\r\n'));
    UI.toast('Reporte descargado.');
  }

  VG.registry.implement('fermentacion', {
    async onMount(ctx) {
      if (ctx.query.id) return ficha(ctx, ctx.query.id);
      if (ctx.sub === 'ficha' && ctx.rest[0]) return ficha(ctx, ctx.rest[0]);
      lista(ctx);
    }
  });
})(window.VG);
