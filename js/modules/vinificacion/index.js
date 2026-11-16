/**
 * modules/vinificacion/index.js — Módulo 7. Vinificación y aditivos.
 * SO₂ (con cálculo de dosis), bentonita, tartárico, taninos, enzimas, levaduras,
 * nutrientes y clarificantes por lote/estanque, con costo acumulado por litro.
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui, Oe = () => VG.calc.oenology;
  const TIPOS = [['so2', 'SO₂ (metabisulfito)'], ['bentonita', 'Bentonita'], ['tartarico', 'Ácido tartárico'], ['tanino', 'Taninos'], ['enzima', 'Enzimas'], ['levadura', 'Levaduras'], ['nutriente', 'Nutrientes'], ['clarificante', 'Clarificante'], ['otro', 'Otro']];
  const tLabel = k => (TIPOS.find(t => t[0] === k) || [k, k])[1];
  const ins = id => VG.db.get('insumo', id) || {};

  /** Cantidad en unidad del insumo a partir de dosis (g/hL) y volumen (L): g = dosis × L/100. */
  function cantidad(v) {
    if (v.tipo === 'so2') return U.n(v.gramos) / 1000;
    const g = U.n(v.dosis) * U.n(v.volumen) / 100;
    return (ins(v.insumoId).unidad === 'g') ? g : g / 1000;
  }

  VG.registry.implement('vinificacion', {
    async onMount(ctx) {
      UI.crud(ctx.el, {
        entity: 'aditivo', moduleId: 'vinificacion', query: ctx.query, title: 'Vinificación y aditivos', crumbs: [['Vinificación y bodega']], season: true,
        desc: 'Registra cada producto enológico aplicado a un lote. El costo se acumula en el costo por litro del lote y descuenta stock del insumo.',
        newLabel: 'Registrar aplicación', emptyIcon: '🍷',
        fields: [
          { key: 'fecha', label: 'Fecha', type: 'date', required: true },
          { key: 'loteId', label: 'Lote', type: 'ref', ref: 'lote', required: true, onChangeSet: v => { const e = VG.calc.inventory.litrosLote(v.loteId); return { volumen: Math.round(e) || v.volumen }; } },
          { key: 'estanqueId', label: 'Estanque', type: 'ref', ref: 'estanque' },
          { key: 'tipo', label: 'Tipo de aditivo', type: 'select', options: TIPOS, required: true },
          { key: 'insumoId', label: 'Producto (maestro de insumos)', type: 'ref', ref: 'insumo', refFilter: (i, v) => i.categoria === 'enologico' && (v.tipo !== 'so2' || i.tipo === 'Sulfitante'), required: true },
          { key: 'volumen', label: 'Volumen tratado', type: 'number', unit: 'L', min: 1, required: true },
          { key: 'modo', label: 'Modo de sulfitado', type: 'select', options: [['suave', 'Suave (recomendado)'], ['moderado', 'Moderado']], showIf: v => v.tipo === 'so2' },
          { key: 'momento', label: 'Momento', type: 'select', options: ['Recepción / molienda', 'Encubado', 'Post FA', 'Post FML', 'Guarda', 'Pre-envasado'], showIf: v => v.tipo === 'so2' },
          { key: 'objetivoMgL', label: 'Aporte objetivo de SO₂', type: 'number', unit: 'mg/L', min: 0, max: 80, showIf: v => v.tipo === 'so2', help: 'Se sugiere la cantidad de producto para lograrlo.' },
          { key: 'gramos', label: 'Gramos de producto', type: 'number', unit: 'g', min: 0, required: true, showIf: v => v.tipo === 'so2' },
          { key: 'dosis', label: 'Dosis', type: 'number', unit: 'g/hL', min: 0, required: true, showIf: v => v.tipo !== 'so2' },
          { key: 'objetivo', label: 'Objetivo', showIf: v => v.tipo !== 'so2', list: ['Estabilidad proteica', 'Corrección de acidez', 'Inoculación', 'Nutrición', 'Clarificación', 'Estabilizar color', 'Desfangado'] },
          { key: 'responsable', label: 'Responsable' },
          { key: 'observaciones', label: 'Observaciones', type: 'textarea' }
        ],
        defaults: () => ({ fecha: U.today(), tipo: 'bentonita', modo: 'suave' }),
        liveCalc: v => {
          const i = ins(v.insumoId), lote = VG.db.get('lote', v.loteId) || {};
          if (v.tipo === 'so2') {
            const fr = Oe().fraccionSO2(i);
            const sug = Oe().gramosParaDosis(v.objetivoMgL, v.volumen, fr);
            const dosis = Oe().dosisMgL(v.gramos, v.volumen, fr);
            const r = Oe().rangoSO2(lote.tipo || 'tinto');
            const max = v.modo === 'suave' ? 30 : 50;
            return `<h4>Cálculo de SO₂</h4><dl><dt>Fracción SO₂ del producto</dt><dd>${U.pct(fr, 0)}</dd><dt>Gramos sugeridos</dt><dd>${U.dec1(sug)} g</dd><dt>Aporte de SO₂</dt><dd class="${dosis > max ? 'text-error' : ''}">${U.dec1(dosis)} mg/L</dd><dt>Rango suave ${lote.tipo || ''}</dt><dd>${r.min}–${r.max} mg/L</dd><dt class="total">Costo</dt><dd class="total">${U.clp(U.n(v.gramos) / 1000 * U.n(i.precio))}</dd><dt>Costo por litro</dt><dd>${U.dec2(U.n(v.gramos) / 1000 * U.n(i.precio) / (U.n(v.volumen) || 1))} $/L</dd></dl>
              ${dosis > max ? `<p class="text-xs text-error" style="margin:6px 0 0">⚠ Aporte alto para modo ${v.modo}. Considera fraccionar la adición.</p>` : ''}<p class="text-xs muted" style="margin:6px 0 0">Para el seguimiento de SO₂ libre medido usa la ficha de fermentación.</p>`;
          }
          const q = cantidad(v);
          return `<h4>Cálculo en vivo</h4><dl><dt>Cantidad de producto</dt><dd>${U.dec2(q)} ${U.esc(i.unidad || 'kg')}</dd><dt>Precio</dt><dd>${U.clp(i.precio)} / ${U.esc(i.unidad || '')}</dd><dt class="total">Costo</dt><dd class="total">${U.clp(q * U.n(i.precio))}</dd><dt>Costo por litro</dt><dd>${U.dec2(q * U.n(i.precio) / (U.n(v.volumen) || 1))} $/L</dd><dt>Stock disponible</dt><dd>${U.dec2(VG.calc.inventory.stockInsumo(v.insumoId))}</dd></dl>`;
        },
        beforeSave: d => {
          const i = ins(d.insumoId);
          d.cantidad = cantidad(d); d.producto = i.nombre; d.costo = Math.round(d.cantidad * U.n(i.precio));
          if (d.tipo === 'so2') { d.dosisMgL = U.round(Oe().dosisMgL(d.gramos, d.volumen, Oe().fraccionSO2(i)), 1); d.dosis = ''; d.unidadDosis = 'mg/L SO₂'; } else d.unidadDosis = 'g/hL';
          return d;
        },
        afterSave: async a => {
          VG.db.list('movInsumo', m => m.ref === 'aditivo:' + a.id).forEach(m => VG.db.remove('movInsumo', m.id, { system: true }));
          await VG.db.save('movInsumo', { fecha: a.fecha, insumoId: a.insumoId, cantidad: -a.cantidad, tipo: 'aditivo', ref: 'aditivo:' + a.id }, { system: true, silent: true });
          VG.events.emit('vinificacion.aditivoAplicado', { aditivo: a });
        },
        afterRemove: a => VG.db.list('movInsumo', m => m.ref === 'aditivo:' + a.id).forEach(m => VG.db.remove('movInsumo', m.id, { system: true })),
        columns: [
          { key: 'fecha', label: 'Fecha', sticky: true, render: r => U.fmtDate(r.fecha) + UI.demoBadge(r) },
          { key: 'lote', label: 'Lote', value: r => UI.refText('lote', r.loteId), render: r => UI.ref('lote', r.loteId) },
          { key: 'tipo', label: 'Tipo', value: r => tLabel(r.tipo), render: r => UI.badge(tLabel(r.tipo), r.tipo === 'so2' ? 'warning' : 'primary') },
          { key: 'producto', label: 'Producto' },
          { key: 'dosis', label: 'Dosis', num: true, value: r => r.tipo === 'so2' ? r.dosisMgL : r.dosis, render: r => r.tipo === 'so2' ? U.dec1(r.dosisMgL) + ' mg/L' : U.dec1(r.dosis) + ' g/hL' },
          { key: 'volumen', label: 'Volumen', num: true, render: r => U.lt(r.volumen) },
          { key: 'objetivo', label: 'Objetivo / momento', value: r => r.objetivo || r.momento || '' },
          { key: 'costo', label: 'Costo', num: true, render: r => U.clp(r.costo) }
        ],
        filters: [{ key: 'loteId', label: 'Lote', options: () => VG.db.list('lote').map(l => [l.id, l.codigo]) }, { key: 'tipo', label: 'Tipo', options: TIPOS }],
        footer: rows => ({ costo: U.clp(U.sum(rows, r => r.costo)) }),
        renderTop: (top) => {
          const lotes = VG.db.list('lote', l => VG.store.inSeason(l));
          top.innerHTML = `<div class="card"><div class="card-head"><h3>Costo enológico acumulado por lote</h3></div><p class="card-desc">Incluye aditivos y adiciones de metabisulfito registradas en las fichas de fermentación.</p>
            <div class="table-wrap"><table class="data compact"><thead><tr><th>Lote</th><th>Tipo</th><th class="num">Litros ingresados</th><th class="num">Costo enológico</th><th class="num">$/L enológico</th><th class="num">Costo directo total</th><th class="num">$/L total</th></tr></thead><tbody>
            ${lotes.map(l => { const c = VG.calc.financial.costoLitroLote(l.id); return `<tr><td><b>${U.esc(l.codigo)}</b></td><td>${UI.tipoBadge(l.tipo)}</td><td class="num">${U.int(c.litros)}</td><td class="num">${U.clp(c.partes.enologico)}</td><td class="num">${U.dec1(c.litros ? c.partes.enologico / c.litros : 0)}</td><td class="num">${U.clp(c.total)}</td><td class="num"><b>${U.clp(c.costoLitro)}</b></td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">Sin lotes en la temporada.</td></tr>'}
            </tbody></table></div></div>`;
        }
      });
    }
  });
})(window.VG);
