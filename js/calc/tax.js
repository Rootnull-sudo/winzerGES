/**
 * calc/tax.js — Cálculos tributarios chilenos (IVA, ILA, PPM, F29, impuesto único, Renta).
 *
 * ⚠ Herramienta de apoyo. Las tasas, tramos y plazos son configurables y cambian
 *   en el tiempo. Los resultados son BORRADORES que deben validarse con un contador
 *   antes de declarar ante el SII.
 */
(function (VG) {
  'use strict';
  const U = VG.utils;
  const cfg = () => VG.store.config();

  /** Tramos del Impuesto Único de Segunda Categoría (mensual, en UTM): [desde, hasta, factor, rebaja]. */
  const TRAMOS_IUSC = [
    [0, 13.5, 0, 0],
    [13.5, 30, 0.04, 0.54],
    [30, 50, 0.08, 1.74],
    [50, 70, 0.135, 4.49],
    [70, 90, 0.23, 11.14],
    [90, 120, 0.304, 17.80],
    [120, 310, 0.35, 23.32],
    [310, Infinity, 0.40, 38.82]
  ];

  /** Tipos de DTE y su efecto en el libro (signo). */
  const DTE_TIPOS = {
    33: { nombre: 'Factura electrónica', signo: 1, afecta: true },
    34: { nombre: 'Factura exenta electrónica', signo: 1, afecta: false },
    39: { nombre: 'Boleta electrónica', signo: 1, afecta: true, ivaIncluido: true },
    52: { nombre: 'Guía de despacho electrónica', signo: 0, afecta: true },
    56: { nombre: 'Nota de débito electrónica', signo: 1, afecta: true },
    61: { nombre: 'Nota de crédito electrónica', signo: -1, afecta: true }
  };

  const Tax = {
    TRAMOS_IUSC, DTE_TIPOS,

    /** IVA = neto × 19% (redondeo al peso). */
    iva(neto) { return Math.round(U.n(neto) * cfg().tributario.tasaIVA); },
    /** ILA vinos = neto × 20,5% (si está activo). Código 25 en DTE. */
    ila(neto, aplica = true) { const t = cfg().tributario; return aplica && t.ilaActivo ? Math.round(U.n(neto) * t.tasaILA) : 0; },

    /**
     * Totales de un documento.
     * @param {number} neto monto neto afecto
     * @param {{exento?:number, ila?:boolean, ivaIncluido?:boolean}} o
     *  ivaIncluido: para boletas, `neto` viene con impuestos incluidos y se desglosa.
     */
    totales(neto, o = {}) {
      const t = cfg().tributario;
      let n = U.n(neto);
      const aplicaIla = o.ila !== false && t.ilaActivo;
      if (o.ivaIncluido) n = Math.round(n / (1 + t.tasaIVA + (aplicaIla ? t.tasaILA : 0)));
      const iva = Tax.iva(n), ila = Tax.ila(n, aplicaIla);
      const exento = U.n(o.exento);
      return { neto: n, exento, iva, ila, total: n + iva + ila + exento };
    },

    /** Impuesto único de segunda categoría sobre base tributable mensual. */
    impuestoUnico(base, utm) {
      const u = U.n(utm || cfg().remuneraciones.utm);
      const enUtm = U.n(base) / u;
      const t = TRAMOS_IUSC.find(([d, h]) => enUtm > d && enUtm <= h) || TRAMOS_IUSC[0];
      return Math.max(0, Math.round((enUtm * t[2] - t[3]) * u));
    },

    /**
     * Liquidación de sueldo (borrador).
     *  imponible = sueldo base + gratificación + bonos + comisiones (+ horas extra)
     *  gratificación legal art. 50 = 25% del sueldo, tope 4,75 IMM anual (/12 mensual)
     *  descuentos trabajador: AFP (10% + comisión), salud 7%, cesantía 0,6% (indefinido)
     *  tributable = imponible − cotizaciones;  impuesto único según tramos
     *  costo empresa = imponible + no imponibles + cesantía empleador + SIS + aporte empleador
     */
    liquidacion(t, extra = {}) {
      const r = cfg().remuneraciones;
      const base = U.n(t.sueldoBase);
      const grat = t.gratificacion === 'art50' ? Math.min(Math.round(base * 0.25), Math.round(4.75 * r.imm / 12)) : U.n(t.gratificacionMonto);
      const bonos = U.n(extra.bonos ?? t.bonos), com = U.n(extra.comisiones ?? t.comisiones), hhee = U.n(extra.horasExtra);
      const noImp = U.n(t.colacion) + U.n(t.movilizacion);
      const imponible = base + grat + bonos + com + hhee;
      const topeImp = 87.8 * (r.uf || 39500); // tope imponible referencial ~87,8 UF
      const impTope = Math.min(imponible, topeImp);
      const afp = Math.round(impTope * (U.n(t.tasaAfp) || r.afp));
      const salud = Math.round(Math.max(impTope * r.salud, U.n(t.planSalud)));
      const ces = t.contrato === 'plazo_fijo' ? 0 : Math.round(impTope * r.cesantiaTrabajador);
      const tributable = imponible - afp - Math.round(impTope * r.salud) - ces;
      const iu = Tax.impuestoUnico(tributable, r.utm);
      const descuentos = afp + salud + ces + iu + U.n(extra.anticipos);
      const liquido = imponible + noImp - descuentos;
      const cesEmp = Math.round(impTope * (t.contrato === 'plazo_fijo' ? 0.03 : r.cesantiaEmpleador));
      const sis = Math.round(impTope * r.sis);
      const aporte = Math.round(impTope * r.aporteEmpleadorPension);
      const costoEmpresa = imponible + noImp + cesEmp + sis + aporte;
      return { base, gratificacion: grat, bonos, comisiones: com, horasExtra: hhee, noImponible: noImp, imponible, afp, salud, cesantia: ces, tributable, impuestoUnico: iu, descuentos, liquido, cesantiaEmpleador: cesEmp, sis, aporteEmpleador: aporte, costoEmpresa };
    },

    /** Retención de boleta de honorarios. */
    retencionHonorarios(bruto) { return Math.round(U.n(bruto) * cfg().tributario.retencionHonorarios); },

    /* ---------------- Libros y F29 ---------------- */

    /** DTE emitidos (ventas) válidos de un período YYYY-MM. */
    dteEmitidos(periodo) {
      return VG.db.list('dte', d => d.direccion === 'emitido' && U.month(d.fecha) === periodo && !['borrador', 'rechazado', 'anulado'].includes(d.estado) && d.tipo !== 52);
    },
    dteRecibidos(periodo) {
      return VG.db.list('dte', d => d.direccion === 'recibido' && U.month(d.fecha) === periodo && !['rechazado', 'anulado'].includes(d.estado) && d.tipo !== 52);
    },
    /** Resumen de libro (ventas o compras) con signo por tipo de documento. */
    resumenLibro(docs) {
      const s = d => (DTE_TIPOS[d.tipo] || { signo: 1 }).signo;
      return {
        documentos: docs.length,
        neto: U.sum(docs, d => s(d) * U.n(d.neto)),
        exento: U.sum(docs, d => s(d) * U.n(d.exento)),
        iva: U.sum(docs, d => s(d) * U.n(d.iva)),
        ila: U.sum(docs, d => s(d) * U.n(d.ila)),
        total: U.sum(docs, d => s(d) * U.n(d.total)),
        porTipo: Object.entries(U.groupBy(docs, d => d.tipo)).map(([tipo, ds]) => ({ tipo: Number(tipo), cantidad: ds.length, neto: U.sum(ds, d => U.n(d.neto)), iva: U.sum(ds, d => U.n(d.iva)), total: U.sum(ds, d => U.n(d.total)) }))
      };
    },

    /**
     * Borrador F29 de un período.
     *  IVA determinado = débito − crédito − remanente del mes anterior
     *  Si es negativo → remanente para el mes siguiente.
     *  PPM = ingresos netos del mes × tasa PPM
     *  Total = IVA a pagar + ILA débito + PPM + retenciones (honorarios) + impuesto único trabajadores
     */
    f29(periodo) {
      return U.memo('f29_' + periodo, () => {
        const t = cfg().tributario;
        const v = Tax.resumenLibro(Tax.dteEmitidos(periodo));
        const c = Tax.resumenLibro(Tax.dteRecibidos(periodo));
        const prev = Tax.periodoAnterior(periodo);
        const remAnt = Tax.remanente(prev);
        const ivaDet = v.iva - c.iva - remAnt;
        const ivaPagar = Math.max(0, ivaDet);
        const remSig = Math.max(0, -ivaDet);
        const ingresosPPM = v.neto + v.exento;
        const ppm = Math.max(0, Math.round(ingresosPPM * t.tasaPPM));
        const retHon = U.sum(VG.db.list('honorario', h => U.month(h.fecha) === periodo), h => h.retencion);
        const iusc = U.sum(VG.db.list('remuneracion', r => r.periodo === periodo), r => r.impuestoUnico);
        const ilaDebito = Math.max(0, v.ila - c.ila);
        const total = ivaPagar + ilaDebito + ppm + retHon + iusc;
        return { periodo, ventas: v, compras: c, ivaDebito: v.iva, ivaCredito: c.iva, remanenteAnterior: remAnt, ivaDeterminado: ivaDet, ivaPagar, remanenteSiguiente: remSig, ilaDebito, baseIngresosPPM: ingresosPPM, tasaPPM: t.tasaPPM, ppm, retencionHonorarios: retHon, impuestoUnico: iusc, total };
      });
    },
    periodoAnterior(p) { const [y, m] = p.split('-').map(Number); return m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0'); },
    /** Remanente de crédito fiscal al cierre de un período (recursivo, parte en 0 sin datos previos). */
    remanente(periodo) {
      const hay = VG.db.list('dte', d => U.month(d.fecha) <= periodo).length;
      if (!hay) return U.n(cfg().tributario.remanenteInicial);
      // Si existe un F29 declarado para el período, usar su remanente registrado
      const dec = VG.db.find('f29', f => f.periodo === periodo && ['declarado', 'pagado'].includes(f.estado));
      if (dec && dec.snapshot) return U.n(dec.snapshot.remanenteSiguiente);
      return Tax.f29(periodo).remanenteSiguiente;
    },

    /** PPM acumulado del año comercial. */
    ppmAnual(anio) {
      const meses = U.monthsOfYear(anio);
      const calc = meses.map(p => Tax.f29(p).ppm);
      const pagados = U.sum(VG.db.list('pagoImpuesto', p => p.tipo === 'PPM' && String(p.periodo).startsWith(String(anio))), p => p.monto);
      return { meses, porMes: calc, total: U.sum(calc), pagados };
    },

    /**
     * Borrador Renta (año comercial `anio`, año tributario `anio+1`).
     *  RLI = utilidad antes de impuestos + agregados (gastos rechazados) − deducciones
     *  IDPC = RLI × tasa (25% Pro Pyme / 27% general)
     *  Resultado = IDPC − PPM del año − otros créditos → a pagar (+) o devolución (−)
     */
    renta(anio) {
      const t = cfg().tributario;
      const er = VG.calc.financial.estadoResultados({ desde: anio + '-01-01', hasta: anio + '-12-31' });
      const agregados = U.sum(VG.db.list('gasto', g => g.noDeducible && U.year(g.fecha) === anio), g => g.monto);
      const rli = Math.max(0, er.uai + agregados);
      const idpc = Math.round(rli * t.tasaIDPC);
      const ppm = Tax.ppmAnual(anio);
      const ppmCredito = ppm.pagados || ppm.total;
      const resultado = idpc - ppmCredito;
      return { anioComercial: anio, anioTributario: anio + 1, regimen: t.regimen, resultadoFinanciero: er.uai, agregados, deducciones: 0, rli, tasa: t.tasaIDPC, idpc, ppm: ppmCredito, resultado, aPagar: Math.max(0, resultado), devolucion: Math.max(0, -resultado), conciliacion: { utilidadFinanciera: er.uai, masGastosRechazados: agregados, rentaLiquidaImponible: rli } };
    },

    /** Calendario tributario y normativo anual (generado). */
    calendario(anio) {
      const t = cfg().tributario;
      const items = [];
      const pad = n => String(n).padStart(2, '0');
      for (let m = 1; m <= 12; m++) {
        const per = (m === 1 ? anio - 1 : anio) + '-' + pad(m === 1 ? 12 : m - 1);
        items.push({ key: 'F29-' + per, tipo: 'F29', nombre: `F29 y PPM período ${U.monthName(per)}`, fecha: `${anio}-${pad(m)}-${pad(t.diaF29)}`, modulo: 'tributario', ruta: '#/tributario/f29' });
      }
      items.push({ key: 'RENTA-' + anio, tipo: 'Renta', nombre: `Declaración de Renta AT${anio} (F22)`, fecha: `${anio}-${pad(t.mesRenta)}-${pad(t.diaRenta)}`, modulo: 'tributario', ruta: '#/tributario/renta' });
      [['01-31', '1ª cuota'], ['07-31', '2ª cuota']].forEach(([d, c]) => {
        items.push({ key: `PATMUN-${anio}-${c}`, tipo: 'Patente', nombre: `Patente municipal ${c}`, fecha: `${anio}-${d}`, modulo: 'cumplimiento' });
        items.push({ key: `PATALC-${anio}-${c}`, tipo: 'Patente', nombre: `Patente de alcoholes ${c} (Ley 19.925)`, fecha: `${anio}-${d}`, modulo: 'cumplimiento' });
      });
      [['04-30', '1ª'], ['06-30', '2ª'], ['09-30', '3ª'], ['11-30', '4ª']].forEach(([d, c]) => items.push({ key: `CONTRIB-${anio}-${c}`, tipo: 'Contribuciones', nombre: `Contribuciones ${c} cuota`, fecha: `${anio}-${d}`, modulo: 'tributario' }));
      items.push({ key: 'SAG-EXIST-' + anio, tipo: 'SAG', nombre: 'Declaración de existencias SAG (1–19 enero)', fecha: `${anio}-01-19`, modulo: 'cumplimiento' });
      items.push({ key: 'SAG-COSECHA-' + anio, tipo: 'SAG', nombre: 'Declaración de cosecha SAG (1–30 junio)', fecha: `${anio}-06-30`, modulo: 'cumplimiento' });
      items.push({ key: 'SAG-COSECHA-CORR-' + anio, tipo: 'SAG', nombre: 'Correcciones declaración de cosecha (hasta 15 julio)', fecha: `${anio}-07-15`, modulo: 'cumplimiento' });
      // estado desde registros `obligacion`
      return items.map(i => {
        const r = VG.db.find('obligacion', o => o.key === i.key);
        const dias = U.diffDays(U.today(), i.fecha);
        const estado = r ? r.estado : (dias < 0 ? 'vencida' : 'pendiente');
        return Object.assign(i, { estado, dias, registroId: r && r.id, folio: r && r.folio });
      }).sort((a, b) => a.fecha.localeCompare(b.fecha));
    }
  };

  VG.calc = VG.calc || {};
  VG.calc.tax = Tax;
})(window.VG);
