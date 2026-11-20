# Cómo migrar un módulo de v1 a v2

Hay dos patrones, con un módulo de referencia cada uno. Mira primero en `packages/domain/src/modules.ts`
si el área del módulo es offline (`operacion`, `bodega`, `administracion`) u online.

| Patrón | Referencia | Lee/escribe |
|---|---|---|
| **Online** | `apps/web/src/app/[org]/clientes/` | Server Component lee con `withOrg`; Server Actions escriben con `upsert` |
| **Offline** | `apps/web/src/app/[org]/catastro/` | Componente cliente lee con `useEntity`; escribe con `engine.write` |

Antes de empezar, lee la ficha del módulo en [modulos.md](modulos.md) y sus tablas en
[modelo-datos.md](modelo-datos.md). El issue de la [hoja de ruta](hoja-de-ruta.md) dice qué tablas crea tu PR.

## Pasos (ambos patrones)

1. **Dominio** — `packages/domain/src/entities/<modulo>.ts`: esquema Zod con los campos de `js/modules/<modulo>/`
   (v1). Usa los mismos nombres de campo que v1 (así el importador es directo). Si el módulo tiene cálculos en
   `js/calc/*`, pórtalos como funciones puras que reciben los datos y la `OrgConfig`, y agrega un test de paridad
   en `packages/domain/test/` con `loadLegacy([...])` (ver `tax.test.ts`).
2. **Tabla** — las de tu issue, tal como están en [modelo-datos.md](modelo-datos.md) (si algo cambia, actualiza
   ese documento en el mismo PR). En `packages/db/src/schema.ts`, en un bloque propio al final (`/* --- <Módulo> --- */`), con
   `...base()` y además `...syncCols()` si es offline. **No hay que escribir SQL ni registrar la tabla en listas**:
   al migrar, toda tabla con `org_id` recibe RLS y toda tabla con `xid` queda sincronizable (ver
   [adr/0006](adr/0006-rls-automatica.md)). Genera la migración **al final, justo antes del PR**:
   ```bash
   npm run db:generate -- --name <modulo>
   npm run db:migrate
   ```
   Si al integrar `main` choca con una migración del otro: `npm run db:rehacer -- <modulo>`
   ([colaboracion.md](colaboracion.md#migraciones-de-base-de-datos-en-paralelo)).
3. **Importador** — agrega la entidad a `IMPORTERS` en `packages/db/src/import-v1.ts` (en orden: maestros antes que
   lo que los referencia; lista en `refs` los campos que apuntan a otras entidades).
4. **Página** — `apps/web/src/app/[org]/<modulo>/page.tsx` con `orgWith(slug, '<modulo>')` y `<NoAccess>`.
5. **Marcar como migrado** — `status: 'v2'` en `MODULES` (`packages/domain/src/modules.ts`). El menú y el buscador
   Ctrl+K lo enlazan solos.
6. **Tests** — un E2E en `apps/web/e2e/` con el flujo principal y, si es offline, una variante con `context.setOffline(true)`.
7. **PR** — reserva antes el módulo con un issue *Migrar módulo*; si necesitas tocar código compartido (`components/ui`,
   `repo`, sync), hazlo en un PR previo y pequeño. Checklist en la plantilla del PR.

## Solo offline

- Registra la entidad en `SYNC_ENTITIES` (`packages/domain/src/sync.ts`) con su `module`, `schema` y `unique`
  (un test verifica que coincida con las tablas que tienen `syncCols()`).
- Lee con `useEntity<T>('<entidad>')` (devuelve `undefined` mientras carga: muestra un esqueleto).
- Escribe con `useSync()?.write('<entidad>', 'upsert' | 'delete', id | null, data)`. Lanza `Error` con el mensaje
  de Zod si los datos son inválidos; muéstralo junto al campo.
- Prefiere **movimientos append-only** (como `movBodega` en v1) a contadores editables: no conflictúan.
- Las reacciones entre módulos de v1 (`js/integrations/domain.js`, p. ej. envasado → descuenta bodega) se hacen en el
  **servidor** dentro de la misma transacción del push o de la Server Action, nunca en el cliente.

## Temporada

Todo listado, KPI o reporte se filtra por la temporada elegida en la barra superior ([adr/0011](adr/0011-temporadas-y-parametros.md)):

- **Página (servidor)**: `const t = await temporadaDe(slug, await searchParams)` (`apps/web/src/lib/temporada.ts`)
  devuelve `{ anio, inicio, fin }`.
- **Viñedo y bodega** guardan `temporadaId` (FK a `temporada`). Al crear un registro, propón la temporada de su
  fecha con `temporadaDeFecha(temporadas, fecha)`; offline las temporadas están en `useEntity('temporada')`.
- **Comercial, finanzas y tributario** no guardan temporada: filtran `fecha` entre `t.inicio` y `t.fin`.
- Enlaces internos: conserva `?t=` (el menú ya lo hace).

## Efectos sobre otros módulos

Cuando una acción escribe en tablas de otro módulo (envasar descuenta bodega e insumos; vender descuenta stock),
no lo hagas en la pantalla ni con varias llamadas a `upsert`. Ver [adr/0010](adr/0010-documentos-y-libros.md):

- **Online**: un **servicio** en `packages/db/src/services/<accion>.ts` que recibe `(tx, actor, input)`, valida y
  escribe todo en la misma transacción. La Server Action solo lo llama.
- **Offline**: una **reacción** en `packages/db/src/reacciones/<modulo>.ts`, registrada con una línea en
  `REACCIONES[<entidad>]` (`reacciones/index.ts`). `sync/push` la ejecuta en la misma transacción, después de
  escribir. Recibe `(tx, actor, { op, previo, registro })`.
  - Tiene que ser idempotente: un reintento no duplica movimientos.
  - Escribe como sistema con `tx`: el permiso ya se verificó sobre la entidad que la disparó.
  - Si lanza un error, la mutación completa se rechaza.
  - Ejemplo: `reacciones/catastro.ts` (un cuartel con variedad nueva la agrega al maestro).
- Si un servicio online escribe una entidad que tiene reacciones, llama a `reaccionar(tx, actor, …)` después de
  escribir, para que el efecto sea el mismo online y offline.
- Códigos y folios (`V-0001`, `OE-2026-0001`, folios DTE): `siguienteCodigo(tx, clave, prefijo)` dentro del servicio,
  nunca `count + 1` (v1 los repetía al borrar).
- Stocks y saldos: no los guardes en columnas; usa o crea una vista `v_*` ([modelo-datos.md](modelo-datos.md#vistas-derivadas-sql)).

## Orden

Lo define [hoja-de-ruta.md](hoja-de-ruta.md): F0 núcleo común → carril A (viñedo y bodega) y carril B (compras,
gastos y personas) en paralelo → comercial → tributario → finanzas y dashboard.
