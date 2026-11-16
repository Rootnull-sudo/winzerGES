/**
 * modules/configuracion/index.js — Configuración general y gestión de datos.
 * Empresa, umbrales enológicos y financieros, respaldo/restauración JSON y CSV,
 * datos demo (cargar / borrar) y reinicio completo.
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui;
  const db = () => VG.db;

  function general(ctx) {
    const c = VG.store.config();
    const content = UI.page(ctx.el, { title: 'Configuración y datos', crumbs: [['Administración']], tabs: [{ label: 'General', href: '#/configuracion', active: true }, { label: 'Datos y respaldos', href: '#/configuracion/datos' }], desc: 'Datos de la empresa, umbrales de alertas y parámetros financieros.' });
    const form = UI.form([
      { key: 'nombreFantasia', label: 'Nombre de la viña', required: true, section: 'Empresa' }, { key: 'razonSocial', label: 'Razón social', required: true, section: 'Empresa' }, { key: 'rut', label: 'RUT', type: 'rut', required: true, section: 'Empresa' }, { key: 'giro', label: 'Giro', section: 'Empresa' },
      { key: 'direccion', label: 'Dirección', section: 'Empresa' }, { key: 'comuna', label: 'Comuna', section: 'Empresa' }, { key: 'email', label: 'Correo', type: 'email', section: 'Empresa' }, { key: 'telefono', label: 'Teléfono', section: 'Empresa' }, { key: 'inscripcionSAG', label: 'N° inscripción SAG', section: 'Empresa' },
      { key: 'so2BMin', label: 'SO₂ libre blancos — mínimo', type: 'number', unit: 'mg/L', min: 0, section: 'Enología (modo suave)' }, { key: 'so2BMax', label: 'SO₂ libre blancos — máximo', type: 'number', unit: 'mg/L', min: 0, section: 'Enología (modo suave)' }, { key: 'so2BAl', label: 'Blancos — umbral de alerta', type: 'number', unit: 'mg/L', min: 0, section: 'Enología (modo suave)' },
      { key: 'so2TMin', label: 'SO₂ libre tintos — mínimo', type: 'number', unit: 'mg/L', min: 0, section: 'Enología (modo suave)' }, { key: 'so2TMax', label: 'SO₂ libre tintos — máximo', type: 'number', unit: 'mg/L', min: 0, section: 'Enología (modo suave)' }, { key: 'so2TAl', label: 'Tintos — umbral de alerta', type: 'number', unit: 'mg/L', min: 0, section: 'Enología (modo suave)' },
      { key: 'intervaloMinHoras', label: 'Intervalo mínimo entre adiciones de SO₂', type: 'number', unit: 'h', min: 0, section: 'Enología (modo suave)' }, { key: 'desviacionDias', label: 'Umbral de desviación de FA', type: 'number', unit: 'días', min: 1, section: 'Enología (modo suave)' },
      { key: 'kgCajonMin', label: 'Kg por cajón — mínimo', type: 'number', min: 1, section: 'Enología (modo suave)' }, { key: 'kgCajonMax', label: 'Kg por cajón — máximo', type: 'number', min: 1, section: 'Enología (modo suave)' },
      { key: 'margenMinimo', label: 'Margen bruto mínimo (alerta)', type: 'number', unit: '%', min: 0, max: 100, section: 'Finanzas' }, { key: 'saldoInicialCaja', label: 'Saldo inicial de caja (1 de enero)', type: 'money', section: 'Finanzas' }, { key: 'patrimonio', label: 'Patrimonio (para ROE)', type: 'money', min: 0, section: 'Finanzas' }, { key: 'capitalInvertido', label: 'Capital invertido (ROI / ROC)', type: 'money', min: 0, section: 'Finanzas' },
      { key: 'inactividadMin', label: 'Bloqueo por inactividad', type: 'number', unit: 'min', min: 1, max: 240, section: 'Seguridad y alertas' }, { key: 'foliosPct', label: 'Alerta de folios usados', type: 'number', unit: '%', min: 10, max: 100, section: 'Seguridad y alertas' }, { key: 'diasVenc', label: 'Avisar vencimiento de insumos con', type: 'number', unit: 'días', min: 1, section: 'Seguridad y alertas' }
    ], Object.assign({}, c.empresa, { so2BMin: c.enologia.so2Blanco.min, so2BMax: c.enologia.so2Blanco.max, so2BAl: c.enologia.so2Blanco.alerta, so2TMin: c.enologia.so2Tinto.min, so2TMax: c.enologia.so2Tinto.max, so2TAl: c.enologia.so2Tinto.alerta, intervaloMinHoras: c.enologia.intervaloMinHoras, desviacionDias: c.enologia.desviacionDias, kgCajonMin: c.enologia.kgCajonMin, kgCajonMax: c.enologia.kgCajonMax, margenMinimo: c.finanzas.margenMinimo * 100, saldoInicialCaja: c.finanzas.saldoInicialCaja, patrimonio: c.finanzas.patrimonio, capitalInvertido: c.finanzas.capitalInvertido, inactividadMin: c.alertas.inactividadMin, foliosPct: c.alertas.foliosPct * 100, diasVenc: c.alertas.stockMinimoDiasVencimiento }));
    const card = U.html('<div class="card"></div>'); card.appendChild(form.el);
    const can = VG.auth.can('configuracion', 'e');
    const b = U.html(`<div class="row" style="margin-top:16px"><button class="btn btn-primary" ${can ? '' : 'disabled'}>Guardar configuración</button>${can ? '' : '<span class="text-sm muted">Solo lectura para tu rol.</span>'}</div>`); card.appendChild(b);
    b.querySelector('button').onclick = async () => {
      if (!form.validate()) return UI.toast('Revisa los campos marcados en rojo.', 'warning');
      const v = form.values();
      await UI.run(() => VG.store.saveConfig({ empresa: { nombreFantasia: v.nombreFantasia, razonSocial: v.razonSocial, rut: v.rut, giro: v.giro, direccion: v.direccion, comuna: v.comuna, email: v.email, telefono: v.telefono, inscripcionSAG: v.inscripcionSAG }, enologia: { so2Blanco: { min: v.so2BMin, max: v.so2BMax, alerta: v.so2BAl }, so2Tinto: { min: v.so2TMin, max: v.so2TMax, alerta: v.so2TAl }, intervaloMinHoras: v.intervaloMinHoras, desviacionDias: v.desviacionDias, kgCajonMin: v.kgCajonMin, kgCajonMax: v.kgCajonMax }, finanzas: { margenMinimo: v.margenMinimo / 100, saldoInicialCaja: v.saldoInicialCaja, patrimonio: v.patrimonio, capitalInvertido: v.capitalInvertido }, alertas: { inactividadMin: v.inactividadMin, foliosPct: v.foliosPct / 100, stockMinimoDiasVencimiento: v.diasVenc } }), 'Configuración guardada.');
      VG.app.refreshLayout();
    };
    content.appendChild(card);
  }

  function datos(ctx) {
    const content = UI.page(ctx.el, { title: 'Datos y respaldos', crumbs: [['Administración'], ['Configuración', '#/configuracion']], tabs: [{ label: 'General', href: '#/configuracion' }, { label: 'Datos y respaldos', href: '#/configuracion/datos', active: true }], desc: 'Tus datos viven solo en este navegador. Exporta respaldos con frecuencia y guárdalos fuera de GitHub (nube privada, USB).', noDemoBanner: true });
    const isAdmin = VG.auth.can('configuracion', 'e');
    const last = db().getMeta('lastBackup');
    const ents = Object.keys(VG.schema.entities).filter(e => db().count(e)).sort();
    content.innerHTML = `${!last || U.diffDays(last.slice(0, 10), U.today()) > 7 ? UI.alert('warning', 'Haz un respaldo', last ? 'El último respaldo es del ' + U.fmtDateTime(last) + '.' : 'Aún no has exportado ningún respaldo.') : UI.alert('success', 'Respaldo reciente', 'Último respaldo: ' + U.fmtDateTime(last) + '.')}
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><div class="card-head"><h3>💾 Respaldo completo (JSON)</h3></div><p class="text-sm muted">Incluye todas las entidades y preferencias. Restaurar reemplaza los datos actuales.</p><div class="row"><button class="btn btn-primary" data-exp>Exportar respaldo</button>${isAdmin ? '<label class="btn">Restaurar respaldo<input type="file" accept=".json,application/json" data-imp hidden></label>' : ''}</div></div>
        <div class="card"><div class="card-head"><h3>📄 CSV por entidad</h3></div><p class="text-sm muted">Exporta o importa una tabla (sin pérdida: los campos compuestos van como JSON). Importar agrega o actualiza por id.</p><div class="row"><select class="select" data-ent style="width:auto">${ents.map(e => `<option value="${e}">${U.esc(VG.schema.get(e).label)} (${db().count(e)})</option>`).join('')}</select><button class="btn" data-csv>Exportar CSV</button>${isAdmin ? '<label class="btn">Importar CSV<input type="file" accept=".csv,text/csv" data-icsv hidden></label>' : ''}</div></div>
        <div class="card"><div class="card-head"><h3>🧪 Datos de ejemplo</h3></div><p class="text-sm muted">${db().hasDemo() ? 'Hay datos de ejemplo cargados (marcados como "demo").' : 'No hay datos de ejemplo.'}</p><div class="row">${isAdmin && db().hasDemo() ? '<button class="btn btn-danger" data-deldemo>Borrar datos demo</button>' : ''}${isAdmin && !db().hasDemo() ? '<button class="btn" data-seed>Cargar datos demo</button>' : ''}</div></div>
        <div class="card"><div class="card-head"><h3>ℹ️ Información técnica</h3></div>${UI.dl([['Versión', VG.VERSION], ['Almacenamiento', db().backend === 'indexeddb' ? 'IndexedDB' : 'localStorage (respaldo)'], ['Registros', U.int(db().count())], ['Módulos instalados', (db().getMeta('installed', []) || []).length + ' / ' + VG.registry.list().length], ['Modo', VG.DEV ? 'Desarrollo (?dev=1)' : 'Normal']])}${isAdmin ? '<div class="row" style="margin-top:14px"><button class="btn btn-danger" data-reset>Borrar TODOS los datos</button></div>' : ''}</div>
      </div>`;
    const q = s => content.querySelector(s);
    q('[data-exp]').onclick = () => { VG.backup.exportJSON(); UI.toast('Respaldo descargado. Guárdalo en un lugar seguro (no en GitHub).'); };
    const imp = q('[data-imp]'); if (imp) imp.onchange = async e => { const f = e.target.files[0]; if (!f) return; if (!(await UI.confirm({ title: 'Restaurar respaldo', message: `Se reemplazarán <b>todos</b> los datos actuales por los del archivo <b>${U.esc(f.name)}</b>. Te recomendamos exportar un respaldo antes.`, confirmText: 'Restaurar', danger: true }))) return; const n = await UI.run(() => VG.backup.importJSON(f)); if (n !== undefined) { UI.toast(`Respaldo restaurado: ${U.int(n)} registros.`); setTimeout(() => location.reload(), 800); } };
    q('[data-csv]').onclick = () => { const n = VG.backup.exportCSV(q('[data-ent]').value); UI.toast(`${n} registros exportados.`); };
    const ic = q('[data-icsv]'); if (ic) ic.onchange = async e => { const f = e.target.files[0]; if (!f) return; const ent = q('[data-ent]').value; if (!(await UI.confirm({ title: 'Importar CSV', message: `Se agregarán o actualizarán registros de <b>${U.esc(VG.schema.get(ent).label)}</b> desde ${U.esc(f.name)}.`, confirmText: 'Importar' }))) return; const n = await UI.run(() => VG.backup.importCSV(ent, f)); if (n !== undefined) { UI.toast(`${n} registros importados.`); ctx.refresh(); } };
    const dd = q('[data-deldemo]'); if (dd) dd.onclick = async () => { if (!(await UI.confirm({ title: 'Borrar datos demo', message: 'Se eliminarán todos los registros marcados como "demo", incluidos los usuarios de ejemplo. Tu usuario actual se conservará si no es de ejemplo. Exporta un respaldo si quieres conservar algo.', confirmText: 'Borrar datos demo', danger: true }))) return; const me = VG.auth.current(); const n = await UI.run(() => db().clearDemo()); UI.toast(`${U.int(n)} registros de ejemplo eliminados.`); if (me && me._demo) { VG.auth.logout(); location.reload(); } else ctx.refresh(); };
    const sd = q('[data-seed]'); if (sd) sd.onclick = async () => { sd.disabled = true; sd.textContent = 'Cargando…'; await UI.run(() => VG.app.loadSeed(), 'Datos de ejemplo cargados (usuarios demo con PIN 1234).'); VG.app.refreshLayout(); ctx.refresh(); };
    const rs = q('[data-reset]'); if (rs) rs.onclick = async () => { if (!(await UI.confirm({ title: '¿Borrar todos los datos?', message: 'Se eliminará <b>toda</b> la información de este navegador, incluidos usuarios y configuración. Esta acción no se puede deshacer.', confirmText: 'Sí, borrar todo', danger: true }))) return; if (!(await UI.confirm({ title: 'Confirmación final', message: 'La app quedará vacía, como recién instalada. ¿Continuar?', confirmText: 'Borrar definitivamente', danger: true }))) return; await db().clearAll(false); sessionStorage.clear(); location.reload(); };
  }

  VG.registry.implement('configuracion', { async onMount(ctx) { (ctx.sub === 'datos' ? datos : general)(ctx); } });
})(window.VG);
