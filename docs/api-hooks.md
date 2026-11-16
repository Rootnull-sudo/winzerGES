# Catálogo de eventos y hooks

Los módulos se comunican **solo** mediante el event bus (`js/core/events.js`). Nombres estables con el formato `<dominio>.<acción>`.

```js
const off = VG.events.on('venta.confirmada', ({ venta }) => { /* … */ });
VG.events.emit('venta.confirmada', { venta });
off(); // desuscribir
```

Un error dentro de un suscriptor se registra en consola y no interrumpe a los demás. Con `index.html?dev=1` cada evento se registra en consola.

## Eventos genéricos de datos (los emite `db.js`)

| Evento | Payload |
|---|---|
| `data.saved` | `{ entity, record, isNew }` o `{ entity, many: true }` |
| `data.removed` | `{ entity, id, record }` |
| `<entidad>.saved` | `{ record, isNew, before }` — ej. `cuartel.saved` |
| `<entidad>.removed` | `{ id, record }` |
| `db.migrated` | `{ count }` — al aplicar migraciones de esquema |
| `db.restored` | `{}` — tras restaurar un respaldo |

## Eventos de dominio

| Evento | Publica | Escuchan (en `integrations/domain.js` u otros) | Payload |
|---|---|---|---|
| `catastro.cuartelCreado` | catastro | — (disponible para extensiones) | `{ cuartel }` |
| `insumos.aplicacionRegistrada` | insumos | — | `{ aplicacion }` |
| `cosecha.registroCreado` | cosecha | calendario (lote → *En vendimia*); costos e inventarios se derivan de los datos | `{ registro }` |
| `cosecha.costoCalculado` | cosecha | — | `{ registro, costo: { jornales, otros, total, porKg } }` |
| `lote.estadoCambiado` | calendario | — | `{ lote, anterior }` |
| `bodega.entradaRegistrada` | bodega | fermentación (crea ficha en borrador), calendario (lote → *En molienda*) | `{ mov }` |
| `bodega.trasiegoRegistrado` | bodega | — | `{ salida, entrada }` |
| `fermentacion.faIniciada` | fermentación | calendario (lote → *Fermentando*) | `{ ficha }` |
| `fermentacion.faFinalizada` | fermentación | calendario (lote → *FML* o *En guarda*), usuarios (tarea "Trasegar") | `{ ficha }` |
| `fermentacion.so2Agregado` | fermentación | — | `{ ficha, adicion }` |
| `vinificacion.aditivoAplicado` | vinificación | — | `{ aditivo }` |
| `laboratorio.analisisRegistrado` | laboratorio | — | `{ analisis }` |
| `envasado.confirmado` | envasado | bodega (salida de vino), inventarios (consumo de botellas, corchos, cápsulas, cajas, etiquetas), calendario (lote → *Envasado*) | `{ orden }` |
| `venta.confirmada` | ventas | inventarios/bodega (descuenta granel), dte (genera DTE si `venta.generarDTE`) | `{ venta, isNew }` |
| `venta.anulada` | ventas | bodega (revierte movimiento) | `{ venta }` |
| `cobro.registrado` | ventas, clientes | conciliación (queda como candidato) | `{ venta, monto }` |
| `compra.registrada` | proveedores | inventarios (ingreso y precio del insumo), dte (DTE recibido → IVA crédito) | `{ compra }` |
| `gasto.registrado` | administración | — (el IVA crédito del gasto se registra como DTE recibido) | `{ gasto }` |
| `remuneracion.calculada` | administración | — (F29 lee impuesto único) | `{ periodo }` |
| `dte.emitido` | dte | — | `{ dte, venta }` |
| `dte.estadoCambiado` | dte | — | `{ dte, estado }` |
| `conciliacion.actualizada` | conciliación | — | `{ cuentaId, n? }` |

## Eventos del sistema

| Evento | Payload |
|---|---|
| `auth.login` / `auth.logout` | `{ user }` / `{}` |
| `auth.locked` / `auth.unlocked` | bloqueo por inactividad |
| `season.changed` | `{ season }` |
| `route.changed` | `{ id, sub }` |
| `registry.changed` | `{ id }` — al agregar un manifiesto en tiempo de ejecución |
| `inventarios.actualizado` | `{ origen }` |

## Hooks de módulo

| Hook | Cuándo | Recibe |
|---|---|---|
| `onInstall(ctx)` | Una sola vez, la primera vez que se carga el módulo | `{ db, manifest }` |
| `onMount(ctx)` | Cada vez que se navega a la ruta | `{ el, id, sub, rest, query, manifest, navigate, refresh }` |
| `onUnmount(ctx)` | Al salir de la ruta | el mismo `ctx` |

## Payloads de ejemplo

```json
// venta.confirmada
{ "venta": { "id": "ven_x1", "codigo": "V-0031", "tipo": "envasado", "fecha": "2026-11-13",
  "clienteId": "cli_rest", "canal": "restaurante", "ordenEnvasadoId": "oe_d1f", "formatoId": "fmt_075",
  "loteId": "lot_sb26", "cantidad": 24, "litros": 18, "precio": 7500, "neto": 180000, "iva": 34200,
  "ila": 36900, "total": 251100, "costoUnitario": 1332, "documento": "factura", "generarDTE": true,
  "estadoPago": "pendiente", "estado": "confirmada" }, "isNew": true }

// envasado.confirmado
{ "orden": { "id": "oe_d1f", "codigo": "OE-2026-03", "loteId": "lot_sb26", "estanqueId": "est_e01",
  "formatoId": "fmt_075", "unidades": 8000, "mermaPct": 1.5, "litrosConsumidos": 6090,
  "costoUnitario": 1332, "costoPartes": { "vino": 279, "envase": 430, "etiqueta": 147, "capsula": 58,
  "cierre": 170, "caja": 73, "manoObra": 181, "energia": 18 }, "estado": "confirmada" } }

// compra.registrada
{ "compra": { "id": "com_x", "fecha": "2026-10-15", "proveedorId": "prv_cris", "documento": "factura",
  "folio": 4130, "insumoId": "ins_bot750", "cantidad": 6000, "precioUnitario": 445,
  "neto": 2670000, "iva": 507300, "total": 3177300, "estadoPago": "pendiente" } }

// fermentacion.faFinalizada
{ "ficha": { "id": "fer_sb26", "codigo": "FA-L-2026-SB", "loteId": "lot_sb26", "tipo": "blanco",
  "inicioFA": "2026-03-09", "finFA": "2026-03-27", "diasPlanificados": 18 } }
```
