# 0004. npm workspaces sin Turborepo

- Estado: Aceptado · Fecha: 2026-11-17

## Decisión
Monorepo con npm workspaces (`apps/*`, `packages/*`). Los paquetes se consumen como TypeScript fuente
(`transpilePackages` en Next, `tsx`/Vitest en el resto): no hay paso de build por paquete.

## Consecuencias
Menos herramientas para empezar y builds simples. Si el CI se vuelve lento, agregar Turborepo para caché es un cambio acotado.
