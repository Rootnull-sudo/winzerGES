/**
 * modules/historico/index.js — Módulo 10. Histórico de kilos y litros.
 * Consolidado filtrable con trazabilidad uva → mosto → vino → envasado / granel / vinagre / merma,
 * rendimientos históricos y comparativa entre temporadas. Exporta CSV y JSON.
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui;
  const db = () => VG.db;

  function filas() {
    return db().list('lote').map(l => {
      const cos = db().list('cosecha', c => c.loteId === l.id);
      const kg = U.sum(cos, c => c.kg);
      const b = VG.calc.inventory.balanceLote(l.id);
      const cuarteles = Array.from(new Set(cos.map(c => c.cuartelId).concat(l.cuartelIds || []))).map(id => UI.refText('cuartel', id).split(' · ')[0]).filter(Boolean).join(', ');
      const botellas = U.sum(db().list('ordenEnvasado', o => o.loteId === l.id && o.estado === 'confirmada'), o => o.unidades);
      return { id: l.id, temporada: Number(l.temporada), lote: l.codigo, variedad: l.variedad, tipo: l.tipo, cuarteles, kg, litros: b.entradas, rendimiento: kg ? b.entradas / kg : 0, envasado: b.envasado, botellas, granel: b.ventaGranel, vinagre: b.vinagre, merma: b.merma, stock: b.stock, mermaPct: b.entradas ? b.merma / b.entradas : 0 };
    }).filter(r => r.kg || r.litros);
  }

  VG.registry.implement('historico', {
    async onMount(ctx) {
      const rows = filas();
      const content = UI.page(ctx.el, {
        title: 'Histórico de kilos y litros', crumbs: [['Vinificación y bodega']],
        desc: 'Trazabilidad completa por lote: uva cosechada → litros ingresados → envasado, granel, vinagre y mermas. Todas las temporadas.',
        actions: [{ label: 'Exportar JSON', icon: 'download', perm: ['historico', 'x'], run: () => { U.download('historico_kg_litros_' + U.today() + '.json', JSON.stringify(rows, null, 1), 'application/json'); UI.toast('JSON exportado.'); } }]
      });
      const temps = Array.from(new Set(rows.map(r => r.temporada))).sort();
      const porT = temps.map(t => { const rs = rows.filter(r => r.temporada === t); return { t, kg: U.sum(rs, r => r.kg), litros: U.sum(rs, r => r.litros), blanco: U.sum(rs.filter(r => r.tipo === 'blanco'), r => r.litros), tinto: U.sum(rs.filter(r => r.tipo === 'tinto'), r => r.litros), env: U.sum(rs, r => r.envasado), gr: U.sum(rs, r => r.granel), me: U.sum(rs, r => r.merma) }; });
      const top = U.html(`<div><div class="grid grid-2" style="margin-bottom:16px"><div class="card"><div class="card-head"><h3>Kg cosechados y litros producidos por temporada</h3></div><div data-c1></div></div><div class="card"><div class="card-head"><h3>Blanco vs tinto (litros)</h3></div><div data-c2></div></div></div>
        <div class="card" style="margin-bottom:16px"><div class="card-head"><h3>Comparativa entre temporadas</h3></div><div class="table-wrap"><table class="data compact"><thead><tr><th>Temporada</th><th class="num">Kg</th><th class="num">Litros</th><th class="num">L/kg</th><th class="num">Envasado</th><th class="num">Granel</th><th class="num">Mermas</th><th class="num">Var. litros</th></tr></thead><tbody>
        ${porT.map((x, i) => { const prev = porT[i - 1]; const v = prev && prev.litros ? (x.litros - prev.litros) / prev.litros : null; return `<tr><td><b>${x.t}</b></td><td class="num">${U.int(x.kg)}</td><td class="num">${U.int(x.litros)}</td><td class="num">${U.dec2(x.kg ? x.litros / x.kg : 0)}</td><td class="num">${U.int(x.env)}</td><td class="num">${U.int(x.gr)}</td><td class="num">${U.int(x.me)}</td><td class="num ${v === null ? '' : v >= 0 ? 'text-success' : 'text-error'}">${v === null ? '—' : (v >= 0 ? '↑ ' : '↓ ') + U.pct(Math.abs(v))}</td></tr>`; }).join('')}
        </tbody></table></div></div><div data-t></div></div>`);
      content.appendChild(top);
      VG.charts.bar(top.querySelector('[data-c1]'), { labels: porT.map(x => String(x.t)), series: [{ name: 'Kg uva', data: porT.map(x => x.kg) }, { name: 'Litros', data: porT.map(x => x.litros) }], height: 200 });
      VG.charts.bar(top.querySelector('[data-c2]'), { labels: porT.map(x => String(x.t)), series: [{ name: 'Blanco', data: porT.map(x => x.blanco), color: 'var(--chart-3)' }, { name: 'Tinto', data: porT.map(x => x.tinto), color: 'var(--chart-1)' }], height: 200 });
      UI.table(top.querySelector('[data-t]'), {
        rows, exportName: 'historico_kg_litros', exportPerm: 'historico', defaultSort: 'temporada',
        columns: [
          { key: 'temporada', label: 'Temp.', num: true, sticky: true }, { key: 'lote', label: 'Lote', render: r => `<b>${U.esc(r.lote)}</b>` }, { key: 'variedad', label: 'Variedad' }, { key: 'tipo', label: 'Tipo', render: r => UI.tipoBadge(r.tipo) }, { key: 'cuarteles', label: 'Cuarteles' },
          { key: 'kg', label: 'Kg uva', num: true, render: r => U.int(r.kg) }, { key: 'litros', label: 'Litros', num: true, render: r => U.int(r.litros) }, { key: 'rendimiento', label: 'L/kg', num: true, render: r => U.dec2(r.rendimiento) },
          { key: 'envasado', label: 'Envasado L', num: true, render: r => U.int(r.envasado) }, { key: 'botellas', label: 'Unidades', num: true, render: r => U.int(r.botellas) }, { key: 'granel', label: 'Granel L', num: true, render: r => U.int(r.granel) }, { key: 'vinagre', label: 'Vinagre L', num: true, render: r => U.int(r.vinagre) },
          { key: 'merma', label: 'Merma L', num: true, render: r => U.int(r.merma) + ` <span class="muted text-xs">${U.pct(r.mermaPct)}</span>` }, { key: 'stock', label: 'Stock L', num: true, render: r => `<b>${U.int(r.stock)}</b>` }
        ],
        filters: [{ key: 'temporada', label: 'Temporada', options: temps.map(String), fn: (r, v) => String(r.temporada) === v }, { key: 'tipo', label: 'Tipo', options: [['blanco', 'Blanco'], ['tinto', 'Tinto']] }, { key: 'variedad', label: 'Variedad', options: () => Array.from(new Set(rows.map(r => r.variedad))) }, { key: 'cuarteles', label: 'Cuartel', options: () => db().list('cuartel').map(c => c.codigo), fn: (r, v) => r.cuarteles.includes(v) }],
        footer: rs => ({ kg: U.int(U.sum(rs, r => r.kg)), litros: U.int(U.sum(rs, r => r.litros)), envasado: U.int(U.sum(rs, r => r.envasado)), botellas: U.int(U.sum(rs, r => r.botellas)), granel: U.int(U.sum(rs, r => r.granel)), vinagre: U.int(U.sum(rs, r => r.vinagre)), merma: U.int(U.sum(rs, r => r.merma)), stock: U.int(U.sum(rs, r => r.stock)) }),
        empty: { icon: '📜', title: 'Sin historial', text: 'Registra cosechas y entradas a bodega para construir el histórico.' }
      });
    }
  });
})(window.VG);
