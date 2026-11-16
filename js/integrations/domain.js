/**
 * integrations/domain.js — Reacciones de dominio entre módulos (suscriptores del event bus).
 *
 * Las vistas de los módulos se cargan bajo demanda (lazy), pero estas reglas de
 * integración deben estar siempre activas, por eso viven aquí y se cargan al inicio.
 * Cada reacción es una consecuencia del sistema, por lo que se guarda con
 * `{system:true}` (no exige que el usuario tenga permiso en el módulo destino).
 *
 * Catálogo completo de eventos y payloads: docs/api-hooks.md
 */
(function (VG) {
  'use strict';
  const U = VG.utils;
  const on = VG.events.on;
  const db = () => VG.db;
  const sys = { system: true, silent: true };

  /** venta.confirmada → inventarios (descuenta stock granel), dte (borrador si se pidió). */
  on('venta.confirmada', async ({ venta }) => {
    if (venta.tipo === 'granel' && venta.estanqueId) {
      await db().save('movBodega', { fecha: venta.fecha, estanqueId: venta.estanqueId, loteId: venta.loteId, litros: -U.n(venta.litros), tipo: 'venta_granel', ref: 'venta:' + venta.id, glosa: 'Venta granel ' + venta.codigo }, sys);
    }
    if (venta.generarDTE && !venta.dteId) {
      try { await VG.integrations.dte.emitirDesdeVenta(venta); }
      catch (e) { VG.ui.toast(e.message, 'warning'); }
    }
    VG.events.emit('inventarios.actualizado', { origen: 'venta' });
  });

  /** venta.anulada → revierte el movimiento de bodega. */
  on('venta.anulada', async ({ venta }) => {
    db().list('movBodega', m => m.ref === 'venta:' + venta.id).forEach(m => db().remove('movBodega', m.id, sys));
  });

  /** compra.registrada → inventarios (ingreso de insumo), dte (documento recibido → IVA crédito). */
  on('compra.registrada', async ({ compra }) => {
    db().list('movInsumo', m => m.ref === 'compra:' + compra.id).forEach(m => db().remove('movInsumo', m.id, sys));
    if (compra.insumoId && U.n(compra.cantidad)) {
      await db().save('movInsumo', { fecha: compra.fecha, insumoId: compra.insumoId, cantidad: U.n(compra.cantidad), tipo: 'compra', ref: 'compra:' + compra.id, costoUnitario: U.n(compra.precioUnitario) }, sys);
      const ins = db().get('insumo', compra.insumoId);
      if (ins && U.n(compra.precioUnitario) && U.n(ins.precio) !== U.n(compra.precioUnitario)) {
        const hist = (ins.historialPrecios || []).concat([{ fecha: compra.fecha, precio: U.n(compra.precioUnitario), proveedorId: compra.proveedorId }]);
        await db().save('insumo', Object.assign({}, ins, { precio: U.n(compra.precioUnitario), historialPrecios: hist }), sys);
      }
    }
    if (['factura', 'factura_exenta', 'nota_credito'].includes(compra.documento)) await VG.integrations.dte.registrarRecibido(compra);
  });

  /** envasado.confirmado → bodega (salida de vino), inventarios (consumo de insumos de envasado). */
  on('envasado.confirmado', async ({ orden }) => {
    const c = VG.calc.financial.costoEnvasado(orden);
    await db().save('movBodega', { fecha: orden.fecha, estanqueId: orden.estanqueId, loteId: orden.loteId, litros: -c.litrosConsumidos, tipo: 'envasado', ref: 'envasado:' + orden.id, glosa: 'Envasado ' + orden.codigo }, sys);
    const fmt = db().get('formato', orden.formatoId) || {};
    const u = U.n(orden.unidades);
    const consumos = [[orden.envaseId, u], [orden.capsulaId, u], [orden.cierreId, u], [orden.etiquetaInsumoId, u], [orden.cajaId, Math.ceil(u / (U.n(fmt.unidadesCaja) || 12))]];
    for (const [id, cant] of consumos) if (id) await db().save('movInsumo', { fecha: orden.fecha, insumoId: id, cantidad: -cant, tipo: 'consumo_envasado', ref: 'envasado:' + orden.id }, sys);
    const lote = db().get('lote', orden.loteId);
    if (lote && VG.calc.inventory.litrosLote(lote.id) < 1) await db().save('lote', Object.assign({}, lote, { estado: 'Envasado' }), sys);
    VG.events.emit('inventarios.actualizado', { origen: 'envasado' });
  });

  /** bodega.entradaRegistrada → fermentacion (crea ficha si el lote no tiene), calendario (estado). */
  on('bodega.entradaRegistrada', async ({ mov }) => {
    const lote = db().get('lote', mov.loteId);
    if (!lote) return;
    if (!db().find('fermentacion', f => f.loteId === lote.id) && mov.origen !== 'vino') {
      await db().save('fermentacion', {
        codigo: 'FA-' + lote.codigo, loteId: lote.id, estanqueId: mov.estanqueId, tipo: lote.tipo, variedad: lote.variedad,
        volumen: U.n(mov.litros), fechaMolienda: mov.fecha, inicioFA: '', brixInicial: '', diasPlanificados: lote.tipo === 'blanco' ? 18 : 10, estado: 'borrador'
      }, sys);
      VG.ui && VG.ui.toast(`Se creó la ficha de fermentación de ${lote.codigo} en borrador.`, 'info');
    }
    if (['Planificado', 'En vendimia'].includes(lote.estado)) await db().save('lote', Object.assign({}, lote, { estado: 'En molienda', fechaMoliendaReal: mov.fecha }), sys);
  });

  /** fermentacion.faIniciada → calendario (estado Fermentando). */
  on('fermentacion.faIniciada', async ({ ficha }) => {
    const lote = db().get('lote', ficha.loteId);
    if (lote && !['Fermentando', 'Macerando', 'FML', 'En guarda', 'Envasado', 'Finalizado'].includes(lote.estado)) await db().save('lote', Object.assign({}, lote, { estado: 'Fermentando', inicioFAReal: ficha.inicioFA }), sys);
  });

  /** fermentacion.faFinalizada → bodega (sugiere trasiego), calendario (actualiza estado del lote). */
  on('fermentacion.faFinalizada', async ({ ficha }) => {
    const lote = db().get('lote', ficha.loteId);
    if (lote) await db().save('lote', Object.assign({}, lote, { estado: ficha.tipo === 'tinto' && !ficha.finFML ? 'FML' : 'En guarda', finFAReal: ficha.finFA }), sys);
    await db().save('tarea', { titulo: `Trasegar lote ${lote ? lote.codigo : ''}: FA finalizada`, descripcion: 'La fermentación alcohólica terminó. Evalúa trasiego/descube y ajuste de SO₂.', modulo: 'bodega', ruta: '#/bodega/movimientos', estado: 'pendiente', fecha: U.today(), rol: 'enologo' }, sys);
  });

  /** cosecha.registroCreado → calendario (lote En vendimia). Costos e históricos se derivan de los datos. */
  on('cosecha.registroCreado', async ({ registro }) => {
    const lote = registro.loteId && db().get('lote', registro.loteId);
    if (lote && lote.estado === 'Planificado') await db().save('lote', Object.assign({}, lote, { estado: 'En vendimia', inicioVendimiaReal: registro.fecha }), sys);
  });

  /** Guardar usuario activo → refresca sesión con los datos nuevos. */
  on('usuario.saved', ({ record }) => { if (VG.auth.current() && VG.auth.current().id === record.id) Object.assign(VG.auth.current(), record); });
})(window.VG);
