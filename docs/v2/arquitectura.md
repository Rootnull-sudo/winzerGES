# Winzer v2 — arquitectura de la plataforma en la nube

> Estado: **base funcionando** (rama `v2`). Migrados: Clientes y cobranza (online), Catastro (offline),
> Usuarios y permisos, Configuración con importador de v1. Los otros 22 módulos siguen en v1 (raíz del repo).

## Por qué

v1 es una app 100% frontend: los datos viven en el IndexedDB de un navegador, la "autenticación" es un PIN
local y no hay forma de compartir datos entre personas ni de ofrecerla como servicio (`docs/architecture.md`:
"No exponer en internet con datos reales"). v2 la convierte en un **SaaS multi-viña**: cada viña es una
organización aislada, una persona puede trabajar en varias viñas con roles distintos (el contador o el enólogo
consultor), y los módulos de campo y bodega siguen funcionando **sin señal**.

## Qué se conservó de v1

| v1 | v2 |
|---|---|
| `js/calc/*` (fórmulas documentadas) | `packages/domain` — TypeScript puro; la config se pasa como argumento. **Tests de paridad** cargan el JS de v1 y comparan resultados. |
| `js/auth/permissions.js` (roles `vcedx`) | `packages/domain/src/permissions.ts` — mismos roles; el rol ahora es **por viña**. |
| `js/data/schema.js` (entidad → módulo dueño, `sensitive`) | tablas Drizzle + esquemas Zod + `EntityMeta` |
| `VG.db.save` (permiso + auditoría + eventos) | `packages/db/src/repo.ts` `upsert/softDelete`, en el servidor y en la misma transacción |
| Stocks derivados de movimientos | se mantiene: los movimientos son *append-only* → no generan conflictos al sincronizar offline |
| Tokens `css/tokens.css` | `apps/web/src/app/globals.css` (misma identidad B/N, estados accesibles, paleta de gráficos CVD) |
| `db.dump()` (respaldo JSON) | formato de entrada del **importador v1** |

## Stack

| Capa | Elección |
|---|---|
| App | Next.js 16 (App Router, Server Actions, Route Handlers) + React 19 + TypeScript |
| Datos | PostgreSQL 17 + Drizzle ORM (driver `postgres`) |
| Aislamiento | `org_id` en cada tabla de negocio + **Row-Level Security** |
| Auth | Better Auth (email + contraseña, sesiones en Postgres, rate-limit) |
| UI | Tailwind v4, componentes propios en `apps/web/src/components/ui`, `cmdk`, `lucide-react` |
| Validación | Zod 4, mismo esquema en cliente, servidor, sync e importador |
| Offline | PWA (`public/sw.js`) + Dexie (IndexedDB) + outbox + pull por cursor |
| Tests | Vitest (dominio, RLS, sync) + Playwright (E2E, incluido modo sin conexión y móvil) |
| Monorepo | npm workspaces · Prettier · CI en GitHub Actions |

## Estructura

```
apps/web/            Next.js. app/[org]/<módulo> = páginas; api/[org]/sync/* = sync; lib/offline = motor offline
packages/domain/     Lógica pura (cálculos, permisos, módulos, Zod, protocolo de sync). Sin dependencias de servidor.
packages/db/         Esquema, migraciones (drizzle/), RLS, repo, sync en servidor, orgs/invitaciones, importador v1, seed
js/, css/, index.html  v1 (sin cambios, sigue publicándose como demo)
```

## Multi-viña (tenancy)

- `organization` = viña. `member (org_id, user_id, role)` = quién accede y con qué rol. `invitation` = enlace
  personal (se guarda solo el hash del token, vence en 7 días, exige el mismo correo). `org_role` = roles personalizados.
- La URL lleva la viña: `/vina-demo/catastro`. `requireOrg(slug)` resuelve el actor; si el usuario no es miembro
  responde **404** (no revela que la viña existe).
- **RLS**: la app se conecta como `winzer_app` (sin `BYPASSRLS`). `withOrg(orgId, fn)` abre una transacción y fija
  `app.org_id` con `set_config(..., true)`. La política `tenant_isolation` filtra lectura y escritura. Sin viña
  activa no se ve ninguna fila (falla cerrada). Se aplica **automáticamente** a toda tabla con `org_id` al migrar
  (`packages/db/src/tables.ts` + `ensure.ts`). Tests: `packages/db/test/rls.test.ts`, `schema.test.ts`.
- Las tablas de tenancy (`organization`, `member`, `invitation`) y las de auth no tienen RLS: son el mapa de
  acceso y solo se consultan desde `packages/db/src/orgs.ts`, siempre filtrando por usuario.
