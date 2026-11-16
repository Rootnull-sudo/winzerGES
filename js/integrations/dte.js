/**
 * integrations/dte.js — Documentos Tributarios Electrónicos (formato SII Chile).
 *
 * ⚠ El sistema NO envía documentos al SII. Genera el XML del DTE (sin timbre TED
 *   ni firma digital) para que el contribuyente lo procese y envíe a través de su
 *   proveedor de facturación electrónica autorizado. La responsabilidad legal de la
 *   emisión y envío es del contribuyente (Ley 19.799 de firma electrónica).
 *
 * Estados: borrador → generado → enviado → aceptado | rechazado → anulado
 */
(function (VG) {
  'use strict';
  const U = VG.utils;
  const db = () => VG.db;
  const x = s => U.esc(String(s ?? '').slice(0, 100));

  const ESTADOS = ['borrador', 'generado', 'enviado', 'aceptado', 'rechazado', 'anulado'];
  const TIPOS = {
    33: 'Factura electrónica', 34: 'Factura exenta electrónica', 39: 'Boleta electrónica',
    52: 'Guía de despacho electrónica', 56: 'Nota de débito electrónica', 61: 'Nota de crédito electrónica'
  };

  const DTE = {
    ESTADOS, TIPOS,

    /** Estado de folios autorizados (CAF) para un tipo. */
    folios(tipo) {
      const cafs = db().list('caf', c => Number(c.tipo) === Number(tipo)).sort((a, b) => a.desde - b.desde);
      const total = U.sum(cafs, c => U.n(c.hasta) - U.n(c.desde) + 1);
      const usados = db().list('dte', d => d.direccion === 'emitido' && Number(d.tipo) === Number(tipo) && d.folio).map(d => Number(d.folio));
      const usadosSet = new Set(usados);
      let siguiente = null;
      for (const c of cafs) { for (let f = U.n(c.desde); f <= U.n(c.hasta); f++) if (!usadosSet.has(f)) { siguiente = f; break; } if (siguiente) break; }
      return { total, usados: usados.length, pct: total ? usados.length / total : 1, siguiente, cafs };
    },

    /**
     * Crea un DTE emitido desde una venta.
     * Calcula neto, IVA 19%, ILA 20,5% (vinos, código 25) y total; asigna folio correlativo.
     */
    async emitirDesdeVenta(venta, tipo) {
      const cfg = VG.store.config();
      tipo = Number(tipo || (venta.documento === 'boleta' ? 39 : venta.documento === 'guia' ? 52 : 33));
      const f = DTE.folios(tipo);
      if (!f.siguiente) throw new Error(`No hay folios disponibles para ${TIPOS[tipo]}. Carga un nuevo rango CAF en DTE › Folios.`);
      const cli = db().get('cliente', venta.clienteId) || {};
      const fmt = db().get('formato', venta.formatoId);
      const item = venta.tipo === 'granel' ? `Vino a granel ${venta.descripcion || ''}`.trim() : `Vino ${fmt ? fmt.nombre : ''} ${venta.descripcion || ''}`.trim();
      const d = {
        direccion: 'emitido', tipo, folio: f.siguiente, fecha: venta.fecha, estado: 'generado',
        ventaId: venta.id, contraparteRut: cli.rut || '66.666.666-6', contraparte: cli.nombre || 'Cliente boleta',
        giro: cli.giro || '', direccionContraparte: cli.direccion || '', comuna: cli.comuna || '',
        detalle: [{ nombre: item, cantidad: U.n(venta.cantidad), unidad: venta.tipo === 'granel' ? 'L' : 'UN', precio: U.n(venta.precio), monto: U.n(venta.neto) }],
        neto: U.n(venta.neto), exento: 0, iva: U.n(venta.iva), ila: U.n(venta.ila), total: U.n(venta.total),
        formaPago: venta.estadoPago === 'pagado' ? 1 : 2, vencimiento: venta.vencimiento || ''
      };
      if (tipo === 34) { d.exento = d.neto; d.neto = 0; d.iva = 0; d.ila = 0; d.total = d.exento; }
      const saved = await db().save('dte', d);
      saved.xml = DTE.xml(saved, cfg);
      await db().save('dte', saved, { silent: true });
      await db().save('venta', Object.assign({}, venta, { dteId: saved.id, folio: saved.folio }), { silent: true });
      if (f.pct + 1 / Math.max(1, f.total) >= cfg.alertas.foliosPct) VG.ui && VG.ui.toast(`Atención: se ha usado más del ${Math.round(cfg.alertas.foliosPct * 100)}% de los folios de ${TIPOS[tipo]}.`, 'warning');
      VG.events.emit('dte.emitido', { dte: saved, venta });
      return saved;
    },

    /** Nota de crédito (61) que anula/corrige un DTE emitido. */
    async notaCredito(dteRef, razon, montoNeto) {
      const t = VG.calc.tax.totales(montoNeto ?? dteRef.neto, { ila: U.n(dteRef.ila) > 0 });
      const f = DTE.folios(61);
      if (!f.siguiente) throw new Error('No hay folios disponibles para notas de crédito. Carga un rango CAF tipo 61.');
      const nc = await db().save('dte', {
        direccion: 'emitido', tipo: 61, folio: f.siguiente, fecha: U.today(), estado: 'generado', contraparteRut: dteRef.contraparteRut, contraparte: dteRef.contraparte,
        giro: dteRef.giro, direccionContraparte: dteRef.direccionContraparte, comuna: dteRef.comuna, detalle: [{ nombre: razon || 'Anula documento', cantidad: 1, unidad: 'UN', precio: t.neto, monto: t.neto }],
        neto: t.neto, exento: 0, iva: t.iva, ila: t.ila, total: t.total, referencia: { tipo: dteRef.tipo, folio: dteRef.folio, fecha: dteRef.fecha, codigo: montoNeto ? 3 : 1, razon }
      });
      nc.xml = DTE.xml(nc); await db().save('dte', nc, { silent: true });
      return nc;
    },

    /** Registra un DTE recibido desde una compra (alimenta IVA crédito). */
    async registrarRecibido(compra) {
      const prov = db().get('proveedor', compra.proveedorId) || {};
      const tipo = compra.documento === 'factura_exenta' ? 34 : compra.documento === 'nota_credito' ? 61 : 33;
      const existing = db().find('dte', d => d.compraId === compra.id);
      const d = Object.assign(existing || {}, {
        direccion: 'recibido', tipo, folio: Number(compra.folio) || 0, fecha: compra.fecha, estado: existing ? existing.estado : 'aceptado', compraId: compra.id,
        contraparteRut: prov.rut, contraparte: prov.nombre, neto: tipo === 34 ? 0 : U.n(compra.neto), exento: tipo === 34 ? U.n(compra.neto) : U.n(compra.exento), iva: U.n(compra.iva), ila: 0, total: U.n(compra.total),
        detalle: [{ nombre: compra.descripcion || 'Compra', cantidad: U.n(compra.cantidad) || 1, unidad: 'UN', precio: U.n(compra.precioUnitario), monto: U.n(compra.neto) }]
      });
      return db().save('dte', d, { silent: true });
    },

    async cambiarEstado(id, estado) {
      if (!ESTADOS.includes(estado)) throw new Error('Estado no válido.');
      const d = db().get('dte', id);
      const r = await db().save('dte', Object.assign({}, d, { estado, ['fecha_' + estado]: new Date().toISOString() }));
      VG.events.emit('dte.estadoCambiado', { dte: r, estado });
      return r;
    },

    /**
     * XML del DTE con la estructura del esquema SII (EnvioDTE v10):
     * Documento > Encabezado (IdDoc, Emisor, Receptor, Totales) > Detalle > Referencia > TED
     * El nodo TED (timbre) y la firma (Signature) los genera el proveedor con el CAF y certificado digital.
     */
    xml(d, cfg) {
      cfg = cfg || VG.store.config();
      const e = cfg.empresa, t = cfg.tributario;
      const boleta = Number(d.tipo) === 39;
      const emitido = d.direccion === 'emitido';
      const rutE = U.rutSII(emitido ? e.rut : d.contraparteRut), rutR = U.rutSII(emitido ? d.contraparteRut : e.rut);
      const L = [];
      L.push('<?xml version="1.0" encoding="ISO-8859-1"?>');
      L.push('<!-- Generado por Winzer Gestión v' + VG.VERSION + '. Borrador sin timbre ni firma: enviar mediante proveedor autorizado. -->');
      L.push('<DTE version="1.0">');
      L.push(`  <Documento ID="F${d.folio}T${d.tipo}">`);
      L.push('    <Encabezado>');
      L.push('      <IdDoc>');
      L.push(`        <TipoDTE>${d.tipo}</TipoDTE>`);
      L.push(`        <Folio>${d.folio}</Folio>`);
      L.push(`        <FchEmis>${d.fecha}</FchEmis>`);
      if (boleta) L.push('        <IndServicio>3</IndServicio>');
      if (Number(d.tipo) === 52) { L.push('        <TipoDespacho>2</TipoDespacho>'); L.push('        <IndTraslado>1</IndTraslado>'); }
      if (!boleta && Number(d.tipo) !== 52) L.push(`        <FmaPago>${d.formaPago || 1}</FmaPago>`);
      if (d.vencimiento) L.push(`        <FchVenc>${d.vencimiento}</FchVenc>`);
      L.push('      </IdDoc>');
      L.push('      <Emisor>');
      L.push(`        <RUTEmisor>${rutE}</RUTEmisor>`);
      if (boleta) {
        L.push(`        <RznSocEmisor>${x(e.razonSocial)}</RznSocEmisor>`);
        L.push(`        <GiroEmisor>${x(e.giro)}</GiroEmisor>`);
      } else {
        L.push(`        <RznSoc>${x(emitido ? e.razonSocial : d.contraparte)}</RznSoc>`);
        L.push(`        <GiroEmis>${x(emitido ? e.giro : d.giro)}</GiroEmis>`);
        if (emitido) L.push(`        <Acteco>${x(e.acteco)}</Acteco>`);
      }
      L.push(`        <DirOrigen>${x(emitido ? e.direccion : '')}</DirOrigen>`);
      L.push(`        <CmnaOrigen>${x(emitido ? e.comuna : '')}</CmnaOrigen>`);
      L.push('      </Emisor>');
      L.push('      <Receptor>');
      L.push(`        <RUTRecep>${rutR}</RUTRecep>`);
      L.push(`        <RznSocRecep>${x(emitido ? d.contraparte : e.razonSocial)}</RznSocRecep>`);
      if (!boleta) L.push(`        <GiroRecep>${x(emitido ? d.giro || 'Particular' : e.giro).slice(0, 40)}</GiroRecep>`);
      L.push(`        <DirRecep>${x(emitido ? d.direccionContraparte : e.direccion)}</DirRecep>`);
      L.push(`        <CmnaRecep>${x(emitido ? d.comuna : e.comuna)}</CmnaRecep>`);
      L.push('      </Receptor>');
      L.push('      <Totales>');
      if (U.n(d.neto)) L.push(`        <MntNeto>${Math.round(d.neto)}</MntNeto>`);
      if (U.n(d.exento)) L.push(`        <MntExe>${Math.round(d.exento)}</MntExe>`);
      if (U.n(d.neto) && !boleta) L.push(`        <TasaIVA>${(t.tasaIVA * 100).toFixed(0)}</TasaIVA>`);
      if (U.n(d.iva)) L.push(`        <IVA>${Math.round(d.iva)}</IVA>`);
      if (U.n(d.ila)) {
        L.push('        <ImptoReten>');
        L.push('          <TipoImp>25</TipoImp>');
        L.push(`          <TasaImp>${(t.tasaILA * 100).toFixed(1)}</TasaImp>`);
        L.push(`          <MontoImp>${Math.round(d.ila)}</MontoImp>`);
        L.push('        </ImptoReten>');
      }
      L.push(`        <MntTotal>${Math.round(d.total)}</MntTotal>`);
      L.push('      </Totales>');
      L.push('    </Encabezado>');
      (d.detalle || []).forEach((it, i) => {
        L.push('    <Detalle>');
        L.push(`      <NroLinDet>${i + 1}</NroLinDet>`);
        if (Number(d.tipo) === 34) L.push('      <IndExe>1</IndExe>');
        L.push(`      <NmbItem>${x(it.nombre).slice(0, 80)}</NmbItem>`);
        L.push(`      <QtyItem>${U.round(it.cantidad, 4)}</QtyItem>`);
        L.push(`      <UnmdItem>${x(it.unidad || 'UN')}</UnmdItem>`);
        L.push(`      <PrcItem>${U.round(it.precio, 4)}</PrcItem>`);
        if (U.n(d.ila)) L.push('      <CodImpAdic>25</CodImpAdic>');
        L.push(`      <MontoItem>${Math.round(it.monto)}</MontoItem>`);
        L.push('    </Detalle>');
      });
      if (d.referencia) {
        L.push('    <Referencia>');
        L.push('      <NroLinRef>1</NroLinRef>');
        L.push(`      <TpoDocRef>${d.referencia.tipo}</TpoDocRef>`);
        L.push(`      <FolioRef>${d.referencia.folio}</FolioRef>`);
        L.push(`      <FchRef>${d.referencia.fecha}</FchRef>`);
        L.push(`      <CodRef>${d.referencia.codigo || 1}</CodRef>`);
        L.push(`      <RazonRef>${x(d.referencia.razon || 'Anula documento de referencia')}</RazonRef>`);
        L.push('    </Referencia>');
      }
      L.push('    <!-- TED: timbre electrónico generado por el proveedor autorizado con el CAF -->');
      L.push(`    <TmstFirma>${new Date().toISOString().slice(0, 19)}</TmstFirma>`);
      L.push('  </Documento>');
      L.push('</DTE>');
      return L.join('\n');
    },

    /** Validación básica de estructura del XML generado. */
    validarXML(xml) {
      const errs = [];
      try {
        const doc = new DOMParser().parseFromString(xml.replace(/^<\?xml[^>]*\?>/, ''), 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) errs.push('XML mal formado.');
        ['TipoDTE', 'Folio', 'FchEmis', 'RUTEmisor', 'RUTRecep', 'MntTotal'].forEach(t => { if (!doc.getElementsByTagName(t).length) errs.push('Falta el nodo ' + t); });
        const rE = doc.getElementsByTagName('RUTEmisor')[0], rR = doc.getElementsByTagName('RUTRecep')[0];
        if (rE && !U.rutValid(rE.textContent)) errs.push('RUT emisor inválido');
        if (rR && !U.rutValid(rR.textContent)) errs.push('RUT receptor inválido');
      } catch (e) { errs.push('No se pudo validar el XML.'); }
      return errs;
    },

    /** Libro de compras o ventas de un período. */
    libro(direccion, periodo) {
      return db().list('dte', d => d.direccion === direccion && U.month(d.fecha) === periodo && d.tipo !== 52 && d.estado !== 'borrador').sort((a, b) => a.fecha.localeCompare(b.fecha) || a.folio - b.folio);
    },

    descargarXML(d) { U.download(`DTE_T${d.tipo}_F${d.folio}.xml`, d.xml || DTE.xml(d), 'application/xml'); },
    descargarMasivo(docs) {
      const body = docs.map(d => (d.xml || DTE.xml(d)).replace(/^<\?xml[^>]*\?>\n?/, '').replace(/^<!--.*-->\n?/, '')).join('\n');
      U.download('DTE_lote.xml', '<?xml version="1.0" encoding="ISO-8859-1"?>\n<!-- Lote de DTE para envío vía proveedor autorizado -->\n<SetDTE>\n' + body + '\n</SetDTE>', 'application/xml');
    }
  };

  VG.integrations = VG.integrations || {};
  VG.integrations.dte = DTE;
})(window.VG);
