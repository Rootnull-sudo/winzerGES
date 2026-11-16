/**
 * modules/cumplimiento/index.js — Módulo 20. Cumplimiento normativo chileno.
 * Panel regulatorio con estado y alertas: inscripción de productos SAG, inicio de
 * actividades, patente de alcoholes (Ley 19.925), marca INAPI, certificado D.O.,
 * certificaciones, libro de existencias exportable, declaraciones SAG y laboratorio autorizado.
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui;
  const db = () => VG.db;
  const TIPOS = ['SAG', 'SII', 'Patente', 'INAPI', 'D.O.', 'Certificación', 'Municipal', 'Otro'];
  const estadoDe = c => { if (c.estado === 'pendiente') return 'pendiente'; if (!c.vencimiento) return 'vigente'; const d = U.diffDays(U.today(), c.vencimiento); return d < 0 ? 'vencido' : d <= U.n(c.avisoDias || 30) ? 'por vencer' : 'vigente'; };

  /** Libro de existencias: litros por lote, variedad y añada (para la declaración SAG). */
  function libroExistencias() {
    const rows = [];
    db().list('estanque').forEach(e => VG.calc.inventory.lotesEnEstanque(e.id).forEach(x => { const l = db().get('lote', x.loteId) || {}; rows.push({ estanque: e.codigo, lote: l.codigo, variedad: l.variedad, tipo: l.tipo, anada: l.temporada, litros: Math.round(x.litros), estado: 'Granel' }); }));
    Object.entries(VG.calc.inventory.stockPorFormato()).forEach(([fid, s]) => s.ordenes.forEach(o => { const f = db().get('formato', fid) || {}; const l = db().get('lote', o.orden.loteId) || {}; rows.push({ estanque: 'Bodega PT', lote: l.codigo, variedad: l.variedad, tipo: l.tipo, anada: l.temporada, litros: Math.round(o.stock * U.n(f.litros)), estado: 'Envasado ' + f.nombre + ' (' + U.int(o.stock) + ' un)' }); }));
    return rows;
  }

  VG.registry.implement('cumplimiento', {
    libroExistencias,
    async onMount(ctx) {
      const content = UI.page(ctx.el, {
        title: 'Cumplimiento normativo', crumbs: [['Tributario']],
        desc: 'Panel de obligaciones regulatorias con sus vencimientos. Referencias: Ley 18.455 y Decreto 78 (SAG), Ley 19.925 (patentes de alcoholes), INAPI (marcas), SII.',
        actions: [{ label: 'Libro de existencias (CSV)', icon: 'download', perm: ['cumplimiento', 'x'], run: () => { const r = libroExistencias(); U.download('libro_existencias_' + U.today() + '.csv', U.toCSV(r, [{ key: 'estanque', label: 'Ubicación' }, { key: 'lote', label: 'Lote' }, { key: 'variedad', label: 'Variedad' }, { key: 'tipo', label: 'Tipo' }, { key: 'anada', label: 'Añada' }, { key: 'estado', label: 'Estado' }, { key: 'litros', label: 'Litros' }])); UI.toast('Libro de existencias exportado.'); } }]
      });
      const items = db().list('cumplimiento');
      const cnt = s => items.filter(c => estadoDe(c) === s).length;
      const hoy = U.today(), y = new Date().getFullYear();
      const lotesSinLab = db().list('lote', l => Number(l.temporada) === VG.store.state.season && !db().find('analisis', a => a.loteId === l.id && a.autorizadoSAG) && VG.calc.inventory.litrosEntradaLote(l.id) > 0);
      const sinInscripcion = !items.some(c => /inscripci[oó]n de productos/i.test(c.nombre));
      const top = U.html(`<div class="stack">
        <div class="grid grid-4">${UI.kpi({ label: 'Vigentes', value: cnt('vigente'), icon: 'ok', tone: 'success' })}${UI.kpi({ label: 'Por vencer', value: cnt('por vencer'), icon: 'warn', tone: 'warning' })}${UI.kpi({ label: 'Vencidos', value: cnt('vencido'), icon: 'err', tone: cnt('vencido') ? 'error' : '' })}${UI.kpi({ label: 'Pendientes', value: cnt('pendiente'), icon: 'calendar', tone: cnt('pendiente') ? 'info' : '' })}</div>
        <div class="grid grid-2"><div class="card"><div class="card-head"><h3>Declaraciones SAG</h3></div>
          ${UI.alert(hoy >= y + '-06-01' && hoy <= y + '-07-15' ? 'warning' : 'info', 'Declaración de cosecha', `Del 1 al 30 de junio (correcciones hasta el 15 de julio). Kg de la temporada ${VG.store.state.season}: <b>${U.int(U.sum(db().list('cosecha', c => Number(c.temporada) === VG.store.state.season), c => c.kg))}</b>.`)}
          ${UI.alert(hoy.slice(5) <= '01-19' ? 'warning' : 'info', 'Declaración de existencias', `Del 1 al 19 de enero. Existencias actuales: <b>${U.lt(U.sum(libroExistencias(), r => r.litros))}</b> (granel + envasado).`)}
        </div><div class="card"><div class="card-head"><h3>Verificaciones automáticas</h3></div>
          ${lotesSinLab.length ? UI.alert('warning', 'Lotes sin análisis de laboratorio autorizado SAG', lotesSinLab.map(l => U.esc(l.codigo)).join(', '), { href: '#/laboratorio', label: 'Laboratorio' }) : UI.alert('success', 'Todos los lotes de la temporada tienen análisis autorizado', '')}
          ${db().list('ordenEnvasado', o => o.declaraDO && (U.n(o.pctUvaZona) < 75 || !o.certificadoDO)).length ? UI.alert('error', 'Etiquetas con D.O. sin respaldo', 'Revisa las órdenes de envasado marcadas.', { href: '#/envasado', label: 'Envasado' }) : UI.alert('success', 'Denominaciones de origen respaldadas', '≥ 75% de uva de la zona y certificado de entidad autorizada.')}
          ${sinInscripcion ? UI.alert('warning', 'Registra la inscripción de productos en el SAG', 'Todo vino debe inscribirse antes de comercializarse.') : ''}
          ${VG.alerts.compute().filter(a => a.module === 'cumplimiento' && /Patente/.test(a.title)).map(a => UI.alert(a.level, a.title, a.body)).join('')}
        </div></div></div>`);
      content.appendChild(top);
      const el = U.html('<div style="margin-top:20px"></div>'); content.appendChild(el);
      UI.crud(el, {
        embed: true, entity: 'cumplimiento', moduleId: 'cumplimiento', title: 'Obligaciones y registros', newLabel: 'Nueva obligación',
        fields: [{ key: 'nombre', label: 'Obligación / registro', required: true }, { key: 'tipo', label: 'Tipo', type: 'select', options: TIPOS, required: true }, { key: 'numero', label: 'N° / resolución' }, { key: 'estado', label: 'Estado', type: 'select', options: [['vigente', 'Vigente / cumplida'], ['pendiente', 'Pendiente de trámite']] }, { key: 'fecha', label: 'Fecha de obtención', type: 'date' }, { key: 'vencimiento', label: 'Vencimiento', type: 'date' }, { key: 'avisoDias', label: 'Avisar con anticipación', type: 'number', unit: 'días', min: 0, step: 1 }, { key: 'responsable', label: 'Responsable' }, { key: 'notas', label: 'Notas', type: 'textarea' }],
        defaults: () => ({ tipo: 'SAG', estado: 'vigente', avisoDias: 30 }),
        columns: [{ key: 'nombre', label: 'Obligación', render: c => `<b>${U.esc(c.nombre)}</b>${UI.demoBadge(c)}` }, { key: 'tipo', label: 'Tipo', render: c => UI.badge(c.tipo, 'primary') }, { key: 'numero', label: 'N°' }, { key: 'fecha', label: 'Obtención', render: c => U.fmtDate(c.fecha) }, { key: 'vencimiento', label: 'Vencimiento', render: c => c.vencimiento ? U.fmtDate(c.vencimiento) + ` <span class="muted text-xs">(${U.diffDays(hoy, c.vencimiento)} d)</span>` : '<span class="muted">No vence</span>' }, { key: 'est', label: 'Estado', value: estadoDe, render: c => UI.estadoBadge(estadoDe(c)) }],
        filters: [{ key: 'tipo', label: 'Tipo', options: TIPOS }],
        defaultSort: 'vencimiento', defaultDir: 'asc'
      });
    }
  });
})(window.VG);
