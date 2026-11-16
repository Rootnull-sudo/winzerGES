/**
 * core/store.js — Estado global de la app y configuración.
 *
 * - `VG.store.state`: usuario activo, temporada seleccionada, tema, etc.
 * - `VG.store.subscribe(fn)`: notifica cambios de estado (ej. cambio de temporada).
 * - `VG.store.config()`: configuración de empresa, tributaria y umbrales (persistida en la entidad `config`).
 *
 * Los módulos leen datos compartidos vía `VG.db` y el estado vía `VG.store`;
 * nunca importan internals de otros módulos.
 */
(function (VG) {
  'use strict';
  const U = VG.utils;
  const subs = new Set();

  /** Valores por defecto de configuración. Todos editables en Configuración. */
  const DEFAULT_CONFIG = {
    id: 'main',
    empresa: {
      nombreFantasia: 'Mi viña', razonSocial: 'Viña Demo Boutique SpA', rut: '76.123.456-0',
      giro: 'Elaboración de vinos', acteco: '110200', direccion: 'Camino Los Robles km 4', comuna: 'Santa Cruz',
      ciudad: 'Santa Cruz', email: 'contacto@vinademo.cl', telefono: '+56 9 1234 5678', inscripcionSAG: 'SAG-VI-0000',
      resolucionSII: { numero: 0, fecha: '2026-01-01' }, ambienteDTE: 'certificacion', certificadoVence: ''
    },
    tributario: {
      regimen: '14D3',            // 14D3 Pro Pyme General | 14D8 Pro Pyme Transparente | 14A Semi integrado
      tasaIVA: 0.19,
      tasaIDPC: 0.25,             // 25% Pro Pyme, 27% régimen general (14A)
      tasaPPM: 0.0025,            // 0,25% Pro Pyme General (referencial); 14D8: 0,2%; 14A: según año anterior
      ilaActivo: true,            // Impuesto adicional bebidas alcohólicas (DL 825 art. 42)
      tasaILA: 0.205,             // 20,5% vinos
      diaF29: 20,                 // 20 si emite facturas electrónicas; 12 en papel
      mesRenta: 4, diaRenta: 30,
      retencionHonorarios: 0.1525, // tasa 2026 de retención de boletas de honorarios (verificar cada año)
      remanenteInicial: 0         // remanente de crédito fiscal al iniciar el uso del sistema
    },
    remuneraciones: {
      utm: 69500,                 // actualizar mensualmente (valor referencial)
      uf: 39800,                  // valor UF referencial (tope imponible)
      imm: 539000,                // ingreso mínimo mensual referencial
      afp: 0.1127,                // 10% + comisión AFP referencial
      salud: 0.07,
      cesantiaTrabajador: 0.006,  // contrato indefinido
      cesantiaEmpleador: 0.024,
      sis: 0.0154,
      aporteEmpleadorPension: 0.01 // aporte adicional del empleador (reforma previsional), configurable
    },
    enologia: {
      so2Blanco: { min: 25, max: 35, alerta: 40 },
      so2Tinto: { min: 20, max: 30, alerta: 35 },
      intervaloMinHoras: 24,      // intervalo mínimo entre adiciones de metabisulfito
      desviacionDias: 3,
      kgCajonMin: 18, kgCajonMax: 20,
      tempBaseGD: 10              // temperatura base para grados día (Winkler)
    },
    finanzas: {
      margenMinimo: 0.25,         // alerta si margen bruto < 25%
      saldoInicialCaja: 15000000,
      patrimonio: 120000000,
      capitalInvertido: 150000000
    },
    alertas: { stockMinimoDiasVencimiento: 30, foliosPct: 0.8, inactividadMin: 15 }
  };

  function deepMerge(a, b) {
    const out = Array.isArray(a) ? a.slice() : Object.assign({}, a);
    Object.keys(b || {}).forEach(k => {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a && typeof a[k] === 'object') out[k] = deepMerge(a[k], b[k]);
      else out[k] = b[k];
    });
    return out;
  }

  const state = {
    user: null,
    season: Number(VG.db ? 0 : 0) || new Date().getFullYear(),
    theme: 'light',
    route: '',
    sidebarCollapsed: false
  };

  VG.store = {
    state,
    DEFAULT_CONFIG,
    /** Suscribe a cambios de estado. fn(state, changedKeys) */
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    set(patch) {
      Object.assign(state, patch);
      subs.forEach(fn => { try { fn(state, Object.keys(patch)); } catch (e) { console.error(e); } });
      if ('season' in patch) VG.db.setMeta('season', patch.season);
      if ('season' in patch) VG.events.emit('season.changed', { season: patch.season });
    },
    /** Configuración efectiva (defaults + guardada). */
    config() {
      return U.memo('config', () => deepMerge(DEFAULT_CONFIG, VG.db.get('config', 'main') || {}));
    },
    async saveConfig(patch) {
      const cur = VG.db.get('config', 'main') || { id: 'main' };
      // Si el usuario edita los datos de la empresa, dejan de ser los de ejemplo
      if (patch.empresa && VG.db.getMeta('configDemo')) { await VG.db.setMeta('configDemo', false); await VG.db.setMeta('empresaPrevia', null); }
      return VG.db.save('config', Object.assign(deepMerge(cur, patch), { _demo: false }));
    },
    /** Temporadas disponibles: años con datos + actual. */
    seasons() {
      const ys = new Set([new Date().getFullYear(), state.season]);
      ['cosecha', 'lote', 'venta', 'gasto'].forEach(e => VG.db.list(e).forEach(r => { const y = r.temporada || U.year(r.fecha); if (y) ys.add(Number(y)); }));
      return Array.from(ys).sort((a, b) => b - a);
    },
    /** ¿Pertenece el registro a la temporada seleccionada? (por campo temporada o año de fecha) */
    inSeason(r, field = 'fecha') {
      const s = state.season;
      if (r.temporada) return Number(r.temporada) === s;
      const y = U.year(r[field]);
      return y === null ? true : y === s;
    }
  };
})(window.VG);
