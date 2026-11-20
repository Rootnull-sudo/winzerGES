# Sincronización offline

Módulos de las áreas **Operación**, **Vinificación y bodega** y **Administración** funcionan sin conexión
(`AREAS[].offline` en `packages/domain/src/modules.ts`). Comercial, Finanzas y Tributario son solo online.

## Piezas

| Pieza | Archivo | Rol |
|---|---|---|
| Protocolo (tipos) | `packages/domain/src/sync.ts` | `Mutation`, `SyncRecord`, `PullResponse`, `PushResult`, `SYNC_ENTITIES` |
| Base local | `apps/web/src/lib/offline/store.ts` | Dexie `winzer:<userId>:<orgId>`: `records`, `outbox`, `issues`, `meta` |
| Motor | `apps/web/src/lib/offline/engine.ts` | `SyncEngine`: `write()`, `sync()` (push → pull), eventos de red |
| Hooks | `apps/web/src/lib/offline/hooks.ts` | `useSync()`, `useSyncState()`, `useEntity(entity)`, `useIssues()` |
| Endpoints | `apps/web/src/app/api/[org]/sync/{pull,push}/route.ts` | Autentican y delegan a `packages/db` |
| Servidor | `packages/db/src/sync.ts` | `pull(actor, cursor)`, `push(actor, mutations)` |
| PWA | `apps/web/public/sw.js`, `src/app/manifest.ts` | Cachea estáticos y páginas visitadas |

## Escritura

```ts
const engine = useSync();
await engine?.write('cuartel', 'upsert', idOrNull, datosDelFormulario);
await engine?.write('cuartel', 'delete', id);
```

1. Valida con el Zod de `SYNC_ENTITIES[entity].schema` (mismo que el servidor) y, si hay campos `unique`, contra
   los registros locales. Lanza `Error` con mensaje en español (y `field`/`issues` para marcar el campo).
2. En una transacción de IndexedDB: guarda el registro con `pending: true` y agrega la mutación a `outbox`
   con `baseVersion` = versión que el servidor confirmó por última vez.
3. Si ya había una mutación pendiente para el mismo registro, la reemplaza (conserva su `baseVersion`). Crear y
   borrar sin conexión se anulan entre sí.
4. Dispara `sync()`; si no hay red, queda en cola.

## Push — `POST /api/<viña>/sync/push`

Cuerpo `{ mutations: Mutation[] }` (máx. 200; el motor envía de a 50). Por cada mutación, en su propia transacción:

- Entidad desconocida → `rejected`.
- `delete` → `softDelete` (permiso `d`).
- `upsert` → Zod, unicidad, permiso `c`/`e`, y si `baseVersion` ≠ versión actual → `conflict` con el registro del servidor.
- Reintento de algo ya aplicado (misma data, versión `base+1`, mismo usuario) → `ok` sin duplicar.
- Después de escribir, las **reacciones** de la entidad (`REACCIONES`, `packages/db/src/reacciones/`) en la misma
  transacción. Si una falla, la mutación entera se rechaza.

Respuesta `{ results: PushResult[] }`. En el cliente: `ok` → se guarda la versión del servidor; `conflict` /
`rejected` → se vuelve a la versión del servidor (o se quita si nunca existió) y se agrega un aviso a `issues`,
que el shell muestra en una franja ("Conflicto · C-04: otro usuario modificó…").

## Pull — `GET /api/<viña>/sync/pull?since=<cursor>`

Devuelve `{ records, cursor, hasMore }` con cambios (incluidos borrados) de todas las entidades offline que el
rol puede **ver**. El cliente pide páginas hasta `hasMore: false` y guarda el cursor en `meta`. Los maestros
transversales marcados `readAll` en `SYNC_ENTITIES` (p. ej. `temporada`) llegan a todos los roles; escribirlos sigue
exigiendo permiso en su módulo.

### Por qué el cursor es `xid:seq` y no solo `seq`

Con transacciones concurrentes, una fila puede recibir `seq = 10`, quedar sin confirmar, mientras otra con
`seq = 11` confirma. Si el cliente lee hasta 11, la fila 10 aparecería después **detrás** del cursor y se perdería.

Solución: cada fila guarda `xid` (id de la transacción, `xid8`). El pull solo entrega filas con
`xid < pg_snapshot_xmin(pg_current_snapshot())` (transacciones ya terminadas) ordenadas por `(xid, seq)`.
Ninguna transacción futura puede tener un `xid` menor que ese límite. Hay un test que lo demuestra
(`packages/db/test/rls.test.ts › una transacción abierta no hace que el cursor se salte filas`).

## Cuándo sincroniza

Al abrir la viña, al volver la conexión (`online`), al volver a la pestaña (`visibilitychange`), cada 30 s,
después de cada `write()`, y al tocar el indicador del header. Estados del indicador: *Sincronizando…* (incluye
la primera sincronización de la sesión), *Al día*, *N por enviar*, *Sin conexión*.

## Reglas de diseño para módulos offline

- **Movimientos append-only** en vez de contadores: una cosecha, un movimiento de bodega, una adición de SO₂ son
  registros nuevos; el stock se **calcula** sumando (como en v1). No hay conflicto posible entre dos inserciones.
- Las reacciones entre módulos (p. ej. envasado → descuenta vino del estanque) ocurren en el **servidor**, en la
  misma transacción del push, nunca en el cliente.
- Gestionar usuarios, roles y configuración requiere conexión.
- El service worker solo sirve páginas ya visitadas: hay que abrir cada módulo una vez con señal.

## Limitaciones conocidas y siguientes pasos

- Los cambios de otros llegan por sondeo (≤ 30 s). Próximo paso: notificación en tiempo real (SSE o Postgres `LISTEN`).
- La resolución de conflictos es "gana el servidor" a nivel de registro; fusión por campo si llega a ser necesario.
- Si la sesión expira estando offline, al volver la red se pide iniciar sesión; la cola se conserva.
