/**
 * modules/marca/index.js — Módulo 14. Gestión de marca, diseño y etiquetas.
 * Registro de marca INAPI (vigencia 10 años), versiones de etiqueta con costos de
 * diseño, impresión e ilustración, y amortización de costos únicos por botella.
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui, F = () => VG.calc.financial;
  const db = () => VG.db;
  const producidas = et => U.sum(db().list('ordenEnvasado', o => o.etiquetaId === et.id && o.estado === 'confirmada'), o => o.unidades);

  function etiquetas(ctx, el) {
    UI.crud(el, {
      embed: true, entity: 'etiqueta', moduleId: 'marca', title: 'Diseños de etiqueta', newLabel: 'Nueva versión de etiqueta', query: ctx.query,
      fields: [
        { key: 'nombre', label: 'Nombre del diseño', required: true, section: 'Diseño' },
        { key: 'version', label: 'Versión', type: 'number', min: 1, step: 1, required: true, section: 'Diseño' },
        { key: 'marcaId', label: 'Marca', type: 'ref', ref: 'marca', section: 'Diseño' },
        { key: 'fecha', label: 'Fecha', type: 'date', section: 'Diseño' },
        { key: 'disenador', label: 'Diseñador', section: 'Diseño' },
        { key: 'aprobacionLegal', label: 'Aprobación legal de rotulación (Ley 18.455 / Decreto 78)', type: 'checkbox', section: 'Diseño' },
        { key: 'costoDiseno', label: 'Costo de diseño', type: 'money', min: 0, section: 'Costos únicos (se prorratean)' },
        { key: 'costoFotografia', label: 'Fotografía', type: 'money', min: 0, section: 'Costos únicos (se prorratean)' },
        { key: 'costoIlustracion', label: 'Ilustración', type: 'money', min: 0, section: 'Costos únicos (se prorratean)' },
        { key: 'tirajeEstimado', label: 'Botellas estimadas con esta versión', type: 'number', min: 1, step: 1, section: 'Costos únicos (se prorratean)', help: 'Base de prorrateo mientras no haya producción suficiente.' },
        { key: 'costoImpresion', label: 'Costo de impresión unitario', type: 'money', min: 0, section: 'Impresión' },
        { key: 'proveedorId', label: 'Imprenta', type: 'ref', ref: 'proveedor', section: 'Impresión' },
        { key: 'tirajeMinimo', label: 'Tiraje mínimo', type: 'number', min: 0, step: 1, section: 'Impresión' },
        { key: 'varietal', label: 'Varietal declarado', section: 'Rotulación' }, { key: 'graduacion', label: 'Graduación', type: 'number', unit: '% vol', section: 'Rotulación' }, { key: 'do', label: 'D.O. declarada', section: 'Rotulación' }, { key: 'denominacion', label: 'Denominación', section: 'Rotulación' }
      ],
      defaults: () => ({ version: 1, fecha: U.today(), tirajeEstimado: 10000 }),
      liveCalc: v => { const unicos = U.n(v.costoDiseno) + U.n(v.costoFotografia) + U.n(v.costoIlustracion); const base = Math.max(v.id ? producidas(v) : 0, U.n(v.tirajeEstimado)) || 1; return `<h4>Amortización por botella</h4><dl><dt>Costos únicos</dt><dd>${U.clp(unicos)}</dd><dt>Base de prorrateo</dt><dd>${U.int(base)} bot.</dd><dt>Diseño por botella</dt><dd>${U.dec1(unicos / base)}</dd><dt>Impresión</dt><dd>${U.clp(v.costoImpresion)}</dd><dt class="total">Costo etiqueta/botella</dt><dd class="total">${U.dec1(unicos / base + U.n(v.costoImpresion))}</dd></dl>`; },
      columns: [
        { key: 'nombre', label: 'Diseño', render: e => `<b>${U.esc(e.nombre)}</b> v${e.version}${UI.demoBadge(e)}` },
        { key: 'marca', label: 'Marca', value: e => UI.refText('marca', e.marcaId), render: e => UI.ref('marca', e.marcaId) },
        { key: 'fecha', label: 'Fecha', render: e => U.fmtDate(e.fecha) },
        { key: 'unicos', label: 'Costos únicos', num: true, value: e => U.n(e.costoDiseno) + U.n(e.costoFotografia) + U.n(e.costoIlustracion), render: e => U.clp(U.n(e.costoDiseno) + U.n(e.costoFotografia) + U.n(e.costoIlustracion)) },
        { key: 'producidas', label: 'Botellas producidas', num: true, value: producidas, render: e => U.int(producidas(e)) },
        { key: 'prorrateo', label: 'Diseño/bot.', num: true, value: e => F().prorrateoEtiqueta(e), render: e => U.dec1(F().prorrateoEtiqueta(e)) },
        { key: 'costoImpresion', label: 'Impresión', num: true, render: e => U.clp(e.costoImpresion) },
        { key: 'total', label: 'Total/bot.', num: true, value: e => F().prorrateoEtiqueta(e) + U.n(e.costoImpresion), render: e => `<b>${U.dec1(F().prorrateoEtiqueta(e) + U.n(e.costoImpresion))}</b>` },
        { key: 'aprobacionLegal', label: 'Legal', render: e => e.aprobacionLegal ? UI.badge('Aprobada', 'success') : UI.badge('Pendiente', 'warning') }
      ]
    });
  }

  VG.registry.implement('marca', {
    async onMount(ctx) {
      const content = UI.page(ctx.el, { title: 'Marca, diseño y etiquetas', crumbs: [['Comercial']], desc: 'Registro de marcas en INAPI (renovación cada 10 años) y versiones de etiqueta. Los costos únicos de diseño se amortizan entre las botellas producidas con cada versión.' });
      const a = U.html('<div></div>'), b = U.html('<div style="margin-top:28px"></div>');
      content.appendChild(a); content.appendChild(b);
      UI.crud(a, {
        embed: true, entity: 'marca', moduleId: 'marca', title: 'Marcas registradas', newLabel: 'Nueva marca',
        fields: [{ key: 'nombre', label: 'Nombre de la marca', required: true }, { key: 'titular', label: 'Titular' }, { key: 'numeroINAPI', label: 'N° de registro INAPI' }, { key: 'clases', label: 'Clases (Niza)', placeholder: '33' }, { key: 'fechaRegistro', label: 'Fecha de registro', type: 'date', required: true, onChangeSet: v => ({ vencimiento: v.fechaRegistro ? (Number(v.fechaRegistro.slice(0, 4)) + 10) + v.fechaRegistro.slice(4) : '' }) }, { key: 'vencimiento', label: 'Vencimiento (10 años)', type: 'date' }, { key: 'costo', label: 'Costo de registro y abogados', type: 'money', min: 0, help: 'Se amortiza en 10 años como gasto del período.' }],
        columns: [{ key: 'nombre', label: 'Marca', render: m => `<b>${U.esc(m.nombre)}</b>${UI.demoBadge(m)}` }, { key: 'numeroINAPI', label: 'N° INAPI' }, { key: 'clases', label: 'Clases' }, { key: 'fechaRegistro', label: 'Registro', render: m => U.fmtDate(m.fechaRegistro) }, { key: 'vencimiento', label: 'Vence', render: m => { const d = U.diffDays(U.today(), m.vencimiento); return `${U.fmtDate(m.vencimiento)} ${d < 0 ? UI.badge('Vencida', 'error') : d < 180 ? UI.badge('Renovar', 'warning') : UI.badge('Vigente', 'success')}`; } }, { key: 'costo', label: 'Costo', num: true, render: m => U.clp(m.costo) }, { key: 'amort', label: 'Amortización anual', num: true, value: m => U.n(m.costo) / 10, render: m => U.clp(U.n(m.costo) / 10) }]
      });
      etiquetas(ctx, b);
    }
  });
})(window.VG);
