/**
 * modules/inventarios/index.js — Módulo 13. Inventarios.
 * Producto terminado (por formato y lote/añada), stock a granel, insumos de envasado,
 * agrícolas y enológicos con vencimientos, y ajustes de inventario.
 * El stock se deriva de movimientos (compras, consumos, envasado, ventas).
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui, Inv = () => VG.calc.inventory;
  const db = () => VG.db;

  VG.registry.implement('inventarios', {
    async onMount(ctx) {
      const tab = ctx.query.tab || 'producto';
      const canCost = VG.auth.can('costos', 'v');
      const content = UI.page(ctx.el, {
        title: 'Inventarios', crumbs: [['Comercial']],
        desc: 'Existencias calculadas a partir de los movimientos: compras, aplicaciones, envasado y ventas. Para corregir diferencias usa un ajuste.',
        tabs: [['producto', 'Producto terminado'], ['granel', 'Vino a granel'], ['envasado', 'Insumos de envasado'], ['agricola', 'Insumos agrícolas y enológicos'], ['movimientos', 'Movimientos de insumos']].map(([k, l]) => ({ label: l, href: '#/inventarios?tab=' + k, active: tab === k })),
        actions: [{ label: 'Ajuste de inventario', icon: 'edit', perm: ['inventarios', 'c'], run: () => ajuste(ctx) }]
      });
      const spf = Inv().stockPorFormato();
      const kp = U.html(`<div class="grid grid-4" style="margin-bottom:16px">
        ${UI.kpi({ label: 'Producto terminado', value: U.int(U.sum(Object.values(spf), x => x.unidades)) + ' un', icon: 'bottle', micro: canCost ? 'Valorizado ' + U.compactCLP(Inv().valorProductoTerminado()) : 'Todas las presentaciones' })}
        ${UI.kpi({ label: 'Vino a granel', value: U.lt(Inv().stockGranel()), icon: 'tank', micro: canCost ? 'Valorizado ' + U.compactCLP(Inv().valorGranel()) : 'En estanques' })}
        ${UI.kpi({ label: 'Insumos', value: db().count('insumo') + ' ítems', icon: 'box', micro: canCost ? 'Valorizado ' + U.compactCLP(Inv().valorInventarioInsumos()) : '' })}
        ${UI.kpi({ label: 'Alertas de stock', value: VG.alerts.compute().filter(a => a.module === 'inventarios').length, icon: 'warn', tone: VG.alerts.compute().some(a => a.module === 'inventarios') ? 'warning' : 'success', micro: 'Stock bajo o vencimientos' })}
      </div>`);
      content.appendChild(kp);
      const el = U.html('<div></div>'); content.appendChild(el);

      if (tab === 'producto') {
        const rows = [];
        db().list('ordenEnvasado', o => o.estado === 'confirmada').forEach(o => { const s = Inv().stockOrden(o.id); const f = db().get('formato', o.formatoId) || {}; const l = db().get('lote', o.loteId) || {}; rows.push({ id: o.id, formato: f.nombre, formatoId: o.formatoId, minimo: f.stockMinimo, lote: l.codigo, variedad: l.variedad, anada: l.temporada, orden: o.codigo, producidas: o.unidades, stock: s, costo: o.costoUnitario, valor: s * U.n(o.costoUnitario) }); });
        const resumen = db().list('formato').map(f => ({ label: f.nombre, value: (spf[f.id] || { unidades: 0 }).unidades }));
        const ch = U.html('<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>Stock por formato</h3></div><div data-c></div></div>'); el.appendChild(ch);
        VG.charts.hbar(ch.querySelector('[data-c]'), { items: resumen, fmt: v => U.int(v) + ' un' });
        const t = U.html('<div></div>'); el.appendChild(t);
        UI.table(t, { rows, exportName: 'inventario_producto_terminado', exportPerm: 'inventarios', defaultSort: 'stock', columns: [{ key: 'formato', label: 'Formato' }, { key: 'variedad', label: 'Vino' }, { key: 'anada', label: 'Añada', num: true }, { key: 'lote', label: 'Lote' }, { key: 'orden', label: 'Orden' }, { key: 'producidas', label: 'Producidas', num: true, render: r => U.int(r.producidas) }, { key: 'stock', label: 'Stock', num: true, render: r => `<b class="${r.stock <= 0 ? 'muted' : ''}">${U.int(r.stock)}</b>` }].concat(canCost ? [{ key: 'costo', label: 'Costo unit.', num: true, render: r => U.clp(r.costo) }, { key: 'valor', label: 'Valor', num: true, render: r => U.clp(r.valor) }] : []), filters: [{ key: 'formatoId', label: 'Formato', options: () => db().list('formato').map(f => [f.id, f.nombre]) }], footer: rs => ({ producidas: U.int(U.sum(rs, r => r.producidas)), stock: U.int(U.sum(rs, r => r.stock)), valor: canCost ? U.clp(U.sum(rs, r => r.valor)) : undefined }), empty: { icon: '🍾', title: 'Sin producto terminado', text: 'Confirma órdenes de envasado para generar stock.' } });
      } else if (tab === 'granel') {
        const rows = [];
        db().list('estanque').forEach(e => Inv().lotesEnEstanque(e.id).forEach(x => { const l = db().get('lote', x.loteId) || {}; const cl = VG.calc.financial.costoLitroLote(x.loteId).costoLitro; rows.push({ id: e.id + x.loteId, estanque: e.codigo, lote: l.codigo, tipo: l.tipo, variedad: l.variedad, anada: l.temporada, litros: x.litros, costoL: cl, valor: x.litros * cl }); }));
        UI.table(el, { rows, exportName: 'inventario_granel', exportPerm: 'inventarios', columns: [{ key: 'estanque', label: 'Estanque' }, { key: 'lote', label: 'Lote' }, { key: 'variedad', label: 'Variedad' }, { key: 'tipo', label: 'Tipo', render: r => UI.tipoBadge(r.tipo) }, { key: 'anada', label: 'Añada', num: true }, { key: 'litros', label: 'Litros', num: true, render: r => `<b>${U.int(r.litros)}</b>` }].concat(canCost ? [{ key: 'costoL', label: '$/L', num: true, render: r => U.clp(r.costoL) }, { key: 'valor', label: 'Valor', num: true, render: r => U.clp(r.valor) }] : []), footer: rs => ({ litros: U.int(U.sum(rs, r => r.litros)), valor: canCost ? U.clp(U.sum(rs, r => r.valor)) : undefined }), empty: { icon: '🛢️', title: 'Sin vino a granel' } });
      } else if (tab === 'movimientos') {
        UI.table(el, { rows: db().list('movInsumo'), exportName: 'movimientos_insumos', exportPerm: 'inventarios', defaultSort: 'fecha', columns: [{ key: 'fecha', label: 'Fecha', render: m => U.fmtDate(m.fecha) }, { key: 'insumo', label: 'Insumo', value: m => UI.refText('insumo', m.insumoId), render: m => UI.ref('insumo', m.insumoId) }, { key: 'tipo', label: 'Tipo' }, { key: 'cantidad', label: 'Cantidad', num: true, render: m => `<span class="${m.cantidad < 0 ? 'text-error' : 'text-success'}">${m.cantidad > 0 ? '+' : ''}${U.dec2(m.cantidad)}</span>` }, { key: 'ref', label: 'Origen', value: m => m.motivo || m.ref || '' }], filters: [{ key: 'tipo', label: 'Tipo', options: () => Array.from(new Set(db().list('movInsumo').map(m => m.tipo))) }, { key: 'insumoId', label: 'Insumo', options: () => db().list('insumo').map(i => [i.id, i.nombre]) }] });
      } else {
        const cats = tab === 'envasado' ? ['envasado', 'etiquetado'] : ['agricola', 'enologico'];
        const rows = db().list('insumo', i => cats.includes(i.categoria)).map(i => { const s = Inv().stockInsumo(i.id); return { id: i.id, nombre: i.nombre, tipo: i.tipo, categoria: i.categoria, unidad: i.unidad, stock: s, minimo: U.n(i.stockMinimo), precio: U.n(i.precio), valor: Math.max(0, s) * U.n(i.precio), proveedor: UI.refText('proveedor', i.proveedorId), plazo: i.plazoEntrega, vencimiento: i.vencimiento }; });
        UI.table(el, { rows, exportName: 'inventario_insumos_' + tab, exportPerm: 'inventarios', defaultSort: 'nombre', defaultDir: 'asc', columns: [{ key: 'nombre', label: 'Insumo', render: r => `<b>${U.esc(r.nombre)}</b>` }, { key: 'tipo', label: 'Tipo' }, { key: 'stock', label: 'Stock', num: true, render: r => `<span class="${r.minimo && r.stock < r.minimo ? 'badge warning' : ''}">${U.dec2(r.stock).replace(/,00$/, '')} ${U.esc(r.unidad || '')}</span>` }, { key: 'minimo', label: 'Mínimo', num: true }, { key: 'nivel', label: 'Nivel', sort: false, render: r => r.minimo ? UI.progress(Math.min(1, r.stock / (r.minimo * 3)), 2, 2).replace('progress ', 'progress ' + (r.stock < r.minimo ? 'err ' : '')) : '' }, canCost ? { key: 'precio', label: 'Precio', num: true, render: r => U.clp(r.precio) } : null, canCost ? { key: 'valor', label: 'Valor', num: true, render: r => U.clp(r.valor) } : null, { key: 'proveedor', label: 'Proveedor' }, { key: 'vencimiento', label: 'Vence', render: r => { if (!r.vencimiento) return '—'; const d = U.diffDays(U.today(), r.vencimiento); return `<span class="${d < 0 ? 'text-error' : d < 30 ? 'text-warning' : ''}">${U.fmtDate(r.vencimiento)}</span>`; } }].filter(Boolean), footer: rs => ({ valor: canCost ? U.clp(U.sum(rs, r => r.valor)) : undefined }) });
      }
    }
  });

  async function ajuste(ctx) {
    const r = await UI.formModal({
      title: 'Ajuste de inventario de insumo', values: { fecha: U.today() },
      fields: [{ key: 'fecha', label: 'Fecha', type: 'date', required: true }, { key: 'insumoId', label: 'Insumo', type: 'ref', ref: 'insumo', required: true }, { key: 'conteo', label: 'Stock contado físicamente', type: 'number', required: true, min: 0 }, { key: 'motivo', label: 'Motivo', required: true, list: ['Toma de inventario', 'Merma', 'Rotura', 'Vencimiento', 'Error de registro'] }],
      liveCalc: v => { const s = v.insumoId ? Inv().stockInsumo(v.insumoId) : 0; return `<h4>Ajuste</h4><dl><dt>Stock en sistema</dt><dd>${U.dec2(s)}</dd><dt>Contado</dt><dd>${U.dec2(v.conteo)}</dd><dt class="total">Diferencia</dt><dd class="total">${U.dec2(U.n(v.conteo) - s)}</dd></dl>`; },
      onSave: v => db().save('movInsumo', { fecha: v.fecha, insumoId: v.insumoId, cantidad: U.n(v.conteo) - Inv().stockInsumo(v.insumoId), tipo: 'ajuste', motivo: v.motivo })
    });
    if (r) { UI.toast('Ajuste registrado.'); ctx.refresh(); }
  }
})(window.VG);
