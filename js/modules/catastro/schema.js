/**
 * modules/catastro/schema.js — Campos del formulario y columnas de la tabla de cuarteles.
 * Módulo de referencia: muestra cómo separar esquema (schema.js), vista (view.js)
 * y registro de hooks (index.js). Ver docs/modules.md.
 */
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui;
  const VARIEDADES = ['Sauvignon Blanc', 'Chardonnay', 'Viognier', 'Riesling', 'Moscatel de Alejandría', 'Gewürztraminer', 'Sémillon', 'Cabernet Sauvignon', 'Carménère', 'Merlot', 'Syrah', 'Pinot Noir', 'Malbec', 'Cabernet Franc', 'País', 'Cinsault', 'Carignan', 'Petit Verdot'];
  const VALLES = ['Maipo', 'Colchagua', 'Cachapoal', 'Curicó', 'Casablanca', 'Leyda', 'San Antonio', 'Maule', 'Itata', 'Bío Bío', 'Aconcagua', 'Limarí', 'Elqui', 'Malleco'];
  const BLANCAS = ['Sauvignon Blanc', 'Chardonnay', 'Viognier', 'Riesling', 'Moscatel de Alejandría', 'Gewürztraminer', 'Sémillon'];

  const fields = [
    { key: 'codigo', label: 'Código del cuartel', required: true, section: 'Identificación', placeholder: 'C-04', validate: (v, all) => VG.db.find('cuartel', c => c.codigo.toLowerCase() === String(v).toLowerCase() && c.id !== all.id) ? 'Ya existe un cuartel con ese código.' : '' },
    { key: 'variedad', label: 'Variedad', required: true, section: 'Identificación', list: VARIEDADES, onChangeSet: v => ({ tipo: BLANCAS.includes(v.variedad) ? 'blanco' : (v.tipo || 'tinto') }) },
    { key: 'tipo', label: 'Tipo de uva', type: 'select', required: true, section: 'Identificación', options: [['blanco', 'Blanca'], ['tinto', 'Tinta']] },
    { key: 'valle', label: 'Valle', type: 'select', options: VALLES, section: 'Identificación' },
    { key: 'sector', label: 'Sector / ubicación', section: 'Identificación' },
    { key: 'superficie', label: 'Superficie', type: 'number', unit: 'ha', min: 0.01, max: 500, step: 0.01, required: true, section: 'Plantación' },
    { key: 'anioPlantacion', label: 'Año de plantación', type: 'number', min: 1850, max: new Date().getFullYear(), step: 1, section: 'Plantación' },
    { key: 'patron', label: 'Patrón / portainjerto', section: 'Plantación', list: ['Franco', '1103 Paulsen', '110 Richter', 'SO4', '101-14', 'Harmony'] },
    { key: 'conduccion', label: 'Sistema de conducción', type: 'select', options: ['Espaldera VSP', 'Espaldera alta', 'Parrón', 'Cabeza (gobelet)', 'Lira', 'Cordón libre'], section: 'Plantación' },
    { key: 'densidad', label: 'Densidad', type: 'number', unit: 'pl/ha', min: 0, step: 1, section: 'Plantación', help: 'Plantas por hectárea. Si la ingresas, se calcula el total de plantas.' },
    { key: 'plantas', label: 'Número total de plantas', type: 'number', min: 0, step: 1, section: 'Plantación' },
    { key: 'cajonesEstimados', label: 'Cajones estimados por temporada', type: 'number', min: 0, step: 1, section: 'Plantación' },
    { key: 'estadoSanitario', label: 'Estado sanitario', section: 'Estado y costos', list: ['Bueno', 'Regular', 'Malo', 'En recuperación'] },
    { key: 'costoPlantacion', label: 'Costo de plantación', type: 'money', min: 0, section: 'Estado y costos' },
    { key: 'observaciones', label: 'Observaciones', type: 'textarea', section: 'Estado y costos' }
  ];

  function kgTemporada(c) { return U.sum(VG.db.list('cosecha', x => x.cuartelId === c.id && Number(x.temporada) === VG.store.state.season), x => x.kg); }

  const columns = [
    { key: 'codigo', label: 'Código', sticky: true, render: c => `<b>${U.esc(c.codigo)}</b>${UI.demoBadge(c)}` },
    { key: 'variedad', label: 'Variedad' },
    { key: 'tipo', label: 'Tipo', render: c => UI.tipoBadge(c.tipo) },
    { key: 'valle', label: 'Valle' },
    { key: 'superficie', label: 'Sup. (ha)', num: true, render: c => U.dec2(c.superficie) },
    { key: 'plantas', label: 'Plantas', num: true, render: c => U.int(c.plantas) },
    { key: 'densidad', label: 'Densidad', num: true, render: c => U.int(c.densidad) },
    { key: 'anioPlantacion', label: 'Plantación', num: true },
    { key: 'conduccion', label: 'Conducción' },
    { key: 'estadoSanitario', label: 'Estado sanitario' },
    { key: 'kg', label: 'Kg temporada', num: true, value: kgTemporada, render: c => U.int(kgTemporada(c)) },
    { key: 'kgha', label: 'Kg/ha', num: true, value: c => U.n(c.superficie) ? kgTemporada(c) / c.superficie : 0, render: c => U.int(U.n(c.superficie) ? kgTemporada(c) / c.superficie : 0) }
  ];

  VG.mod = VG.mod || {};
  VG.mod.catastro = { fields, columns, VARIEDADES, VALLES, BLANCAS, kgTemporada };
})(window.VG);
