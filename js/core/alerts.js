/**
 * core/alerts.js — Motor de alertas transversales (dashboard y campana de notificaciones).
 * Cada alerta: { level:'error'|'warning'|'info', title, body, href, module }
 * Solo se muestran las alertas de módulos que el usuario puede ver.
 */
(function (VG) {
  'use strict';
  const U = VG.utils;
  const db = () => VG.db;

  function compute() {
    const A = [];
    const cfg = VG.store.config();
    const hoy = U.today();
    const add = (module, level, title, body, href) => A.push({ module, level, title, body, href });
    const Oe = VG.calc.oenology, Inv = VG.calc.inventory, F = VG.calc.financial, T = VG.calc.tax;

    // --- Fermentación: SO2 y desviación
    db().list('fermentacion', f => f.estado !== 'cerrada').forEach(f => {
      const segs = db().list('seguimiento', s => s.fermentacionId === f.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
      const last = segs.find(s => s.so2Libre !== '' && s.so2Libre !== undefined);
      if (last) {
        const st = Oe.estadoSO2(last.so2Libre, f.tipo);
        if (st === 'critico') add('fermentacion', 'error', `Sobre-sulfitado en ${f.codigo}`, `SO₂ libre ${U.dec1(last.so2Libre)} mg/L supera el umbral de alerta (${Oe.rangoSO2(f.tipo).alerta} mg/L).`, '#/fermentacion?id=' + f.id);
        else if (st === 'alto') add('fermentacion', 'warning', `SO₂ libre alto en ${f.codigo}`, `${U.dec1(last.so2Libre)} mg/L sobre el rango suave (${Oe.rangoSO2(f.tipo).min}–${Oe.rangoSO2(f.tipo).max}).`, '#/fermentacion?id=' + f.id);
        else if (st === 'bajo' && f.finFA) add('fermentacion', 'warning', `SO₂ libre bajo en ${f.codigo}`, `${U.dec1(last.so2Libre)} mg/L: evalúa ajuste para proteger el vino.`, '#/fermentacion?id=' + f.id);
      }
      const t = Oe.tiempos(f, segs);
      if (t.alertaDesvio) add('fermentacion', 'warning', `Desviación de fermentación en ${f.codigo}`, `${t.desvio > 0 ? '+' : ''}${t.desvio} días respecto de lo planificado (${f.diasPlanificados} días).`, '#/fermentacion?id=' + f.id);
      if (f.tipo === 'tinto' && f.inicioFML && !f.finFML && U.diffDays(f.inicioFML, hoy) > 45) add('fermentacion', 'warning', `FML prolongada en ${f.codigo}`, `Lleva ${U.diffDays(f.inicioFML, hoy)} días.`, '#/fermentacion?id=' + f.id);
    });

    // --- Carencias de aplicaciones vs fecha de cosecha
    db().list('aplicacion', a => U.n(a.carencia) > 0).forEach(a => {
      const libre = U.addDays(a.fecha, a.carencia);
      const cos = db().find('cosecha', c => c.cuartelId === a.cuartelId && c.fecha >= a.fecha && c.fecha < libre);
      const cu = db().get('cuartel', a.cuartelId);
      if (cos) add('insumos', 'error', `Cosecha dentro del período de carencia (${cu ? cu.codigo : ''})`, `Aplicación del ${U.fmtDate(a.fecha)} con ${a.carencia} días de carencia; se cosechó el ${U.fmtDate(cos.fecha)}.`, '#/insumos/aplicaciones');
      else if (libre > hoy && U.diffDays(hoy, libre) <= 21) add('insumos', 'warning', `Carencia vigente en ${cu ? cu.codigo : 'cuartel'}`, `No cosechar antes del ${U.fmtDate(libre)}.`, '#/insumos/aplicaciones');
    });

    // --- Cajones fuera de rango
    db().list('cosecha', c => VG.store.inSeason(c) && !Oe.cajonValido(c.kg, c.cajones)).forEach(c => add('cosecha', 'warning', 'Peso por cajón fuera de rango', `${U.fmtDate(c.fecha)}: ${U.dec1(U.n(c.kg) / U.n(c.cajones))} kg/cajón (rango ${cfg.enologia.kgCajonMin}–${cfg.enologia.kgCajonMax} kg).`, '#/cosecha?id=' + c.id));

    // --- Desborre sin registrar (temporada en curso, después del 15 de octubre)
    const y = new Date().getFullYear();
    if (hoy >= y + '-10-15') db().list('cuartel').forEach(cu => { if (!db().find('fenologia', f => f.cuartelId === cu.id && Number(f.temporada) === y + 1 && f.desborreInicio)) add('fenologia', 'info', `Registrar desborre de ${cu.codigo}`, `No hay fecha de inicio de desborre para la temporada ${y + 1}.`, '#/fenologia'); });

    // --- Bodega: sobrecapacidad y mermas
    db().list('estanque').forEach(e => { const l = Inv.litrosEstanque(e.id); if (l > U.n(e.capacidad) + 0.5) add('bodega', 'error', `Sobrecapacidad en ${e.codigo}`, `${U.int(l)} L en un estanque de ${U.int(e.capacidad)} L.`, '#/bodega'); });
    db().list('lote').forEach(l => { const b = Inv.balanceLote(l.id); if (b.entradas && b.merma / b.entradas > 0.03) add('bodega', 'warning', `Mermas altas en lote ${l.codigo}`, `${U.pct(b.merma / b.entradas)} de las entradas (${U.int(b.merma)} L).`, '#/bodega/balance'); });
    db().list('ordenEnvasado', o => U.n(o.mermaPct) > 3).forEach(o => add('envasado', 'warning', `Merma de envasado alta (${o.codigo})`, `${U.dec1(o.mermaPct)}% sobre el volumen envasado.`, '#/envasado'));

    // --- Stock bajo y vencimientos
    db().list('insumo').forEach(i => {
      const s = Inv.stockInsumo(i.id);
      if (U.n(i.stockMinimo) && s < U.n(i.stockMinimo)) add('inventarios', 'warning', `Stock bajo: ${i.nombre}`, `Quedan ${U.int(s)} ${i.unidad || ''} (mínimo ${U.int(i.stockMinimo)}).`, '#/inventarios');
      if (i.vencimiento && s > 0) { const d = U.diffDays(hoy, i.vencimiento); if (d < 0) add('inventarios', 'error', `Insumo vencido: ${i.nombre}`, `Venció el ${U.fmtDate(i.vencimiento)}.`, '#/inventarios'); else if (d <= cfg.alertas.stockMinimoDiasVencimiento) add('inventarios', 'warning', `Insumo por vencer: ${i.nombre}`, `Vence en ${d} días.`, '#/inventarios'); }
    });
    const spf = Inv.stockPorFormato();
    db().list('formato', f => U.n(f.stockMinimo)).forEach(f => { const s = (spf[f.id] || { unidades: 0 }).unidades; if (s < U.n(f.stockMinimo)) add('inventarios', 'warning', `Stock bajo de producto ${f.nombre}`, `${U.int(s)} unidades (mínimo ${U.int(f.stockMinimo)}).`, '#/inventarios'); });

    // --- D.O.
    db().list('ordenEnvasado', o => o.declaraDO && (U.n(o.pctUvaZona) < 75 || !o.certificadoDO)).forEach(o => add('envasado', 'error', `Denominación de origen sin respaldo (${o.codigo})`, U.n(o.pctUvaZona) < 75 ? `Declara D.O. con ${U.int(o.pctUvaZona)}% de uva de la zona (mínimo 75%).` : 'Falta el certificado de una entidad autorizada por el SAG.', '#/envasado?id=' + o.id));

    // --- Cumplimiento normativo (patentes, INAPI, certificaciones)
    db().list('cumplimiento', c => c.vencimiento).forEach(c => {
      const d = U.diffDays(hoy, c.vencimiento);
      if (d < 0) add('cumplimiento', 'error', `Vencido: ${c.nombre}`, `Venció el ${U.fmtDate(c.vencimiento)}.`, '#/cumplimiento');
      else if (d <= U.n(c.avisoDias || 30)) add('cumplimiento', 'warning', `Por vencer: ${c.nombre}`, `Vence en ${d} días (${U.fmtDate(c.vencimiento)}).`, '#/cumplimiento');
    });
    db().list('marca', m => m.vencimiento && U.diffDays(hoy, m.vencimiento) <= 180).forEach(m => add('marca', U.diffDays(hoy, m.vencimiento) < 0 ? 'error' : 'warning', `Renovar marca ${m.nombre} (INAPI)`, `Vence el ${U.fmtDate(m.vencimiento)}.`, '#/marca'));

    // --- Calendario tributario / SAG próximos 10 días
    T.calendario(new Date().getFullYear()).concat(T.calendario(new Date().getFullYear() + 1)).filter(i => i.estado !== 'cumplida' && i.dias >= -30 && i.dias <= 10).forEach(i => {
      const mod = i.tipo === 'SAG' || i.tipo === 'Patente' ? 'cumplimiento' : 'tributario';
      add(mod, i.dias < 0 ? 'error' : 'warning', `${i.dias < 0 ? 'Vencido' : 'Vence pronto'}: ${i.nombre}`, i.dias < 0 ? `Venció hace ${-i.dias} días. Márcalo como cumplido si ya se realizó.` : `Vence el ${U.fmtDate(i.fecha)} (en ${i.dias} días).`, i.ruta || '#/tributario/calendario');
    });

    // --- DTE y folios
    db().list('dte', d => d.estado === 'rechazado').forEach(d => add('dte', 'error', `DTE rechazado: T${d.tipo} N°${d.folio}`, `${U.esc(d.contraparte || '')}. Corrige y emite nuevamente.`, '#/dte?id=' + d.id));
    [33, 39, 52, 61].forEach(t => { const f = VG.integrations.dte.folios(t); if (f.total && f.pct >= cfg.alertas.foliosPct) add('dte', f.pct >= 1 ? 'error' : 'warning', `Folios de ${VG.integrations.dte.TIPOS[t]} al ${U.pct(f.pct, 0)}`, 'Solicita un nuevo rango CAF en el SII.', '#/dte/folios'); });

    // --- Conciliación
    db().list('cuentaBanco').forEach(c => {
      const p = db().list('movBanco', m => m.cuentaId === c.id && m.estado === 'pendiente');
      if (p.length) add('conciliacion', 'info', `${p.length} movimientos sin conciliar en ${c.banco}`, `El más antiguo es del ${U.fmtDate(p.map(m => m.fecha).sort()[0])}.`, '#/conciliacion?cuenta=' + c.id);
      const d = db().list('movBanco', m => m.cuentaId === c.id && m.estado === 'diferencia');
      if (d.length) add('conciliacion', 'warning', `Diferencias de conciliación en ${c.banco}`, `${d.length} partidas por ${U.clp(U.sum(d, m => m.monto))}.`, '#/conciliacion?cuenta=' + c.id);
    });

    // --- Cobranza y pagos
    const mora = db().list('venta', v => v.estado !== 'anulada' && v.estadoPago !== 'pagado' && v.vencimiento && v.vencimiento < hoy);
    if (mora.length) add('clientes', 'error', `${mora.length} ventas en mora`, `Total ${U.clp(U.sum(mora, v => v.total))} vencido.`, '#/clientes/cobranza');
    const venc = db().list('compra', c => c.estadoPago !== 'pagado' && c.vencimiento && c.vencimiento <= U.addDays(hoy, 7));
    if (venc.length) add('proveedores', 'warning', `${venc.length} facturas de proveedores por pagar`, `Vencidas o por vencer en 7 días: ${U.clp(U.sum(venc, c => c.total))}.`, '#/proveedores/pagar');

    // --- Finanzas (temporada seleccionada)
    const p = F.periodoAnio(VG.store.state.season);
    const er = F.estadoResultados(p);
    if (er.ingresos > 0) {
      const mb = er.mb / er.ingresos;
      if (mb < cfg.finanzas.margenMinimo) add('financiero', 'warning', 'Margen bruto bajo el umbral', `${U.pct(mb)} vs mínimo ${U.pct(cfg.finanzas.margenMinimo, 0)}.`, '#/financiero');
      const pe = F.puntoEquilibrio(p);
      if (!pe.alcanzado) add('financiero', 'info', 'Punto de equilibrio aún no alcanzado', `Faltan ${U.clp(pe.pePesos - pe.ingresos)} en ventas netas.`, '#/financiero/equilibrio');
    }
    const fc = F.flujoCaja(VG.store.state.season);
    if (fc.negativo) add('financiero', 'error', 'Caja proyectada negativa', `En ${U.monthName(fc.negativo.mes)} el saldo sería ${U.clp(fc.negativo.saldo)}.`, '#/financiero/flujo');

    // --- Tareas del usuario
    const u = VG.auth.current();
    if (u) db().list('tarea', t => t.estado === 'pendiente' && (!t.usuarioId || t.usuarioId === u.id) && (!t.rol || t.rol === u.rol || u.rol === 'admin')).forEach(t => add('usuarios', 'info', 'Tarea: ' + t.titulo, t.descripcion || '', t.ruta || '#/usuarios/tareas'));

    const order = { error: 0, warning: 1, info: 2 };
    return A.filter(a => VG.auth.can(a.module, 'v')).sort((a, b) => order[a.level] - order[b.level]);
  }

  VG.alerts = {
    compute() { return U.memo('alerts_' + (VG.auth.current() || {}).id + VG.store.state.season, compute); }
  };
})(window.VG);
