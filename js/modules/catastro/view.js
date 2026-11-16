/**
 * modules/catastro/view.js — Ficha resumen del cuartel (historial y rentabilidad).
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui;

  function ficha(c) {
    const db = VG.db, F = VG.calc.financial;
    const temporadas = Array.from(new Set(db.list('cosecha', x => x.cuartelId === c.id).map(x => Number(x.temporada)))).sort();
    const hist = temporadas.map(t => {
      const cs = db.list('cosecha', x => x.cuartelId === c.id && Number(x.temporada) === t);
      const kg = U.sum(cs, x => x.kg), caj = U.sum(cs, x => x.cajones);
      const campo = U.sum(db.list('aplicacion', a => a.cuartelId === c.id && Number(a.temporada) === t), a => a.costo) + U.sum(db.list('labor', l => l.cuartelId === c.id && Number(l.temporada) === t), l => l.costo);
      const cosecha = U.sum(cs, x => F.costoCosecha(x).total);
      const rent = F.rentabilidadCuarteles(t).find(r => r.cuartel.id === c.id) || {};
      return { t, kg, caj, kgHa: U.n(c.superficie) ? kg / c.superficie : 0, kgPlanta: U.n(c.plantas) ? kg / c.plantas : 0, costo: campo + cosecha, costoKg: kg ? (campo + cosecha) / kg : 0, ingresos: rent.ingresos || 0 };
    });
    const fen = db.list('fenologia', f => f.cuartelId === c.id).sort((a, b) => b.temporada - a.temporada)[0];
    const body = U.html(`<div class="stack">
      <div class="row">${UI.tipoBadge(c.tipo)} ${UI.badge(c.valle || 'Sin valle')} ${UI.badge(c.estadoSanitario || 'Estado no informado', /malo/i.test(c.estadoSanitario) ? 'error' : /regular/i.test(c.estadoSanitario) ? 'warning' : 'success')}</div>
      <div class="grid grid-2">
        <div class="card pad-sm flat">${UI.dl([['Variedad', U.esc(c.variedad)], ['Superficie', U.dec2(c.superficie) + ' ha'], ['Plantas', U.int(c.plantas)], ['Densidad', U.int(c.densidad) + ' pl/ha'], ['Año plantación', c.anioPlantacion || '—'], ['Edad', c.anioPlantacion ? new Date().getFullYear() - c.anioPlantacion + ' años' : '—']])}</div>
        <div class="card pad-sm flat">${UI.dl([['Patrón', U.esc(c.patron || '—')], ['Conducción', U.esc(c.conduccion || '—')], ['Sector', U.esc(c.sector || '—')], ['Cajones estimados', U.int(c.cajonesEstimados)], ['Costo plantación', U.clp(c.costoPlantacion)], ['Último desborre', fen && fen.desborreInicio ? U.fmtDate(fen.desborreInicio) + ' (T' + fen.temporada + ')' : '—']])}</div>
      </div>
      <h3>Historial por temporada</h3>
      ${hist.length ? `<div class="table-wrap"><table class="data compact"><thead><tr><th>Temporada</th><th class="num">Kg</th><th class="num">Cajones</th><th class="num">Kg/ha</th><th class="num">Kg/planta</th><th class="num">Costo campo + cosecha</th><th class="num">Costo/kg</th><th class="num">Ingresos atribuidos</th><th class="num">Margen</th></tr></thead><tbody>
        ${hist.map(h => `<tr><td>${h.t}</td><td class="num">${U.int(h.kg)}</td><td class="num">${U.int(h.caj)}</td><td class="num">${U.int(h.kgHa)}</td><td class="num">${U.dec2(h.kgPlanta)}</td><td class="num">${U.clp(h.costo)}</td><td class="num">${U.clp(h.costoKg)}</td><td class="num">${U.clp(h.ingresos)}</td><td class="num ${h.ingresos - h.costo < 0 ? 'text-error' : 'text-success'}">${U.clp(h.ingresos - h.costo)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Aún no hay cosechas registradas para este cuartel.</p>'}
      <div class="card pad-sm flat"><div class="card-head"><h3>Kg por temporada</h3></div><div data-chart></div></div>
      <p class="text-xs muted">Ingresos atribuidos = ventas de los lotes que recibieron uva del cuartel, prorrateadas por kg aportados.</p>
    </div>`);
    const m = UI.modal({ title: `Cuartel ${c.codigo}`, body, size: 'lg', foot: VG.auth.can('catastro', 'e') ? '<div class="right"><button class="btn" data-close>Cerrar</button><button class="btn btn-primary" data-edit>Editar</button></div>' : undefined });
    VG.charts.bar(body.querySelector('[data-chart]'), { labels: hist.map(h => String(h.t)), series: [{ name: 'Kg cosechados', data: hist.map(h => h.kg) }], yFmt: U.compact, tipFmt: v => U.kg(v), height: 180 });
    const eb = m.el.querySelector('[data-edit]');
    if (eb) eb.onclick = () => { m.close(true); VG.mod.catastro.ctl.openForm(c); };
  }

  VG.mod.catastro.ficha = ficha;
})(window.VG);
