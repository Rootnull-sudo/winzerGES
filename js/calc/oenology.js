/**
 * calc/oenology.js — Cálculos enológicos.
 * Todas las fórmulas son referenciales; el enólogo debe validar con análisis de laboratorio.
 */
(function (VG) {
  'use strict';
  const U = VG.utils;

  /** Fracción de SO₂ que aporta cada producto (por defecto). */
  const SO2_FRACCION = {
    'K2S2O5': 0.57,   // metabisulfito de potasio ≈ 57% SO₂
    'Na2S2O5': 0.67   // metabisulfito de sodio ≈ 67% SO₂
  };

  const Oe = {
    SO2_FRACCION,

    /** Fracción de SO₂ de un insumo (campo so2Pct en %) o del tipo químico. */
    fraccionSO2(insumo) {
      if (!insumo) return SO2_FRACCION.K2S2O5;
      if (U.n(insumo.so2Pct) > 0) return U.n(insumo.so2Pct) / 100;
      return SO2_FRACCION[insumo.quimico] || SO2_FRACCION.K2S2O5;
    },

    /**
     * Dosis de SO₂ aportada (mg/L).
     *   dosis[mg/L] = gramos × 1000 [mg/g] × fracciónSO₂ / volumen[L]
     * Ej.: 50 g de K₂S₂O₅ (57%) en 1.000 L → 50×1000×0,57/1000 = 28,5 mg/L
     */
    dosisMgL(gramos, litros, fraccion) {
      if (!U.n(litros)) return 0;
      return U.n(gramos) * 1000 * U.n(fraccion) / U.n(litros);
    },

    /**
     * Gramos de producto para alcanzar un aporte objetivo de SO₂.
     *   gramos = objetivo[mg/L] × volumen[L] / (1000 × fracciónSO₂)
     */
    gramosParaDosis(mgL, litros, fraccion) {
      if (!U.n(fraccion)) return 0;
      return U.n(mgL) * U.n(litros) / (1000 * U.n(fraccion));
    },

    /**
     * SO₂ libre teórico esperado tras la adición = SO₂ libre previo + dosis aportada.
     * En la práctica parte del SO₂ se combina (acetaldehído, azúcares), por eso
     * se compara con el medido: diferencia = medido − teórico.
     * eficiencia = (medido − previo) / dosis  → fracción que quedó libre.
     */
    so2Teorico(previo, dosis) { return U.n(previo) + U.n(dosis); },
    eficienciaSO2(previo, medido, dosis) { return U.n(dosis) ? (U.n(medido) - U.n(previo)) / U.n(dosis) : null; },

    /** Rango "modo suave" según tipo de vino (configurable). */
    rangoSO2(tipo) {
      const c = VG.store.config().enologia;
      return tipo === 'blanco' ? c.so2Blanco : c.so2Tinto;
    },

    /**
     * Estado del SO₂ libre: 'bajo' | 'ok' | 'alto' | 'critico'
     *   critico = sobre umbral de alerta (blanco >40, tinto >35 mg/L por defecto)
     */
    estadoSO2(valor, tipo) {
      const r = Oe.rangoSO2(tipo), v = U.n(valor);
      if (v > r.alerta) return 'critico';
      if (v > r.max) return 'alto';
      if (v < r.min) return 'bajo';
      return 'ok';
    },

    /** °Brix desde densidad (g/L): Brix ≈ 261,3 × (1 − 1/SG), SG = densidad/1000. */
    brixDesdeDensidad(d) {
      const sg = U.n(d) / 1000;
      if (sg <= 0) return 0;
      return Math.max(0, 261.3 * (1 - 1 / sg));
    },
    /** Azúcar aproximada (g/L) ≈ °Brix × 10. */
    azucarDesdeBrix(brix) { return U.n(brix) * 10; },
    /** Alcohol probable (% vol) ≈ azúcar[g/L] / 16,83 (rendimiento ~16,83 g/L por grado). */
    alcoholProbable(brix) { return Oe.azucarDesdeBrix(brix) / 16.83; },

    /**
     * Velocidad media de fermentación (g/L/día de azúcar consumida)
     *   v = (azúcar inicial − azúcar actual) / días transcurridos
     */
    velocidadFA(brixInicial, brixActual, dias) {
      if (!U.n(dias)) return 0;
      return (Oe.azucarDesdeBrix(brixInicial) - Oe.azucarDesdeBrix(brixActual)) / U.n(dias);
    },

    /**
     * Resumen de tiempos de una ficha de fermentación.
     *  latencia  = inicio tumultuosa − inicio FA (días)
     *  díasFA    = fin FA − inicio FA (o hasta hoy si sigue en curso)
     *  desvío    = días reales − días planificados (alerta si > umbral, 3 por defecto)
     */
    tiempos(f, segs = []) {
      const hoy = U.today();
      const fin = f.finFA || null;
      const diasFA = f.inicioFA ? U.diffDays(f.inicioFA, fin || hoy) : null;
      const latencia = f.inicioFA && f.inicioTumultuosa ? U.diffDays(f.inicioFA, f.inicioTumultuosa) : null;
      const sorted = segs.slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
      const last = sorted.filter(x => (x.brix !== '' && x.brix !== undefined && x.brix !== null) || U.n(x.densidad)).pop();
      const brixAct = last && U.n(last.brix) ? U.n(last.brix) : (last && U.n(last.densidad) ? Oe.brixDesdeDensidad(last.densidad) : null);
      const vel = brixAct !== null && diasFA ? Oe.velocidadFA(f.brixInicial, brixAct, Math.max(1, U.diffDays(f.inicioFA, last.fecha))) : null;
      const plan = U.n(f.diasPlanificados) || null;
      const desvio = plan && diasFA !== null ? diasFA - plan : null;
      const fml = f.inicioFML ? U.diffDays(f.inicioFML, f.finFML || hoy) : null;
      return { diasFA, latencia, velocidad: vel, brixActual: brixAct, desvio, enCurso: !!f.inicioFA && !fin, diasFML: fml, alertaDesvio: desvio !== null && Math.abs(desvio) > VG.store.config().enologia.desviacionDias };
    },

    /**
     * Grados día (índice de Winkler) acumulados:
     *   GD = Σ max(0, (Tmáx + Tmín)/2 − Tbase), Tbase = 10 °C por defecto.
     */
    gradosDia(registros, base) {
      const b = base ?? VG.store.config().enologia.tempBaseGD;
      return U.sum(registros, r => Math.max(0, (U.n(r.tmax) + U.n(r.tmin)) / 2 - b));
    },

    /** Kg por cajón dentro del rango aceptado (18–20 kg por defecto). */
    cajonValido(kg, cajones) {
      const c = VG.store.config().enologia;
      if (!U.n(cajones)) return true;
      const x = U.n(kg) / U.n(cajones);
      return x >= c.kgCajonMin && x <= c.kgCajonMax;
    }
  };

  VG.calc = VG.calc || {};
  VG.calc.oenology = Oe;
})(window.VG);
