/**
 * modules/insumos/index.js — Módulo 3. Insumos agrícolas y labores de campo.
 * Maestro de insumos (agrícolas, enológicos, envasado), aplicaciones por cuartel con
 * costo y período de carencia, y labores (poda, raleo, deshoje, riego…).
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui;
  const CATS = [['agricola', 'Agrícola'], ['enologico', 'Enológico'], ['envasado', 'Envasado'], ['etiquetado', 'Etiquetado y marca']];
  const TIPOS = ['Fertilizante', 'Abono', 'Fungicida', 'Insecticida', 'Herbicida', 'Bioestimulante', 'Corrector', 'Sulfitante', 'Clarificante', 'Levadura', 'Nutriente', 'Enzima', 'Tanino', 'Envase vidrio', 'Envase PET', 'Bag in box', 'Cierre', 'Cápsula', 'Caja', 'Etiqueta', 'Otro'];
  const catLabel = k => (CATS.find(c => c[0] === k) || [k, k])[1];
  const season = () => VG.store.state.season;

  function maestro(ctx) {
    UI.crud(ctx.el, {
      entity: 'insumo', moduleId: 'insumos', query: ctx.query, title: 'Insumos y labores', crumbs: [['Operación']], tabs: UI.moduleTabs(ctx),
      desc: 'Maestro único de insumos: el mismo registro se usa en aplicaciones de campo, vinificación, envasado, compras e inventario.',
      newLabel: 'Nuevo insumo', emptyIcon: '🧪',
      fields: [
        { key: 'nombre', label: 'Nombre', required: true, section: 'Identificación' },
        { key: 'categoria', label: 'Categoría', type: 'select', options: CATS, required: true, section: 'Identificación' },
        { key: 'tipo', label: 'Tipo', type: 'select', options: TIPOS, section: 'Identificación' },
        { key: 'unidad', label: 'Unidad', type: 'select', options: ['kg', 'g', 'L', 'mL', 'un', 'caja', 'rollo'], required: true, section: 'Identificación' },
        { key: 'npk', label: 'Composición N-P-K', placeholder: '12-12-17', section: 'Identificación', showIf: v => v.categoria === 'agricola' },
        { key: 'precio', label: 'Precio unitario (neto)', type: 'money', min: 0, required: true, section: 'Compra', help: 'Se actualiza automáticamente con cada compra registrada.' },
        { key: 'proveedorId', label: 'Proveedor habitual', type: 'ref', ref: 'proveedor', section: 'Compra' },
        { key: 'stockMinimo', label: 'Stock mínimo', type: 'number', min: 0, section: 'Compra' },
        { key: 'stockInicial', label: 'Stock inicial', type: 'number', min: 0, section: 'Compra', help: 'Existencia al comenzar a usar el sistema. Luego el stock se mueve con compras y consumos.' },
        { key: 'vencimiento', label: 'Vencimiento', type: 'date', section: 'Control' },
        { key: 'carencia', label: 'Período de carencia', type: 'number', unit: 'días', min: 0, step: 1, section: 'Control', showIf: v => v.categoria === 'agricola', help: 'Días mínimos entre la aplicación y la cosecha.' },
        { key: 'quimico', label: 'Compuesto (sulfitantes)', type: 'select', options: [['K2S2O5', 'Metabisulfito de potasio (≈57% SO₂)'], ['Na2S2O5', 'Metabisulfito de sodio (≈67% SO₂)']], section: 'Control', showIf: v => v.tipo === 'Sulfitante' },
        { key: 'so2Pct', label: 'Aporte de SO₂', type: 'number', unit: '%', min: 0, max: 100, section: 'Control', showIf: v => v.tipo === 'Sulfitante', help: 'Fracción de SO₂ del producto. K₂S₂O₅ ≈ 57%, Na₂S₂O₅ ≈ 67%.' },
        { key: 'plazoEntrega', label: 'Plazo de entrega', type: 'number', unit: 'días', min: 0, section: 'Control', showIf: v => ['envasado', 'etiquetado'].includes(v.categoria) },
        { key: 'condiciones', label: 'Condiciones comerciales', section: 'Control', showIf: v => ['envasado', 'etiquetado'].includes(v.categoria) }
      ],
      defaults: () => ({ categoria: 'agricola', unidad: 'kg' }),
      columns: [
        { key: 'nombre', label: 'Insumo', sticky: true, render: r => `<b>${U.esc(r.nombre)}</b>${UI.demoBadge(r)}` },
        { key: 'categoria', label: 'Categoría', render: r => UI.badge(catLabel(r.categoria), r.categoria === 'agricola' ? 'success' : r.categoria === 'enologico' ? 'primary' : 'info'), value: r => catLabel(r.categoria) },
        { key: 'tipo', label: 'Tipo' },
        { key: 'precio', label: 'Precio', num: true, render: r => U.clp(r.precio) + ' / ' + U.esc(r.unidad || '') },
        { key: 'stock', label: 'Stock', num: true, value: r => VG.calc.inventory.stockInsumo(r.id), render: r => { const s = VG.calc.inventory.stockInsumo(r.id); return `<span class="${U.n(r.stockMinimo) && s < U.n(r.stockMinimo) ? 'text-error' : ''}">${U.dec2(s).replace(/,00$/, '')} ${U.esc(r.unidad || '')}</span>`; } },
        { key: 'proveedor', label: 'Proveedor', value: r => UI.refText('proveedor', r.proveedorId), render: r => UI.ref('proveedor', r.proveedorId) },
        { key: 'carencia', label: 'Carencia', num: true, render: r => U.n(r.carencia) ? r.carencia + ' d' : '—' },
        { key: 'vencimiento', label: 'Vence', render: r => { if (!r.vencimiento) return '—'; const d = U.diffDays(U.today(), r.vencimiento); return `<span class="${d < 0 ? 'text-error' : d < 30 ? 'text-warning' : ''}">${U.fmtDate(r.vencimiento)}</span>`; } }
      ],
      defaultSort: 'nombre', defaultDir: 'asc',
      filters: [{ key: 'categoria', label: 'Categoría', options: CATS }],
      canDelete: r => VG.db.find('movInsumo', m => m.insumoId === r.id) ? 'No se puede eliminar: el insumo tiene movimientos (compras o consumos).' : true
    });
  }

  function aplicaciones(ctx) {
    const precioDe = id => U.n((VG.db.get('insumo', id) || {}).precio);
    UI.crud(ctx.el, {
      entity: 'aplicacion', moduleId: 'insumos', title: 'Aplicaciones de campo', crumbs: [['Operación'], ['Insumos', '#/insumos']], tabs: UI.moduleTabs(ctx), season: true,
      desc: 'Cada aplicación descuenta stock del insumo y suma al costo del cuartel. Se alerta si la carencia se cruza con la cosecha.',
      newLabel: 'Nueva aplicación', emptyIcon: '💧',
      fields: [
        { key: 'fecha', label: 'Fecha', type: 'date', required: true },
        { key: 'temporada', label: 'Temporada', type: 'number', required: true, step: 1 },
        { key: 'cuartelId', label: 'Cuartel', type: 'ref', ref: 'cuartel', required: true },
        { key: 'insumoId', label: 'Insumo', type: 'ref', ref: 'insumo', refFilter: i => i.categoria === 'agricola', required: true, onChangeSet: v => ({ carencia: (VG.db.get('insumo', v.insumoId) || {}).carencia || 0 }) },
        { key: 'dosis', label: 'Dosis por hectárea', type: 'number', min: 0, required: true, help: 'Cantidad por hectárea en la unidad del insumo.' },
        { key: 'cantidad', label: 'Cantidad total aplicada', type: 'number', min: 0, required: true, hint: 'Sugerido: dosis × superficie del cuartel.' },
        { key: 'carencia', label: 'Carencia', type: 'number', unit: 'días', min: 0 },
        { key: 'responsable', label: 'Responsable' },
        { key: 'observaciones', label: 'Observaciones', type: 'textarea' }
      ],
      defaults: () => ({ fecha: U.today(), temporada: season() }),
      liveCalc: v => {
        const c = VG.db.get('cuartel', v.cuartelId), i = VG.db.get('insumo', v.insumoId);
        const sug = c ? U.n(v.dosis) * U.n(c.superficie) : 0;
        const libre = v.fecha && U.n(v.carencia) ? U.addDays(v.fecha, v.carencia) : '';
        const stock = i ? VG.calc.inventory.stockInsumo(i.id) : 0;
        return `<h4>Cálculo en vivo</h4><dl><dt>Cantidad sugerida</dt><dd>${U.dec2(sug)} ${i ? U.esc(i.unidad) : ''}</dd><dt>Precio unitario</dt><dd>${U.clp(precioDe(v.insumoId))}</dd><dt class="total">Costo</dt><dd class="total">${U.clp(U.n(v.cantidad || sug) * precioDe(v.insumoId))}</dd><dt>Costo por ha</dt><dd>${c ? U.clp(U.n(v.cantidad || sug) * precioDe(v.insumoId) / U.n(c.superficie)) : '—'}</dd><dt>Stock disponible</dt><dd class="${stock < U.n(v.cantidad) ? 'text-error' : ''}">${U.dec2(stock)}</dd><dt>Cosechar desde</dt><dd>${libre ? U.fmtDate(libre) : '—'}</dd></dl>`;
      },
      beforeSave: (d, isNew, before) => {
        d.costo = Math.round(U.n(d.cantidad) * precioDe(d.insumoId));
        const disp = VG.calc.inventory.stockInsumo(d.insumoId) + (before ? U.n(before.cantidad) : 0);
        if (U.n(d.cantidad) > disp + 1e-6) VG.ui.toast(`Atención: el stock registrado (${U.dec2(disp)}) es menor a lo aplicado. Registra la compra correspondiente.`, 'warning');
        return d;
      },
      afterSave: async (a) => {
        VG.db.list('movInsumo', m => m.ref === 'aplicacion:' + a.id).forEach(m => VG.db.remove('movInsumo', m.id, { system: true }));
        await VG.db.save('movInsumo', { fecha: a.fecha, insumoId: a.insumoId, cantidad: -U.n(a.cantidad), tipo: 'aplicacion', ref: 'aplicacion:' + a.id }, { system: true, silent: true });
        VG.events.emit('insumos.aplicacionRegistrada', { aplicacion: a });
      },
      afterRemove: a => VG.db.list('movInsumo', m => m.ref === 'aplicacion:' + a.id).forEach(m => VG.db.remove('movInsumo', m.id, { system: true })),
      columns: [
        { key: 'fecha', label: 'Fecha', render: r => U.fmtDate(r.fecha) + UI.demoBadge(r) },
        { key: 'cuartel', label: 'Cuartel', value: r => UI.refText('cuartel', r.cuartelId), render: r => UI.ref('cuartel', r.cuartelId) },
        { key: 'insumo', label: 'Insumo', value: r => UI.refText('insumo', r.insumoId), render: r => UI.ref('insumo', r.insumoId) },
        { key: 'dosis', label: 'Dosis/ha', num: true, render: r => U.dec2(r.dosis) },
        { key: 'cantidad', label: 'Cantidad', num: true, render: r => U.dec2(r.cantidad) },
        { key: 'costo', label: 'Costo', num: true, render: r => U.clp(r.costo) },
        { key: 'carencia', label: 'Carencia hasta', value: r => U.n(r.carencia) ? U.addDays(r.fecha, r.carencia) : '', render: r => { if (!U.n(r.carencia)) return '—'; const f = U.addDays(r.fecha, r.carencia); return f >= U.today() ? `<span class="badge warning">${U.fmtDate(f)}</span>` : U.fmtDate(f); } }
      ],
      filters: [{ key: 'cuartelId', label: 'Cuartel', options: () => VG.db.list('cuartel').map(c => [c.id, c.codigo]) }],
      footer: rows => ({ _label: 'Total temporada', costo: U.clp(U.sum(rows, r => r.costo)) })
    });
  }

  function labores(ctx) {
    UI.crud(ctx.el, {
      entity: 'labor', moduleId: 'insumos', title: 'Labores de campo', crumbs: [['Operación'], ['Insumos', '#/insumos']], tabs: UI.moduleTabs(ctx), season: true,
      desc: 'Poda, raleo, deshoje, riego y mantención con su mano de obra. El costo se suma al costo del cuartel.',
      newLabel: 'Nueva labor', emptyIcon: '✂️',
      fields: [
        { key: 'fecha', label: 'Fecha', type: 'date', required: true },
        { key: 'temporada', label: 'Temporada', type: 'number', required: true, step: 1 },
        { key: 'cuartelId', label: 'Cuartel', type: 'ref', ref: 'cuartel', required: true },
        { key: 'tipo', label: 'Labor', required: true, list: ['Poda', 'Amarra', 'Desbrote', 'Deshoje', 'Raleo', 'Riego (energía)', 'Mantención', 'Control de malezas', 'Reposición de plantas'] },
        { key: 'jornadas', label: 'Jornadas-hombre', type: 'number', min: 0 },
        { key: 'valorJornada', label: 'Valor por jornada', type: 'money', min: 0 },
        { key: 'otrosCostos', label: 'Otros costos (maquinaria, energía)', type: 'money', min: 0 },
        { key: 'costo', label: 'Costo total', type: 'money', min: 0, hint: 'Si lo dejas vacío se calcula: jornadas × valor + otros.' },
        { key: 'responsable', label: 'Responsable' }
      ],
      defaults: () => ({ fecha: U.today(), temporada: season(), valorJornada: 30000 }),
      liveCalc: v => `<h4>Costo</h4><dl><dt>Mano de obra</dt><dd>${U.clp(U.n(v.jornadas) * U.n(v.valorJornada))}</dd><dt>Otros</dt><dd>${U.clp(v.otrosCostos)}</dd><dt class="total">Total</dt><dd class="total">${U.clp(U.n(v.costo) || U.n(v.jornadas) * U.n(v.valorJornada) + U.n(v.otrosCostos))}</dd></dl>`,
      beforeSave: d => { if (!U.n(d.costo)) d.costo = U.n(d.jornadas) * U.n(d.valorJornada) + U.n(d.otrosCostos); return d; },
      columns: [
        { key: 'fecha', label: 'Fecha', render: r => U.fmtDate(r.fecha) + UI.demoBadge(r) },
        { key: 'cuartel', label: 'Cuartel', value: r => UI.refText('cuartel', r.cuartelId), render: r => UI.ref('cuartel', r.cuartelId) },
        { key: 'tipo', label: 'Labor' }, { key: 'jornadas', label: 'Jornadas', num: true },
        { key: 'costo', label: 'Costo', num: true, render: r => U.clp(r.costo) }, { key: 'responsable', label: 'Responsable' }
      ],
      filters: [{ key: 'cuartelId', label: 'Cuartel', options: () => VG.db.list('cuartel').map(c => [c.id, c.codigo]) }, { key: 'tipo', label: 'Labor', options: () => Array.from(new Set(VG.db.list('labor').map(l => l.tipo))) }],
      footer: rows => ({ costo: U.clp(U.sum(rows, r => r.costo)) })
    });
  }

  VG.registry.implement('insumos', {
    async onMount(ctx) { (ctx.sub === 'aplicaciones' ? aplicaciones : ctx.sub === 'labores' ? labores : maestro)(ctx); }
  });
})(window.VG);
