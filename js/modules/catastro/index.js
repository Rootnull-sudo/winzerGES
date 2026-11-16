/**
 * modules/catastro/index.js — Módulo 1. Catastro vitícola.
 * Registra los hooks del módulo en el registro central.
 *
 * Eventos que publica: catastro.cuartelCreado { cuartel }
 * Nota de extensión: para agregar un campo nuevo al cuartel, añádelo en schema.js
 * y sube la versión de la entidad `cuartel` en js/data/schema.js con su migración.
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui, M = VG.mod.catastro;

  VG.registry.implement('catastro', {
    async onMount(ctx) {
      M.ctl = UI.crud(ctx.el, {
        entity: 'cuartel', moduleId: 'catastro', query: ctx.query,
        title: 'Catastro vitícola',
        desc: 'Cuarteles de la viña con su variedad, superficie y plantación. Los cuarteles quedan disponibles en todos los módulos (cosecha, insumos, calendario, costos).',
        crumbs: [['Operación']],
        newLabel: 'Nuevo cuartel', emptyIcon: '🗺️', emptyTitle: 'Aún no tienes cuarteles', emptyText: 'Registra tu primer cuartel para empezar a planificar la temporada.',
        fields: M.fields, columns: M.columns, defaultSort: 'codigo', defaultDir: 'asc',
        filters: [{ key: 'tipo', label: 'Tipo', options: [['blanco', 'Blanco'], ['tinto', 'Tinto']] }, { key: 'valle', label: 'Valle', options: () => Array.from(new Set(VG.db.list('cuartel').map(c => c.valle).filter(Boolean))) }],
        defaults: () => ({ tipo: 'tinto', valle: 'Colchagua', conduccion: 'Espaldera VSP' }),
        liveCalc: v => `<h4>Cálculo en vivo</h4><dl>
          <dt>Plantas (sup. × densidad)</dt><dd>${U.int(U.n(v.superficie) * U.n(v.densidad))}</dd>
          <dt>Edad del cuartel</dt><dd>${v.anioPlantacion ? new Date().getFullYear() - v.anioPlantacion + ' años' : '—'}</dd>
          <dt>Kg esperados (8.000 kg/ha)</dt><dd>${U.int(U.n(v.superficie) * 8000)}</dd>
          <dt>Cajones (19 kg)</dt><dd>${U.int(U.n(v.superficie) * 8000 / 19)}</dd></dl>`,
        beforeSave: d => { if (!U.n(d.plantas) && U.n(d.densidad)) d.plantas = Math.round(U.n(d.superficie) * U.n(d.densidad)); return d; },
        afterSave: (c, isNew) => { if (isNew) VG.events.emit('catastro.cuartelCreado', { cuartel: c }); },
        canDelete: c => VG.db.find('cosecha', x => x.cuartelId === c.id) ? 'No se puede eliminar: el cuartel tiene cosechas registradas. Puedes marcarlo en observaciones como inactivo.' : true,
        view: c => M.ficha(c),
        renderTop: (top, rows) => {
          const sup = U.sum(rows, c => c.superficie), bl = rows.filter(c => c.tipo === 'blanco'), ti = rows.filter(c => c.tipo === 'tinto');
          top.innerHTML = `<div class="grid grid-4">
            ${UI.kpi({ label: 'Cuarteles', value: rows.length, icon: 'map', micro: `${bl.length} blancos · ${ti.length} tintos` })}
            ${UI.kpi({ label: 'Superficie total', value: U.dec1(sup) + ' ha', icon: 'sprout', micro: `${U.dec1(U.sum(bl, c => c.superficie))} ha blancas · ${U.dec1(U.sum(ti, c => c.superficie))} ha tintas` })}
            ${UI.kpi({ label: 'Plantas', value: U.int(U.sum(rows, c => c.plantas)), icon: 'grape', micro: 'Total de plantas en producción' })}
            ${UI.kpi({ label: `Kg temporada ${VG.store.state.season}`, value: U.int(U.sum(rows, M.kgTemporada)), icon: 'chart', micro: sup ? U.int(U.sum(rows, M.kgTemporada) / sup) + ' kg/ha promedio' : '' })}
          </div>`;
        }
      });
    }
  });
})(window.VG);
