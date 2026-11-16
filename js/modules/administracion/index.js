/**
 * modules/administracion/index.js — Módulo 18. Administración, sueldos y gastos.
 * Trabajadores, remuneraciones mensuales (bruto, AFP, salud, cesantía, impuesto único,
 * líquido, aportes del empleador y costo empresa), liquidación imprimible, honorarios
 * con retención, gastos operacionales clasificados y presupuesto vs real.
 * Cada gasto/remuneración alimenta el F29 (retenciones, impuesto único, IVA crédito).
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui, T = () => VG.calc.tax;
  const db = () => VG.db;
  const CATS = [['servicios', 'Servicios básicos'], ['arriendo', 'Arriendo'], ['patentes', 'Patentes (municipal, alcoholes)'], ['contribuciones', 'Contribuciones'], ['seguros', 'Seguros'], ['mantencion', 'Mantención'], ['combustible', 'Combustible'], ['marketing', 'Marketing y branding'], ['profesionales', 'Servicios profesionales'], ['certificaciones', 'Certificaciones'], ['financiero', 'Gastos financieros'], ['otros', 'Otros / imprevistos']];
  const catL = k => (CATS.find(c => c[0] === k) || [k, k])[1];

  function trabajadores(ctx) {
    UI.crud(ctx.el, {
      entity: 'trabajador', moduleId: 'administracion', query: ctx.query, title: 'Sueldos y gastos', crumbs: [['Finanzas']], tabs: UI.moduleTabs(ctx),
      desc: 'Maestro de trabajadores con su contrato y remuneración. El área (producción / administración / ventas) define dónde se registra su costo en el estado de resultados.',
      newLabel: 'Nuevo trabajador', emptyIcon: '👷', modalSize: 'lg',
      fields: [
        { key: 'nombre', label: 'Nombre completo', required: true, section: 'Datos personales' }, { key: 'rut', label: 'RUT', type: 'rut', required: true, section: 'Datos personales' },
        { key: 'cargo', label: 'Cargo', required: true, section: 'Contrato' }, { key: 'area', label: 'Área', type: 'select', options: [['produccion', 'Producción'], ['admin', 'Administración'], ['ventas', 'Ventas']], required: true, section: 'Contrato' },
        { key: 'contrato', label: 'Tipo de contrato', type: 'select', options: [['indefinido', 'Indefinido'], ['plazo_fijo', 'Plazo fijo'], ['obra', 'Por obra o faena']], required: true, section: 'Contrato' },
        { key: 'ingreso', label: 'Fecha de ingreso', type: 'date', section: 'Contrato' },
        { key: 'sueldoBase', label: 'Sueldo base', type: 'money', min: 0, required: true, section: 'Remuneración', validate: v => U.n(v) < VG.store.config().remuneraciones.imm ? 'Es inferior al ingreso mínimo mensual configurado (verifica si es jornada parcial).' : '' },
        { key: 'gratificacion', label: 'Gratificación', type: 'select', options: [['art50', 'Art. 50 (25% con tope 4,75 IMM)'], ['fija', 'Monto fijo'], ['ninguna', 'Sin gratificación mensual']], section: 'Remuneración' },
        { key: 'gratificacionMonto', label: 'Monto gratificación', type: 'money', min: 0, section: 'Remuneración', showIf: v => v.gratificacion === 'fija' },
        { key: 'bonos', label: 'Bonos imponibles', type: 'money', min: 0, section: 'Remuneración' }, { key: 'comisiones', label: 'Comisiones', type: 'money', min: 0, section: 'Remuneración' },
        { key: 'colacion', label: 'Colación (no imponible)', type: 'money', min: 0, section: 'Remuneración' }, { key: 'movilizacion', label: 'Movilización (no imponible)', type: 'money', min: 0, section: 'Remuneración' },
        { key: 'afp', label: 'AFP', type: 'select', options: ['Capital', 'Cuprum', 'Habitat', 'Modelo', 'PlanVital', 'Provida', 'Uno'], section: 'Previsión' },
        { key: 'tasaAfp', label: 'Tasa AFP total (10% + comisión)', type: 'number', min: 0.1, max: 0.13, step: 0.0001, section: 'Previsión', help: 'Ej. 0,1127 para 10% + 1,27% de comisión. Vacío = valor de configuración.' },
        { key: 'salud', label: 'Salud', type: 'select', options: ['Fonasa', 'Isapre'], section: 'Previsión' }, { key: 'planSalud', label: 'Plan Isapre (pesos)', type: 'money', min: 0, section: 'Previsión', showIf: v => v.salud === 'Isapre' },
        { key: 'vacacionesPendientes', label: 'Vacaciones pendientes', type: 'number', unit: 'días', min: 0, section: 'Otros' }, { key: 'licencias', label: 'Licencias médicas (observación)', section: 'Otros' }
      ],
      defaults: () => ({ contrato: 'indefinido', area: 'produccion', gratificacion: 'art50', afp: 'Modelo', salud: 'Fonasa', ingreso: U.today() }),
      liveCalc: v => { const l = T().liquidacion(v); return `<h4>Liquidación estimada</h4><dl><dt>Imponible</dt><dd>${U.clp(l.imponible)}</dd><dt>AFP</dt><dd>−${U.clp(l.afp)}</dd><dt>Salud</dt><dd>−${U.clp(l.salud)}</dd><dt>Seguro cesantía</dt><dd>−${U.clp(l.cesantia)}</dd><dt>Impuesto único</dt><dd>−${U.clp(l.impuestoUnico)}</dd><dt>No imponibles</dt><dd>+${U.clp(l.noImponible)}</dd><dt class="total">Líquido</dt><dd class="total">${U.clp(l.liquido)}</dd><dt>Aportes empleador</dt><dd>${U.clp(l.cesantiaEmpleador + l.sis + l.aporteEmpleador)}</dd><dt><b>Costo empresa</b></dt><dd><b>${U.clp(l.costoEmpresa)}</b></dd></dl>`; },
      columns: [
        { key: 'nombre', label: 'Trabajador', sticky: true, render: t => `<b>${U.esc(t.nombre)}</b>${UI.demoBadge(t)}` }, { key: 'rut', label: 'RUT' }, { key: 'cargo', label: 'Cargo' },
        { key: 'area', label: 'Área', render: t => ({ produccion: 'Producción', admin: 'Administración', ventas: 'Ventas' }[t.area] || t.area) },
        { key: 'contrato', label: 'Contrato' }, { key: 'sueldoBase', label: 'Sueldo base', num: true, render: t => U.clp(t.sueldoBase) },
        { key: 'liquido', label: 'Líquido est.', num: true, value: t => T().liquidacion(t).liquido, render: t => U.clp(T().liquidacion(t).liquido) },
        { key: 'costo', label: 'Costo empresa', num: true, value: t => T().liquidacion(t).costoEmpresa, render: t => `<b>${U.clp(T().liquidacion(t).costoEmpresa)}</b>` },
        { key: 'vacacionesPendientes', label: 'Vacaciones', num: true, render: t => U.int(t.vacacionesPendientes) + ' d' }
      ],
      footer: rs => ({ sueldoBase: U.clp(U.sum(rs, t => t.sueldoBase)), liquido: U.clp(U.sum(rs, t => T().liquidacion(t).liquido)), costo: `<b>${U.clp(U.sum(rs, t => T().liquidacion(t).costoEmpresa))}</b>` }),
      canDelete: t => db().find('remuneracion', r => r.trabajadorId === t.id) ? 'No se puede eliminar: tiene remuneraciones registradas.' : true
    });
  }

  function remuneraciones(ctx) {
    const per = ctx.query.periodo || U.month(U.today());
    const content = UI.page(ctx.el, {
      title: 'Remuneraciones mensuales', crumbs: [['Finanzas'], ['Sueldos y gastos', '#/administracion']], tabs: UI.moduleTabs(ctx),
      desc: 'Calcula las liquidaciones del mes para todos los trabajadores. Los valores de AFP, salud, UTM e IMM se configuran en Configuración (verifícalos cada mes).',
      actions: [{ label: 'Calcular mes ' + U.monthName(per), icon: 'plus', primary: true, perm: ['administracion', 'c'], run: () => calcular(per, ctx) }]
    });
    const rs = db().list('remuneracion', r => r.periodo === per);
    content.innerHTML = `<div class="row" style="margin-bottom:16px"><label class="text-sm muted" for="mes">Mes</label><input type="month" class="input" id="mes" style="width:auto" value="${per}"></div>
      <div class="grid grid-4">${UI.kpi({ label: 'Total imponible', value: U.compactCLP(U.sum(rs, r => r.imponible)), icon: 'money' })}${UI.kpi({ label: 'Total líquido a pagar', value: U.compactCLP(U.sum(rs, r => r.liquido)), icon: 'bank' })}${UI.kpi({ label: 'Impuesto único (F29)', value: U.clp(U.sum(rs, r => r.impuestoUnico)), icon: 'receipt' })}${UI.kpi({ label: 'Costo empresa', value: U.compactCLP(U.sum(rs, r => r.costoEmpresa)), icon: 'briefcase' })}</div><div data-t style="margin-top:16px"></div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h3>Resumen mensual del año</h3></div><div data-c></div></div>`;
    content.querySelector('#mes').onchange = e => location.hash = '#/administracion/remuneraciones?periodo=' + e.target.value;
    UI.table(content.querySelector('[data-t]'), {
      rows: rs, exportName: 'remuneraciones_' + per, exportPerm: 'administracion', search: false,
      columns: [{ key: 't', label: 'Trabajador', value: r => UI.refText('trabajador', r.trabajadorId), render: r => `<b>${UI.ref('trabajador', r.trabajadorId)}</b>` }, { key: 'base', label: 'Base', num: true, render: r => U.clp(r.base) }, { key: 'gratificacion', label: 'Gratif.', num: true, render: r => U.clp(r.gratificacion) }, { key: 'imponible', label: 'Imponible', num: true, render: r => U.clp(r.imponible) }, { key: 'afp', label: 'AFP', num: true, render: r => U.clp(r.afp) }, { key: 'salud', label: 'Salud', num: true, render: r => U.clp(r.salud) }, { key: 'cesantia', label: 'Cesantía', num: true, render: r => U.clp(r.cesantia) }, { key: 'impuestoUnico', label: 'Imp. único', num: true, render: r => U.clp(r.impuestoUnico) }, { key: 'liquido', label: 'Líquido', num: true, render: r => `<b>${U.clp(r.liquido)}</b>` }, { key: 'costoEmpresa', label: 'Costo empresa', num: true, render: r => U.clp(r.costoEmpresa) }, { key: 'estado', label: 'Estado', render: r => UI.estadoBadge(r.estado) }],
      rowActions: r => [{ label: 'Ver liquidación (PDF)', icon: 'print', run: () => liquidacion(r) }, r.estado !== 'pagada' && VG.auth.can('administracion', 'e') ? { label: 'Marcar pagada', icon: 'check', run: async () => { await db().save('remuneracion', Object.assign({}, r, { estado: 'pagada', fechaPago: U.today() })); UI.toast('Remuneración marcada como pagada.'); ctx.refresh(); } } : null, VG.auth.can('administracion', 'd') ? { label: 'Eliminar', icon: 'trash', danger: true, run: async () => { if (await UI.confirm({ title: 'Eliminar liquidación', message: 'Se eliminará la liquidación del mes.', danger: true, confirmText: 'Eliminar' })) { await db().remove('remuneracion', r.id); ctx.refresh(); } } } : null].filter(Boolean),
      footer: rows => ({ imponible: U.clp(U.sum(rows, r => r.imponible)), afp: U.clp(U.sum(rows, r => r.afp)), salud: U.clp(U.sum(rows, r => r.salud)), cesantia: U.clp(U.sum(rows, r => r.cesantia)), impuestoUnico: U.clp(U.sum(rows, r => r.impuestoUnico)), liquido: `<b>${U.clp(U.sum(rows, r => r.liquido))}</b>`, costoEmpresa: U.clp(U.sum(rows, r => r.costoEmpresa)) }),
      empty: { icon: '🧾', title: 'No hay liquidaciones para ' + U.monthName(per), text: 'Usa "Calcular mes" para generarlas con los datos de cada trabajador.' }
    });
    const ms = U.monthsOfYear(Number(per.slice(0, 4)));
    VG.charts.bar(content.querySelector('[data-c]'), { labels: ms.map(U.monthName), series: [{ name: 'Líquido', data: ms.map(m => U.sum(db().list('remuneracion', r => r.periodo === m), r => r.liquido)) }, { name: 'Costo empresa', data: ms.map(m => U.sum(db().list('remuneracion', r => r.periodo === m), r => r.costoEmpresa)) }], yFmt: U.compactCLP, tipFmt: U.clp, height: 200 });
  }
  async function calcular(per, ctx) {
    const ts = db().list('trabajador');
    if (!ts.length) return UI.toast('Primero registra trabajadores.', 'warning');
    const ya = db().list('remuneracion', r => r.periodo === per);
    if (ya.length && !(await UI.confirm({ title: 'Recalcular ' + U.monthName(per), message: `Ya existen ${ya.length} liquidaciones para este mes. Se recalcularán con los datos actuales de cada trabajador.`, confirmText: 'Recalcular' }))) return;
    await UI.run(async () => {
      for (const t of ts) { const prev = ya.find(r => r.trabajadorId === t.id); await db().save('remuneracion', Object.assign(prev ? { id: prev.id } : {}, { trabajadorId: t.id, periodo: per, estado: prev ? prev.estado : 'pendiente' }, T().liquidacion(t))); }
      VG.events.emit('remuneracion.calculada', { periodo: per });
    }, `Liquidaciones de ${U.monthName(per)} calculadas.`);
    ctx.refresh();
  }
  function liquidacion(r) {
    const t = db().get('trabajador', r.trabajadorId) || {}, e = VG.store.config().empresa;
    const row = (l, v) => `<tr><td>${l}</td><td class="num">${U.clp(v)}</td></tr>`;
    UI.modal({ title: 'Liquidación de sueldo · ' + U.monthName(r.periodo), size: 'lg', foot: '<div class="right"><button class="btn" data-close>Cerrar</button><button class="btn btn-primary" onclick="window.print()">🖨️ Imprimir / PDF</button></div>', body: `<div><div class="grid grid-2">${UI.dl([['Empleador', U.esc(e.razonSocial)], ['RUT empleador', U.esc(e.rut)], ['Período', U.esc(r.periodo)]])}${UI.dl([['Trabajador', U.esc(t.nombre)], ['RUT', U.esc(t.rut)], ['Cargo', U.esc(t.cargo)], ['AFP / Salud', U.esc((t.afp || '') + ' / ' + (t.salud || ''))]])}</div>
      <div class="grid grid-2" style="margin-top:16px"><table class="statement"><tr class="sub"><td>Haberes</td><td></td></tr>${row('Sueldo base', r.base)}${row('Gratificación', r.gratificacion)}${row('Bonos', r.bonos)}${row('Comisiones', r.comisiones)}<tr class="sub"><td>Total imponible</td><td class="num">${U.clp(r.imponible)}</td></tr>${row('Colación y movilización', r.noImponible)}</table>
      <table class="statement"><tr class="sub"><td>Descuentos</td><td></td></tr>${row('Cotización AFP', r.afp)}${row('Salud', r.salud)}${row('Seguro de cesantía', r.cesantia)}${row('Impuesto único', r.impuestoUnico)}<tr class="sub"><td>Total descuentos</td><td class="num">${U.clp(r.descuentos)}</td></tr><tr class="total"><td>Líquido a pagar</td><td class="num">${U.clp(r.liquido)}</td></tr></table></div>
      <p class="text-xs muted" style="margin-top:12px">Aportes del empleador: seguro de cesantía ${U.clp(r.cesantiaEmpleador)}, SIS ${U.clp(r.sis)}, aporte previsional ${U.clp(r.aporteEmpleador)}. Borrador referencial: valida tasas y topes vigentes con tu contador o Previred.</p>
      <div class="print-only" style="margin-top:40px"><div class="grid grid-2"><div>_______________________<br>Firma empleador</div><div>_______________________<br>Firma trabajador</div></div></div></div>` });
  }

  function honorarios(ctx) {
    UI.crud(ctx.el, {
      entity: 'honorario', moduleId: 'administracion', title: 'Boletas de honorarios', crumbs: [['Finanzas'], ['Sueldos y gastos', '#/administracion']], tabs: UI.moduleTabs(ctx), season: true,
      desc: `Retención vigente configurada: ${U.pct(VG.store.config().tributario.retencionHonorarios, 2)}. La retención se declara en el F29 del mes.`,
      newLabel: 'Registrar boleta', emptyIcon: '🧾',
      fields: [{ key: 'fecha', label: 'Fecha', type: 'date', required: true }, { key: 'nombre', label: 'Prestador', required: true }, { key: 'rut', label: 'RUT', type: 'rut', required: true }, { key: 'numero', label: 'N° de boleta electrónica', type: 'number', step: 1 }, { key: 'descripcion', label: 'Servicio' }, { key: 'bruto', label: 'Monto bruto', type: 'money', min: 1, required: true }, { key: 'estado', label: 'Estado', type: 'select', options: [['pendiente', 'Pendiente'], ['pagada', 'Pagada']] }],
      defaults: () => ({ fecha: U.today(), estado: 'pendiente' }),
      liveCalc: v => { const r = T().retencionHonorarios(v.bruto); return `<h4>Retención</h4><dl><dt>Bruto</dt><dd>${U.clp(v.bruto)}</dd><dt>Retención ${U.pct(VG.store.config().tributario.retencionHonorarios, 2)}</dt><dd>${U.clp(r)}</dd><dt class="total">Líquido a pagar</dt><dd class="total">${U.clp(U.n(v.bruto) - r)}</dd></dl>`; },
      beforeSave: d => { d.retencion = T().retencionHonorarios(d.bruto); d.liquido = U.n(d.bruto) - d.retencion; return d; },
      columns: [{ key: 'fecha', label: 'Fecha', render: h => U.fmtDate(h.fecha) + UI.demoBadge(h) }, { key: 'nombre', label: 'Prestador' }, { key: 'rut', label: 'RUT' }, { key: 'numero', label: 'N°' }, { key: 'bruto', label: 'Bruto', num: true, render: h => U.clp(h.bruto) }, { key: 'retencion', label: 'Retención', num: true, render: h => U.clp(h.retencion) }, { key: 'liquido', label: 'Líquido', num: true, render: h => U.clp(h.liquido) }, { key: 'estado', label: 'Estado', render: h => UI.estadoBadge(h.estado) }],
      footer: rs => ({ bruto: U.clp(U.sum(rs, h => h.bruto)), retencion: U.clp(U.sum(rs, h => h.retencion)), liquido: U.clp(U.sum(rs, h => h.liquido)) })
    });
  }

  function gastos(ctx) {
    UI.crud(ctx.el, {
      entity: 'gasto', moduleId: 'administracion', query: ctx.query, title: 'Gastos operacionales', crumbs: [['Finanzas'], ['Sueldos y gastos', '#/administracion']], tabs: UI.moduleTabs(ctx), season: true,
      desc: 'Montos netos. Si el gasto tiene factura afecta, su IVA se registra como crédito fiscal (DTE recibido) para el F29. Los gastos de producción van a costos indirectos; los demás a gastos de administración y ventas.',
      newLabel: 'Registrar gasto', emptyIcon: '💸',
      fields: [
        { key: 'fecha', label: 'Fecha', type: 'date', required: true, section: 'Gasto' }, { key: 'categoria', label: 'Categoría', type: 'select', options: CATS, required: true, section: 'Gasto' },
        { key: 'descripcion', label: 'Descripción', required: true, section: 'Gasto' }, { key: 'proveedorId', label: 'Proveedor', type: 'ref', ref: 'proveedor', section: 'Gasto' },
        { key: 'monto', label: 'Monto neto', type: 'money', min: 1, required: true, section: 'Gasto' },
        { key: 'documento', label: 'Documento', type: 'select', options: [['factura', 'Factura'], ['boleta', 'Boleta'], ['otro', 'Otro (sin IVA)']], section: 'Documento y pago' },
        { key: 'folio', label: 'Folio', section: 'Documento y pago', showIf: v => v.documento === 'factura' },
        { key: 'afectoIVA', label: 'Afecto a IVA (crédito fiscal)', type: 'checkbox', section: 'Documento y pago', showIf: v => v.documento === 'factura' },
        { key: 'medioPago', label: 'Medio de pago', type: 'select', options: ['transferencia', 'cargo automático', 'tarjeta', 'efectivo', 'cheque'], section: 'Documento y pago' },
        { key: 'estado', label: 'Estado', type: 'select', options: [['pagado', 'Pagado'], ['pendiente', 'Pendiente']], section: 'Documento y pago' },
        { key: 'tipoCosto', label: 'Fijo / variable', type: 'select', options: [['fijo', 'Fijo'], ['variable', 'Variable']], section: 'Clasificación' },
        { key: 'area', label: 'Área', type: 'select', options: [['admin', 'Administración'], ['ventas', 'Ventas'], ['produccion', 'Producción (indirecto)']], section: 'Clasificación' },
        { key: 'noDeducible', label: 'Gasto rechazado / no deducible tributariamente', type: 'checkbox', section: 'Clasificación', help: 'Se agrega a la Renta Líquida Imponible en el borrador de Renta.' }
      ],
      defaults: () => ({ fecha: U.today(), documento: 'factura', afectoIVA: true, estado: 'pagado', tipoCosto: 'fijo', area: 'admin', medioPago: 'transferencia' }),
      liveCalc: v => { const iva = v.documento === 'factura' && v.afectoIVA ? T().iva(v.monto) : 0; return `<h4>Totales</h4><dl><dt>Neto</dt><dd>${U.clp(v.monto)}</dd><dt>IVA crédito</dt><dd>${U.clp(iva)}</dd><dt class="total">Total a pagar</dt><dd class="total">${U.clp(U.n(v.monto) + iva)}</dd></dl><p class="text-xs muted" style="margin:6px 0 0">Va a: ${v.area === 'produccion' ? 'costos indirectos de producción' : 'gastos de administración y ventas'} (${v.tipoCosto === 'variable' ? 'variable' : 'fijo'}).</p>`; },
      afterSave: async (g, isNew) => {
        const ex = db().find('dte', d => d.gastoId === g.id);
        if (g.documento === 'factura' && g.afectoIVA) {
          const p = db().get('proveedor', g.proveedorId) || {}; const t = VG.calc.tax.totales(g.monto, { ila: false });
          await db().save('dte', Object.assign(ex || {}, { direccion: 'recibido', tipo: 33, folio: Number(g.folio) || 0, fecha: g.fecha, estado: 'aceptado', gastoId: g.id, contraparteRut: p.rut || '', contraparte: p.nombre || g.descripcion, neto: t.neto, exento: 0, iva: t.iva, ila: 0, total: t.total }), { system: true, silent: true });
        } else if (ex) await db().remove('dte', ex.id, { system: true });
        if (isNew) VG.events.emit('gasto.registrado', { gasto: g });
      },
      afterRemove: g => db().list('dte', d => d.gastoId === g.id).forEach(d => db().remove('dte', d.id, { system: true })),
      columns: [{ key: 'fecha', label: 'Fecha', render: g => U.fmtDate(g.fecha) + UI.demoBadge(g) }, { key: 'categoria', label: 'Categoría', value: g => catL(g.categoria) }, { key: 'descripcion', label: 'Descripción' }, { key: 'monto', label: 'Neto', num: true, render: g => U.clp(g.monto) }, { key: 'documento', label: 'Doc.' }, { key: 'tipoCosto', label: 'Tipo', render: g => UI.badge(g.tipoCosto === 'variable' ? 'Variable' : 'Fijo', g.tipoCosto === 'variable' ? 'info' : '') }, { key: 'area', label: 'Área', render: g => ({ produccion: 'Producción', admin: 'Administración', ventas: 'Ventas' }[g.area] || '') }, { key: 'estado', label: 'Estado', render: g => UI.estadoBadge(g.estado) }],
      filters: [{ key: 'categoria', label: 'Categoría', options: CATS }, { key: 'tipoCosto', label: 'Tipo', options: [['fijo', 'Fijo'], ['variable', 'Variable']] }, { key: 'area', label: 'Área', options: [['admin', 'Administración'], ['ventas', 'Ventas'], ['produccion', 'Producción']] }],
      footer: rs => ({ monto: U.clp(U.sum(rs, g => g.monto)) })
    });
  }

  function presupuesto(ctx) {
    const y = VG.store.state.season;
    const content = UI.page(ctx.el, { title: 'Presupuesto vs real ' + y, crumbs: [['Finanzas'], ['Sueldos y gastos', '#/administracion']], tabs: UI.moduleTabs(ctx), desc: 'Compara el presupuesto anual por categoría con el gasto real acumulado y proyectado al cierre del año.' });
    const mesesTransc = Math.max(1, new Date().getFullYear() === y ? new Date().getMonth() + 1 : 12);
    const rows = CATS.map(([k, l]) => { const p = db().find('presupuesto', x => Number(x.anio) === y && x.categoria === k); const real = U.sum(db().list('gasto', g => g.categoria === k && U.year(g.fecha) === y), g => g.monto); const pres = p ? U.n(p.monto) : 0; const proy = real / mesesTransc * 12; return { id: k, cat: l, presId: p && p.id, pres, real, proy, desv: pres ? (proy - pres) / pres : null }; }).filter(r => r.pres || r.real);
    const t = U.html('<div></div>'); content.appendChild(t);
    UI.table(t, {
      rows, search: false, exportName: 'presupuesto_vs_real_' + y,
      columns: [{ key: 'cat', label: 'Categoría' }, { key: 'pres', label: 'Presupuesto anual', num: true, render: r => U.clp(r.pres) }, { key: 'real', label: 'Real acumulado', num: true, render: r => U.clp(r.real) }, { key: 'avance', label: 'Avance', sort: false, render: r => r.pres ? `<div style="min-width:120px">${UI.progress(r.real / r.pres, 0.85, 1)}<span class="text-xs muted">${U.pct(r.real / r.pres, 0)}</span></div>` : '—' }, { key: 'proy', label: 'Proyección al cierre', num: true, render: r => U.clp(r.proy) }, { key: 'desv', label: 'Desviación', num: true, render: r => r.desv === null ? UI.badge('Sin presupuesto', 'warning') : `<span class="${r.desv > 0.1 ? 'badge error' : r.desv > 0 ? 'badge warning' : 'badge success'}">${r.desv > 0 ? '+' : ''}${U.pct(r.desv)}</span>` }],
      rowActions: VG.auth.can('administracion', 'e') ? r => [{ label: 'Editar presupuesto', icon: 'edit', run: async () => { const x = await UI.formModal({ title: 'Presupuesto ' + r.cat + ' ' + y, values: { monto: r.pres }, fields: [{ key: 'monto', label: 'Monto anual', type: 'money', min: 0, required: true }], onSave: v => db().save('presupuesto', { id: r.presId, anio: y, categoria: r.id, monto: v.monto }) }); if (x) ctx.refresh(); } }] : null,
      footer: rs => ({ pres: U.clp(U.sum(rs, r => r.pres)), real: U.clp(U.sum(rs, r => r.real)), proy: U.clp(U.sum(rs, r => r.proy)) })
    });
  }

  VG.registry.implement('administracion', {
    async onMount(ctx) { ({ remuneraciones, honorarios, gastos, presupuesto }[ctx.sub] || trabajadores)(ctx); }
  });
})(window.VG);
