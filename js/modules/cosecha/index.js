/**
 * modules/cosecha/index.js — Módulo 4. Cosecha por cuartel.
 * Registro de kg y cajones (validación 18–20 kg/cajón), rendimientos, personal
 * (cuadrillas, tarifa por kg/cajón/día) y costo total y por kilo.
 * Publica: cosecha.registroCreado { registro }, cosecha.costoCalculado { registro, costo }
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui, F = () => VG.calc.financial;
  const cfg = () => VG.store.config().enologia;

  function registro(ctx) {
    UI.crud(ctx.el, {
      entity: 'cosecha', moduleId: 'cosecha', query: ctx.query, title: 'Cosecha por cuartel', crumbs: [['Operación']], tabs: UI.moduleTabs(ctx), season: true,
      desc: `Registra cada jornada de cosecha. Se valida que el peso por cajón esté entre ${cfg().kgCajonMin} y ${cfg().kgCajonMax} kg.`,
      newLabel: 'Registrar cosecha', emptyIcon: '🍇', emptyTitle: 'Aún no hay cosechas en esta temporada',
      fields: [
        { key: 'fecha', label: 'Fecha', type: 'date', required: true, section: 'Cosecha' },
        { key: 'temporada', label: 'Temporada', type: 'number', required: true, step: 1, section: 'Cosecha' },
        { key: 'cuartelId', label: 'Cuartel', type: 'ref', ref: 'cuartel', required: true, section: 'Cosecha' },
        { key: 'loteId', label: 'Lote de destino', type: 'ref', ref: 'lote', refFilter: (l, v) => Number(l.temporada) === Number(v.temporada), section: 'Cosecha', help: 'Lote de vinificación que recibe esta uva (se crea en Calendario de vendimia).' },
        { key: 'cajones', label: 'Cajones', type: 'number', min: 1, step: 1, required: true, section: 'Cosecha' },
        { key: 'kg', label: 'Kg totales', type: 'number', min: 1, required: true, section: 'Cosecha', validate: (v, a) => !VG.calc.oenology.cajonValido(v, a.cajones) ? `El peso por cajón (${U.dec1(U.n(v) / U.n(a.cajones))} kg) está fuera del rango ${cfg().kgCajonMin}–${cfg().kgCajonMax} kg. Revisa kg o cajones.` : '' },
        { key: 'destino', label: 'Destino del fruto', type: 'select', options: ['Vinificación propia', 'Venta de uva', 'Descarte'], section: 'Cosecha' },
        { key: 'costoBins', label: 'Bins / arriendo', type: 'money', min: 0, section: 'Otros costos' },
        { key: 'costoTransporte', label: 'Transporte', type: 'money', min: 0, section: 'Otros costos' },
        { key: 'costoAlimentacion', label: 'Alimentación', type: 'money', min: 0, section: 'Otros costos' },
        { key: 'otrosCostos', label: 'Otros', type: 'money', min: 0, section: 'Otros costos' },
        { key: 'observaciones', label: 'Observaciones', type: 'textarea', section: 'Otros costos' }
      ],
      defaults: () => ({ fecha: U.today(), temporada: VG.store.state.season, destino: 'Vinificación propia' }),
      liveCalc: v => {
        const c = VG.db.get('cuartel', v.cuartelId);
        const kc = U.n(v.cajones) ? U.n(v.kg) / U.n(v.cajones) : 0;
        const ok = VG.calc.oenology.cajonValido(v.kg, v.cajones);
        const otros = U.n(v.costoBins) + U.n(v.costoTransporte) + U.n(v.costoAlimentacion) + U.n(v.otrosCostos);
        const jor = v.id ? U.sum(VG.db.list('jornal', j => j.cosechaId === v.id), j => F().pagoJornal(j)) : 0;
        return `<h4>Cálculo en vivo</h4><dl>
          <dt>Kg por cajón</dt><dd class="${ok ? 'text-success' : 'text-error'}">${U.dec1(kc)} ${ok ? '✓' : '⚠'}</dd>
          <dt>Rendimiento</dt><dd>${c && U.n(c.superficie) ? U.int(U.n(v.kg) / c.superficie) + ' kg/ha' : '—'}</dd>
          <dt>Kg por planta</dt><dd>${c && U.n(c.plantas) ? U.dec2(U.n(v.kg) / c.plantas) : '—'}</dd>
          <dt>Personal (jornales)</dt><dd>${U.clp(jor)}</dd><dt>Otros costos</dt><dd>${U.clp(otros)}</dd>
          <dt class="total">Costo total</dt><dd class="total">${U.clp(jor + otros)}</dd><dt>Costo por kg</dt><dd>${U.n(v.kg) ? U.clp((jor + otros) / U.n(v.kg)) : '—'}</dd></dl>
          ${v.id ? '' : '<p class="text-xs muted" style="margin:8px 0 0">Después de guardar, agrega el personal en "Personal y pagos".</p>'}`;
      },
      afterSave: (r, isNew) => { if (isNew) VG.events.emit('cosecha.registroCreado', { registro: r }); VG.events.emit('cosecha.costoCalculado', { registro: r, costo: F().costoCosecha(r) }); },
      afterRemove: r => VG.db.list('jornal', j => j.cosechaId === r.id).forEach(j => VG.db.remove('jornal', j.id, { system: true })),
      rowActions: r => [{ label: 'Agregar personal', icon: 'users', run: () => location.hash = '#/cosecha/personal?cosecha=' + r.id }],
      columns: [
        { key: 'fecha', label: 'Fecha', sticky: true, render: r => U.fmtDate(r.fecha) + UI.demoBadge(r) },
        { key: 'cuartel', label: 'Cuartel', value: r => UI.refText('cuartel', r.cuartelId), render: r => UI.ref('cuartel', r.cuartelId) },
        { key: 'lote', label: 'Lote', value: r => UI.refText('lote', r.loteId), render: r => UI.ref('lote', r.loteId) },
        { key: 'cajones', label: 'Cajones', num: true, render: r => U.int(r.cajones) },
        { key: 'kg', label: 'Kg', num: true, render: r => U.int(r.kg) },
        { key: 'kgc', label: 'Kg/cajón', num: true, value: r => U.n(r.kg) / (U.n(r.cajones) || 1), render: r => { const ok = VG.calc.oenology.cajonValido(r.kg, r.cajones); return `<span class="${ok ? '' : 'badge warning'}">${U.dec1(U.n(r.kg) / (U.n(r.cajones) || 1))}</span>`; } },
        { key: 'kgha', label: 'Kg/ha', num: true, value: r => { const c = VG.db.get('cuartel', r.cuartelId); return c ? U.n(r.kg) / U.n(c.superficie) : 0; }, render: r => { const c = VG.db.get('cuartel', r.cuartelId); return c ? U.int(U.n(r.kg) / U.n(c.superficie)) : '—'; } },
        { key: 'costo', label: 'Costo', num: true, value: r => F().costoCosecha(r).total, render: r => U.clp(F().costoCosecha(r).total) },
        { key: 'ckg', label: '$/kg', num: true, value: r => F().costoCosecha(r).porKg, render: r => U.clp(F().costoCosecha(r).porKg) }
      ],
      filters: [{ key: 'cuartelId', label: 'Cuartel', options: () => VG.db.list('cuartel').map(c => [c.id, c.codigo]) }],
      footer: rows => { const kg = U.sum(rows, r => r.kg), caj = U.sum(rows, r => r.cajones), co = U.sum(rows, r => F().costoCosecha(r).total); return { cajones: U.int(caj), kg: U.int(kg), kgc: U.dec1(kg / (caj || 1)), costo: U.clp(co), ckg: U.clp(co / (kg || 1)) }; },
        renderTop: (top, rows) => {
          const kg = U.sum(rows, r => r.kg), costo = U.sum(rows, r => F().costoCosecha(r).total);
          const porCuartel = VG.db.list('cuartel').map(c => ({ label: c.codigo + ' · ' + c.variedad, value: U.sum(rows.filter(r => r.cuartelId === c.id), r => r.kg) }));
          top.innerHTML = `<div class="grid grid-4">
            ${UI.kpi({ label: 'Kg cosechados', value: U.int(kg), icon: 'grape', micro: `Temporada ${VG.store.state.season}` })}
            ${UI.kpi({ label: 'Cajones', value: U.int(U.sum(rows, r => r.cajones)), icon: 'box', micro: U.dec1(kg / (U.sum(rows, r => r.cajones) || 1)) + ' kg/cajón promedio' })}
            ${UI.kpi({ label: 'Costo de cosecha', value: U.compactCLP(costo), icon: 'coins', micro: 'Personal + bins + transporte + alimentación' })}
            ${UI.kpi({ label: 'Costo por kg', value: U.clp(kg ? costo / kg : 0), icon: 'chart', micro: 'Solo costo de cosecha' })}
          </div><div class="card"><div class="card-head"><h3>Kg por cuartel</h3></div><div data-c></div></div>`;
          VG.charts.hbar(top.querySelector('[data-c]'), { items: porCuartel, fmt: v => U.kg(v) });
        }
    });
  }

  function personal(ctx) {
    const filt = ctx.query.cosecha;
    UI.crud(ctx.el, {
      entity: 'jornal', moduleId: 'cosecha', title: 'Personal y pagos de cosecha', crumbs: [['Operación'], ['Cosecha', '#/cosecha']], tabs: UI.moduleTabs(ctx),
      desc: 'Registra cada trabajador o cuadrilla con su tarifa (por kg, por cajón o por día). El pago se suma al costo de la cosecha.',
      filter: r => (!filt || r.cosechaId === filt) && (!r.fecha || VG.store.inSeason(r)),
      newLabel: 'Agregar trabajador o cuadrilla', emptyIcon: '👷',
      fields: [
        { key: 'cosechaId', label: 'Registro de cosecha', type: 'ref', ref: 'cosecha', required: true, refLabel: c => U.fmtDate(c.fecha) + ' · ' + UI.refText('cuartel', c.cuartelId) + ' · ' + U.int(c.kg) + ' kg', onChangeSet: v => ({ fecha: (VG.db.get('cosecha', v.cosechaId) || {}).fecha }) },
        { key: 'nombre', label: 'Nombre (trabajador o cuadrilla)', required: true },
        { key: 'rut', label: 'RUT', type: 'rut' },
        { key: 'cuadrilla', label: 'Cuadrilla' },
        { key: 'trabajadores', label: 'N° de trabajadores', type: 'number', min: 1, step: 1 },
        { key: 'horas', label: 'Horas por jornada', type: 'number', min: 0, max: 14 },
        { key: 'tarifaTipo', label: 'Tipo de tarifa', type: 'select', required: true, options: [['kg', 'Por kg'], ['cajon', 'Por cajón'], ['dia', 'Por día']] },
        { key: 'tarifa', label: 'Tarifa', type: 'money', min: 0, required: true },
        { key: 'kg', label: 'Kg cosechados', type: 'number', min: 0, showIf: v => v.tarifaTipo === 'kg' },
        { key: 'cajones', label: 'Cajones cosechados', type: 'number', min: 0, step: 1, showIf: v => v.tarifaTipo === 'cajon' },
        { key: 'jornadas', label: 'Jornadas (días × trabajadores)', type: 'number', min: 0, showIf: v => v.tarifaTipo === 'dia' }
      ],
      defaults: () => ({ cosechaId: filt || '', tarifaTipo: 'cajon', tarifa: 650, trabajadores: 1, horas: 8, fecha: filt ? (VG.db.get('cosecha', filt) || {}).fecha : U.today() }),
      liveCalc: v => `<h4>Pago</h4><dl><dt>Pago total</dt><dd class="total">${U.clp(F().pagoJornal(v))}</dd><dt>Por trabajador</dt><dd>${U.clp(F().pagoJornal(v) / (U.n(v.trabajadores) || 1))}</dd></dl>`,
      beforeSave: d => { d.pago = F().pagoJornal(d); d.fecha = (VG.db.get('cosecha', d.cosechaId) || {}).fecha || d.fecha; return d; },
      columns: [
        { key: 'fecha', label: 'Fecha', render: r => U.fmtDate(r.fecha) + UI.demoBadge(r) },
        { key: 'nombre', label: 'Nombre / cuadrilla', render: r => `<b>${U.esc(r.nombre)}</b>` },
        { key: 'rut', label: 'RUT' }, { key: 'trabajadores', label: 'Trab.', num: true }, { key: 'horas', label: 'Horas', num: true },
        { key: 'tarifa', label: 'Tarifa', num: true, render: r => U.clp(r.tarifa) + ({ kg: '/kg', cajon: '/cajón', dia: '/día' }[r.tarifaTipo] || '') },
        { key: 'cant', label: 'Cantidad', num: true, value: r => r.tarifaTipo === 'kg' ? r.kg : r.tarifaTipo === 'cajon' ? r.cajones : r.jornadas, render: r => U.int(r.tarifaTipo === 'kg' ? r.kg : r.tarifaTipo === 'cajon' ? r.cajones : r.jornadas) },
        { key: 'pago', label: 'Pago', num: true, value: r => F().pagoJornal(r), render: r => `<b>${U.clp(F().pagoJornal(r))}</b>` }
      ],
      footer: rows => ({ _label: 'Total a pagar', pago: `<b>${U.clp(U.sum(rows, r => F().pagoJornal(r)))}</b>` }),
      renderTop: top => { top.innerHTML = filt ? `<div class="alert info"><span>🔎</span><div class="a-body">Mostrando el personal de la cosecha del ${U.fmtDate((VG.db.get('cosecha', filt) || {}).fecha)}.</div><a href="#/cosecha/personal">Ver todo →</a></div>` : ''; }
    });
  }

  VG.registry.implement('cosecha', { async onMount(ctx) { (ctx.sub === 'personal' ? personal : registro)(ctx); } });
})(window.VG);
