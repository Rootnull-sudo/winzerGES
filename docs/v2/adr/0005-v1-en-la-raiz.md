# 0005. v1 se queda en la raíz durante la migración

- Estado: Aceptado · Fecha: 2026-11-17

## Decisión
`index.html`, `js/`, `css/` y `docs/*.md` de v1 no se mueven ni se reformatean (están en `.prettierignore`).
v2 vive en `apps/` y `packages/`. Los tests de paridad leen v1 desde su ubicación actual.

## Consecuencias
La demo de GitHub Pages sigue funcionando y las usuarias actuales no se ven afectadas. Cuando se migre la
mayoría de los módulos, un ADR nuevo decidirá moverla a `legacy/` o retirarla.
