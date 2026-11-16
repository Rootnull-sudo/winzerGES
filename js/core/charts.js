/**
 * core/charts.js — Gráficos SVG livianos, sin dependencias (funcionan offline).
 *
 * Reglas de diseño aplicadas:
 *  - colores categoriales en orden fijo (--chart-1..5, validados para daltonismo en claro y oscuro)
 *  - un solo eje Y (nunca doble eje), grilla recesiva, líneas de 2px, barras finas con extremos redondeados
 *  - leyenda siempre presente con ≥ 2 series; tooltip al pasar el mouse en cada marca
 *
 *   VG.charts.line(el, { labels, series:[{name, data}], yFmt })
 *   VG.charts.bar(el,  { labels, series:[{name, data}], yFmt })
 *   VG.charts.hbar(el, { items:[{label, value}], fmt })
 *   VG.charts.stack(el,{ items:[{label, value}], fmt })   // composición 100%
 */
(function (VG) {
  'use strict';
  const U = VG.utils;
  const color = i => `var(--chart-${(i % 5) + 1})`;
  let tipEl = null;
  function tip(e, html) {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'chart-tooltip'; document.body.appendChild(tipEl); }
    if (!html) { tipEl.style.display = 'none'; return; }
    tipEl.innerHTML = html; tipEl.style.display = 'block';
    const x = Math.min(window.innerWidth - tipEl.offsetWidth - 10, e.clientX + 14);
    tipEl.style.left = x + 'px'; tipEl.style.top = (e.clientY - tipEl.offsetHeight - 10) + 'px';
  }
  function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
  function legend(series) { return series.length < 2 ? '' : `<div class="chart-legend">${series.map((s, i) => `<span><i style="background:${s.color || color(i)}"></i>${U.esc(s.name)}</span>`).join('')}</div>`; }
  function empty(el, msg) { el.innerHTML = `<div class="empty" style="padding:28px"><div class="empty-ico">📉</div><p>${msg || 'Sin datos para graficar en este período.'}</p></div>`; }

  function frame(o, W, H, pad) {
    const all = o.series.flatMap(s => s.data.filter(v => v !== null && v !== undefined && v !== '').map(U.n)).concat((o.refLines || []).map(r => U.n(r.value)), (o.bands || []).map(b => U.n(b.to)));
    const rawMin = Math.min(0, ...all), rawMax = Math.max(0, ...all) || 1;
    const step = niceMax((rawMax - rawMin) / 4);
    const min = Math.floor(rawMin / step) * step;
    const max = Math.max(min + step, Math.ceil(rawMax / step) * step);
    const range = max - min || 1;
    const y = v => pad.t + (H - pad.t - pad.b) * (1 - (U.n(v) - min) / range);
    const fmt = o.yFmt || U.compact;
    let g = '';
    for (let v = min; v <= max + step / 2; v += step) { const yy = y(v); g += `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}"/><text x="${pad.l - 6}" y="${yy + 4}" text-anchor="end">${U.esc(fmt(v))}</text>`; }
    g += `<line class="axis" x1="${pad.l}" x2="${W - pad.r}" y1="${y(0)}" y2="${y(0)}"/>`;
    return { y, g, fmt, min, max };
  }

  const C = {
    line(el, o) {
      if (!o.labels.length || !o.series.some(s => s.data.some(v => U.n(v)))) return empty(el, o.emptyText);
      const W = 640, H = o.height || 240, pad = { t: 12, r: 14, b: 28, l: 58 };
      const f = frame(o, W, H, pad);
      const n = o.labels.length, x = i => pad.l + (W - pad.l - pad.r) * (n === 1 ? 0.5 : i / (n - 1));
      const step = Math.ceil(n / 10);
      let svg = f.g + o.labels.map((l, i) => i % step === 0 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${U.esc(l)}</text>` : '').join('');
      (o.bands || []).forEach(b => { svg += `<rect x="${pad.l}" width="${W - pad.l - pad.r}" y="${f.y(b.to)}" height="${Math.max(0, f.y(b.from) - f.y(b.to))}" fill="var(--color-success)" opacity=".08"/>${b.label ? `<text x="${W - pad.r - 4}" y="${f.y(b.to) + 12}" text-anchor="end">${U.esc(b.label)}</text>` : ''}`; });
      (o.refLines || []).forEach(r => { svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${f.y(r.value)}" y2="${f.y(r.value)}" stroke="var(--color-error)" stroke-dasharray="4 3" stroke-width="1.5"/><text x="${W - pad.r - 4}" y="${f.y(r.value) - 4}" text-anchor="end" style="fill:var(--color-error)">${U.esc(r.label)}</text>`; });
      o.series.forEach((s, si) => {
        const pts = s.data.map((v, i) => v === null || v === '' || v === undefined ? null : [x(i), f.y(v)]);
        const d = pts.reduce((a, p, i) => p ? a + (a && pts[i - 1] ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1) : a, '');
        svg += `<path d="${d}" fill="none" stroke="${s.color || color(si)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
        if (n <= 31) pts.forEach(p => { if (p) svg += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${s.color || color(si)}" stroke="var(--color-surface)" stroke-width="2"/>`; });
      });
      svg += `<line class="xh" x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}" stroke="var(--color-muted)" stroke-width="1" opacity="0"/>`;
      svg += `<rect class="hit" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}" fill="transparent"/>`;
      el.innerHTML = `<div class="chart" role="img" aria-label="${U.esc(o.title || 'Gráfico de líneas')}"><svg viewBox="0 0 ${W} ${H}">${svg}</svg>${legend(o.series)}</div>`;
      const sv = el.querySelector('svg'), hit = sv.querySelector('.hit'), xh = sv.querySelector('.xh');
      hit.addEventListener('mousemove', e => {
        const r = sv.getBoundingClientRect(); const px = (e.clientX - r.left) * W / r.width;
        const i = U.clamp(Math.round((px - pad.l) / ((W - pad.l - pad.r) / Math.max(1, n - 1))), 0, n - 1);
        xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('opacity', '.5');
        tip(e, `<b>${U.esc(o.labels[i])}</b><br>` + o.series.map((s, si) => `<span style="color:${s.color || color(si)}">●</span> ${U.esc(s.name)}: <b>${U.esc((o.tipFmt || f.fmt)(s.data[i]))}</b>`).join('<br>'));
      });
      hit.addEventListener('mouseleave', () => { tip(null); xh.setAttribute('opacity', '0'); });
    },

    bar(el, o) {
      if (!o.labels.length || !o.series.some(s => s.data.some(v => U.n(v)))) return empty(el, o.emptyText);
      const W = 640, H = o.height || 240, pad = { t: 12, r: 10, b: 28, l: 58 };
      const f = frame(o, W, H, pad);
      const n = o.labels.length, ns = o.series.length;
      const gw = (W - pad.l - pad.r) / n, bw = Math.max(4, Math.min(28, (gw * 0.7) / ns - 2));
      let svg = f.g;
      o.labels.forEach((l, i) => { svg += `<text x="${pad.l + gw * i + gw / 2}" y="${H - 8}" text-anchor="middle">${U.esc(String(l).slice(0, 12))}</text>`; });
      o.series.forEach((s, si) => s.data.forEach((v, i) => {
        const x0 = pad.l + gw * i + gw / 2 - (ns * (bw + 2)) / 2 + si * (bw + 2);
        const y0 = f.y(0), yv = f.y(v), top = Math.min(y0, yv), h = Math.abs(y0 - yv);
        const r = Math.min(4, bw / 2, h);
        const neg = U.n(v) < 0;
        const path = h < 0.5 ? '' : neg
          ? `M${x0},${top}h${bw}v${h - r}a${r},${r} 0 0 1 -${r},${r}h-${bw - 2 * r}a${r},${r} 0 0 1 -${r},-${r}z`
          : `M${x0},${top + h}v-${h - r}a${r},${r} 0 0 1 ${r},-${r}h${bw - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - r}z`;
        svg += `<path d="${path}" fill="${s.color || color(si)}"/><rect class="hb" data-i="${i}" data-s="${si}" x="${x0 - 1}" y="${pad.t}" width="${bw + 2}" height="${H - pad.t - pad.b}" fill="transparent"/>`;
      }));
      el.innerHTML = `<div class="chart" role="img" aria-label="${U.esc(o.title || 'Gráfico de barras')}"><svg viewBox="0 0 ${W} ${H}">${svg}</svg>${legend(o.series)}</div>`;
      el.querySelectorAll('.hb').forEach(r => {
        r.addEventListener('mousemove', e => { const i = +r.dataset.i, s = o.series[+r.dataset.s]; tip(e, `<b>${U.esc(o.labels[i])}</b><br>${o.series.length > 1 ? U.esc(s.name) + ': ' : ''}<b>${U.esc((o.tipFmt || f.fmt)(s.data[i]))}</b>`); });
        r.addEventListener('mouseleave', () => tip(null));
      });
    },

    /** Barras horizontales para comparar categorías (un solo color, valor como texto). */
    hbar(el, o) {
      const items = o.items.filter(x => U.n(x.value));
      if (!items.length) return empty(el, o.emptyText);
      const max = Math.max(...items.map(x => Math.abs(U.n(x.value))));
      const fmt = o.fmt || U.compact;
      el.innerHTML = `<div class="chart" role="list">${items.map((x, i) => `<div role="listitem" style="display:grid;grid-template-columns:minmax(90px,30%) 1fr auto;gap:10px;align-items:center;margin:7px 0;font-size:13px">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${U.esc(x.label)}">${U.esc(x.label)}</span>
        <span style="height:12px;background:var(--color-surface-2);border-radius:4px;overflow:hidden"><span style="display:block;height:100%;width:${Math.abs(U.n(x.value)) / max * 100}%;background:${U.n(x.value) < 0 ? 'var(--color-error)' : (x.color || o.color || color(0))};border-radius:0 4px 4px 0"></span></span>
        <b class="num">${U.esc(fmt(x.value))}</b></div>`).join('')}</div>`;
    },

    /** Barra de composición (100%) con leyenda y valores. */
    stack(el, o) {
      const items = o.items.filter(x => U.n(x.value) > 0);
      const tot = U.sum(items, x => x.value);
      if (!tot) return empty(el, o.emptyText);
      const fmt = o.fmt || U.compact;
      el.innerHTML = `<div class="chart"><div style="display:flex;gap:2px;height:22px;border-radius:4px;overflow:hidden">${items.map((x, i) => `<span title="${U.esc(x.label)}: ${U.esc(fmt(x.value))} (${U.pct(x.value / tot)})" style="flex:${x.value} 0 0;background:${x.color || color(i)}"></span>`).join('')}</div>
        <div class="chart-legend" style="margin-top:10px">${items.map((x, i) => `<span><i style="background:${x.color || color(i)}"></i>${U.esc(x.label)} · <b style="color:var(--color-text)">${U.esc(fmt(x.value))}</b> (${U.pct(x.value / tot, 0)})</span>`).join('')}</div></div>`;
    }
  };
  VG.charts = C;
})(window.VG);
