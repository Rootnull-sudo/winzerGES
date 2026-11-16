# Cómo crear un módulo nuevo

Agregar un módulo **no requiere modificar el núcleo**: se crea una carpeta, se define el manifiesto y se registra en `_registry.js`. Ejemplo: un módulo de **Barricas y crianza**.

## 1. Crear la carpeta y el archivo

```
js/modules/barricas/index.js
```

(Si el módulo crece, sepáralo como `catastro/`: `schema.js` + `view.js` + `index.js`, y declara `files` en el manifiesto.)

## 2. Registrar el manifiesto en `js/modules/_registry.js`

```js
{ id: 'barricas', name: 'Barricas y crianza', icon: 'tank', area: 'bodega', route: '/barricas',
  dependencies: ['bodega'],                      // si falta, el sistema avisa y no rompe
  menu: [{ label: 'Barricas', route: '/barricas' }, { label: 'Rellenos', route: '/barricas/rellenos' }],
  provides: ['barricas.rellenoRegistrado'],      // eventos que publica
  consumes: ['bodega.trasiegoRegistrado'] }      // eventos que escucha
```

Campos del manifiesto:

| Campo | Uso |
|---|---|
| `id` | Identificador único (carpeta, ruta, permisos) |
| `name`, `icon`, `area` | Menú lateral (áreas: `inicio`, `operacion`, `bodega`, `comercial`, `finanzas`, `tributario`, `administracion`) |
| `route` | Ruta hash (`#/barricas`) |
| `files` | Opcional: archivos a cargar en orden (por defecto `['index.js']`) |
| `dependencies` | Módulos requeridos |
| `menu` | Submenú (también se usa para pestañas con `UI.moduleTabs(ctx)`) |
| `provides` / `consumes` | Documentación de eventos |

## 3. Dar permisos a los roles

En `js/auth/permissions.js` agrega el id a `MODS` (el administrador y el auditor lo reciben automáticamente) y a los roles que corresponda, por ejemplo `enologo: { ..., barricas: 'vcedx' }`. Los roles personalizados se ajustan desde *Usuarios › Roles y permisos*.

## 4. Declarar entidades (con versión)

Desde el propio módulo, en `onInstall` o al cargar el archivo:

```js
VG.schema.define('barrica', {
  module: 'barricas', label: 'Barrica', version: 1, sensitive: false,
  display: r => r.codigo,
  migrations: {}   // ej. 2: r => Object.assign({ tostado: 'medio' }, r)
});
```

Para agregar un campo más adelante: sube `version` a 2 y agrega `migrations: { 2: r => ({ ...r, nuevoCampo: valorPorDefecto }) }`. Se aplica sola al iniciar.

## 5. Implementar los hooks

```js
(function (VG) {
  'use strict';
  const U = VG.utils, UI = VG.ui;

  VG.schema.define('barrica', { module: 'barricas', label: 'Barrica', display: r => r.codigo });

  VG.registry.implement('barricas', {
    /** Se ejecuta una sola vez, la primera vez que se carga el módulo (datos maestros, etc.). */
    async onInstall({ db }) { },

    /** Monta la vista. ctx = { el, id, sub, rest, query, manifest, navigate, refresh } */
    async onMount(ctx) {
      UI.crud(ctx.el, {
        entity: 'barrica', moduleId: 'barricas', query: ctx.query,
        title: 'Barricas y crianza', crumbs: [['Vinificación y bodega']], tabs: UI.moduleTabs(ctx),
        fields: [
          { key: 'codigo', label: 'Código', required: true },
          { key: 'roble', label: 'Roble', type: 'select', options: ['Francés', 'Americano'] },
          { key: 'capacidad', label: 'Capacidad', type: 'number', unit: 'L', min: 1, required: true },
          { key: 'loteId', label: 'Lote', type: 'ref', ref: 'lote' }
        ],
        columns: [
          { key: 'codigo', label: 'Código' }, { key: 'roble', label: 'Roble' },
          { key: 'capacidad', label: 'Capacidad', num: true, render: r => U.lt(r.capacidad) }
        ],
        liveCalc: v => `<h4>Cálculo</h4><dl><dt>Barricas de 225 L</dt><dd>${U.dec1(U.n(v.capacidad) / 225)}</dd></dl>`,
        afterSave: (r, isNew) => isNew && VG.events.emit('barricas.rellenoRegistrado', { barrica: r })
      });
    },

    /** Limpieza al salir (desuscribir eventos, timers). */
    async onUnmount(ctx) { }
  });
})(window.VG);
```

`UI.crud` entrega gratis: tabla con búsqueda, filtros, orden, paginación, selección múltiple, menú ⋯ por fila, exportación CSV, estado vacío, modal con validación en tiempo real, borrador automático, confirmación al eliminar y toasts.

## 6. Escuchar eventos de otros módulos

Las vistas se cargan bajo demanda, así que una regla que debe estar **siempre activa** (p. ej. "al trasegar, actualizar la barrica") va en `js/integrations/domain.js` o en un archivo propio cargado en `index.html`:

```js
VG.events.on('bodega.trasiegoRegistrado', async ({ salida, entrada }) => { /* … */ });
```

Documenta tus eventos en [api-hooks.md](api-hooks.md).

## 7. Probar

1. `index.html?dev=1`, carga datos demo y navega a `#/barricas`.
2. Revisa la consola (sin errores) y prueba con un rol sin permisos.
3. Agrega una entrada en `CHANGELOG.md`.

## Componentes útiles de `VG.ui`

| Función | Para qué |
|---|---|
| `UI.page(el, {title, desc, crumbs, actions, tabs})` | Encabezado estándar; devuelve el contenedor de contenido |
| `UI.crud(el, opciones)` | Página CRUD completa |
| `UI.table(el, {rows, columns, ...})` | Tabla de datos |
| `UI.formModal({title, fields, values, onSave, liveCalc})` | Formulario en modal (Promise) |
| `UI.confirm({title, message, danger})` | Confirmación (Promise<boolean>) |
| `UI.toast(msg, 'success'|'warning'|'error'|'info')` | Notificación |
| `UI.kpi({...})`, `UI.alert(...)`, `UI.badge(...)`, `UI.empty(...)`, `UI.tip(...)` | Piezas visuales |
| `VG.charts.line / bar / hbar / stack` | Gráficos SVG |

Tipos de campo: `text`, `number`, `money`, `date`, `month`, `select`, `ref` (registro de otra entidad), `multiref`, `checkbox`, `textarea`, `rut` (valida dígito verificador), `email`, `password`, `computed`. Propiedades: `required`, `min`, `max`, `step`, `unit`, `help` (tooltip ?), `hint`, `section`, `showIf(v)`, `refFilter(r, v)`, `validate(valor, todos)`, `onChangeSet(v) → {otrosCampos}`.
