/**
 * modules/conciliacion/index.js — Módulo 22. Conciliación bancaria.
 * Cuentas, importación de cartola CSV con mapeo de columnas, match automático y manual
 * con cobros, pagos, remuneraciones, impuestos y gastos, registro de diferencias,
 * libro de banco y conciliación (saldo extracto ± partidas = saldo libros).
 * Publica: conciliacion.actualizada { cuentaId }
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui, R = () => VG.integrations.recon;
  const db = () => VG.db;

  VG.registry.implement('conciliacion', {
    async onMount(ctx) {
      const ctas = db().list('cuentaBanco');
      const cid = ctx.query.cuenta || (ctas[0] || {}).id;
      const cta = cid && db().get('cuentaBanco', cid);
      const can = a => VG.auth.can('conciliacion', a);
      const content = UI.page(ctx.el, {
        title: 'Conciliación bancaria', crumbs: [['Tributario']],
        desc: 'Importa la cartola, deja que el sistema sugiera las coincidencias y concilia el resto a mano. Saldo según extracto ± partidas en tránsito = saldo según libros.',
        actions: [
          { label: 'Nueva cuenta', icon: 'plus', perm: ['conciliacion', 'c'], run: () => cuentaForm(ctx) },
          cta && { label: 'Importar cartola CSV', icon: 'upload', perm: ['conciliacion', 'c'], run: () => importar(cta, ctx) },
          cta && { label: 'Movimiento manual', icon: 'edit', perm: ['conciliacion', 'c'], run: () => manual(cta, ctx) },
          cta && { label: 'Conciliar automáticamente', icon: 'check', primary: true, perm: ['conciliacion', 'e'], run: async () => { const n = await UI.run(() => R().autoConciliar(cta.id)); UI.toast(n ? `${n} movimientos conciliados automáticamente.` : 'No se encontraron coincidencias únicas nuevas.', n ? 'success' : 'info'); ctx.refresh(); } }
        ]
      });
      if (!cta) { content.innerHTML = UI.empty({ icon: '🏦', title: 'Aún no tienes cuentas bancarias', text: 'Crea una cuenta para importar cartolas y conciliar.', action: can('c') ? '+ Crear cuenta' : null }); const b = content.querySelector('[data-empty-action]'); if (b) b.onclick = () => cuentaForm(ctx); return; }
      const rs = R().resumen(cta.id);
      const movs = db().list('movBanco', m => m.cuentaId === cta.id);
      const hoy = U.today();
      content.innerHTML = `<div class="row" style="margin-bottom:16px"><label class="text-sm muted" for="cta">Cuenta</label><select class="select" id="cta" style="width:auto">${ctas.map(c => `<option value="${c.id}" ${c.id === cta.id ? 'selected' : ''}>${U.esc(c.banco)} · ${U.esc(c.tipo)} ${U.esc(c.numero)}</option>`).join('')}</select>${can('e') ? '<button class="btn btn-sm" data-edit>Editar cuenta</button>' : ''}</div>
        <div class="grid grid-4">${UI.kpi({ label: 'Saldo según extracto', value: U.clp(rs.saldoExtracto), icon: 'bank' })}${UI.kpi({ label: 'Saldo según libros', value: U.clp(rs.saldoLibros), icon: 'doc' })}${UI.kpi({ label: 'Conciliados', value: `${rs.conciliados} / ${rs.total}`, icon: 'ok', tone: rs.nPendientes ? 'warning' : 'success', micro: rs.nPendientes + ' pendientes' })}${UI.kpi({ label: 'Diferencias', value: rs.nDif, icon: 'warn', tone: rs.nDif ? 'warning' : '', micro: U.clp(rs.ajustesDif) })}</div>
        <div class="grid grid-2" style="margin-top:16px;align-items:start"><div class="card"><div class="card-head"><h3>Conciliación</h3></div><table class="statement"><tr><td>Saldo según extracto bancario</td><td>${U.clp(rs.saldoExtracto)}</td></tr><tr><td class="indent">+ Depósitos en tránsito (en libros, no en banco)</td><td>${U.clp(rs.depositosTransito)}</td></tr><tr><td class="indent">− Pagos girados no cobrados</td><td>${U.clp(rs.giradosNoCobrados)}</td></tr><tr><td class="indent">− Movimientos bancarios sin registrar en libros</td><td>${U.clp(-rs.pendientes)}</td></tr><tr><td class="indent">∓ Diferencias (comisiones, intereses, errores)</td><td>${U.clp(-rs.ajustesDif)}</td></tr><tr class="total"><td>Saldo según libros</td><td>${U.clp(rs.saldoLibros)}</td></tr></table></div>
        <div class="card"><div class="card-head"><h3>Partidas en libros no presentes en el banco</h3></div><div data-p></div></div></div>
        <h2 style="margin-top:24px">Libro de banco</h2><div data-t></div>`;
      content.querySelector('#cta').onchange = e => location.hash = '#/conciliacion?cuenta=' + e.target.value;
      const eb = content.querySelector('[data-edit]'); if (eb) eb.onclick = () => cuentaForm(ctx, cta);
      UI.table(content.querySelector('[data-p]'), { rows: rs.enLibrosNoBanco.map(c => Object.assign({ id: c.ref }, c)), search: false, pageSize: 6, columns: [{ key: 'fecha', label: 'Fecha', render: c => U.fmtDate(c.fecha) }, { key: 'tipo', label: 'Tipo' }, { key: 'desc', label: 'Detalle' }, { key: 'monto', label: 'Monto', num: true, render: c => `<span class="${c.monto < 0 ? 'text-error' : 'text-success'}">${U.clp(c.monto)}</span>` }, { key: 'ant', label: 'Antigüedad', num: true, value: c => U.diffDays(c.fecha, hoy), render: c => U.diffDays(c.fecha, hoy) + ' d' }], empty: { icon: '✅', title: 'Sin partidas en tránsito' } });
      let saldo = U.n(cta.saldoInicial);
      const libro = movs.slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.createdAt).localeCompare(String(b.createdAt))).map(m => { saldo += U.n(m.monto); return Object.assign({}, m, { saldo }); });
      UI.table(content.querySelector('[data-t]'), {
        rows: libro, exportName: 'libro_banco_' + cta.numero, exportPerm: 'conciliacion', defaultSort: 'fecha', pageSize: 20,
        columns: [{ key: 'fecha', label: 'Fecha', render: m => U.fmtDate(m.fecha) + UI.demoBadge(m) }, { key: 'glosa', label: 'Glosa' }, { key: 'cargo', label: 'Cargo', num: true, value: m => m.monto < 0 ? -m.monto : 0, render: m => m.monto < 0 ? U.clp(-m.monto) : '' }, { key: 'abono', label: 'Abono', num: true, value: m => m.monto > 0 ? m.monto : 0, render: m => m.monto > 0 ? U.clp(m.monto) : '' }, { key: 'saldo', label: 'Saldo', num: true, render: m => U.clp(m.saldo) }, { key: 'estado', label: 'Estado', render: m => UI.estadoBadge(m.estado) }, { key: 'matchDesc', label: 'Conciliado con', value: m => m.matchDesc || m.nota || '', render: m => U.esc(m.matchDesc || m.nota || '') }, { key: 'ant', label: 'Antigüedad', num: true, value: m => m.estado === 'pendiente' ? U.diffDays(m.fecha, hoy) : -1, render: m => m.estado === 'pendiente' ? `<span class="${U.diffDays(m.fecha, hoy) > 30 ? 'text-error' : ''}">${U.diffDays(m.fecha, hoy)} d</span>` : '' }],
        filters: [{ key: 'estado', label: 'Estado', options: [['pendiente', 'Pendiente'], ['conciliado', 'Conciliado'], ['diferencia', 'Diferencia']] }],
        rowActions: can('e') ? m => [m.estado !== 'conciliado' ? { label: 'Conciliar manualmente', icon: 'link', run: () => conciliarManual(m, ctx) } : { label: 'Deshacer conciliación', icon: 'x', run: async () => { await db().save('movBanco', Object.assign({}, m, { estado: 'pendiente', matchRef: '', matchDesc: '' })); ctx.refresh(); } }, m.estado === 'pendiente' ? { label: 'Registrar como diferencia', icon: 'warn', run: () => diferencia(m, ctx) } : null, can('d') ? { label: 'Eliminar', icon: 'trash', danger: true, run: async () => { if (await UI.confirm({ title: 'Eliminar movimiento', message: 'Se eliminará el movimiento bancario.', danger: true, confirmText: 'Eliminar' })) { await db().remove('movBanco', m.id); ctx.refresh(); } } } : null].filter(Boolean) : null,
        empty: { icon: '🏦', title: 'Sin movimientos', text: 'Importa una cartola CSV o registra movimientos manuales.' }
      });
    }
  });

  async function cuentaForm(ctx, cta) {
    const r = await UI.formModal({ title: cta ? 'Editar cuenta' : 'Nueva cuenta bancaria', values: cta || { tipo: 'Cuenta corriente', moneda: 'CLP', fechaInicio: U.today(), saldoInicial: 0 }, fields: [{ key: 'banco', label: 'Banco', required: true }, { key: 'tipo', label: 'Tipo', type: 'select', options: ['Cuenta corriente', 'Cuenta vista', 'Cuenta de ahorro', 'Línea de crédito'] }, { key: 'numero', label: 'Número', required: true }, { key: 'moneda', label: 'Moneda', type: 'select', options: ['CLP', 'USD', 'EUR'] }, { key: 'fechaInicio', label: 'Fecha de inicio de la conciliación', type: 'date', required: true }, { key: 'saldoInicial', label: 'Saldo inicial (extracto a esa fecha)', type: 'money', required: true }], onSave: v => db().save('cuentaBanco', Object.assign({}, cta || {}, v)) });
    if (r) { UI.toast('Cuenta guardada.'); location.hash = '#/conciliacion?cuenta=' + r.id; }
  }
  async function manual(cta, ctx) {
    const r = await UI.formModal({ title: 'Movimiento bancario manual', values: { fecha: U.today(), sentido: 'cargo' }, fields: [{ key: 'fecha', label: 'Fecha', type: 'date', required: true }, { key: 'glosa', label: 'Glosa', required: true }, { key: 'sentido', label: 'Tipo', type: 'select', options: [['abono', 'Abono (entrada)'], ['cargo', 'Cargo (salida)']] }, { key: 'monto', label: 'Monto', type: 'money', min: 1, required: true }], onSave: v => db().save('movBanco', { cuentaId: cta.id, fecha: v.fecha, glosa: v.glosa, monto: v.sentido === 'cargo' ? -U.n(v.monto) : U.n(v.monto), estado: 'pendiente' }) });
    if (r) ctx.refresh();
  }
  async function importar(cta, ctx) {
    const body = U.html(`<div class="stack"><p>Descarga la cartola desde tu banco en formato CSV o Excel guardado como CSV. Indica qué columna contiene cada dato (la primera columna es la 1).</p>
      <div class="field"><label for="f">Archivo CSV</label><input class="input" type="file" id="f" accept=".csv,text/csv"></div>
      <div class="form-grid"><div class="field"><label for="cF">Columna fecha</label><input class="input" type="number" id="cF" value="1" min="1"></div><div class="field"><label for="cG">Columna glosa</label><input class="input" type="number" id="cG" value="2" min="1"></div><div class="field"><label for="cC">Columna cargo</label><input class="input" type="number" id="cC" value="3" min="1"></div><div class="field"><label for="cA">Columna abono</label><input class="input" type="number" id="cA" value="4" min="1"></div><div class="field"><label for="cM">Columna monto único (opcional, con signo)</label><input class="input" type="number" id="cM" min="1" placeholder="vacío si hay cargo/abono"></div><div class="field"><label for="cS">Filas de encabezado a saltar</label><input class="input" type="number" id="cS" value="1" min="0"></div></div>
      <div data-prev></div></div>`);
    let parsed = [];
    const foot = U.html('<div class="right"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-ok disabled>Importar movimientos</button></div>');
    const m = UI.modal({ title: 'Importar cartola · ' + cta.banco, body, foot, size: 'lg' });
    const read = async () => {
      const f = body.querySelector('#f').files[0]; if (!f) return;
      const n = id => body.querySelector(id).value === '' ? '' : Number(body.querySelector(id).value) - 1;
      parsed = R().parseCartola(await U.readFile(f), { fecha: n('#cF'), glosa: n('#cG'), cargo: n('#cC'), abono: n('#cA'), monto: n('#cM'), saltar: Number(body.querySelector('#cS').value) });
      const dup = parsed.filter(p => db().find('movBanco', x => x.cuentaId === cta.id && x.fecha === p.fecha && Math.round(x.monto) === Math.round(p.monto) && x.glosa === p.glosa));
      body.querySelector('[data-prev]').innerHTML = parsed.length ? `<p><b>${parsed.length}</b> movimientos leídos${dup.length ? ` (${dup.length} ya existen y se omitirán)` : ''}. Vista previa:</p><table class="data compact"><thead><tr><th>Fecha</th><th>Glosa</th><th class="num">Monto</th></tr></thead><tbody>${parsed.slice(0, 6).map(p => `<tr><td>${U.fmtDate(p.fecha)}</td><td>${U.esc(p.glosa)}</td><td class="num">${U.clp(p.monto)}</td></tr>`).join('')}</tbody></table>` : UI.alert('warning', 'No se pudieron leer movimientos', 'Revisa el mapeo de columnas y el formato de fechas (dd/mm/aaaa o aaaa-mm-dd).');
      foot.querySelector('[data-ok]').disabled = !parsed.length;
      parsed = parsed.filter(p => !dup.includes(p));
    };
    body.addEventListener('change', read);
    foot.querySelector('[data-ok]').onclick = async () => { await UI.run(() => db().saveMany('movBanco', parsed.map(p => Object.assign({ cuentaId: cta.id, estado: 'pendiente' }, p))), `${parsed.length} movimientos importados.`); m.close(true); const n = await R().autoConciliar(cta.id); if (n) UI.toast(`${n} conciliados automáticamente.`, 'info'); ctx.refresh(); };
  }
  async function conciliarManual(m, ctx) {
    const cands = R().candidatos();
    const sug = R().sugerencias(m, cands);
    const others = cands.filter(c => (c.monto > 0) === (m.monto > 0) && !sug.some(s => s.ref === c.ref)).sort((a, b) => Math.abs(Math.abs(a.monto) - Math.abs(m.monto)) - Math.abs(Math.abs(b.monto) - Math.abs(m.monto))).slice(0, 12);
    const body = U.html(`<div class="stack">${UI.dl([['Movimiento', U.esc(m.glosa)], ['Fecha', U.fmtDate(m.fecha)], ['Monto', U.clp(m.monto)]])}<h3>Sugerencias (mismo monto, ±7 días)</h3><div data-s></div><h3>Otros documentos de montos cercanos</h3><div data-o></div></div>`);
    const md = UI.modal({ title: 'Conciliar manualmente', body, size: 'lg' });
    const list = (el, arr) => { el.innerHTML = arr.length ? `<div class="stack">${arr.map((c, i) => `<button class="card pad-sm" style="width:100%;text-align:left;cursor:pointer" data-i="${i}"><div class="row between"><span><b>${U.esc(c.tipo)}</b> · ${U.esc(c.desc)}<br><span class="text-xs muted">${U.fmtDate(c.fecha)}</span></span><b>${U.clp(c.monto)}</b></div></button>`).join('')}</div>` : '<p class="muted">Sin coincidencias.</p>'; el.querySelectorAll('[data-i]').forEach(b => b.onclick = async () => { const c = arr[+b.dataset.i]; await db().save('movBanco', Object.assign({}, m, { estado: Math.round(c.monto) === Math.round(m.monto) ? 'conciliado' : 'diferencia', matchRef: c.ref, matchDesc: c.tipo + ' · ' + c.desc, nota: Math.round(c.monto) !== Math.round(m.monto) ? 'Diferencia ' + U.clp(m.monto - c.monto) : '' })); VG.events.emit('conciliacion.actualizada', { cuentaId: m.cuentaId }); md.close(true); UI.toast('Movimiento conciliado.'); ctx.refresh(); }); };
    list(body.querySelector('[data-s]'), sug); list(body.querySelector('[data-o]'), others);
  }
  async function diferencia(m, ctx) {
    const r = await UI.formModal({ title: 'Registrar diferencia', values: { motivo: m.monto < 0 ? 'Comisión bancaria' : 'Intereses a favor', crearGasto: m.monto < 0 }, fields: [{ key: 'motivo', label: 'Motivo', required: true, list: ['Comisión bancaria', 'Intereses a favor', 'Impuesto timbres', 'Error del banco', 'Error de registro'] }, { key: 'crearGasto', label: 'Registrar como gasto financiero en libros', type: 'checkbox', showIf: () => m.monto < 0 }], onSave: async v => { if (v.crearGasto && m.monto < 0) { await db().save('gasto', { fecha: m.fecha, categoria: 'financiero', descripcion: v.motivo + ' (banco)', monto: -m.monto, afectoIVA: false, documento: 'otro', medioPago: 'cargo automático', estado: 'pagado', tipoCosto: 'fijo', area: 'admin' }, { system: true }); return db().save('movBanco', Object.assign({}, m, { estado: 'conciliado', matchDesc: 'Gasto financiero: ' + v.motivo })); } return db().save('movBanco', Object.assign({}, m, { estado: 'diferencia', nota: v.motivo })); } });
    if (r) ctx.refresh();
  }
})(window.VG);
