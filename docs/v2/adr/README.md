# Registro de decisiones de arquitectura (ADR)

Una decisión que cambia cómo se construye el sistema (tecnología, patrón, convención que todos deben seguir)
se registra aquí **antes** de implementarla, en un PR propio `docs(adr): …`. Se discute en el PR.

- Numeración correlativa: `NNNN-titulo-corto.md`. Si dos PRs toman el mismo número, el segundo en fusionarse renumera.
- Una decisión no se borra: si cambia, se escribe un ADR nuevo y el viejo pasa a *Reemplazado por NNNN*.

| # | Decisión | Estado |
|---|---|---|
| [0001](0001-postgres-rls.md) | Una base Postgres con Row-Level Security por viña | Aceptado |
| [0002](0002-membresias-propias.md) | Membresías y roles propios; Better Auth solo para identidad | Aceptado |
| [0003](0003-sync-propio.md) | Sincronización offline propia (Dexie + outbox + cursor xid) | Aceptado |
| [0004](0004-npm-workspaces.md) | npm workspaces sin Turborepo | Aceptado |
| [0005](0005-v1-en-la-raiz.md) | v1 se queda en la raíz durante la migración | Aceptado |
| [0006](0006-rls-automatica.md) | RLS y sync derivados del esquema; sin SQL por tabla | Aceptado |
| [0007](0007-trunk-squash.md) | Ramas cortas sobre `main` y squash merge | Aceptado |
| [0008](0008-direccion-visual-marca-de-fuego.md) | Dirección visual «Marca de fuego» | Reemplazado por 0009 |
| [0009](0009-direccion-visual-v1-afinado.md) | Dirección visual «v1 afinado» | Aceptado |

## Plantilla

```markdown
# NNNN. Título

- Estado: Propuesto | Aceptado | Reemplazado por NNNN
- Fecha: AAAA-MM-DD
- Autores:

## Contexto
Qué problema hay y qué restricciones importan.

## Decisión
Qué vamos a hacer.

## Consecuencias
Qué se vuelve más fácil, qué más difícil, qué queda pendiente.

## Alternativas consideradas
Y por qué no.
```
