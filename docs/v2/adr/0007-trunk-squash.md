# 0007. Ramas cortas sobre `main` y squash merge

- Estado: Aceptado · Fecha: 2026-11-17

## Contexto
Dos personas avanzan por separado y necesitan integrar seguido sin perder tiempo en conflictos.

## Decisión
Trunk-based: ramas de 1–3 días desde `main`, rebase diario, PRs < 400 líneas, CI obligatorio, revisión en ≤ 1 día
hábil, squash merge con título Conventional Commits. Detalle en [colaboracion.md](../colaboracion.md).

## Consecuencias
Historial lineal y legible; las notas de versión salen de los títulos de los PRs; los conflictos son chicos.
Exige dividir módulos grandes en varios PRs y no dejar ramas abiertas por semanas.
