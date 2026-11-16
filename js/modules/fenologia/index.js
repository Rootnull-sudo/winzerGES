/**
 * modules/fenologia/index.js — Módulo 2. Control de desborre (fenología).
 * Fechas de desborre (inicio/50%/fin), estados BBCH, grados día acumulados (Winkler)
 * y comparación entre temporadas.
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui;
  const BBCH = ['BBCH 00 — Yema dormida', 'BBCH 05 — Yema algodonosa', 'BBCH 07 — Inicio desborre', 'BBCH 09 — Desborre (punta verde)', 'BBCH 15 — 5 hojas', 'BBCH 53 — Racimos visibles', 'BBCH 61 — Inicio floración', 'BBCH 65 — Plena floración', 'BBCH 71 — Cuaja', 'BBCH 77 — Cierre de racimo', 'BBCH 81 — Inicio envero', 'BBCH 85 — Ablandamiento', 'BBCH 89 — Cosecha'];
  const doy = s => { const d = U.parseDate(s); if (!d) return null; const start = new Date(d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1, 6, 1); return Math.round((d - start) / 86400000); }; // días desde el 1 de julio

  VG.registry.implement('fenologia', {
    async onMount(ctx) {
      if (ctx.sub === 'clima') return clima(ctx);
      UI.crud(ctx.el, {
        entity: 'fenologia', moduleId: 'fenologia', query: ctx.query, title: 'Desborre y fenología', crumbs: [['Operación']],
        desc: 'Registra el avance fenológico de cada cuartel y compara entre temporadas. Los grados día se calculan con las temperaturas registradas.',
        tabs: [{ label: 'Registros fenológicos', href: '#/fenologia', active: true }, { label: 'Temperaturas y grados día', href: '#/fenologia/clima' }],
        newLabel: 'Nuevo registro', emptyIcon: '🌱',
        fields: [
          { key: 'cuartelId', label: 'Cuartel', type: 'ref', ref: 'cuartel', required: true },
          { key: 'temporada', label: 'Temporada (año de vendimia)', type: 'number', required: true, min: 2000, max: 2100, step: 1, help: 'El desborre de septiembre 2026 corresponde a la vendimia 2027.' },
          { key: 'desborreInicio', label: 'Inicio de desborre', type: 'date', section: 'Desborre', required: true },
          { key: 'desborre50', label: 'Desborre 50%', type: 'date', section: 'Desborre', validate: (v, a) => a.desborreInicio && v < a.desborreInicio ? 'Debe ser posterior al inicio.' : '' },
          { key: 'desborreFin', label: 'Fin de desborre', type: 'date', section: 'Desborre', validate: (v, a) => a.desborre50 && v < a.desborre50 ? 'Debe ser posterior al 50%.' : '' },
          { key: 'bbch', label: 'Estado fenológico actual (BBCH)', type: 'select', options: BBCH, section: 'Desarrollo' },
          { key: 'floracion', label: 'Plena floración', type: 'date', section: 'Desarrollo' },
          { key: 'envero', label: 'Envero', type: 'date', section: 'Desarrollo' },
          { key: 'observaciones', label: 'Observaciones', type: 'textarea', section: 'Desarrollo' }
        ],
        defaults: () => ({ temporada: new Date().getMonth() >= 6 ? new Date().getFullYear() + 1 : new Date().getFullYear(), desborreInicio: U.today() }),
        columns: [
          { key: 'cuartel', label: 'Cuartel', sticky: true, value: r => UI.refText('cuartel', r.cuartelId), render: r => `<b>${UI.ref('cuartel', r.cuartelId)}</b>${UI.demoBadge(r)}` },
          { key: 'temporada', label: 'Temporada', num: true },
          { key: 'desborreInicio', label: 'Inicio', render: r => U.fmtDate(r.desborreInicio) },
          { key: 'desborre50', label: '50%', render: r => U.fmtDate(r.desborre50) },
          { key: 'desborreFin', label: 'Fin', render: r => U.fmtDate(r.desborreFin) },
          { key: 'dur', label: 'Duración', num: true, value: r => U.diffDays(r.desborreInicio, r.desborreFin) ?? '', render: r => r.desborreFin ? U.diffDays(r.desborreInicio, r.desborreFin) + ' d' : '—' },
          { key: 'bbch', label: 'BBCH' },
          { key: 'floracion', label: 'Floración', render: r => U.fmtDate(r.floracion) },
          { key: 'envero', label: 'Envero', render: r => U.fmtDate(r.envero) }
        ],
        defaultSort: 'temporada',
        filters: [{ key: 'temporada', label: 'Temporada', options: () => Array.from(new Set(VG.db.list('fenologia').map(f => String(f.temporada)))).sort().reverse() }],
        renderTop: (top, rows) => {
          const temps = Array.from(new Set(rows.map(r => Number(r.temporada)))).sort();
          const cuarteles = VG.db.list('cuartel').sort((a, b) => a.codigo.localeCompare(b.codigo));
          top.innerHTML = `<div class="grid grid-2"><div class="card"><div class="card-head"><h3>Comparación de inicio de desborre entre temporadas</h3></div><p class="card-desc">Días desde el 1 de julio hasta el inicio del desborre. Un valor menor indica un desborre más temprano.</p><div data-c1></div></div>
            <div class="card"><div class="card-head"><h3>Alertas visuales</h3></div><div data-al></div></div></div>`;
          VG.charts.bar(top.querySelector('[data-c1]'), { labels: cuarteles.map(c => c.codigo), series: temps.slice(-3).map(t => ({ name: 'T' + t, data: cuarteles.map(c => { const f = rows.find(r => r.cuartelId === c.id && Number(r.temporada) === t); return f ? doy(f.desborreInicio) : 0; }) })), yFmt: v => U.int(v), tipFmt: v => v + ' días', height: 200 });
          const al = [];
          cuarteles.forEach(c => {
            const fs = rows.filter(r => r.cuartelId === c.id).sort((a, b) => a.temporada - b.temporada);
            if (fs.length >= 2) { const a = fs[fs.length - 2], b = fs[fs.length - 1]; const d = doy(b.desborreInicio) - doy(a.desborreInicio); if (Math.abs(d) >= 7) al.push(UI.alert('warning', `${c.codigo}: desborre ${d < 0 ? 'adelantado' : 'atrasado'} ${Math.abs(d)} días`, `Respecto de la temporada ${a.temporada}. Considera ajustar el calendario de labores y heladas.`)); }
            const cur = fs[fs.length - 1];
            if (cur && cur.desborreInicio && !cur.desborreFin && U.diffDays(cur.desborreInicio, U.today()) > 25) al.push(UI.alert('info', `${c.codigo}: registra el fin del desborre`, `Inició hace ${U.diffDays(cur.desborreInicio, U.today())} días.`));
          });
          VG.alerts.compute().filter(a => a.module === 'fenologia').forEach(a => al.push(UI.alert(a.level, a.title, a.body)));
          top.querySelector('[data-al]').innerHTML = al.join('') || '<p class="muted">Sin alertas. Las fechas están dentro de lo esperado.</p>';
        }
      });
    }
  });

  function clima(ctx) {
    const content = UI.page(ctx.el, { title: 'Temperaturas y grados día', crumbs: [['Operación'], ['Fenología', '#/fenologia']], desc: 'Grados día (índice de Winkler) = Σ max(0, (Tmáx + Tmín)/2 − 10 °C), acumulados desde el 1 de septiembre.', tabs: [{ label: 'Registros fenológicos', href: '#/fenologia' }, { label: 'Temperaturas y grados día', href: '#/fenologia/clima', active: true }] });
    const top = U.html('<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>Grados día acumulados por temporada</h3></div><div data-c></div><p class="text-xs muted" data-r></p></div>');
    content.appendChild(top);
    const temps = Array.from(new Set(VG.db.list('clima').map(c => Number(c.temporada)))).sort();
    const base = VG.store.config().enologia.tempBaseGD;
    const series = temps.map(t => { const rs = VG.db.list('clima', c => Number(c.temporada) === t).sort((a, b) => a.fecha.localeCompare(b.fecha)); let acc = 0; const bym = {}; rs.forEach(r => { acc += Math.max(0, (U.n(r.tmax) + U.n(r.tmin)) / 2 - base); bym[U.month(r.fecha).slice(5)] = acc; }); return { t, bym, total: acc }; });
    const ms = ['09', '10', '11', '12', '01', '02', '03', '04'];
    VG.charts.line(top.querySelector('[data-c]'), { labels: ['Sep', 'Oct', 'Nov', 'Dic', 'Ene', 'Feb', 'Mar', 'Abr'], series: series.map(s => ({ name: 'Temporada ' + s.t, data: ms.map(m => s.bym[m] ?? null) })), yFmt: v => U.int(v), tipFmt: v => v === null || v === undefined ? '—' : U.int(v) + ' GD' });
    const region = g => g < 1390 ? 'Región I (fría)' : g < 1670 ? 'Región II' : g < 1940 ? 'Región III' : g < 2220 ? 'Región IV' : 'Región V (cálida)';
    top.querySelector('[data-r]').textContent = series.map(s => `T${s.t}: ${U.int(s.total)} GD → ${region(s.total)}`).join(' · ');
    const el = U.html('<div></div>'); content.appendChild(el);
    UI.crud(el, {
      embed: true, entity: 'clima', moduleId: 'fenologia', title: 'Registros de temperatura', newLabel: 'Registrar día',
      fields: [{ key: 'fecha', label: 'Fecha', type: 'date', required: true }, { key: 'temporada', label: 'Temporada', type: 'number', required: true, step: 1 }, { key: 'tmax', label: 'T° máxima', type: 'number', unit: '°C', required: true, min: -10, max: 50 }, { key: 'tmin', label: 'T° mínima', type: 'number', unit: '°C', required: true, min: -15, max: 40, validate: (v, a) => U.n(v) > U.n(a.tmax) ? 'La mínima no puede superar la máxima.' : '' }, { key: 'estacion', label: 'Estación' }],
      defaults: () => ({ fecha: U.today(), temporada: new Date().getMonth() >= 6 ? new Date().getFullYear() + 1 : new Date().getFullYear() }),
      columns: [{ key: 'fecha', label: 'Fecha', render: r => U.fmtDate(r.fecha) }, { key: 'temporada', label: 'Temporada', num: true }, { key: 'tmax', label: 'Máx °C', num: true }, { key: 'tmin', label: 'Mín °C', num: true }, { key: 'gd', label: 'GD del día', num: true, value: r => Math.max(0, (U.n(r.tmax) + U.n(r.tmin)) / 2 - base), render: r => U.dec1(Math.max(0, (U.n(r.tmax) + U.n(r.tmin)) / 2 - base)) }],
      liveCalc: v => `<h4>Grados día</h4><dl><dt>Temp. media</dt><dd>${U.dec1((U.n(v.tmax) + U.n(v.tmin)) / 2)} °C</dd><dt>GD del día</dt><dd>${U.dec1(Math.max(0, (U.n(v.tmax) + U.n(v.tmin)) / 2 - base))}</dd></dl>`
    });
  }
})(window.VG);
