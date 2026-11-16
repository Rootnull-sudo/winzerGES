/**
 * modules/laboratorio/index.js — Módulo 6. Análisis de laboratorio.
 * Registro por lote, comparación con rangos objetivo, historial y gráficos.
 * Vinculado al certificado D.O. y a la trazabilidad (botella → lote → análisis).
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui;
  /** Rangos objetivo referenciales por tipo de vino. */
  const RANGOS = {
    blanco: { ph: [3.1, 3.4], acidezTotal: [5.5, 7.5], acidezVolatil: [0, 0.6], so2Libre: [25, 35], so2Total: [0, 200], alcohol: [11.5, 14], azucarResidual: [0, 4] },
    tinto: { ph: [3.4, 3.8], acidezTotal: [4.8, 6.5], acidezVolatil: [0, 0.7], so2Libre: [20, 30], so2Total: [0, 150], alcohol: [12.5, 15], azucarResidual: [0, 4] }
  };
  const PARAMS = [['ph', 'pH', ''], ['acidezTotal', 'Acidez total', 'g/L ác. tartárico'], ['acidezVolatil', 'Acidez volátil', 'g/L ác. acético'], ['so2Libre', 'SO₂ libre', 'mg/L'], ['so2Total', 'SO₂ total', 'mg/L'], ['alcohol', 'Alcohol', '% vol'], ['azucarResidual', 'Azúcar residual', 'g/L'], ['turbidez', 'Turbidez', 'NTU'], ['densidad', 'Densidad', 'g/L']];
  const tipoDe = a => (VG.db.get('lote', a.loteId) || {}).tipo || 'tinto';
  function fuera(a) {
    const r = RANGOS[tipoDe(a)]; const out = [];
    Object.entries(r).forEach(([k, [mn, mx]]) => { if (a[k] !== '' && a[k] !== undefined && a[k] !== null && (U.n(a[k]) < mn || U.n(a[k]) > mx)) out.push(PARAMS.find(p => p[0] === k)[1]); });
    return out;
  }

  VG.registry.implement('laboratorio', {
    async onMount(ctx) {
      UI.crud(ctx.el, {
        entity: 'analisis', moduleId: 'laboratorio', query: ctx.query, title: 'Análisis de laboratorio', crumbs: [['Operación']],
        desc: 'Resultados por lote comparados con rangos objetivo. Para el certificado D.O. y exportaciones, el análisis debe provenir de un laboratorio autorizado por el SAG.',
        newLabel: 'Nuevo análisis', emptyIcon: '🔬',
        fields: [
          { key: 'fecha', label: 'Fecha', type: 'date', required: true, section: 'Muestra' },
          { key: 'loteId', label: 'Lote', type: 'ref', ref: 'lote', required: true, section: 'Muestra' },
          { key: 'laboratorio', label: 'Laboratorio', required: true, section: 'Muestra' },
          { key: 'autorizadoSAG', label: 'Laboratorio autorizado por el SAG', type: 'checkbox', section: 'Muestra' },
          ...PARAMS.map(([k, l, u]) => ({ key: k, label: l, type: 'number', unit: u || undefined, min: 0, section: 'Resultados', help: k === 'acidezVolatil' ? 'Límite legal referencial en Chile: 1,5 g/L (expresado en ácido acético). Sobre 0,7 g/L suele ser perceptible.' : undefined })),
          { key: 'color', label: 'Color / observación visual', section: 'Resultados' },
          { key: 'certificadoDO', label: 'Respalda certificado de Denominación de Origen', type: 'checkbox', section: 'Resultados' },
          { key: 'observaciones', label: 'Observaciones', type: 'textarea', section: 'Resultados' }
        ],
        defaults: () => ({ fecha: U.today(), autorizadoSAG: true }),
        liveCalc: v => {
          const r = RANGOS[(VG.db.get('lote', v.loteId) || {}).tipo || 'tinto'];
          return `<h4>Comparación con rangos objetivo</h4><dl>${Object.entries(r).map(([k, [mn, mx]]) => { const has = v[k] !== '' && v[k] !== undefined; const ok = !has || (U.n(v[k]) >= mn && U.n(v[k]) <= mx); return `<dt>${PARAMS.find(p => p[0] === k)[1]} <span class="text-xs">(${mn}–${mx})</span></dt><dd class="${has ? (ok ? 'text-success' : 'text-error') : 'muted'}">${has ? U.dec2(v[k]) + (ok ? ' ✓' : ' ⚠') : '—'}</dd>`; }).join('')}</dl>`;
        },
        afterSave: a => VG.events.emit('laboratorio.analisisRegistrado', { analisis: a }),
        columns: [
          { key: 'fecha', label: 'Fecha', sticky: true, render: r => U.fmtDate(r.fecha) + UI.demoBadge(r) },
          { key: 'lote', label: 'Lote', value: r => UI.refText('lote', r.loteId), render: r => UI.ref('lote', r.loteId) },
          { key: 'laboratorio', label: 'Laboratorio', render: r => U.esc(r.laboratorio) + (r.autorizadoSAG ? ' ' + UI.badge('SAG', 'success') : ' ' + UI.badge('No autorizado', 'warning')) },
          { key: 'ph', label: 'pH', num: true, render: r => U.dec2(r.ph) },
          { key: 'acidezTotal', label: 'AT', num: true, render: r => U.dec1(r.acidezTotal) },
          { key: 'acidezVolatil', label: 'AV', num: true, render: r => U.dec2(r.acidezVolatil) },
          { key: 'so2Libre', label: 'SO₂ L', num: true }, { key: 'so2Total', label: 'SO₂ T', num: true },
          { key: 'alcohol', label: 'Alc.', num: true, render: r => U.dec1(r.alcohol) },
          { key: 'fuera', label: 'Fuera de rango', value: r => fuera(r).join(', '), render: r => fuera(r).map(x => UI.badge(x, 'warning')).join(' ') || UI.badge('OK', 'success') }
        ],
        filters: [{ key: 'loteId', label: 'Lote', options: () => VG.db.list('lote').map(l => [l.id, l.codigo]) }],
        renderTop: (top, rows) => {
          const lotes = Array.from(new Set(rows.map(r => r.loteId))).map(id => VG.db.get('lote', id)).filter(Boolean);
          const sel = lotes[0];
          top.innerHTML = `<div class="card"><div class="card-head"><h3>Evolución por lote</h3><select class="select" style="width:auto" data-lote aria-label="Lote">${lotes.map(l => `<option value="${l.id}">${U.esc(l.codigo)}</option>`).join('')}</select></div><div data-c></div></div>`;
          const draw = id => { const as = rows.filter(r => r.loteId === id).sort((a, b) => a.fecha.localeCompare(b.fecha)); VG.charts.line(top.querySelector('[data-c]'), { labels: as.map(a => U.fmtDate(a.fecha)), series: [{ name: 'SO₂ libre (mg/L)', data: as.map(a => a.so2Libre) }, { name: 'Acidez total × 5', data: as.map(a => U.n(a.acidezTotal) * 5) }], height: 200, tipFmt: v => U.dec1(v), emptyText: 'Sin análisis para graficar.' }); };
          if (sel) draw(sel.id); else top.querySelector('[data-c]').innerHTML = '<p class="muted">Registra análisis para ver la evolución.</p>';
          const s = top.querySelector('[data-lote]'); if (s) s.onchange = () => draw(s.value);
        }
      });
    }
  });
})(window.VG);