- Permisos: se verifican en el servidor en cada escritura (`repo.ts` → `assertCan`) y también al ver una página
  (`orgWith`). La UI solo oculta lo que el rol no puede hacer.
- Auditoría: entidades `sensitive` escriben en `audit_log` dentro de la misma transacción.

## Offline (áreas Operación, Vinificación y bodega, Administración)

Definido en `packages/domain/src/modules.ts` (`AREAS[].offline`). Comercial, Finanzas y Tributario son solo online.

```
UI ──engine.write()──▶ Dexie: records (optimista) + outbox ──POST /api/<viña>/sync/push──▶ repo.upsert (permiso, Zod, versión)
UI ◀──useLiveQuery──── Dexie: records ◀──GET /api/<viña>/sync/pull?since=<cursor>── filas con xid < xmin del snapshot
```

- **Ids** generados en el cliente (UUID) → reintentar un push es idempotente.
- **Cursor sin saltos**: cada fila sincronizable guarda `seq` y `xid8` (transacción que la escribió; un trigger los
  actualiza en cada UPDATE). El pull solo entrega filas de transacciones ya terminadas (`xid < pg_snapshot_xmin`)
  ordenadas por `(xid, seq)`. Una transacción lenta nunca queda detrás del cursor (hay un test para eso).
- **Conflictos**: cada registro tiene `version`. Si se edita offline sobre una versión vieja, gana el servidor, el
  cliente vuelve a la versión del servidor y muestra el aviso ("Conflicto · C-04: otro usuario modificó…").
  Los movimientos (cosecha, bodega, seguimiento) son append-only, así que en la práctica casi no habrá conflictos.
- **Borrados** lógicos (`deleted_at`) para que se propaguen.
- Base local **por usuario y viña** (`winzer:<user>:<org>`): datos de dos viñas nunca se mezclan en un equipo.
- Usuarios/roles/configuración: se leen offline; **gestionarlos requiere conexión** (seguridad).
- El service worker cachea estáticos y las páginas visitadas: hay que abrir cada módulo offline una vez con señal.

## Diseño

Dirección: *Marca de fuego* ([diseno.md](diseno.md), [adr/0008](adr/0008-direccion-visual-marca-de-fuego.md)).
Blanco y negro estricto como el logo WINZER®. El código de cada registro va sellado en un círculo, como la marca a
fuego de una barrica. Títulos en **Gilda Display** (afín a Agatho, la del logo) y datos en **Public Sans** con
cifras tabulares. Tinto/blanco y sincronizado/pendiente se distinguen por forma (punto relleno o vacío, línea
continua o de trazos); el color queda para estados que piden atención. Líneas de 1 px, esquinas rectas. En
móvil, filas anchas con el sello y el botón principal a todo el ancho. Modo oscuro en negro mate.

## Decisiones

Registradas en [adr/](adr/README.md): Postgres + RLS (0001), membresías propias (0002), sync propio (0003),
npm workspaces (0004), v1 en la raíz (0005), RLS y sync derivados del esquema (0006), trunk + squash (0007), dirección visual «Marca de fuego» (0008).

## Documentación relacionada

[desarrollo.md](desarrollo.md) · [colaboracion.md](colaboracion.md) · [datos.md](datos.md) ·
[sync-offline.md](sync-offline.md) · [seguridad.md](seguridad.md) · [diseno.md](diseno.md) · [testing.md](testing.md)

## Correr en local

Ver [desarrollo.md](desarrollo.md#primera-vez). Resumen: `cp .env.example .env && npm install && npm run db:up &&
npm run db:migrate && npm run dev`, y en otra terminal `npm run db:seed` (contraseña demo `winzer1234`).

## Próximos pasos (fuera de esta etapa)

- Migrar los 22 módulos restantes: ver [migrar-modulo.md](migrar-modulo.md).
- Despliegue: Vercel (región `gru1`) + Neon Postgres (`sa-east-1`), con el rol `winzer_app` y migraciones en CI.
- Correo transaccional (invitaciones, recuperar contraseña), verificación de email.
- Jobs en segundo plano (alertas de SO₂, vencimientos tributarios): pg-boss o Inngest.
- DTE real vía proveedor de facturación; archivos (etiquetas, cartolas) en S3/R2.
- Planes y facturación por viña; observabilidad (Sentry); backups/PITR de la base.
- Notificación de cambios en tiempo real (hoy el pull es cada 30 s o al volver a la pestaña).
