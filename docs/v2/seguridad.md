# Seguridad: autenticación, permisos y aislamiento

## Autenticación (Better Auth)

- Configuración: `apps/web/src/lib/auth.ts`. Rutas: `/api/auth/*`. Cliente: `lib/auth-client.ts`.
- Correo + contraseña (mínimo 8), sesiones de 30 días en la tabla `session`, cookie httpOnly.
- **Límite de intentos** activo (anti fuerza bruta). Solo se desactiva con `AUTH_RATE_LIMIT=off` para E2E locales.
- `getSession()` / `requireUser()` (`lib/session.ts`) en server components y acciones; `apiActor()` (`lib/api.ts`)
  en route handlers.
- Pendiente: verificación de correo y recuperación de contraseña (requiere proveedor de correo).

## Autorización: tres capas

1. **Membresía** — `requireOrg(slug)` / `actorFor()`: el usuario debe ser miembro activo de la viña de la URL.
   Si no, **404** (no revela que la viña existe).
2. **Rol por módulo** — permisos `v c e d x` (ver, crear, editar, eliminar, exportar) por módulo, definidos en
   `packages/domain/src/permissions.ts` (mismos roles que v1: admin, enólogo, agrónomo, administrativo, ventas,
   auditor) más roles personalizados por viña (`org_role`).
   - Páginas: `orgWith(slug, modulo)` → `<NoAccess>` si no puede ver.
   - Escrituras: `repo.upsert/softDelete` llaman `assertCan` en el servidor (también en el push de sync).
   - Plan de la viña: el permiso efectivo es rol ∩ plan (`actor.acceso`, ADR 0014). Fuera del plan no se ve ni se
     escribe; en solo lectura (suscripción vencida tras la gracia) solo se ve y exporta.
   - UI: `useCan()` solo oculta botones; **nunca es la protección**.
3. **Aislamiento de datos** — RLS en Postgres ([datos.md](datos.md#cómo-funciona-el-aislamiento-rls)): aunque
   falle 1 o 2, una consulta no puede leer ni escribir datos de otra viña.

## Invitaciones

Token aleatorio de 24 bytes en el enlace; en la base solo su **hash SHA-256**. Vence en 7 días, se usa una vez y
exige iniciar sesión con el **mismo correo** invitado. Crear invitaciones requiere `usuarios:c`; cambiar roles
`usuarios:e`; nadie puede quitarse a sí mismo el rol de administrador.

## Auditoría

Entidades con `sensitive: true` registran crear/editar/eliminar en `audit_log` (usuario, campos cambiados) dentro
de la misma transacción: si la escritura falla, no queda auditoría huérfana, y viceversa.

## Reglas que verifica el CI (`scripts/guardas.mjs`)

- `apps/web` no usa `adminDb` (saltaría RLS).
- Ningún componente `'use client'` importa `@winzer/db`.
- La app no escribe con `tx.insert/update/delete` directo: usa `upsert/softDelete` (permisos + versión + auditoría).
- `test/schema.test.ts`: toda tabla con `org_id` tiene RLS forzada.

## Datos y secretos

- `.env` nunca al repositorio; `BETTER_AUTH_SECRET` distinto por entorno.
- Nunca datos reales (RUT, clientes, montos, DTE) en commits, issues, capturas ni fixtures de test.
- El importador procesa el respaldo en memoria y no guarda el archivo.

## Reportar una vulnerabilidad

No abras un issue público: escribe directamente al otro mantenedor. Se corrige en una rama privada y se publica
la corrección antes de describir el problema.
