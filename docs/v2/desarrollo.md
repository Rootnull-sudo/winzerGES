# Desarrollo: entorno, estructura y convenciones

## Requisitos

- Node.js **22** o superior (`node -v`) y npm 10.
- Docker (para Postgres local).
- Recomendado: VS Code con las extensiones *Prettier* (formatear al guardar), *Tailwind CSS IntelliSense* y *Playwright Test*.

## Primera vez

```bash
git clone https://github.com/Rootnull-sudo/winzerGES.git && cd winzerGES
cp .env.example .env              # valores para desarrollo local; cambia BETTER_AUTH_SECRET
npm install
npm run db:up                     # Postgres 17 en Docker, puerto 5442 (crea el rol winzer_app)
npm run db:migrate                # tablas + RLS + sync
npm run dev                       # http://localhost:3000
# en otra terminal, con la app corriendo (crea los usuarios vía la API de auth):
npm run db:seed
```

Usuarios demo (contraseña `winzer1234`):

| Correo | Viña Demo | Viña Los Robles |
|---|---|---|
| `admin@winzer.test` | Administrador | Administrador |
| `agronomo@winzer.test` | Agrónomo | — |
| `ventas@winzer.test` | Ventas | — |

## Scripts (raíz del repo)

| Script | Qué hace |
|---|---|
| `npm run dev` | App en modo desarrollo (Turbopack) |
| `npm run build` / `npm start` | Build de producción / servirlo |
| `npm run check` | Formato + guardas + tipos + consistencia de migraciones + tests. **Lo mismo que el CI** salvo E2E |
| `npm test` | Tests de `packages/domain` (paridad con v1) y `packages/db` (RLS, sync, importador; requiere Postgres migrado) |
| `npm run test:e2e` | Playwright contra la app en :3000 (ver [testing.md](testing.md)) |
| `npm run format` | Formatea todo con Prettier |
| `npm run guardas` | Reglas de arquitectura (`scripts/guardas.mjs`) |
| `npm run db:up` | Levanta Postgres en Docker |
| `npm run db:migrate` | Aplica migraciones y luego RLS/sync a las tablas que correspondan |
| `npm run db:generate -- --name x` | Genera migración desde `schema.ts` |
| `npm run db:rehacer -- x` | Rehace tus migraciones sobre las de `main` ([colaboracion.md](colaboracion.md#migraciones-de-base-de-datos-en-paralelo)) |
| `npm run db:reset` | Vacía la base **local** (se niega si no es localhost) |
| `npm run db:seed` | Usuarios, viñas y datos demo (idempotente; la app debe estar corriendo) |

## Variables de entorno

| Variable | Uso |
|---|---|
| `DATABASE_URL_ADMIN` | Dueño del esquema: migraciones, seed, tests. **Nunca** en código de `apps/web` (lo impide una guarda). |
| `DATABASE_URL` | Rol `winzer_app` de la app, sujeto a RLS. |
| `BETTER_AUTH_SECRET` | Firma de sesiones. Valor aleatorio de 32+ caracteres; distinto por entorno. |
| `BETTER_AUTH_URL` | URL pública de la app (cookies y redirecciones). |
| `AUTH_RATE_LIMIT=off` | Solo para E2E locales: desactiva el límite de intentos de login. |

Hay un único `.env` en la raíz; `apps/web/next.config.ts` y `packages/db` lo leen. `.env` está en `.gitignore`.

## Estructura del repositorio

```
apps/web/                          Next.js (App Router)
  src/app/
    (auth)/login, (auth)/registro  inicio de sesión y registro
    onboarding/                    elegir o crear viña
    invitacion/[token]/            aceptar invitación
    [org]/                         todo lo de una viña (layout = shell con menú, Ctrl+K, estado de sync)
      page.tsx                     inicio de la viña
      <modulo>/page.tsx            módulo migrado (server component)
      <modulo>/view.tsx            UI del módulo (client component)
      <modulo>/actions.ts          Server Actions (módulos online)
      m/[modulo]/                  aviso para módulos aún en v1
    api/auth/[...all]/             Better Auth
    api/[org]/sync/{pull,push}/    sincronización offline
    api/[org]/import-v1/           importador de respaldos
    actions.ts                     acciones globales (crear viña, aceptar invitación, salir)
  src/components/ui/               design system (Button, Field, Dialog, DataTable, Badge, Stat, Toast…)
  src/components/shell/            layout de la app, navegación, paleta de comandos, contexto de viña
  src/lib/                         auth, sesión, helpers de API, motor offline (lib/offline)
  e2e/                             tests Playwright
  public/sw.js                     service worker (PWA)
packages/domain/                   lógica pura y compartida (cliente + servidor)
  src/num.ts                       números, RUT, formatos CLP
  src/config.ts                    OrgConfig y valores por defecto (tasas, umbrales)
  src/oenology.ts, tax.ts          cálculos portados de v1
  src/modules.ts                   catálogo de módulos y áreas (qué es offline, qué está migrado)
  src/permissions.ts               roles y permisos vcedx
  src/entities/*.ts                esquemas Zod por módulo
  src/sync.ts                      protocolo de sync y entidades offline
  test/                            tests, incluida paridad con v1 (test/legacy.ts)
packages/db/                       todo lo que habla con Postgres (solo servidor)
  src/schema.ts                    tablas Drizzle
  src/tables.ts                    clasificación automática tenant/sync
  src/client.ts                    conexiones (app y admin)
  src/tenancy.ts                   withOrg (fija la viña para RLS)
  src/repo.ts                      upsert/softDelete con permisos, versión y auditoría
  src/sync.ts                      pull/push del servidor
  src/orgs.ts                      viñas, membresías, invitaciones
  src/import-v1.ts                 importador de respaldos v1
  src/ensure.ts, migrate.ts, reset.ts, seed.ts
  drizzle/                         migraciones generadas (no editar a mano)
  test/                            RLS, sync, importador, guardas de esquema
scripts/                           rehacer-migraciones.mjs, guardas.mjs
docs/v2/                           esta documentación
js/, css/, index.html, docs/*.md   v1 (sin cambios mientras se migra)
```

**Regla de dependencias**: `apps/web` → `packages/db` → `packages/domain`. `packages/domain` no depende de
nada del servidor ni del navegador; por eso los mismos esquemas y cálculos corren en ambos lados.
Componentes `'use client'` pueden importar `@winzer/domain` pero **nunca** `@winzer/db`.

## Convenciones de código

- **TypeScript estricto**, ESM. Formato con Prettier (`.prettierrc`: comillas simples, `;`, 160 columnas).
- **Nombres**: dominio en español como en v1 (`cuartel`, `cobro`, `superficie`); infraestructura en inglés
  (`upsert`, `withOrg`, `SyncEngine`). Archivos en minúsculas con guiones.
- **Campos**: mismos nombres que v1 (`js/data/schema.js`, `js/modules/*`) para que el importador sea directo.
  Columnas SQL en `snake_case`, propiedades TS en `camelCase` (Drizzle traduce).
- **Validación**: un solo esquema Zod por entidad en `packages/domain/src/entities/`; se usa en el formulario,
  la Server Action / el push de sync y el importador.
- **Fórmulas**: toda fórmula financiera, tributaria o enológica lleva un comentario con la fórmula (igual que v1).
- **Server vs client**: por defecto server components; `'use client'` solo para interacción. Lecturas en el
  server component con `withOrg`; escrituras en `actions.ts` (online) o `engine.write` (offline).
- **Errores para el usuario**: mensajes en español, accionables ("El RUT no es válido: revisa el dígito
  verificador"), nunca el error técnico. Errores esperados llevan `status` (403/409/422); los demás se loguean.
- **Textos de interfaz** en español de Chile, sin jerga ("Guardar", no "Submit").
- **Comentarios**: explican el *por qué*; cada archivo empieza con un bloque que dice qué es y qué regla protege.

## Agregar una dependencia

`npm install <paquete> -w @winzer/web` (o el workspace que corresponda). Prefiere lo que ya existe en el repo.
Si choca `package-lock.json` al integrar: ver [colaboracion.md](colaboracion.md#zonas-de-conflicto-y-cómo-se-resuelven).

## Problemas comunes

| Síntoma | Causa / solución |
|---|---|
| `Falta la variable de entorno DATABASE_URL` | No copiaste `.env.example` a `.env` |
| La app no muestra datos y no hay errores | La conexión no fijó la viña: la consulta no está dentro de `withOrg` (RLS devuelve vacío) |
| `row-level security policy` al insertar | Estás insertando con un `org_id` distinto de la viña activa |
| `db:seed` falla con `ECONNREFUSED` | La app no está corriendo (el seed crea usuarios vía la API de auth) |
| Después de un rebase, `db:migrate` falla | Tu base tenía una migración que ya no existe: `npm run db:reset && npm run db:migrate` |
| "Demasiados intentos" en E2E | Inicia la app con `AUTH_RATE_LIMIT=off` |
| Cambios offline no aparecen en otra sesión | El pull es cada 30 s o al volver a la pestaña; el botón de estado fuerza una sincronización |
