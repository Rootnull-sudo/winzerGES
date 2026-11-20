# Winzer Gestión — guía para agentes y colaboradores

Repositorio con dos versiones:
- **v1** (raíz: `index.html`, `js/`, `css/`): app 100 % frontend con scripts clásicos bajo `window.VG`. No se modifica salvo correcciones; no se reformatea.
- **v2** (`apps/web`, `packages/domain`, `packages/db`): Next.js 16 + Postgres + Drizzle, multi-viña con RLS y módulos offline. Todo el trabajo nuevo va aquí.

Documentación: `docs/v2/README.md` (índice). Antes de cambiar algo, lee el documento del área:
negocio y reglas → `docs/v2/dominio.md` · tablas objetivo → `docs/v2/modelo-datos.md` · qué falta → `docs/v2/hoja-de-ruta.md` · datos/RLS → `docs/v2/datos.md` · offline → `docs/v2/sync-offline.md` · UI → `docs/v2/diseno.md` · flujo de PRs → `docs/v2/colaboracion.md` · migrar un módulo → `docs/v2/migrar-modulo.md`.

## Reglas que no se rompen

- Toda consulta de negocio va dentro de `withOrg(actor.orgId, tx => …)`. Nunca `adminDb()` en `apps/web`.
- Escrituras de negocio solo con `upsert` / `softDelete` de `@winzer/db` (verifican permiso, versión y auditan). Nunca `tx.insert/update/delete` en la app.
- Validación con el esquema Zod de `packages/domain/src/entities/`; el mismo en formulario, servidor, sync e importador.
- Componentes `'use client'` no importan `@winzer/db`.
- Efectos en tablas de otro módulo: servicio en `packages/db/src/services/` (online) o reacción de sync (offline), en la misma transacción. Stocks y saldos se derivan de libros de movimientos, nunca se guardan (ADR 0010).
- Tablas nuevas: las que define `docs/v2/modelo-datos.md` para tu issue (si cambian, actualiza el documento en el mismo PR). `...base()` (+ `...syncCols()` si es offline) en un bloque propio al final de `packages/db/src/schema.ts`. No escribir SQL de RLS: es automático. Generar la migración con `npm run db:generate -- --name <x>`; nunca editar migraciones existentes.
- UI con componentes de `apps/web/src/components/ui` y tokens de `globals.css` (sin colores sueltos). Textos en español de Chile.
- Fórmulas de negocio con comentario de la fórmula; si vienen de `js/calc/*`, test de paridad con `loadLegacy`.
- Nunca datos reales (RUT, clientes, montos) en código, fixtures o capturas.

## Comandos

```bash
npm run check                    # formato, guardas, tipos, migraciones, tests (lo mismo que el CI salvo E2E)
npm run format                   # Prettier
npm run db:up && npm run db:migrate    # Postgres + s3mock (adjuntos)
npm run dev                      # http://localhost:3000 ; luego npm run db:seed (contraseña demo winzer1234)
npm run worker                   # tareas en segundo plano (alertas cada hora); en otra terminal
npm run plan -- <viña> <plan>    # asignar plan a mano (piloto/esencial/completo) mientras no hay cobro
npm run db:generate -- --name x  # migración desde schema.ts
npm run db:rehacer -- x          # rehacer migraciones propias sobre main tras un conflicto
npm run build && AUTH_RATE_LIMIT=off npm start ; npm run test:e2e
```

## Flujo

Rama corta desde `main` (`feat/…`, `fix/…`, `migra/<modulo>`), rebase diario, PR con la plantilla, `npm run check` en verde, squash merge con título Conventional Commits. No editar `CHANGELOG.md` en PRs. Detalle: `docs/v2/colaboracion.md`.
