# Arquitectura de Winzer Gestión

## Principios

1. **Cero instalación.** `index.html` se abre con doble clic. Por eso se usan *scripts clásicos* (no ES modules): los navegadores bloquean `import` bajo `file://`. Todo cuelga del espacio de nombres global `VG`.
2. **Offline-first.** Los datos viven en IndexedDB (respaldo automático en localStorage si no está disponible). No hay llamadas de red.
3. **Módulos desacoplados.** Cada módulo es una carpeta en `js/modules/<id>/` que se carga bajo demanda. Los módulos nunca se importan entre sí: comparten datos vía `VG.db`/`VG.store` y se coordinan con eventos (`VG.events`).
4. **Stocks derivados, no contadores.** El vino en estanques, el producto terminado y los insumos se calculan sumando movimientos (`movBodega`, `movInsumo`, órdenes y ventas). El balance de masa siempre cuadra y es auditable.
5. **Cálculos en una capa propia** (`js/calc/`), puros y documentados con sus fórmulas.

## Capas

```
┌──────────────────────────────────────────────────────────────┐
│ index.html                                                   │
├──────────────────────────────────────────────────────────────┤
│ core/app.js      arranque, login, onboarding, layout,        │
│                  búsqueda Ctrl+K, notificaciones, tema       │
│ core/router.js   #/modulo/subruta?param → carga y monta      │
│ core/ui.js       toasts, modales, formularios, tablas, CRUD  │
│ core/charts.js   gráficos SVG sin dependencias               │
│ core/alerts.js   motor de alertas transversales              │
├──────────────────────────────────────────────────────────────┤
│ modules/_registry.js  manifiestos (menú, rutas, deps)        │
│ modules/<id>/index.js hooks onInstall / onMount / onUnmount  │
├──────────────────────────────────────────────────────────────┤
│ integrations/domain.js  reacciones entre módulos (eventos)   │
│ integrations/dte.js     XML SII, folios, libros              │
│ integrations/recon.js   cartolas y conciliación              │
├──────────────────────────────────────────────────────────────┤
│ calc/financial.js  costos, ER, ratios, PE, flujo de caja     │
│ calc/tax.js        IVA, ILA, PPM, F29, IUSC, Renta           │
│ calc/oenology.js   SO₂, Brix, velocidad FA, grados día       │
│ calc/inventory.js  stock de estanques, lotes, PT, insumos    │
├──────────────────────────────────────────────────────────────┤
│ auth/auth.js, auth/permissions.js                            │
│ core/store.js (estado + configuración)  core/events.js (bus) │
│ data/db.js (IndexedDB) data/schema.js (entidades/migraciones)│
│ data/backup.js  data/seed.js (demo, carga diferida)          │
│ core/utils.js (formatos, RUT, CSV, SHA-256)                  │
└──────────────────────────────────────────────────────────────┘
```

## Flujo de datos

```
UI (módulo) ──VG.db.save()──▶ db.js ──▶ IndexedDB
                 │              ├─ valida permisos del rol (no solo en la UI)
                 │              ├─ registra auditoría si la entidad es sensible
                 │              └─ emite data.saved / <entidad>.saved
                 └──VG.events.emit('venta.confirmada')──▶ domain.js
                                                           ├─ movBodega (granel)
                                                           └─ dte.emitirDesdeVenta()
F29, ER, ratios, alertas ◀── se recalculan a partir de los datos (memoizados por versión de db)
```

- **Lecturas** síncronas desde una caché en memoria cargada al iniciar (rápido para miles de registros).
- **Memoización:** `VG.utils.memo(clave, fn)` invalida automáticamente cuando cambia `VG.db.version`.

## Persistencia y migraciones

- Un único object store `records` (clave `id`, índice `_e` = entidad). Agregar entidades no requiere subir la versión de IndexedDB.
- Cada registro guarda `_v` (versión de su esquema). Si `schema.js` declara una versión mayor, `db.init()` aplica las funciones `migrations[n]` en orden y guarda el resultado. Ejemplo real: `cuartel` v1 → v2 agrega `valle`.
- Registros de ejemplo llevan `_demo: true` (para "Borrar datos demo").

## Seguridad

- PIN/contraseña con SHA-256 (sal = id de usuario) vía `crypto.subtle` o implementación JS de respaldo.
- Sesión en `sessionStorage` (sobrevive recargas, no el cierre del navegador). Bloqueo por inactividad configurable.
- Permisos: `VG.permissions` define, por rol y módulo, las letras `v c e d x`. `db.save/remove` verifica el permiso del módulo dueño de la entidad.
- **Limitación:** es autenticación local. Cualquiera con acceso al navegador puede inspeccionar IndexedDB. No exponer en internet con datos reales.

## Diseño (UX/UI)

- Tokens en `css/tokens.css` (paleta blanco y negro de Winzer Gestión, estados, espaciado 4/8/12/16/24/32, radios, sombras). Modo oscuro con `[data-theme="dark"]`.
- Colores de estado (verde/amarillo/rojo/azul) siempre acompañados de ícono o texto.
- Gráficos: orden categorial fijo `--chart-1..5`, validado para daltonismo (protan/deután/tritán) en claro y oscuro; un solo eje Y; leyenda con ≥ 2 series; tooltip en cada marca.
- Formularios: validación en tiempo real junto al campo, cálculos en vivo, borradores en `localStorage` y aviso antes de perder cambios.
- `@media print` para exportar a PDF con `window.print()`.

## Eventos del sistema

Catálogo completo con payloads: [api-hooks.md](api-hooks.md).
