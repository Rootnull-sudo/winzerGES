/**
 * modules/envasado/index.js — Módulo 11. Envasado y etiquetado.
 * Órdenes de envasado con validación de stock y costo unitario desglosado por envase,
 * validador de etiqueta (Ley 18.455 y Decreto 78), validación D.O. y formatos.
 * Publica: envasado.confirmado { orden }
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui, F = () => VG.calc.financial, Inv = () => VG.calc.inventory;
  const db = () => VG.db;
  const PARTES = [['vino', 'Vino'], ['envase', 'Envase'], ['etiqueta', 'Etiqueta (impresión + diseño)'], ['capsula', 'Cápsula'], ['cierre', 'Corcho / tapa'], ['caja', 'Caja'], ['manoObra', 'Mano de obra'], ['energia', 'Energía y agua']];
  const insOpt = (...tipos) => i => tipos.includes(i.tipo);

  function ordenes(ctx) {
    const ctl = UI.crud(ctx.el, {
      entity: 'ordenEnvasado', moduleId: 'envasado', query: ctx.query, title: 'Envasado y etiquetado', crumbs: [['Comercial']], tabs: UI.moduleTabs(ctx), season: true,
      desc: 'Crea la orden en borrador y confírmala al envasar: se descuenta el vino del estanque y los insumos de envasado, y se calcula el costo unitario real.',
      newLabel: 'Nueva orden de envasado', emptyIcon: '🍾', modalSize: 'lg',
      fields: [
        { key: 'codigo', label: 'Código', required: true, section: 'Orden' },
        { key: 'fecha', label: 'Fecha', type: 'date', required: true, section: 'Orden' },
        { key: 'estanqueId', label: 'Estanque de origen', type: 'ref', ref: 'estanque', required: true, section: 'Orden', refFilter: e => Inv().litrosEstanque(e.id) > 0.5, refLabel: e => `${e.codigo} · ${U.int(Inv().litrosEstanque(e.id))} L`, onChangeSet: v => { const l = Inv().loteDeEstanque(v.estanqueId); return { loteId: l ? l.id : '' }; } },
        { key: 'loteId', label: 'Lote', type: 'ref', ref: 'lote', required: true, section: 'Orden', refFilter: (l, v) => !v.estanqueId || Inv().lotesEnEstanque(v.estanqueId).some(x => x.loteId === l.id) },
        { key: 'formatoId', label: 'Formato', type: 'ref', ref: 'formato', required: true, section: 'Orden' },
        { key: 'unidades', label: 'Unidades', type: 'number', min: 1, step: 1, required: true, section: 'Orden' },
        { key: 'mermaPct', label: 'Merma de envasado', type: 'number', unit: '%', min: 0, max: 20, step: 0.1, section: 'Orden' },
        { key: 'responsable', label: 'Responsable', section: 'Orden' },
        { key: 'envaseId', label: 'Envase (vidrio / PET)', type: 'ref', ref: 'insumo', refFilter: insOpt('Envase vidrio', 'Envase PET', 'Bag in box'), required: true, section: 'Materiales' },
        { key: 'cierreId', label: 'Corcho / tapa', type: 'ref', ref: 'insumo', refFilter: insOpt('Cierre'), section: 'Materiales' },
        { key: 'capsulaId', label: 'Cápsula', type: 'ref', ref: 'insumo', refFilter: insOpt('Cápsula'), section: 'Materiales' },
        { key: 'cajaId', label: 'Caja', type: 'ref', ref: 'insumo', refFilter: insOpt('Caja'), section: 'Materiales' },
        { key: 'etiquetaId', label: 'Diseño de etiqueta', type: 'ref', ref: 'etiqueta', section: 'Materiales', help: 'Usa el costo de impresión y prorratea el diseño entre las botellas producidas con esa versión.' },
        { key: 'etiquetaInsumoId', label: 'Etiqueta (insumo de stock)', type: 'ref', ref: 'insumo', refFilter: insOpt('Etiqueta'), section: 'Materiales', help: 'Opcional: si las etiquetas se controlan como insumo en inventario.' },
        { key: 'manoObra', label: 'Mano de obra total', type: 'money', min: 0, section: 'Costos de proceso' },
        { key: 'energiaAgua', label: 'Energía y agua (prorrateo)', type: 'money', min: 0, section: 'Costos de proceso' },
        { key: 'graduacion', label: 'Graduación alcohólica', type: 'number', unit: '% vol', min: 0, max: 18, step: 0.1, section: 'Rotulación y D.O.' },
        { key: 'declaraDO', label: 'La etiqueta declara Denominación de Origen', type: 'checkbox', section: 'Rotulación y D.O.' },
        { key: 'pctUvaZona', label: '% de uva de la zona declarada', type: 'number', unit: '%', min: 0, max: 100, section: 'Rotulación y D.O.', showIf: v => v.declaraDO, validate: (v, a) => a.declaraDO && U.n(v) < 75 ? 'Para declarar D.O. se requiere al menos 75% de uva de la zona.' : '' },
        { key: 'certificadoDO', label: 'Certificado D.O. (entidad autorizada SAG)', section: 'Rotulación y D.O.', showIf: v => v.declaraDO, validate: (v, a) => a.declaraDO && !v ? 'Indica el certificado emitido por una entidad autorizada por el SAG.' : '' }
      ],
      defaults: () => { const n = db().count('ordenEnvasado') + 1; return { codigo: `OE-${new Date().getFullYear()}-${String(n).padStart(2, '0')}`, fecha: U.today(), mermaPct: 1.5, estado: 'borrador', responsable: VG.auth.current().nombre, energiaAgua: 0 }; },
      liveCalc: v => {
        const c = F().costoEnvasado(v); const fmt = db().get('formato', v.formatoId) || {};
        const disp = v.estanqueId ? U.sum(db().list('movBodega', m => m.estanqueId === v.estanqueId && m.loteId === v.loteId), m => m.litros) + (v.id && v.estado === 'confirmada' ? c.litrosConsumidos : 0) : 0;
        const falt = [['envaseId', 1], ['cierreId', 1], ['capsulaId', 1]].filter(([k]) => v[k] && Inv().stockInsumo(v[k]) < U.n(v.unidades)).map(([k]) => UI.refText('insumo', v[k]));
        return `<h4>Costo unitario en vivo</h4><dl>${PARTES.map(([k, l]) => `<dt>${l}</dt><dd>${U.clp(c.partes[k])}</dd>`).join('')}<dt class="total">Costo por unidad</dt><dd class="total">${U.clp(c.unitario)}</dd><dt>Costo por litro envasado</dt><dd>${U.clp(fmt.litros ? c.unitario / fmt.litros : 0)}</dd><dt>Costo total orden</dt><dd>${U.clp(c.total)}</dd><dt>Litros a consumir</dt><dd class="${c.litrosConsumidos > disp + 0.01 ? 'text-error' : ''}">${U.int(c.litrosConsumidos)} / ${U.int(disp)} L</dd></dl>
          ${c.litrosConsumidos > disp + 0.01 ? '<p class="text-xs text-error" style="margin:6px 0 0">⚠ No hay vino suficiente del lote en el estanque.</p>' : ''}${falt.length ? `<p class="text-xs text-warning" style="margin:6px 0 0">⚠ Stock insuficiente de: ${falt.map(U.esc).join(', ')}.</p>` : ''}
          <p class="text-xs muted" style="margin:6px 0 0">Costo del vino: ${U.clp(c.costoLitroVino)}/L del lote.</p>`;
      },
      beforeSave: (d, isNew, before) => {
        if (before && before.estado === 'confirmada') throw new Error('La orden ya fue confirmada; para corregirla, anúlala y crea una nueva.');
        const c = F().costoEnvasado(d);
        return Object.assign(d, { estado: d.estado || 'borrador', costoUnitario: Math.round(c.unitario), costoTotal: Math.round(c.total), litrosConsumidos: U.round(c.litrosConsumidos, 1), costoPartes: c.partes });
      },
      canEdit: o => o.estado !== 'confirmada',
      canDelete: o => o.estado === 'confirmada' && db().find('venta', v => v.ordenEnvasadoId === o.id && v.estado !== 'anulada') ? 'No se puede eliminar: hay ventas de esta orden.' : true,
      afterRemove: o => { db().list('movBodega', m => m.ref === 'envasado:' + o.id).forEach(m => db().remove('movBodega', m.id, { system: true })); db().list('movInsumo', m => m.ref === 'envasado:' + o.id).forEach(m => db().remove('movInsumo', m.id, { system: true })); },
      rowActions: (o, { refresh }) => [
        o.estado !== 'confirmada' && VG.auth.can('envasado', 'e') ? { label: 'Confirmar envasado', icon: 'check', run: () => confirmar(o, refresh) } : null,
        { label: 'Ver costo desglosado', icon: 'coins', run: () => verCosto(o) },
        o.estado === 'confirmada' ? { label: 'Validar etiqueta', icon: 'tag', run: () => location.hash = '#/envasado/validador?orden=' + o.id } : null
      ].filter(Boolean),
      view: o => verCosto(o),
      columns: [
        { key: 'codigo', label: 'Orden', sticky: true, render: o => `<b>${U.esc(o.codigo)}</b>${UI.demoBadge(o)}` },
        { key: 'fecha', label: 'Fecha', render: o => U.fmtDate(o.fecha) },
        { key: 'lote', label: 'Lote', value: o => UI.refText('lote', o.loteId), render: o => UI.ref('lote', o.loteId) },
        { key: 'formato', label: 'Formato', value: o => UI.refText('formato', o.formatoId), render: o => UI.ref('formato', o.formatoId) },
        { key: 'unidades', label: 'Unidades', num: true, render: o => U.int(o.unidades) },
        { key: 'litrosConsumidos', label: 'Litros', num: true, render: o => U.int(o.litrosConsumidos) },
        { key: 'mermaPct', label: 'Merma', num: true, render: o => `<span class="${U.n(o.mermaPct) > 3 ? 'text-warning' : ''}">${U.dec1(o.mermaPct)}%</span>` },
        { key: 'costoUnitario', label: 'Costo unit.', num: true, render: o => U.clp(o.costoUnitario) },
        { key: 'stock', label: 'Stock', num: true, value: o => Inv().stockOrden(o.id), render: o => o.estado === 'confirmada' ? U.int(Inv().stockOrden(o.id)) : '—' },
        { key: 'do', label: 'D.O.', value: o => o.declaraDO ? 'Sí' : 'No', render: o => !o.declaraDO ? '<span class="muted">—</span>' : U.n(o.pctUvaZona) >= 75 && o.certificadoDO ? UI.badge('D.O. ✓', 'success') : UI.badge('D.O. sin respaldo', 'error') },
        { key: 'estado', label: 'Estado', render: o => UI.estadoBadge(o.estado) }
      ],
      filters: [{ key: 'estado', label: 'Estado', options: [['borrador', 'Borrador'], ['confirmada', 'Confirmada']] }, { key: 'formatoId', label: 'Formato', options: () => db().list('formato').map(f => [f.id, f.nombre]) }],
      renderTop: (top, rows) => {
        const conf = rows.filter(o => o.estado === 'confirmada');
        const porF = db().list('formato').map(f => { const os = conf.filter(o => o.formatoId === f.id); return { f, u: U.sum(os, o => o.unidades), c: U.sum(os, o => o.costoTotal) }; }).filter(x => x.u);
        top.innerHTML = `<div class="grid grid-4">${UI.kpi({ label: 'Unidades envasadas', value: U.int(U.sum(conf, o => o.unidades)), icon: 'bottle', micro: 'Temporada ' + VG.store.state.season })}${UI.kpi({ label: 'Litros envasados', value: U.lt(U.sum(conf, o => o.litrosConsumidos)), icon: 'drop' })}${porF.slice(0, 2).map(x => UI.kpi({ label: 'Costo prom. ' + x.f.nombre, value: U.clp(x.c / x.u), icon: 'coins', micro: U.int(x.u) + ' unidades' })).join('')}</div>`;
      }
    });
    return ctl;
  }

  async function confirmar(o, refresh) {
    const c = F().costoEnvasado(o);
    try { Inv().validarSalida(o.estanqueId, c.litrosConsumidos, o.loteId); } catch (e) { return UI.toast(e.message, 'error'); }
    if (o.declaraDO && (U.n(o.pctUvaZona) < 75 || !o.certificadoDO)) return UI.toast('No se puede confirmar: la etiqueta declara D.O. sin el 75% de uva de la zona o sin certificado de entidad autorizada SAG.', 'error');
    const ok = await UI.confirm({ title: 'Confirmar envasado ' + o.codigo, message: `Se descontarán <b>${U.int(c.litrosConsumidos)} L</b> del estanque ${UI.ref('estanque', o.estanqueId)} y los insumos de envasado (${U.int(o.unidades)} unidades). Costo unitario: <b>${U.clp(c.unitario)}</b>.`, confirmText: 'Confirmar envasado' });
    if (!ok) return;
    await UI.run(async () => {
      const r = await db().save('ordenEnvasado', Object.assign({}, o, { estado: 'confirmada', costoUnitario: Math.round(c.unitario), costoTotal: Math.round(c.total), litrosConsumidos: U.round(c.litrosConsumidos, 1), costoPartes: c.partes, confirmadaEn: new Date().toISOString() }));
      VG.events.emit('envasado.confirmado', { orden: r });
    }, 'Envasado confirmado. Inventarios actualizados.');
    const fmt = db().get('formato', o.formatoId);
    if (fmt) UI.toast('Recuerda: cada producto debe estar inscrito en el SAG antes de su comercialización.', 'info');
    setTimeout(refresh, 300);
  }

  function verCosto(o) {
    const c = o.costoPartes ? { partes: o.costoPartes, unitario: o.costoUnitario, total: o.costoTotal } : F().costoEnvasado(o);
    const items = PARTES.map(([k, l]) => ({ label: l, value: c.partes[k] }));
    const body = U.html(`<div class="stack">${UI.dl([['Lote', UI.ref('lote', o.loteId)], ['Formato', UI.ref('formato', o.formatoId)], ['Unidades', U.int(o.unidades)], ['Estado', UI.estadoBadge(o.estado)], ['Costo unitario', `<b>${U.clp(c.unitario)}</b>`], ['Costo total', U.clp(c.total)]])}
      <div><h3>Composición del costo por unidad</h3><div data-s></div></div>
      <table class="data compact"><thead><tr><th>Componente</th><th class="num">$/unidad</th><th class="num">%</th></tr></thead><tbody>${items.map(i => `<tr><td>${i.label}</td><td class="num">${U.clp(i.value)}</td><td class="num">${U.pct(c.unitario ? i.value / c.unitario : 0)}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="num">${U.clp(c.unitario)}</td><td class="num">100%</td></tr></tfoot></table></div>`);
    UI.modal({ title: 'Costo de ' + o.codigo, body, size: 'lg' });
    VG.charts.stack(body.querySelector('[data-s]'), { items, fmt: U.clp });
  }

  function formatos(ctx) {
    UI.crud(ctx.el, {
      entity: 'formato', moduleId: 'envasado', title: 'Formatos de envase', crumbs: [['Comercial'], ['Envasado', '#/envasado']], tabs: UI.moduleTabs(ctx),
      desc: 'Formatos estándar (0,75 L, 1 L, 2 L, 5 L) y personalizados. Se agregan desde aquí, sin modificar código.',
      newLabel: 'Nuevo formato', emptyIcon: '🍾',
      fields: [{ key: 'nombre', label: 'Nombre', required: true, placeholder: 'Magnum 1,5 L' }, { key: 'litros', label: 'Contenido', type: 'number', unit: 'L', min: 0.05, max: 1000, step: 0.001, required: true }, { key: 'envase', label: 'Tipo de envase', type: 'select', options: [['vidrio', 'Vidrio'], ['PET', 'PET'], ['BIB', 'Bag in box'], ['lata', 'Lata']] }, { key: 'unidadesCaja', label: 'Unidades por caja', type: 'number', min: 1, step: 1 }, { key: 'stockMinimo', label: 'Stock mínimo (unidades)', type: 'number', min: 0, step: 1 }],
      columns: [{ key: 'nombre', label: 'Formato', render: f => `<b>${U.esc(f.nombre)}</b>` }, { key: 'litros', label: 'Litros', num: true, render: f => U.dec2(f.litros) }, { key: 'envase', label: 'Envase' }, { key: 'unidadesCaja', label: 'Un./caja', num: true }, { key: 'stockMinimo', label: 'Stock mín.', num: true }, { key: 'stock', label: 'Stock actual', num: true, value: f => (Inv().stockPorFormato()[f.id] || { unidades: 0 }).unidades, render: f => U.int((Inv().stockPorFormato()[f.id] || { unidades: 0 }).unidades) }],
      defaultSort: 'litros', defaultDir: 'asc',
      canDelete: f => db().find('ordenEnvasado', o => o.formatoId === f.id) ? 'No se puede eliminar: hay órdenes con este formato.' : true
    });
  }

  /** Validador de etiqueta según Ley 18.455 y Decreto 78 (menciones obligatorias). */
  function validador(ctx) {
    const content = UI.page(ctx.el, { title: 'Validador de etiqueta', crumbs: [['Comercial'], ['Envasado', '#/envasado']], tabs: UI.moduleTabs(ctx), desc: 'Revisa las menciones obligatorias del rótulo de vinos según la Ley 18.455 y su reglamento (Decreto 78). Herramienta de apoyo: la validación final corresponde al SAG.' });
    const o = ctx.query.orden ? db().get('ordenEnvasado', ctx.query.orden) : null;
    const et = o && o.etiquetaId ? db().get('etiqueta', o.etiquetaId) : null;
    const fmt = o ? db().get('formato', o.formatoId) : null;
    const lote = o ? db().get('lote', o.loteId) : null;
    const cfg = VG.store.config().empresa;
    const vals = { denominacion: (et && et.denominacion) || 'Vino', graduacion: (o && o.graduacion) || (et && et.graduacion) || '', contenido: fmt ? (fmt.litros < 1 ? fmt.litros * 1000 + ' ml' : String(fmt.litros).replace('.', ',') + ' L') : '', envasador: cfg.razonSocial, domicilio: [cfg.direccion, cfg.comuna].filter(Boolean).join(', '), pais: 'Chile', varietal: (et && et.varietal) || (lote && lote.variedad) || '', inscripcionSAG: cfg.inscripcionSAG, do: (et && et.do) || '', pctVarietal: 100, anada: lote ? lote.temporada : '', pctAnada: 100, alergenos: true };
    const fields = [
      { key: 'denominacion', label: 'Denominación del producto', required: true, help: 'Ej.: "Vino", "Vino tinto", "Vino blanco".' },
      { key: 'graduacion', label: 'Graduación alcohólica (% vol)', type: 'number', min: 0, max: 18, step: 0.1, required: true },
      { key: 'contenido', label: 'Contenido neto (ml o L)', required: true, placeholder: '750 ml' },
      { key: 'envasador', label: 'Nombre o razón social del envasador', required: true },
      { key: 'domicilio', label: 'Domicilio del envasador', required: true },
      { key: 'pais', label: 'País de origen', required: true },
      { key: 'inscripcionSAG', label: 'N° de inscripción SAG', required: true },
      { key: 'varietal', label: 'Variedad declarada (si aplica)' },
      { key: 'pctVarietal', label: '% de la variedad declarada', type: 'number', min: 0, max: 100 },
      { key: 'anada', label: 'Año de cosecha declarado (si aplica)' },
      { key: 'pctAnada', label: '% del año declarado', type: 'number', min: 0, max: 100 },
      { key: 'do', label: 'Denominación de origen declarada (si aplica)' },
      { key: 'alergenos', label: 'Incluye "Contiene sulfitos"', type: 'checkbox' }
    ];
    const form = UI.form(fields, vals, { liveCalc: v => {
      const ck = [
        ['Denominación', !!v.denominacion], ['Graduación en % vol (Gay-Lussac)', U.n(v.graduacion) > 0], ['Contenido neto en ml o L', /\d\s*(ml|l|cc)\b/i.test(v.contenido || '')], ['Nombre del envasador', !!v.envasador], ['Domicilio del envasador', !!v.domicilio], ['País de origen', !!v.pais], ['N° inscripción SAG', !!v.inscripcionSAG],
        v.varietal ? ['Variedad: mínimo 75% de la cepa', U.n(v.pctVarietal) >= 75] : null,
        v.anada ? ['Año de cosecha: mínimo 75% del año', U.n(v.pctAnada) >= 75] : null,
        v.do ? ['D.O.: 75% uva de la zona y certificado', o ? (U.n(o.pctUvaZona) >= 75 && !!o.certificadoDO) : null] : null,
        ['Advertencia de sulfitos', !!v.alergenos]
      ].filter(Boolean);
      const okN = ck.filter(c => c[1] === true).length;
      return `<h4>Resultado: ${okN}/${ck.length} requisitos</h4><ul style="list-style:none;padding:0;margin:0">${ck.map(([l, ok]) => `<li style="padding:3px 0">${ok === true ? '✅' : ok === null ? '❔' : '❌'} ${U.esc(l)}</li>`).join('')}</ul>${okN === ck.length ? '<p class="text-success" style="margin:8px 0 0"><b>La etiqueta cumple las menciones revisadas.</b></p>' : '<p class="text-error" style="margin:8px 0 0"><b>Faltan menciones obligatorias.</b></p>'}`;
    } });
    content.innerHTML = (o ? `<div class="alert info" style="margin-bottom:12px"><span>🍾</span><div class="a-body">Datos precargados desde la orden <b>${U.esc(o.codigo)}</b>${et ? ' y la etiqueta ' + U.esc(et.nombre + ' v' + et.version) : ''}.</div></div>` : '') + UI.legal('Recuerda: cada producto debe estar inscrito en el SAG antes de comercializarse. La Ley 18.455 regula la producción, elaboración y comercialización de bebidas alcohólicas; el Decreto 78 detalla las menciones de rotulación.');
    const card = U.html('<div class="card"></div>'); card.appendChild(form.el); content.appendChild(card);
  }

  VG.registry.implement('envasado', {
    async onInstall() {
      if (VG.db.count('formato')) return;
      await VG.db.saveMany('formato', [
        { id: 'fmt_075', nombre: 'Botella 0,75 L', litros: 0.75, envase: 'vidrio', unidadesCaja: 12, stockMinimo: 600 },
        { id: 'fmt_1', nombre: 'Botella 1 L', litros: 1, envase: 'vidrio', unidadesCaja: 6, stockMinimo: 120 },
        { id: 'fmt_2', nombre: 'PET 2 L', litros: 2, envase: 'PET', unidadesCaja: 6, stockMinimo: 60 },
        { id: 'fmt_5', nombre: 'Bidón 5 L', litros: 5, envase: 'PET', unidadesCaja: 1, stockMinimo: 20 }
      ], { system: true, silent: true });
    },
    async onMount(ctx) { (ctx.sub === 'formatos' ? formatos : ctx.sub === 'validador' ? validador : ordenes)(ctx); }
  });
})(window.VG);
