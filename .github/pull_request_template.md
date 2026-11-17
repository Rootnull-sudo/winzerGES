<!-- Título del PR = Conventional Commit, p. ej.: feat(cosecha): registro de cosecha offline. Se usa como mensaje del squash. -->

## Qué cambia y por qué

<!-- 2–4 líneas. Enlaza el issue: Closes #123 -->

## Tipo

- [ ] Módulo migrado desde v1 (`status: 'v2'`)
- [ ] Funcionalidad nueva
- [ ] Corrección
- [ ] Infraestructura / docs

## Checklist

- [ ] `npm run check` pasa en local (formato, tipos, migraciones, tests)
- [ ] Si cambié `schema.ts`: generé la migración **después** de integrar main (`npm run db:rehacer` si hubo conflicto)
- [ ] Permisos: el servidor verifica el rol (no solo la UI) y probé con un rol sin acceso
- [ ] Si es offline: probé crear/editar sin conexión y que sincroniza al volver
- [ ] Textos en español de Chile; fórmulas con su comentario
- [ ] Sin datos reales (RUT, clientes, montos) en código, capturas ni fixtures
- [ ] Actualicé la documentación afectada (`docs/v2/…`)

## Capturas (escritorio y móvil, si hay UI)

## Cómo probarlo

<!-- Pasos concretos para quien revisa: usuario demo, ruta, qué debería ver. -->
