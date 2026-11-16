/**
 * modules/bodega/index.js — Módulo 9. Control de bodega.
 * Maestro de estanques, entradas (uva/mosto/vino), trasiegos, mermas, estado en
 * tiempo real, ocupación global y por tipo, alertas de sobrecapacidad y balance de masa.
 * Ventas a granel y envasado se registran en sus módulos y descuentan de aquí.
 * Publica: bodega.entradaRegistrada { mov }, bodega.trasiegoRegistrado { salida, entrada }
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui, Inv = () => VG.calc.inventory;
  const db = () => VG.db;
  const TIPOS_MOV = { entrada: 'Entrada', trasiego_salida: 'Trasiego (salida)', trasiego_entrada: 'Trasiego (entrada)', merma: 'Merma', vinagre: 'Destino vinagre', envasado: 'Envasado', venta_granel: 'Venta granel', ajuste: 'Ajuste' };

  async function entrada(prefill = {}) {
    const r = await UI.formModal({
      title: 'Registrar entrada a estanque', values: Object.assign({ fecha: U.today(), origen: 'mosto' }, prefill),
      fields: [
        { key: 'fecha', label: 'Fecha', type: 'date', required: true },
        { key: 'origen', label: 'Origen', type: 'select', options: [['uva', 'Uva despalillada'], ['mosto', 'Mosto'], ['vino', 'Vino (compra o traslado)']], required: true },
        { key: 'loteId', label: 'Lote', type: 'ref', ref: 'lote', required: true },
        { key: 'estanqueId', label: 'Estanque', type: 'ref', ref: 'estanque', required: true, refLabel: e => `${e.codigo} · libre ${U.int(U.n(e.capacidad) - Inv().litrosEstanque(e.id))} L` },
        { key: 'litros', label: 'Litros', type: 'number', unit: 'L', min: 1, required: true },
        { key: 'kgUva', label: 'Kg de uva procesados', type: 'number', unit: 'kg', min: 0, showIf: v => v.origen !== 'vino', help: 'Permite calcular el rendimiento L/kg.' },
        { key: 'glosa', label: 'Observación' }
      ],
      liveCalc: v => { const e = db().get('estanque', v.estanqueId); const libre = e ? U.n(e.capacidad) - Inv().litrosEstanque(e.id) : 0; return `<h4>Estanque</h4><dl><dt>Capacidad</dt><dd>${e ? U.lt(e.capacidad) : '—'}</dd><dt>Ocupado</dt><dd>${e ? U.lt(Inv().litrosEstanque(e.id)) : '—'}</dd><dt>Libre</dt><dd class="${U.n(v.litros) > libre ? 'text-error' : ''}">${U.lt(libre)}</dd><dt>Ocupación final</dt><dd>${e ? U.pct((Inv().litrosEstanque(e.id) + U.n(v.litros)) / U.n(e.capacidad)) : '—'}</dd><dt>Rendimiento</dt><dd>${U.n(v.kgUva) ? U.dec2(U.n(v.litros) / U.n(v.kgUva)) + ' L/kg' : '—'}</dd></dl>`; },
      onSave: async v => {
        Inv().validarEntrada(v.estanqueId, v.litros);
        const m = await db().save('movBodega', Object.assign({}, v, { litros: U.n(v.litros), tipo: 'entrada' }));
        VG.events.emit('bodega.entradaRegistrada', { mov: m });
        return m;
      }
    });
    if (r) UI.toast('Entrada registrada. Estanque actualizado.');
    return r;
  }
  async function trasiego(prefill = {}) {
    const r = await UI.formModal({
      title: 'Registrar trasiego', values: Object.assign({ fecha: U.today() }, prefill),
      fields: [
        { key: 'fecha', label: 'Fecha', type: 'date', required: true },
        { key: 'origenId', label: 'Estanque de origen', type: 'ref', ref: 'estanque', required: true, refFilter: e => Inv().litrosEstanque(e.id) > 0.5, refLabel: e => `${e.codigo} · ${U.int(Inv().litrosEstanque(e.id))} L`, onChangeSet: v => { const l = Inv().loteDeEstanque(v.origenId); return { loteId: l ? l.id : '' }; } },
        { key: 'loteId', label: 'Lote', type: 'ref', ref: 'lote', required: true, refFilter: (l, v) => !v.origenId || Inv().lotesEnEstanque(v.origenId).some(x => x.loteId === l.id) },
        { key: 'destinoId', label: 'Estanque de destino', type: 'ref', ref: 'estanque', required: true, refLabel: e => `${e.codigo} · libre ${U.int(U.n(e.capacidad) - Inv().litrosEstanque(e.id))} L`, validate: (v, a) => v === a.origenId ? 'El destino debe ser distinto del origen.' : '' },
        { key: 'litros', label: 'Litros trasegados', type: 'number', unit: 'L', min: 1, required: true },
        { key: 'merma', label: 'Merma en el trasiego (borras)', type: 'number', unit: 'L', min: 0 },
        { key: 'glosa', label: 'Observación' }
      ],
      onSave: async v => {
        Inv().validarSalida(v.origenId, U.n(v.litros) + U.n(v.merma), v.loteId);
        Inv().validarEntrada(v.destinoId, v.litros);
        const g = U.uid('tr');
        const s = await db().save('movBodega', { fecha: v.fecha, estanqueId: v.origenId, loteId: v.loteId, litros: -U.n(v.litros), tipo: 'trasiego_salida', grupo: g, glosa: v.glosa || 'Trasiego' });
        const e = await db().save('movBodega', { fecha: v.fecha, estanqueId: v.destinoId, loteId: v.loteId, litros: U.n(v.litros), tipo: 'trasiego_entrada', grupo: g, glosa: v.glosa || 'Trasiego' });
        if (U.n(v.merma)) await db().save('movBodega', { fecha: v.fecha, estanqueId: v.origenId, loteId: v.loteId, litros: -U.n(v.merma), tipo: 'merma', motivo: 'Borras de trasiego', grupo: g });
        VG.events.emit('bodega.trasiegoRegistrado', { salida: s, entrada: e });
        return e;
      }
    });
    if (r) UI.toast('Trasiego registrado.');
    return r;
  }
  async function salidaInterna(prefill = {}) {
    const r = await UI.formModal({
      title: 'Registrar merma / salida interna', values: Object.assign({ fecha: U.today(), tipo: 'merma' }, prefill),
      fields: [
        { key: 'fecha', label: 'Fecha', type: 'date', required: true },
        { key: 'tipo', label: 'Tipo', type: 'select', options: [['merma', 'Merma'], ['vinagre', 'Destino a vinagre'], ['ajuste', 'Ajuste de inventario (+/−)']], required: true },
        { key: 'estanqueId', label: 'Estanque', type: 'ref', ref: 'estanque', required: true, onChangeSet: v => { const l = Inv().loteDeEstanque(v.estanqueId); return { loteId: l ? l.id : '' }; } },
        { key: 'loteId', label: 'Lote', type: 'ref', ref: 'lote', required: true },
        { key: 'litros', label: 'Litros', type: 'number', unit: 'L', required: true, help: 'Para mermas y vinagre ingresa el valor positivo; se descuenta automáticamente. En ajustes usa signo.' },
        { key: 'motivo', label: 'Motivo', required: true, list: ['Borras', 'Evaporación', 'Filtración', 'Derrame', 'Vino defectuoso', 'Diferencia de inventario'] }
      ],
      onSave: async v => {
        let l = U.n(v.litros);
        if (v.tipo !== 'ajuste') { l = -Math.abs(l); Inv().validarSalida(v.estanqueId, Math.abs(l), v.loteId); }
        return db().save('movBodega', Object.assign({}, v, { litros: l }));
      }
    });
    if (r) UI.toast('Movimiento registrado.');
    return r;
  }

  function estanques(ctx) {
    const content = UI.page(ctx.el, {
      title: 'Control de bodega', crumbs: [['Vinificación y bodega']], tabs: UI.moduleTabs(ctx),
      desc: 'Estado en tiempo real de cada estanque. Haz clic en un estanque para ver su detalle.',
      actions: [
        { label: 'Entrada', icon: 'plus', primary: true, perm: ['bodega', 'c'], run: async () => { if (await entrada()) ctx.refresh(); } },
        { label: 'Trasiego', icon: 'switch', perm: ['bodega', 'c'], run: async () => { if (await trasiego()) ctx.refresh(); } },
        { label: 'Merma / salida', icon: 'drop', perm: ['bodega', 'c'], run: async () => { if (await salidaInterna()) ctx.refresh(); } }
      ]
    });
    const oc = Inv().ocupacion();
    const ests = db().list('estanque').sort((a, b) => a.codigo.localeCompare(b.codigo));
    content.innerHTML = `<div class="grid grid-4">
        ${UI.kpi({ label: 'Ocupación global', value: U.pct(oc.pct, 0), icon: 'tank', tone: oc.pct > 0.9 ? 'warning' : '', micro: `${U.lt(oc.usado)} de ${U.lt(oc.capacidad)}` })}
        ${UI.kpi({ label: 'Estanques ocupados', value: `${oc.ocupados} / ${oc.total}`, icon: 'box', micro: `${oc.vacios} vacíos` })}
        ${UI.kpi({ label: 'Vino blanco', value: U.lt(oc.porTipo.blanco || 0), icon: 'wine', micro: 'En estanques' })}
        ${UI.kpi({ label: 'Vino tinto', value: U.lt(oc.porTipo.tinto || 0), icon: 'wine', micro: 'En estanques' })}
      </div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h3>Estanques</h3><span class="chart-legend"><span><i style="background:var(--color-blanco)"></i>Blanco</span><span><i style="background:var(--color-tinto)"></i>Tinto</span></span></div>
        ${ests.length ? `<div class="tank-grid">${ests.map(e => {
          const l = Inv().litrosEstanque(e.id), p = U.n(e.capacidad) ? l / U.n(e.capacidad) : 0, lote = Inv().loteDeEstanque(e.id), st = Inv().estadoEstanque(e);
          return `<button class="tank" data-est="${e.id}" aria-label="Estanque ${U.esc(e.codigo)}, ${U.pct(p, 0)} ocupado"><b>${U.esc(e.codigo)}</b>${UI.demoBadge(e)}<div class="tank-vis"><div class="tank-fill ${lote && lote.tipo === 'blanco' ? 'blanco' : ''}" style="height:${Math.min(100, p * 100)}%"></div></div>
            <div class="text-sm"><b>${U.int(l)} L</b> / ${U.int(e.capacidad)}</div><div class="text-xs muted">${lote ? U.esc(lote.codigo) : '—'}</div><div style="margin-top:4px">${UI.estadoBadge(st, { ocupado: 'primary', vacio: '', mantencion: 'warning', reservado: 'info' })}${p > 1 ? ' ' + UI.badge('Sobrecapacidad', 'error') : ''}</div></button>`;
        }).join('')}</div>` : UI.empty({ icon: '🛢️', title: 'Aún no tienes estanques creados', text: 'Crea tu primer estanque para registrar entradas de uva, mosto o vino.' })}
      </div><div data-crud style="margin-top:16px"></div>`;
    content.querySelectorAll('[data-est]').forEach(b => b.onclick = () => detalle(db().get('estanque', b.dataset.est), ctx));
    const ctl = UI.crud(content.querySelector('[data-crud]'), {
      embed: true, entity: 'estanque', moduleId: 'bodega', title: 'Maestro de estanques', newLabel: 'Nuevo estanque', query: ctx.query, view: e => detalle(e, ctx),
      fields: [
        { key: 'codigo', label: 'Código', required: true, placeholder: 'E-05' },
        { key: 'capacidad', label: 'Capacidad', type: 'number', unit: 'L', min: 1, required: true, help: '1 hL = 100 L.' },
        { key: 'material', label: 'Material', type: 'select', options: ['Acero inoxidable', 'Hormigón epóxico', 'Fibra de vidrio', 'Madera (fudre)', 'Polietileno'] },
        { key: 'tipo', label: 'Tipo', list: ['Fermentación con camisa de frío', 'Fermentación tintos', 'Guarda', 'Mezcla', 'Pulmón de embotellado'] },
        { key: 'ubicacion', label: 'Ubicación' },
        { key: 'estado', label: 'Estado operativo', type: 'select', options: [['operativo', 'Operativo'], ['mantencion', 'En mantención'], ['reservado', 'Reservado']], help: 'Ocupado/vacío se calcula con los movimientos.' },
        { key: 'costoMantencion', label: 'Costo de mantención anual', type: 'money', min: 0 }
      ],
      defaults: () => ({ estado: 'operativo', material: 'Acero inoxidable' }),
      columns: [{ key: 'codigo', label: 'Código', render: e => `<b>${U.esc(e.codigo)}</b>` }, { key: 'capacidad', label: 'Capacidad', num: true, render: e => U.lt(e.capacidad) + ` (${U.dec1(U.n(e.capacidad) / 100)} hL)` }, { key: 'litros', label: 'Contenido', num: true, value: e => Inv().litrosEstanque(e.id), render: e => U.lt(Inv().litrosEstanque(e.id)) }, { key: 'material', label: 'Material' }, { key: 'tipo', label: 'Tipo' }, { key: 'ubicacion', label: 'Ubicación' }, { key: 'estado', label: 'Estado', value: e => Inv().estadoEstanque(e), render: e => UI.estadoBadge(Inv().estadoEstanque(e)) }],
      defaultSort: 'codigo', defaultDir: 'asc',
      canDelete: e => db().find('movBodega', m => m.estanqueId === e.id) ? 'No se puede eliminar: el estanque tiene movimientos registrados.' : true
    });
    VG.events.once('estanque.saved', () => ctx.refresh());
    return ctl;
  }

  function detalle(e, ctx) {
    const movs = db().list('movBodega', m => m.estanqueId === e.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const lotes = Inv().lotesEnEstanque(e.id);
    const body = U.html(`<div class="stack">${UI.dl([['Capacidad', U.lt(e.capacidad)], ['Contenido', U.lt(Inv().litrosEstanque(e.id))], ['Material', U.esc(e.material || '—')], ['Ubicación', U.esc(e.ubicacion || '—')], ['Lotes', lotes.map(l => `${UI.ref('lote', l.loteId)} (${U.int(l.litros)} L)`).join(', ') || '—']])}<div data-t></div></div>`);
    UI.modal({ title: 'Estanque ' + e.codigo, body, size: 'lg' });
    UI.table(body.querySelector('[data-t]'), { rows: movs, search: false, pageSize: 8, columns: [{ key: 'fecha', label: 'Fecha', render: m => U.fmtDate(m.fecha) }, { key: 'tipo', label: 'Tipo', render: m => TIPOS_MOV[m.tipo] || m.tipo }, { key: 'lote', label: 'Lote', render: m => UI.ref('lote', m.loteId) }, { key: 'litros', label: 'Litros', num: true, render: m => `<span class="${m.litros < 0 ? 'text-error' : 'text-success'}">${m.litros > 0 ? '+' : ''}${U.int(m.litros)}</span>` }, { key: 'glosa', label: 'Detalle', render: m => U.esc(m.glosa || m.motivo || '') }], empty: { icon: '🛢️', title: 'Sin movimientos' } });
  }

  function movimientos(ctx) {
    const content = UI.page(ctx.el, {
      title: 'Movimientos de bodega', crumbs: [['Vinificación y bodega'], ['Bodega', '#/bodega']], tabs: UI.moduleTabs(ctx),
      desc: 'Historial de entradas, trasiegos, mermas, envasado y ventas a granel. Las salidas validan stock y las entradas validan capacidad.',
      actions: [{ label: 'Entrada', icon: 'plus', primary: true, perm: ['bodega', 'c'], run: async () => { if (await entrada()) ctx.refresh(); } }, { label: 'Trasiego', icon: 'switch', perm: ['bodega', 'c'], run: async () => { if (await trasiego()) ctx.refresh(); } }, { label: 'Merma / salida', icon: 'drop', perm: ['bodega', 'c'], run: async () => { if (await salidaInterna()) ctx.refresh(); } }]
    });
    const rows = db().list('movBodega', m => VG.store.inSeason(m));
    UI.table(content, {
      rows, exportName: 'movimientos_bodega', exportPerm: 'bodega', defaultSort: 'fecha',
      columns: [{ key: 'fecha', label: 'Fecha', render: m => U.fmtDate(m.fecha) + UI.demoBadge(m) }, { key: 'tipo', label: 'Tipo', value: m => TIPOS_MOV[m.tipo] || m.tipo, render: m => UI.badge(TIPOS_MOV[m.tipo] || m.tipo, m.litros > 0 ? 'success' : m.tipo === 'merma' || m.tipo === 'vinagre' ? 'warning' : 'info') }, { key: 'est', label: 'Estanque', value: m => UI.refText('estanque', m.estanqueId), render: m => UI.ref('estanque', m.estanqueId) }, { key: 'lote', label: 'Lote', value: m => UI.refText('lote', m.loteId), render: m => UI.ref('lote', m.loteId) }, { key: 'litros', label: 'Litros', num: true, render: m => `<b class="${m.litros < 0 ? 'text-error' : 'text-success'}">${m.litros > 0 ? '+' : ''}${U.int(m.litros)}</b>` }, { key: 'glosa', label: 'Detalle', value: m => m.glosa || m.motivo || '' }],
      filters: [{ key: 'tipo', label: 'Tipo', options: Object.entries(TIPOS_MOV) }, { key: 'estanqueId', label: 'Estanque', options: () => db().list('estanque').map(e => [e.id, e.codigo]) }, { key: 'loteId', label: 'Lote', options: () => db().list('lote').map(l => [l.id, l.codigo]) }],
      rowActions: VG.auth.can('bodega', 'd') ? m => (['entrada', 'merma', 'vinagre', 'ajuste', 'trasiego_salida', 'trasiego_entrada'].includes(m.tipo) ? [{ label: 'Eliminar movimiento', icon: 'trash', danger: true, run: async () => {
        if (!(await UI.confirm({ title: 'Eliminar movimiento', message: m.grupo ? 'Se eliminará el trasiego completo (salida, entrada y merma asociada).' : 'Se eliminará el movimiento y el stock del estanque se recalculará.', danger: true, confirmText: 'Eliminar' }))) return;
        await UI.run(async () => { const ids = m.grupo ? db().list('movBodega', x => x.grupo === m.grupo).map(x => x.id) : [m.id]; for (const id of ids) await db().remove('movBodega', id); }, 'Movimiento eliminado.'); ctx.refresh();
      } }] : [{ label: 'Se gestiona desde ' + (m.tipo === 'envasado' ? 'Envasado' : 'Ventas'), icon: 'info', run: () => location.hash = m.tipo === 'envasado' ? '#/envasado' : '#/ventas' }]) : null,
      empty: { icon: '🛢️', title: 'Sin movimientos en la temporada' }
    });
  }

  function balance(ctx) {
    const content = UI.page(ctx.el, { title: 'Balance de masa por lote', crumbs: [['Vinificación y bodega'], ['Bodega', '#/bodega']], tabs: UI.moduleTabs(ctx), desc: 'Entradas = stock actual + envasado + ventas a granel + mermas + vinagre. Una diferencia distinta de cero indica un registro faltante o duplicado.' });
    const lotes = db().list('lote').filter(l => db().find('movBodega', m => m.loteId === l.id));
    UI.table(content, {
      rows: lotes.map(l => Object.assign({ id: l.id, lote: l }, Inv().balanceLote(l.id))), exportName: 'balance_masa', search: false,
      columns: [{ key: 'lote', label: 'Lote', value: r => r.lote.codigo, render: r => `<b>${U.esc(r.lote.codigo)}</b> ${UI.tipoBadge(r.lote.tipo)}` }, { key: 'entradas', label: 'Entradas', num: true, render: r => U.int(r.entradas) }, { key: 'envasado', label: 'Envasado', num: true, render: r => U.int(r.envasado) }, { key: 'ventaGranel', label: 'Granel vendido', num: true, render: r => U.int(r.ventaGranel) }, { key: 'merma', label: 'Mermas', num: true, render: r => U.int(r.merma) + (r.entradas ? ` <span class="muted text-xs">(${U.pct(r.merma / r.entradas)})</span>` : '') }, { key: 'vinagre', label: 'Vinagre', num: true, render: r => U.int(r.vinagre) }, { key: 'stock', label: 'Stock actual', num: true, render: r => `<b>${U.int(r.stock)}</b>` }, { key: 'diferencia', label: 'Cuadratura', num: true, render: r => Math.abs(r.diferencia) < 1 ? UI.badge('Cuadra ✓', 'success') : UI.badge(U.int(r.diferencia) + ' L', 'error') }],
      footer: rows => ({ entradas: U.int(U.sum(rows, r => r.entradas)), envasado: U.int(U.sum(rows, r => r.envasado)), ventaGranel: U.int(U.sum(rows, r => r.ventaGranel)), merma: U.int(U.sum(rows, r => r.merma)), vinagre: U.int(U.sum(rows, r => r.vinagre)), stock: U.int(U.sum(rows, r => r.stock)) })
    });
  }

  VG.registry.implement('bodega', {
    async onMount(ctx) { (ctx.sub === 'movimientos' ? movimientos : ctx.sub === 'balance' ? balance : estanques)(ctx); },
    entrada, trasiego, salidaInterna
  });
})(window.VG);
