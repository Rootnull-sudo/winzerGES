/**
 * integrations/recon.js — Conciliación bancaria.
 *
 * Fórmula de conciliación:
 *   Saldo según extracto
 *   − Cheques/pagos girados no cobrados (en libros, no en banco)
 *   + Depósitos en tránsito (en libros, no en banco)
 *   ± Diferencias registradas (comisiones, intereses, errores)
 *   = Saldo según libros
 */
(function (VG) {
  'use strict';
  const U = VG.utils;
  const db = () => VG.db;

  const R = {
    /**
     * Importa una cartola CSV.
     * @param {string} text contenido CSV
     * @param {{fecha:number, glosa:number, cargo:number, abono:number, monto?:number, saltar:number}} map índices de columnas (0-based)
     */
    parseCartola(text, map) {
      const rows = U.parseCSV(text).slice(map.saltar ?? 1);
      return rows.map(r => {
        let monto;
        if (map.monto !== undefined && map.monto !== null && map.monto !== '') monto = U.n(r[map.monto]);
        else monto = U.n(r[map.abono]) - U.n(r[map.cargo]);
        return { fecha: R.normFecha(r[map.fecha]), glosa: (r[map.glosa] || '').trim(), monto };
      }).filter(r => r.fecha && r.monto);
    },
    /** Acepta dd/mm/yyyy, dd-mm-yyyy o yyyy-mm-dd. */
    normFecha(s) {
      s = String(s || '').trim();
      let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
      m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
      if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
      return '';
    },

    /** Documentos candidatos (en libros) para conciliar. Signo + = entra al banco. */
    candidatos() {
      const out = [];
      db().list('venta', v => v.estadoPago === 'pagado' && v.estado !== 'anulada').forEach(v => out.push({ ref: 'venta:' + v.id, tipo: 'Cobro venta', fecha: v.fechaPago || v.fecha, monto: U.n(v.total), desc: `${v.codigo} · ${(db().get('cliente', v.clienteId) || {}).nombre || ''}` }));
      db().list('compra', c => c.estadoPago === 'pagado').forEach(c => out.push({ ref: 'compra:' + c.id, tipo: 'Pago proveedor', fecha: c.fechaPago || c.fecha, monto: -U.n(c.total), desc: `${(db().get('proveedor', c.proveedorId) || {}).nombre || ''} ${c.folio ? 'F' + c.folio : ''}` }));
      db().list('remuneracion', r => r.estado === 'pagada').forEach(r => out.push({ ref: 'remuneracion:' + r.id, tipo: 'Remuneración', fecha: r.fechaPago || r.periodo + '-28', monto: -U.n(r.liquido), desc: `${(db().get('trabajador', r.trabajadorId) || {}).nombre || ''} ${r.periodo}` }));
      db().list('gasto', g => g.estado === 'pagado' && g.medioPago !== 'efectivo').forEach(g => out.push({ ref: 'gasto:' + g.id, tipo: 'Gasto', fecha: g.fecha, monto: -U.n(g.monto) * (g.afectoIVA ? 1 + VG.store.config().tributario.tasaIVA : 1), desc: g.descripcion }));
      db().list('pagoImpuesto', p => !p.incluidoEnF29).forEach(p => out.push({ ref: 'pagoImpuesto:' + p.id, tipo: 'Impuesto', fecha: p.fecha, monto: -U.n(p.monto), desc: `${p.tipo} ${p.periodo}` }));
      db().list('honorario', h => h.estado === 'pagada').forEach(h => out.push({ ref: 'honorario:' + h.id, tipo: 'Honorarios', fecha: h.fecha, monto: -U.n(h.liquido), desc: h.nombre }));
      const usados = new Set(db().list('movBanco', m => m.matchRef).map(m => m.matchRef));
      return out.filter(c => !usados.has(c.ref));
    },

    /**
     * Sugerencias de match para un movimiento bancario:
     * mismo monto (±1 peso) y fecha dentro de ±7 días. Puntaje mayor = más cercano.
     */
    sugerencias(mov, cands) {
      cands = cands || R.candidatos();
      return cands.filter(c => Math.abs(Math.round(c.monto) - Math.round(mov.monto)) <= 1)
        .map(c => ({ c, dias: Math.abs(U.diffDays(c.fecha, mov.fecha) ?? 99) }))
        .filter(x => x.dias <= 7)
        .sort((a, b) => a.dias - b.dias)
        .map(x => Object.assign({ score: 1 - x.dias / 8 }, x.c));
    },

    /** Conciliación automática: aplica el mejor match único a cada movimiento pendiente. */
    async autoConciliar(cuentaId) {
      const pend = db().list('movBanco', m => m.cuentaId === cuentaId && m.estado === 'pendiente');
      let cands = R.candidatos(), n = 0;
      for (const m of pend) {
        const s = R.sugerencias(m, cands);
        if (s.length && (s.length === 1 || s[0].score > s[1].score)) {
          await db().save('movBanco', Object.assign({}, m, { estado: 'conciliado', matchRef: s[0].ref, matchDesc: s[0].tipo + ' · ' + s[0].desc }), { silent: true });
          cands = cands.filter(c => c.ref !== s[0].ref); n++;
        }
      }
      VG.events.emit('conciliacion.actualizada', { cuentaId, n });
      return n;
    },

    /** Resumen de conciliación de una cuenta. */
    resumen(cuentaId) {
      const cta = db().get('cuentaBanco', cuentaId);
      const movs = db().list('movBanco', m => m.cuentaId === cuentaId);
      const saldoExtracto = U.n(cta.saldoInicial) + U.sum(movs, m => m.monto);
      const difs = movs.filter(m => m.estado === 'diferencia');
      const pend = movs.filter(m => m.estado === 'pendiente');
      // partidas en libros no presentes en el banco (desde la fecha de inicio de la cuenta)
      const enLibrosNoBanco = R.candidatos().filter(c => c.fecha >= (cta.fechaInicio || '1900-01-01') && (!c.cuentaId || c.cuentaId === cuentaId));
      const giradosNoCobrados = U.sum(enLibrosNoBanco.filter(c => c.monto < 0), c => c.monto);
      const depositosTransito = U.sum(enLibrosNoBanco.filter(c => c.monto > 0), c => c.monto);
      const ajustesDif = U.sum(difs, m => m.monto);
      const pendientes = U.sum(pend, m => m.monto);
      const saldoLibros = saldoExtracto + giradosNoCobrados + depositosTransito - ajustesDif - pendientes;
      return { cuenta: cta, saldoExtracto, giradosNoCobrados, depositosTransito, ajustesDif, pendientes, saldoLibros, conciliados: movs.filter(m => m.estado === 'conciliado').length, nPendientes: pend.length, nDif: difs.length, total: movs.length, enLibrosNoBanco };
    }
  };

  VG.integrations = VG.integrations || {};
  VG.integrations.recon = R;
})(window.VG);
