# 0014. Planes y cobro por viña

- Estado: Propuesto (falta elegir el proveedor de cobro) · Fecha: 2026-11-17

## Contexto
v2 es un servicio multi-viña. Hay que poder ofrecer planes (qué módulos, cuántos usuarios, cuánto espacio), dar un
periodo de prueba y cobrar de forma recurrente en CLP, sin amarrar el modelo de datos a un proveedor de pagos.

## Decisión
- **`plan`** es global:
  - Campos: `id`, `nombre`, `modulos[]`, `max_usuarios`, `max_gb` y `precio_clp` mensual.
  - Planes iniciales: *piloto* (todo, gratis, para viñas de prueba), *esencial* (Operación + Bodega + Comercial) y
    *completo*.
- **`suscripcion`**, una vigente por viña:
  - Campos: `plan_id`, `estado` (prueba/activa/morosa/cancelada), periodo, `proveedor` e `id_externo`.
  - Crear una viña abre una prueba de 30 días.
- **Control de acceso**:
  - `requireOrg` calcula los módulos habilitados = plan ∩ permisos del rol.
  - El menú y el buscador muestran los módulos fuera del plan como "disponible en …".
  - Con la suscripción morosa: solo lectura después de 15 días de gracia. Nunca se borran datos.
  - Al invitar se valida el límite de usuarios; al subir un archivo, el de almacenamiento.
- **Cobro**:
  - Interfaz `ProveedorCobro` con `crearSuscripcion`, `cancelar` y `portalCliente`.
  - Los webhooks del proveedor se guardan en `evento_cobro` y los procesa un job ([0012](0012-jobs-y-alertas.md)) de
    forma idempotente.
- **Proveedor** (a decidir en F8-1, antes de implementar el cobro real). Requisito: suscripciones recurrentes en CLP
  con tarjetas chilenas y boleta o factura al cliente. Candidatas:

| Opción | A favor | En contra |
|---|---|---|
| Flow | Local, CLP, suscripciones, Webpay | API menos moderna |
| Mercado Pago | Conocido en Chile, suscripciones | Peor experiencia de desarrollo para B2B |
| Stripe | Mejor API y portal de cliente | Verificar disponibilidad para empresas chilenas y la emisión de documentos tributarios |

  La facturación de la propia suscripción (DTE de Winzer al cliente) es aparte y queda fuera de alcance.

## Consecuencias
- El control por plan se implementa en F0-7 sin cobro real: los planes se asignan a mano y el cobro llega en F8.
- Cambiar de proveedor implica implementar otra `ProveedorCobro` y migrar los `id_externo`; el resto no cambia.

## Alternativas consideradas
- **Cobrar fuera de la app (transferencia + factura manual)**: válido para los primeros clientes y compatible con
  este modelo (`proveedor = 'manual'`), pero no escala.
