/**
 * calc/inventory.js — Balances de bodega, stock de producto terminado e insumos.
 *
 * Los stocks NO se guardan como contadores: se derivan de movimientos.
 * Así el balance de masa siempre cuadra y es auditable:
 *   - movBodega: { estanqueId, loteId, litros (± con signo), tipo }
 *       tipos: entrada, trasiego_salida, trasiego_entrada, merma, envasado, venta_granel, vinagre, ajuste
 *   - movInsumo: { insumoId, cantidad (±), tipo, ref }
 *   - Producto terminado = unidades de órdenes de envasado − unidades vendidas.
 */
(function (VG) {
  'use strict';
  const U = VG.utils;
  const db = () => VG.db;

  const Inv = {
    /** Litros actuales en un estanque. */
    litrosEstanque(estanqueId) {
      return U.memo('lt_est_' + estanqueId, () => U.sum(db().list('movBodega', m => m.estanqueId === estanqueId), m => m.litros));
    },
    /** Litros por lote dentro de un estanque. */
    lotesEnEstanque(estanqueId) {
      const by = U.groupBy(db().list('movBodega', m => m.estanqueId === estanqueId), m => m.loteId || '—');
      return Object.entries(by).map(([loteId, ms]) => ({ loteId, litros: U.sum(ms, m => m.litros) })).filter(x => x.litros > 0.5);
    },
    /** Lote principal (con más litros) de un estanque. */
    loteDeEstanque(estanqueId) {
      const l = Inv.lotesEnEstanque(estanqueId).sort((a, b) => b.litros - a.litros)[0];
      return l ? db().get('lote', l.loteId) : null;
    },
    /** Litros disponibles de un lote en todos los estanques. */
    litrosLote(loteId) { return U.sum(db().list('movBodega', m => m.loteId === loteId), m => m.litros); },
    /** Litros que ingresaron al lote (entradas). */
    litrosEntradaLote(loteId) { return U.sum(db().list('movBodega', m => m.loteId === loteId && m.tipo === 'entrada'), m => m.litros); },

    /** Estado de un estanque (ocupado / vacío / mantención / reservado). */
    estadoEstanque(e) {
      if (e.estado === 'mantencion' || e.estado === 'reservado') return e.estado;
      return Inv.litrosEstanque(e.id) > 0.5 ? 'ocupado' : 'vacio';
    },
    /** Ocupación global y por tipo. */
    ocupacion() {
      const ests = db().list('estanque');
      const cap = U.sum(ests, e => e.capacidad);
      const uso = U.sum(ests, e => Math.max(0, Inv.litrosEstanque(e.id)));
      const porTipo = {};
      ests.forEach(e => {
        const l = Inv.loteDeEstanque(e.id); const t = l ? l.tipo : 'vacío';
        porTipo[t] = (porTipo[t] || 0) + Math.max(0, Inv.litrosEstanque(e.id));
      });
      return { capacidad: cap, usado: uso, pct: cap ? uso / cap : 0, porTipo, ocupados: ests.filter(e => Inv.estadoEstanque(e) === 'ocupado').length, vacios: ests.filter(e => Inv.estadoEstanque(e) === 'vacio').length, total: ests.length };
    },

    /**
     * Valida que haya stock suficiente para una salida del estanque.
     * @throws Error en español si no alcanza
     */
    validarSalida(estanqueId, litros, loteId) {
      const disp = loteId ? U.sum(db().list('movBodega', m => m.estanqueId === estanqueId && m.loteId === loteId), m => m.litros) : Inv.litrosEstanque(estanqueId);
      if (U.n(litros) > disp + 0.01) {
        const e = db().get('estanque', estanqueId);
        throw new Error(`No hay suficiente vino en ${e ? e.codigo : 'el estanque'}: disponibles ${U.int(disp)} L, solicitados ${U.int(litros)} L.`);
      }
      return disp;
    },
    validarEntrada(estanqueId, litros) {
      const e = db().get('estanque', estanqueId);
      if (!e) throw new Error('Selecciona un estanque válido.');
      if (e.estado === 'mantencion') throw new Error(`El estanque ${e.codigo} está en mantención.`);
      const libre = U.n(e.capacidad) - Inv.litrosEstanque(estanqueId);
      if (U.n(litros) > libre + 0.01) throw new Error(`Sobrecapacidad: ${e.codigo} tiene ${U.int(libre)} L libres y se intentan ingresar ${U.int(litros)} L.`);
      return libre;
    },

    /* ---------- Producto terminado ---------- */
    /** Unidades disponibles de una orden de envasado. */
    stockOrden(ordenId) {
      const o = db().get('ordenEnvasado', ordenId);
      if (!o || o.estado !== 'confirmada') return 0;
      const vendidas = U.sum(db().list('venta', v => v.ordenEnvasadoId === ordenId && v.estado !== 'anulada'), v => v.cantidad);
      return U.n(o.unidades) - vendidas;
    },
    /** Stock por formato (todas las órdenes). */
    stockPorFormato() {
      const out = {};
      db().list('ordenEnvasado', o => o.estado === 'confirmada').forEach(o => {
        const k = o.formatoId; out[k] = out[k] || { unidades: 0, valor: 0, ordenes: [] };
        const s = Inv.stockOrden(o.id);
        out[k].unidades += s; out[k].valor += s * U.n(o.costoUnitario); if (s > 0) out[k].ordenes.push({ orden: o, stock: s });
      });
      return out;
    },
    /** Stock a granel total (litros en estanques). */
    stockGranel() { return U.sum(db().list('estanque'), e => Math.max(0, Inv.litrosEstanque(e.id))); },

    /* ---------- Insumos ---------- */
    stockInsumo(insumoId) {
      const ins = db().get('insumo', insumoId);
      return U.n(ins && ins.stockInicial) + U.sum(db().list('movInsumo', m => m.insumoId === insumoId), m => m.cantidad);
    },
    valorInventarioInsumos() { return U.sum(db().list('insumo'), i => Math.max(0, Inv.stockInsumo(i.id)) * U.n(i.precio)); },
    valorProductoTerminado() { return U.sum(Object.values(Inv.stockPorFormato()), x => x.valor); },
    valorGranel() {
      return U.sum(db().list('estanque'), e => Inv.lotesEnEstanque(e.id).reduce((a, x) => a + x.litros * VG.calc.financial.costoLitroLote(x.loteId).costoLitro, 0));
    },

    /**
     * Balance de masa de un lote: entradas = stock + envasado + ventas granel + mermas + vinagre.
     * Devuelve diferencia (debe ser ≈ 0).
     */
    balanceLote(loteId) {
      const ms = db().list('movBodega', m => m.loteId === loteId);
      const by = t => -U.sum(ms.filter(m => m.tipo === t), m => m.litros);
      const entradas = U.sum(ms.filter(m => m.tipo === 'entrada'), m => m.litros);
      const r = { entradas, envasado: by('envasado'), ventaGranel: by('venta_granel'), merma: by('merma'), vinagre: by('vinagre'), stock: Inv.litrosLote(loteId) };
      r.trasiegoNeto = U.sum(ms.filter(m => m.tipo.startsWith('trasiego')), m => m.litros);
      r.diferencia = entradas - (r.stock + r.envasado + r.ventaGranel + r.merma + r.vinagre) + r.trasiegoNeto + U.sum(ms.filter(m => m.tipo === 'ajuste'), m => m.litros);
      return r;
    }
  };

  VG.calc = VG.calc || {};
  VG.calc.inventory = Inv;
})(window.VG);
