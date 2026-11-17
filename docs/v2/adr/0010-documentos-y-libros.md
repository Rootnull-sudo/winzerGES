# 0010. Documentos con líneas, libros de movimientos, servicios y reacciones

- Estado: Propuesto · Fecha: 2026-11-17

## Contexto
En v1:

- **Ventas, compras y DTE tienen una sola línea.** No se puede vender un vino y un espumante en la misma factura.
- **Los stocks se recalculan en el navegador** desde movimientos. Las referencias entre registros son texto
  (`ref='venta:abc'`).
- **Los efectos entre módulos** (envasar descuenta bodega e insumos; vender descuenta stock) los hacen eventos en
  el cliente, sin transacción.
- **Los pagos parciales no se aplican a documentos.** Por eso "marcar pagada" y la conciliación los ignoran.

En v2 hay servidor, transacciones, RLS y sync offline. Hay que decidir cómo se modelan estos casos antes de migrar
20 módulos.

## Decisión
1. **Documentos con líneas**: `venta`/`venta_linea`, `compra`/`compra_linea`, `dte`/`dte_linea`. Los totales del
   documento se recalculan en el servidor desde las líneas.
2. **Libros de movimientos de solo agregar**: `mov_bodega`, `mov_insumo` y `mov_producto` (nuevo, para las botellas).
   - Cada movimiento lleva `origen_tipo` + `origen_id`, y además una FK específica cuando el origen es frecuente.
   - No se borran: se anulan con un movimiento inverso.
   - Los stocks salen de vistas SQL (`v_stock_*`) con `security_invoker`.
3. **Pagos aplicados**: `cobro_aplicacion` y `pago_aplicacion`. Saldo = total − Σ aplicaciones (`v_saldo_*`).
4. **Servicios** (`packages/db/src/services/`) para las acciones online con efectos: `confirmarEnvasado`,
   `confirmarVenta`, `anularVenta`, `registrarCompra`, `registrarGasto`, `pagarF29`, `registrarDiferencia`.
   - Reciben `(tx, actor, input)` y validan permisos y Zod.
   - Escriben todo dentro de la transacción de `withOrg` y auditan.
   - Las Server Actions solo llaman al servicio.
5. **Reacciones de sync** para las entidades offline: `REACCIONES: Record<entidad, (tx, actor, registro, previo) => …>`.
   - `sync/push` las ejecuta en la misma transacción después del `upsert`. Ejemplos: entrada de bodega → ficha de
     fermentación + estado del lote; aplicación → `mov_insumo`.
   - Deben ser **idempotentes**: un reintento del push no duplica movimientos. Se logra borrando y reescribiendo
     por `origen_id`, o con un upsert por id derivado.

## Consecuencias
- Los cálculos de stock y saldo dejan de estar repartidos por el código: son vistas, con tests contra Postgres.
- Una venta o una compra con varias líneas obliga a cambiar `cobro` (migración de `venta_id` →
  `cobro_aplicacion`, en F5).
- Las reacciones de sync ocurren cuando el dispositivo se conecta. Mientras está offline, el usuario no ve el efecto
  (p. ej. el estado del lote). Es aceptable y queda documentado en la ayuda.
- Hay más tablas, pero cada una tiene una sola responsabilidad.

## Alternativas consideradas
- **Disparadores (triggers) en Postgres para los efectos**: lógica escondida, difícil de testear y de portar.
- **Eventos asíncronos (cola) entre módulos**: consistencia eventual innecesaria para una sola base de datos.
- **Mantener stocks en columnas** (`estanque.litros`): rápido de leer, pero se descuadra con ediciones y sync.
