/**
 * calc/financial.js — Costos, estado de resultados, ratios, punto de equilibrio,
 * flujo de caja y simulador. Es el corazón de la toma de decisiones.
 *
 * Convenciones:
 *  - Montos en pesos chilenos NETOS (sin IVA ni ILA).
 *  - Período = { desde: 'YYYY-MM-DD', hasta: 'YYYY-MM-DD' }.
 *  - COGS (costo de ventas) = costo unitario congelado en cada venta × cantidad.
 *    El costo unitario se toma de la orden de envasado (envasado) o del costo/L del lote (granel).
 */
(function (VG) {
  'use strict';
  const U = VG.utils;
  const db = () => VG.db;
  const inP = (fecha, p) => !p || (fecha >= p.desde && fecha <= p.hasta);

  const F = {
    periodoAnio(y) { return { desde: y + '-01-01', hasta: y + '-12-31' }; },
    periodoMes(ym) { const [y, m] = ym.split('-').map(Number); return { desde: ym + '-01', hasta: ym + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0') }; },

    /* ====================== COSTO POR LOTE / LITRO ====================== */
    /**
     * Costo directo de un lote y costo por litro.
     *  uva propia = costo de cosecha de los registros destinados al lote
     *             + insumos agrícolas y labores de cada cuartel × (kg del cuartel al lote / kg totales del cuartel en la temporada)
     *  uva comprada = campo costoUvaComprada del lote
     *  enológico = aditivos del lote + adiciones de metabisulfito de sus fichas
     *  costo/L = total / litros ingresados al lote
     */
    costoLitroLote(loteId) {
      return U.memo('cl_' + loteId, () => {
        const lote = db().get('lote', loteId);
        if (!lote) return { total: 0, costoLitro: 0, litros: 0, partes: {} };
        const cos = db().list('cosecha', c => c.loteId === loteId);
        const cosecha = U.sum(cos, c => F.costoCosecha(c).total);
        let agricola = 0;
        const byCuartel = U.groupBy(cos, c => c.cuartelId);
        Object.entries(byCuartel).forEach(([cid, cs]) => {
          const temporada = lote.temporada;
          const kgLote = U.sum(cs, c => c.kg);
          const kgTot = U.sum(db().list('cosecha', c => c.cuartelId === cid && Number(c.temporada) === Number(temporada)), c => c.kg) || kgLote;
          const costoCampo = U.sum(db().list('aplicacion', a => a.cuartelId === cid && Number(a.temporada) === Number(temporada)), a => a.costo)
            + U.sum(db().list('labor', l => l.cuartelId === cid && Number(l.temporada) === Number(temporada)), l => l.costo);
          agricola += kgTot ? costoCampo * kgLote / kgTot : 0;
        });
        const enologico = U.sum(db().list('aditivo', a => a.loteId === loteId), a => a.costo)
          + U.sum(db().list('fermentacion', f => f.loteId === loteId), f => U.sum(db().list('adicionSO2', x => x.fermentacionId === f.id), x => x.costo));
        const comprada = U.n(lote.costoUvaComprada);
        const total = cosecha + agricola + enologico + comprada;
        const litros = VG.calc.inventory.litrosEntradaLote(loteId) || U.n(lote.litrosEstimados);
        return { total, litros, costoLitro: litros ? total / litros : 0, partes: { cosecha, agricola, enologico, comprada } };
      });
    },

    /** Costo de un registro de cosecha: jornales + otros costos (bins, transporte, alimentación). */
    costoCosecha(c) {
      const jor = U.sum(db().list('jornal', j => j.cosechaId === c.id), j => F.pagoJornal(j));
      const otros = U.n(c.costoBins) + U.n(c.costoTransporte) + U.n(c.costoAlimentacion) + U.n(c.otrosCostos);
      const total = jor + otros;
      return { jornales: jor, otros, total, porKg: U.n(c.kg) ? total / U.n(c.kg) : 0 };
    },
    /** Pago de un jornal según tarifa: por kg, por cajón o por día. */
    pagoJornal(j) {
      const t = U.n(j.tarifa);
      if (j.tarifaTipo === 'kg') return t * U.n(j.kg);
      if (j.tarifaTipo === 'cajon') return t * U.n(j.cajones);
      return t * (U.n(j.jornadas) || 1);
    },

    /**
     * Costo unitario por botella / envase de una orden de envasado.
     *  vino = litros por unidad × (1 + merma) × costo/L del lote
     *  + envase + etiqueta (impresión + prorrateo diseño) + cápsula + corcho/tapa + caja/unidades por caja
     *  + mano de obra + energía/agua prorrateada (por unidad)
     */
    costoEnvasado(o) {
      const fmt = db().get('formato', o.formatoId) || { litros: 0.75 };
      const lote = F.costoLitroLote(o.loteId);
      const merma = U.n(o.mermaPct) / 100;
      const precio = id => { const i = id && db().get('insumo', id); return i ? U.n(i.precio) : 0; };
      const et = o.etiquetaId && db().get('etiqueta', o.etiquetaId);
      const unidades = U.n(o.unidades) || 1;
      const etiqueta = et ? U.n(et.costoImpresion) + F.prorrateoEtiqueta(et) : precio(o.etiquetaInsumoId);
      const partes = {
        vino: U.n(fmt.litros) * (1 + merma) * lote.costoLitro,
        envase: precio(o.envaseId),
        etiqueta,
        capsula: precio(o.capsulaId),
        cierre: precio(o.cierreId),
        caja: o.cajaId ? precio(o.cajaId) / (U.n(fmt.unidadesCaja) || 12) : 0,
        manoObra: U.n(o.manoObra) / unidades,
        energia: U.n(o.energiaAgua) / unidades
      };
      const unitario = U.sum(Object.values(partes));
      return { partes, unitario, total: unitario * unidades, litrosConsumidos: U.n(fmt.litros) * unidades * (1 + merma), costoLitroVino: lote.costoLitro };
    },
    /**
     * Prorrateo de costos únicos de una etiqueta (diseño, fotografía, marca) entre las
     * botellas producidas con esa versión (o el tiraje estimado si aún no hay producción).
     */
    prorrateoEtiqueta(et) {
      const unicos = U.n(et.costoDiseno) + U.n(et.costoFotografia) + U.n(et.costoIlustracion);
      const producidas = U.sum(db().list('ordenEnvasado', o => o.etiquetaId === et.id && o.estado === 'confirmada'), o => o.unidades);
      const base = Math.max(producidas, U.n(et.tirajeEstimado) || 0) || 1;
      return unicos / base;
    },

    /** Precio neto promedio y costo por formato (para margen y contribución). */
    porFormato(p) {
      const ventas = db().list('venta', v => v.estado !== 'anulada' && inP(v.fecha, p));
      const out = {};
      db().list('formato').forEach(f => out[f.id] = { formato: f, unidades: 0, litros: 0, ingresos: 0, costo: 0 });
      out.granel = { formato: { id: 'granel', nombre: 'Granel', litros: 1 }, unidades: 0, litros: 0, ingresos: 0, costo: 0 };
      ventas.forEach(v => {
        const k = v.tipo === 'granel' ? 'granel' : v.formatoId;
        if (!out[k]) return;
        out[k].unidades += U.n(v.cantidad); out[k].litros += U.n(v.litros);
        out[k].ingresos += U.n(v.neto); out[k].costo += U.n(v.cantidad) * U.n(v.costoUnitario);
      });
      Object.values(out).forEach(x => {
        x.precioProm = x.unidades ? x.ingresos / x.unidades : 0;
        x.costoProm = x.unidades ? x.costo / x.unidades : 0;
        x.contribucion = x.ingresos - x.costo;
        x.contribucionUnit = x.precioProm - x.costoProm;
        x.margen = x.ingresos ? x.contribucion / x.ingresos : 0;
      });
      return out;
    },

    /* ====================== ESTADO DE RESULTADOS ====================== */
    /** Costo empresa de remuneraciones en el período, separado por área. */
    remuneraciones(p) {
      const rs = db().list('remuneracion', r => inP(r.periodo + '-15', p));
      const hon = db().list('honorario', h => inP(h.fecha, p));
      const area = r => (db().get('trabajador', r.trabajadorId) || {}).area || 'admin';
      return {
        produccion: U.sum(rs.filter(r => area(r) === 'produccion'), r => r.costoEmpresa),
        admin: U.sum(rs.filter(r => area(r) === 'admin'), r => r.costoEmpresa),
        ventas: U.sum(rs.filter(r => area(r) === 'ventas'), r => r.costoEmpresa),
        honorarios: U.sum(hon, h => h.bruto),
        total: U.sum(rs, r => r.costoEmpresa) + U.sum(hon, h => h.bruto)
      };
    },
    /** Depreciación lineal de activos en el período (meses × valor/vida útil/12). */
    depreciacion(p) {
      const meses = Math.max(1, Math.round(U.diffDays(p.desde, p.hasta) / 30.4));
      return U.sum(db().list('activo'), a => {
        if (a.fechaCompra > p.hasta) return 0;
        return U.n(a.valor) / (U.n(a.vidaUtil) || 1) / 12 * meses;
      });
    },
    /** Amortización de marca (registro INAPI 10 años) en el período. */
    amortizacion(p) {
      const meses = Math.max(1, Math.round(U.diffDays(p.desde, p.hasta) / 30.4));
      return U.sum(db().list('marca'), m => U.n(m.costo) / 120 * meses);
    },

    /**
     * Estado de resultados del período.
     *  Ingresos − COGS = Margen bruto
     *  − Gastos de administración y ventas − Gastos indirectos de producción = EBITDA
     *  − Depreciación y amortización = EBIT
     *  − Gastos financieros = Utilidad antes de impuestos (UAI)
     *  − Impuesto a la renta (tasa configurable) = Utilidad neta
     */
    estadoResultados(p) {
      return U.memo('er_' + p.desde + p.hasta, () => {
        const cfg = VG.store.config();
        const ventas = db().list('venta', v => v.estado !== 'anulada' && inP(v.fecha, p));
        const ingGranel = U.sum(ventas.filter(v => v.tipo === 'granel'), v => v.neto);
        const ingEnv = U.sum(ventas.filter(v => v.tipo !== 'granel'), v => v.neto);
        const ingresos = ingGranel + ingEnv;
        const porCanal = {};
        ventas.forEach(v => { const k = v.tipo === 'granel' ? 'granel' : (v.canal || 'directa'); porCanal[k] = (porCanal[k] || 0) + U.n(v.neto); });
        const cogs = U.sum(ventas, v => U.n(v.cantidad) * U.n(v.costoUnitario));
        const mb = ingresos - cogs;
        const gastos = db().list('gasto', g => inP(g.fecha, p));
        const gFin = U.sum(gastos.filter(g => g.categoria === 'financiero'), g => g.monto);
        const gProd = U.sum(gastos.filter(g => g.area === 'produccion' && g.categoria !== 'financiero'), g => g.monto);
        const gAdm = U.sum(gastos.filter(g => g.area !== 'produccion' && g.categoria !== 'financiero'), g => g.monto);
        const rem = F.remuneraciones(p);
        const gav = gAdm + rem.admin + rem.ventas + rem.honorarios;
        const indirectos = gProd + rem.produccion;
        const ebitda = mb - gav - indirectos;
        const dep = F.depreciacion(p), amort = F.amortizacion(p);
        const ebit = ebitda - dep - amort;
        const uai = ebit - gFin;
        const impuesto = Math.max(0, Math.round(uai * cfg.tributario.tasaIDPC));
        const un = uai - impuesto;
        const litros = U.sum(ventas, v => v.litros), unidades = U.sum(ventas.filter(v => v.tipo !== 'granel'), v => v.cantidad);
        const fijos = U.sum(gastos.filter(g => g.tipoCosto !== 'variable'), g => g.monto) + rem.total + dep + amort;
        const variablesGasto = U.sum(gastos.filter(g => g.tipoCosto === 'variable'), g => g.monto);
        return { periodo: p, ingresos, ingGranel, ingEnv, porCanal, cogs, mb, gav, gastosAdmin: gAdm, remuneraciones: rem, indirectos, gastosProduccion: gProd, ebitda, dep, amort, ebit, gFin, uai, impuesto, un, litros, unidades, ventasN: ventas.length, costosFijos: fijos, costosVariables: cogs + variablesGasto };
      });
    },

    /* ====================== RATIOS ====================== */
    /**
     * Ratios con semáforo.
     *  Margen bruto = MB/Ingresos; Operacional = EBIT/Ingresos; Neto = UN/Ingresos
     *  ROS = UN/Ventas; ROC = EBIT×(1−t)/Capital invertido; ROI = UN/Capital invertido; ROE = UN/Patrimonio
     *  Rotación inventario = COGS / Inventario valorizado; Días inventario = 365 / rotación
     */
    ratios(p) {
      const er = F.estadoResultados(p);
      const c = VG.store.config();
      const inv = VG.calc.inventory.valorProductoTerminado() + VG.calc.inventory.valorGranel() + VG.calc.inventory.valorInventarioInsumos();
      const dias = Math.max(1, U.diffDays(p.desde, p.hasta) + 1);
      const anual = 365 / dias;
      const div = (a, b) => (b ? a / b : 0);
      const rot = div(er.cogs * anual, inv);
      const tickets = db().list('venta', v => v.estado !== 'anulada' && inP(v.fecha, p));
      const mm = c.finanzas.margenMinimo;
      const sem = (v, ok, warn) => (v >= ok ? 'ok' : v >= warn ? 'warn' : 'bad');
      const list = [
        { key: 'mb', label: 'Margen bruto', value: div(er.mb, er.ingresos), fmt: 'pct', estado: sem(div(er.mb, er.ingresos), mm + 0.15, mm), ayuda: 'Margen bruto / Ingresos. Cuánto queda de cada peso vendido después del costo directo.' },
        { key: 'mo', label: 'Margen operacional', value: div(er.ebit, er.ingresos), fmt: 'pct', estado: sem(div(er.ebit, er.ingresos), 0.15, 0.05), ayuda: 'EBIT / Ingresos. Rentabilidad de la operación antes de intereses e impuestos.' },
        { key: 'mn', label: 'Margen neto', value: div(er.un, er.ingresos), fmt: 'pct', estado: sem(div(er.un, er.ingresos), 0.10, 0.02), ayuda: 'Utilidad neta / Ingresos.' },
        { key: 'ros', label: 'ROS', value: div(er.un, er.ingresos), fmt: 'pct', estado: sem(div(er.un, er.ingresos), 0.10, 0.02), ayuda: 'Return on Sales = Utilidad neta / Ventas.' },
        { key: 'roc', label: 'ROC', value: div(er.ebit * (1 - c.tributario.tasaIDPC) * anual, c.finanzas.capitalInvertido), fmt: 'pct', estado: sem(div(er.ebit * (1 - c.tributario.tasaIDPC) * anual, c.finanzas.capitalInvertido), 0.12, 0.05), ayuda: 'Return on Capital = EBIT × (1 − tasa) / Capital invertido (anualizado).' },
        { key: 'roi', label: 'ROI', value: div(er.un * anual, c.finanzas.capitalInvertido), fmt: 'pct', estado: sem(div(er.un * anual, c.finanzas.capitalInvertido), 0.10, 0.03), ayuda: 'Utilidad neta anualizada / Capital invertido.' },
        { key: 'roe', label: 'ROE', value: div(er.un * anual, c.finanzas.patrimonio), fmt: 'pct', estado: sem(div(er.un * anual, c.finanzas.patrimonio), 0.12, 0.04), ayuda: 'Utilidad neta anualizada / Patrimonio.' },
        { key: 'rot', label: 'Rotación de inventario', value: rot, fmt: 'x', estado: sem(rot, 2, 1), ayuda: 'COGS anualizado / Inventario valorizado. Veces que rota el inventario al año.' },
        { key: 'dias', label: 'Días de inventario', value: rot ? 365 / rot : 0, fmt: 'dias', estado: rot ? (365 / rot <= 180 ? 'ok' : 365 / rot <= 365 ? 'warn' : 'bad') : 'warn', ayuda: '365 / rotación. Días promedio que el producto permanece en inventario (el vino con guarda naturalmente es alto).' },
        { key: 'cl', label: 'Costo por litro vendido', value: div(er.cogs, er.litros), fmt: 'clp', estado: 'ok', ayuda: 'COGS / litros vendidos.' },
        { key: 'il', label: 'Ingreso por litro', value: div(er.ingresos, er.litros), fmt: 'clp', estado: 'ok', ayuda: 'Ingresos netos / litros vendidos.' },
        { key: 'cb', label: 'Costo por botella (envasado)', value: div(U.sum(tickets.filter(v => v.tipo !== 'granel'), v => U.n(v.cantidad) * U.n(v.costoUnitario)), er.unidades), fmt: 'clp', estado: 'ok', ayuda: 'COGS de producto envasado / unidades vendidas.' },
        { key: 'ib', label: 'Ingreso por botella', value: div(er.ingEnv, er.unidades), fmt: 'clp', estado: 'ok', ayuda: 'Ingresos de envasado / unidades vendidas.' },
        { key: 'tk', label: 'Ticket promedio', value: div(er.ingresos, tickets.length), fmt: 'clp', estado: 'ok', ayuda: 'Ingresos netos / número de ventas.' }
      ];
      return { er, inventario: inv, list, map: Object.fromEntries(list.map(x => [x.key, x])) };
    },

    /* ====================== PUNTO DE EQUILIBRIO ====================== */
    /**
     * Punto de equilibrio multiproducto (mezcla de ventas del período).
     *  Contribución por litro ponderada = Σ (contribución formato) / Σ litros
     *  PE litros = Costos fijos / contribución ponderada por litro
     *  PE unidades formato = PE litros × participación en litros del formato / litros por unidad
     *  PE pesos = Costos fijos / razón de contribución (contribución / ingresos)
     *  Margen de seguridad = (Ventas − PE pesos) / Ventas
     *  `ajustes` permite simular: { precio: +%, volumen: +%, costoEnvase: +%, sueldos: +%, tipoCambio: +% }
     */
    puntoEquilibrio(p, aj = {}) {
      const er = F.estadoResultados(p);
      const pf = F.porFormato(p);
      const kP = 1 + U.n(aj.precio) / 100, kV = 1 + U.n(aj.volumen) / 100, kE = U.n(aj.costoEnvase) / 100, kS = 1 + U.n(aj.sueldos) / 100, kT = U.n(aj.tipoCambio) / 100;
      let ing = 0, cv = 0, litros = 0;
      const rows = Object.values(pf).filter(x => x.unidades > 0).map(x => {
        const envPart = x.formato.id === 'granel' ? 0 : F.participacionEnvase(x.formato.id);
        const expPart = U.n(aj.exportShare ?? 0);
        const precio = x.precioProm * kP * (1 + expPart * kT);
        const costo = x.costoProm * (1 + envPart * kE);
        const unidades = x.unidades * kV;
        const r = { id: x.formato.id, nombre: x.formato.nombre, litrosUnidad: U.n(x.formato.litros) || 1, unidades, precio, costo, contribucionUnit: precio - costo, ingresos: precio * unidades, cv: costo * unidades, litros: x.litros * kV };
        ing += r.ingresos; cv += r.cv; litros += r.litros; return r;
      });
      const rem = er.remuneraciones.total;
      const fijos = er.costosFijos + rem * (kS - 1);
      const contrib = ing - cv;
      const razon = ing ? contrib / ing : 0;
      const contribLitro = litros ? contrib / litros : 0;
      const peLitros = contribLitro > 0 ? fijos / contribLitro : Infinity;
      const pePesos = razon > 0 ? fijos / razon : Infinity;
      rows.forEach(r => { r.share = litros ? r.litros / litros : 0; r.peUnidades = isFinite(peLitros) ? peLitros * r.share / r.litrosUnidad : Infinity; });
      const ebit = contrib - fijos;
      return { fijos, ingresos: ing, costosVariables: cv, contribucion: contrib, razon, contribLitro, litros, peLitros, pePesos, margenSeguridad: ing && isFinite(pePesos) ? (ing - pePesos) / ing : -1, rows, utilidadOperacional: ebit, utilidadNeta: ebit - Math.max(0, ebit) * VG.store.config().tributario.tasaIDPC, alcanzado: ing >= pePesos };
    },
    /** Participación del envase en el costo unitario promedio de un formato (para sensibilidad). */
    participacionEnvase(formatoId) {
      const os = db().list('ordenEnvasado', o => o.formatoId === formatoId && o.estado === 'confirmada');
      if (!os.length) return 0.3;
      const c = F.costoEnvasado(os[os.length - 1]);
      return c.unitario ? c.partes.envase / c.unitario : 0.3;
    },

    /* ====================== FLUJO DE CAJA ====================== */
    /**
     * Flujo de caja mensual del año (real + proyectado).
     *  Entradas: ventas cobradas (total con IVA) por fecha de cobro; pendientes por vencimiento.
     *  Salidas: compras pagadas/por pagar, remuneraciones (líquido + cotizaciones), gastos, F29 (IVA + PPM + retenciones).
     */
    flujoCaja(anio) {
      return U.memo('fc_' + anio, () => {
        const cfg = VG.store.config();
        const meses = U.monthsOfYear(anio);
        const hoyM = U.month(U.today());
        const m = Object.fromEntries(meses.map(x => [x, { mes: x, entradas: 0, salidas: 0, cobros: 0, pagosProv: 0, sueldos: 0, gastos: 0, impuestos: 0, proyectado: x > hoyM }]));
        const add = (fecha, k, v, entrada) => { const mm = U.month(fecha); if (m[mm]) { m[mm][k] += v; m[mm][entrada ? 'entradas' : 'salidas'] += v; } };
        db().list('venta', v => v.estado !== 'anulada').forEach(v => add(v.estadoPago === 'pagado' ? (v.fechaPago || v.fecha) : (v.vencimiento || v.fecha), 'cobros', U.n(v.total), true));
        db().list('compra').forEach(c => add(c.estadoPago === 'pagado' ? (c.fechaPago || c.fecha) : (c.vencimiento || c.fecha), 'pagosProv', U.n(c.total), false));
        db().list('remuneracion').forEach(r => add(r.periodo + '-28', 'sueldos', U.n(r.costoEmpresa), false));
        db().list('honorario').forEach(h => add(h.fecha, 'sueldos', U.n(h.bruto), false));
        db().list('gasto').forEach(g => add(g.fecha, 'gastos', U.n(g.monto) * (g.afectoIVA ? 1 + cfg.tributario.tasaIVA : 1), false));
        meses.forEach(per => { const f = VG.calc.tax.f29(VG.calc.tax.periodoAnterior(per)); add(per + '-' + String(cfg.tributario.diaF29).padStart(2, '0'), 'impuestos', f.total, false); });
        let saldo = U.n(cfg.finanzas.saldoInicialCaja);
        const rows = meses.map(x => { const r = m[x]; r.neto = r.entradas - r.salidas; saldo += r.neto; r.saldo = saldo; r.alerta = saldo < 0; return r; });
        const cxc = U.sum(db().list('venta', v => v.estado !== 'anulada' && v.estadoPago !== 'pagado'), v => v.total);
        const cxp = U.sum(db().list('compra', c => c.estadoPago !== 'pagado'), c => c.total);
        return { rows, saldoFinal: saldo, cxc, cxp, negativo: rows.find(r => r.alerta) };
      });
    },

    /** Proyección en 3 escenarios sobre el estado de resultados del período. */
    escenarios(p) {
      const base = F.puntoEquilibrio(p);
      const mk = (nombre, aj) => { const r = F.puntoEquilibrio(p, aj); return { nombre, ingresos: r.ingresos, utilidad: r.utilidadOperacional, utilidadNeta: r.utilidadNeta, pe: r.pePesos }; };
      return [mk('Pesimista', { precio: -8, volumen: -15, costoEnvase: 10 }), { nombre: 'Base', ingresos: base.ingresos, utilidad: base.utilidadOperacional, utilidadNeta: base.utilidadNeta, pe: base.pePesos }, mk('Optimista', { precio: 5, volumen: 12, costoEnvase: -3 })];
    },

    /** Rentabilidad por cuartel: ingresos atribuidos según litros del lote vendidos vs costo de campo. */
    rentabilidadCuarteles(anio) {
      return db().list('cuartel').map(c => {
        const cos = db().list('cosecha', x => x.cuartelId === c.id && Number(x.temporada) === Number(anio));
        const kg = U.sum(cos, x => x.kg);
        const costo = U.sum(cos, x => F.costoCosecha(x).total) + U.sum(db().list('aplicacion', a => a.cuartelId === c.id && Number(a.temporada) === Number(anio)), a => a.costo) + U.sum(db().list('labor', l => l.cuartelId === c.id && Number(l.temporada) === Number(anio)), l => l.costo);
        // ingresos atribuidos: por cada lote al que aportó, proporción de kg × ingresos del lote
        let ingresos = 0;
        Object.entries(U.groupBy(cos, x => x.loteId || '')).forEach(([loteId, cs]) => {
          if (!loteId) return;
          const kgLote = U.sum(db().list('cosecha', x => x.loteId === loteId), x => x.kg) || 1;
          const ingLote = U.sum(db().list('venta', v => v.estado !== 'anulada' && (v.loteId === loteId)), v => v.neto);
          ingresos += ingLote * U.sum(cs, x => x.kg) / kgLote;
        });
        return { cuartel: c, kg, costo, ingresos, margen: ingresos - costo, kgHa: U.n(c.superficie) ? kg / U.n(c.superficie) : 0 };
      });
    },

    /** Recomendaciones automáticas para el resumen ejecutivo. */
    recomendaciones(p) {
      const r = F.ratios(p), pe = F.puntoEquilibrio(p), fc = F.flujoCaja(Number(p.desde.slice(0, 4)));
      const out = [];
      const mb = r.map.mb.value;
      if (r.er.ingresos === 0) return ['Aún no hay ventas en el período: registra ventas para obtener indicadores.'];
      if (mb < VG.store.config().finanzas.margenMinimo) out.push(`El margen bruto (${U.pct(mb)}) está bajo el mínimo configurado. Revisa precios o el costo del envase y etiqueta, que suelen ser el mayor componente del costo por botella.`);
      if (!pe.alcanzado) out.push(`Aún no se alcanza el punto de equilibrio: faltan ${U.clp(pe.pePesos - pe.ingresos)} en ventas netas (≈ ${U.int(Math.max(0, pe.peLitros - pe.litros))} L).`);
      else out.push(`Se superó el punto de equilibrio con un margen de seguridad de ${U.pct(pe.margenSeguridad)}.`);
      const best = pe.rows.slice().sort((a, b) => (b.contribucionUnit / b.litrosUnidad) - (a.contribucionUnit / a.litrosUnidad))[0];
      if (best) out.push(`El formato con mayor contribución por litro es ${best.nombre} (${U.clp(best.contribucionUnit / best.litrosUnidad)}/L). Prioriza su venta y disponibilidad.`);
      const granel = pe.rows.find(x => x.id === 'granel');
      if (granel && best && best.id !== 'granel') out.push(`El granel aporta ${U.clp(granel.contribucionUnit)}/L, versus ${U.clp(best.contribucionUnit / best.litrosUnidad)}/L envasado en ${best.nombre}: evalúa envasar parte del granel si hay demanda.`);
      if (fc.negativo) out.push(`Alerta de caja: el saldo proyectado queda negativo en ${U.monthName(fc.negativo.mes)}. Considera adelantar cobranza (${U.clp(fc.cxc)} por cobrar) o renegociar plazos con proveedores.`);
      if (r.map.dias.value > 365) out.push('Los días de inventario superan un año: revisa la rotación de stock y la planificación de envasado.');
      return out;
    }
  };

  VG.calc = VG.calc || {};
  VG.calc.financial = F;
})(window.VG);
