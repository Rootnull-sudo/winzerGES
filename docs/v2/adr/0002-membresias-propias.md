# 0002. Membresías y roles propios; Better Auth solo para identidad

- Estado: Aceptado · Fecha: 2026-11-17

## Contexto
Better Auth trae un plugin de organizaciones con su propio modelo de roles. Winzer ya tiene roles por módulo
(`v c e d x`) heredados de v1 y roles personalizados.

## Decisión
Better Auth maneja usuarios, contraseñas y sesiones. Viñas (`organization`), membresías (`member`),
invitaciones e `org_role` son tablas propias, administradas en `packages/db/src/orgs.ts`.

## Consecuencias
Un solo modelo de permisos (`packages/domain/permissions.ts`), usado igual en UI, Server Actions y sync.
Invitaciones, cambio de rol y selector de viña son código nuestro que hay que mantener.
