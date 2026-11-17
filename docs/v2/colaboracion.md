# Trabajar en conjunto: ramas, pull requests e integración

Este documento define **cómo avanzamos los dos por separado sin pisarnos** y cómo integramos con
pull requests de forma rápida. La idea central: **ramas cortas sobre `main`, PRs pequeños, y que las
herramientas resuelvan los conflictos repetitivos** (formato, migraciones, registros) para que la
revisión se concentre en lo que importa.

- [Resumen en 10 reglas](#resumen-en-10-reglas)
- [Configuración inicial (una vez)](#configuración-inicial-una-vez)
- [El ciclo de un cambio](#el-ciclo-de-un-cambio)
- [Cómo nos repartimos el trabajo](#cómo-nos-repartimos-el-trabajo)
- [Zonas de conflicto y cómo se resuelven](#zonas-de-conflicto-y-cómo-se-resuelven)
- [Migraciones de base de datos en paralelo](#migraciones-de-base-de-datos-en-paralelo)
- [Revisar un PR](#revisar-un-pr)
- [Qué hace el CI](#qué-hace-el-ci)
- [Versiones y releases](#versiones-y-releases)
- [Chuleta de comandos](#chuleta-de-comandos)

---

## Resumen en 10 reglas

1. **`main` siempre funciona.** Nadie hace push directo a `main`; todo entra por PR con el CI en verde.
2. **Ramas cortas** desde `main`: `tipo/tema` (`feat/cosecha-offline`, `fix/rut-k`). Vida ideal: 1–3 días.
3. **Integra `main` todos los días** en tu rama con `git pull --rebase origin main`. Conflictos chicos y frecuentes > uno enorme al final.
4. **Un módulo, una persona.** Antes de empezar un módulo, resérvalo con un issue *Migrar módulo* y asígnatelo.
5. **El código compartido va en su propio PR pequeño** (componentes `ui/`, `packages/domain`, `repo`, sync). Avisa al otro y fusiónalo primero.
6. **Las migraciones se generan al final** y nunca se fusionan a mano: si chocan, `npm run db:rehacer -- <nombre>`.
7. **`npm run check` antes de pedir revisión.** Si pasa en local, pasa en CI.
8. **PR en borrador temprano** para que el otro vea en qué andas; "Listo para revisión" cuando el CI esté verde.
9. **Revisión en ≤ 1 día hábil.** Comentarios bloqueantes se marcan como tal; lo demás es sugerencia.
10. **Squash merge** con título en Conventional Commits. El historial de `main` queda en una línea por cambio.

---

## Configuración inicial (una vez)

### Repositorio

El repositorio es `Rootnull-sudo/winzerGES`. Lo más simple es trabajar **los dos en el mismo repo**
(sin forks): el dueño agrega al otro como colaborador en *Settings › Collaborators*. Así los PRs corren
el CI con los mismos permisos y las ramas son visibles para ambos.

> Si prefieren forks: cada uno trabaja en su fork, agrega el original como `upstream`
> (`git remote add upstream https://github.com/Rootnull-sudo/winzerGES.git`) y en todos los comandos de
> este documento reemplaza `origin/main` por `upstream/main`. Para el script de migraciones: `BASE=upstream/main`.

### Llevar v2 a `main` (primer PR)

Hoy v2 vive en la rama `v2`. El primer paso es abrir el PR **`v2` → `main`**. v1 sigue en la raíz y la demo
de GitHub Pages no cambia. Desde ese momento ya no hay rama `v2`: todo trabajo sale de `main`.

### Proteger `main` (Settings › Branches › Add rule › `main`)

- ✅ Require a pull request before merging · 1 aprobación · Dismiss stale approvals
- ✅ Require review from Code Owners (`.github/CODEOWNERS`: el código compartido lo revisa el otro)
- ✅ Require status checks: `Formato, tipos y migraciones`, `Tests (dominio + Postgres)`, `E2E (Playwright)`
- ✅ Require branches to be up to date before merging
- ✅ Require linear history · Allow **squash merging** only (desactivar merge commits y rebase merging)
- ✅ Automatically delete head branches

### Entorno local de cada uno

Cada persona tiene **su propia base Postgres en Docker** (nunca compartimos una base de desarrollo).
Pasos en [desarrollo.md](desarrollo.md#primera-vez). Datos: solo los demo del seed; nunca datos reales.

---

## El ciclo de un cambio

```
 issue ──▶ rama ──▶ commits ──▶ rebase diario ──▶ PR borrador ──▶ check verde ──▶ revisión ──▶ squash ──▶ main
   │                                                                                                     │
   └──────── el otro: git pull --rebase origin main && npm install && npm run db:migrate ◀───────────────┘
```

### 1. Empezar

```bash
git switch main && git pull --rebase origin main
npm install && npm run db:migrate          # por si el otro agregó dependencias o tablas
git switch -c feat/cosecha-offline
```

Nombres de rama: `feat/…`, `fix/…`, `refactor/…`, `docs/…`, `chore/…`, `migra/<modulo>` (para migrar un módulo de v1).

### 2. Commits

Pequeños y con [Conventional Commits](https://www.conventionalcommits.org/es/) y el módulo como *scope*:
`feat(cosecha): registro offline de jornales`, `fix(sync): reintento tras 401`, `docs(v2): guía de datos`.
Dentro de la rama los commits pueden ser desordenados: el squash los junta en uno.

### 3. Mantenerse al día (diario, o antes de abrir el PR)

```bash
git fetch origin
git rebase origin/main        # resuelve conflictos (ver tabla más abajo)
npm install                   # si cambió package-lock.json
npm run db:migrate            # si main trajo migraciones nuevas
git push --force-with-lease   # tu rama ya estaba publicada: nunca --force a secas
```

### 4. Abrir el PR

- Ábrelo **en borrador** apenas tengas algo que mostrar; el CI corre en cada push.
- Título = el mensaje final del squash: `feat(cosecha): registro de cosecha y jornales offline`.
- Completa la plantilla (`.github/pull_request_template.md`): qué y por qué, checklist, capturas escritorio y móvil, cómo probarlo.
- Tamaño objetivo: **< 400 líneas cambiadas** sin contar migraciones generadas. Si un módulo es grande, divídelo:
  (1) dominio + tabla + tests, (2) página y formulario, (3) importador y E2E.

### 5. Antes de pedir revisión

```bash
npm run check                 # formato, guardas, tipos, migraciones, tests unitarios y de Postgres
npm run build && npm run test:e2e   # si tocaste UI, sync o permisos (ver testing.md)
```

### 6. Fusionar

Quien **abrió** el PR lo fusiona (squash) cuando tiene aprobación y CI verde. Si `main` avanzó y GitHub pide
"Update branch", haz rebase local (paso 3) en vez del botón, sobre todo si hay migraciones.

### 7. Después de fusionar (el otro)

```bash
git switch main && git pull --rebase origin main && npm install && npm run db:migrate
git switch mi-rama && git rebase main
```

---

## Cómo nos repartimos el trabajo

- **Tablero**: un GitHub Project con columnas *Por hacer · En curso · En revisión · Hecho*. Cada módulo de v1 es
  un issue creado con la plantilla **Migrar módulo** (dice entidades, dependencias y si toca código compartido).
- **Reservar = asignarse el issue.** No se empieza un módulo asignado a la otra persona.
- **Orden y dependencias**: ver [migrar-modulo.md](migrar-modulo.md#orden-sugerido-para-los-22-restantes).
  Lo ideal es trabajar en paralelo en **áreas distintas** (p. ej. uno Operación, el otro Comercial) porque
  comparten menos código.
- **Código compartido** (lo que lista `.github/CODEOWNERS`): si un módulo necesita cambiarlo, ese cambio
  sale como **PR propio y pequeño** antes del PR del módulo, se avisa en el issue y se fusiona rápido.
  Ejemplos: un componente nuevo en `components/ui/`, un cambio en `repo.ts`, una columna nueva en la
  tabla de otro módulo.
- **Decisiones de arquitectura**: se proponen como ADR en un PR (`docs/v2/adr/`, ver plantilla). Se discuten
  en el PR, no en chat, para que quede registro.
- **Sincronización**: 15 minutos a la semana para mover el tablero y ver bloqueos. Lo demás, asíncrono en issues y PRs.

---

## Zonas de conflicto y cómo se resuelven

La estructura ya está pensada para que dos módulos no se toquen: cada módulo vive en su carpeta
(`apps/web/src/app/[org]/<modulo>/`, `packages/domain/src/entities/<modulo>.ts`). Estos son los
únicos archivos que ambos tocan seguido:

| Archivo | Qué pasa | Cómo evitarlo / resolverlo |
|---|---|---|
| `packages/db/drizzle/*` (migraciones) | Ambos generan `0002_*`, choca `_journal.json` | **No se resuelve a mano.** `npm run db:rehacer -- <nombre>` ([abajo](#migraciones-de-base-de-datos-en-paralelo)). |
| `packages/db/src/schema.ts` | Ambos agregan tablas al final | Cada módulo agrega **un bloque propio** con comentario `/* --- <Módulo> --- */` al final del archivo. Conflicto = conservar ambos bloques. |
| `package-lock.json` | Ambos instalaron dependencias | `git checkout origin/main -- package-lock.json && npm install`, luego `git add package-lock.json`. Nunca editarlo a mano. |
| `packages/domain/src/modules.ts` | Ambos cambian `'pendiente'` → `'v2'` | Líneas distintas: git lo fusiona solo. Si choca, conservar ambos cambios. |
| `packages/domain/src/sync.ts` (`SYNC_ENTITIES`) | Ambos agregan entidades offline | Una entrada por línea, en orden de módulo. Conflicto = conservar ambas. |
| `packages/db/src/import-v1.ts` (`IMPORTERS`) | Ambos agregan importadores | Igual: una entrada por línea; respetar orden maestros → dependientes. |
| `packages/domain/src/index.ts` | Ambos exportan su entidad | Una línea por módulo; conservar ambas. |
| `CHANGELOG.md` | Todos editan "Sin publicar" | **No se edita en los PRs.** Las notas salen de los títulos de los PRs al publicar ([releases](#versiones-y-releases)). |
| Formato | Diferencias de espacios/comas | Prettier lo decide (`npm run format`); el CI rechaza código sin formatear. Configura "formatear al guardar" en el editor. |

Ya no existen listas de tablas para RLS ni migraciones SQL por tabla: `packages/db/src/tables.ts` las
deriva del esquema (columnas `org_id` / `xid`) y `ensure.ts` las aplica al migrar. Eso elimina dos de los
puntos de conflicto más frecuentes.

**Durante un rebase, "ours" y "theirs" se invierten**: `--ours` es `main` y `--theirs` es tu commit. Por eso
la tabla usa `git checkout origin/main -- <archivo>` en vez de `--ours/--theirs`.

---

## Migraciones de base de datos en paralelo

Las migraciones de `packages/db/drizzle/` son **generadas** a partir de `schema.ts`. La regla:

1. Trabaja con `schema.ts` libremente; **genera la migración al final**, justo antes de abrir el PR:
   `npm run db:generate -- --name cosecha`.
2. Si al hacer rebase chocan las migraciones (o `main` trajo una migración nueva después de que generaste
   la tuya), **no edites los archivos**: termina de resolver `schema.ts` y corre:
   ```bash
   npm run db:rehacer -- cosecha    # restaura drizzle/ como en main y regenera la tuya encima
   git add -A packages/db/drizzle
   git rebase --continue            # si estabas en medio de un rebase
   npm run db:reset && npm run db:migrate   # tu base local tenía la versión vieja
   ```
   (Probado: con `0002_riego` en main y `0002_credito` en la rama, deja `0002_riego` + `0003_credito`
   con solo tu columna.)
3. **Migraciones escritas a mano** (`--custom`, p. ej. migrar datos) son excepcionales. El script las
   aparta en `packages/db/drizzle-pendientes/` para que las vuelvas a crear; avisa en el PR.
4. **Nunca modifiques una migración que ya está en `main`**: crea otra.
5. El CI falla si `schema.ts` tiene cambios sin migración o si el journal es inconsistente.

---

## Revisar un PR

Quien revisa prueba **leyendo el diff y corriendo la rama** cuando toca UI o datos:

```bash
gh pr checkout 42 && npm install && npm run db:migrate && npm run dev
```

Qué mirar, en orden de importancia:

1. **Aislamiento y permisos**: lecturas y escrituras dentro de `withOrg`; escrituras con `upsert/softDelete`
   (verifican el rol en el servidor); la página usa `orgWith(slug, '<modulo>')`. Las guardas del CI atrapan
   `adminDb` en la app y escrituras directas, pero no la lógica de permisos.
2. **Datos**: Zod en `packages/domain` (no duplicado en el componente); nombres de campo iguales a v1;
   montos en pesos enteros; migración generada y coherente con el esquema.
3. **Offline** (si aplica): escribe con `engine.write`; se probó sin conexión; los movimientos son append-only.
4. **Cálculos**: fórmula comentada; si viene de `js/calc/*`, test de paridad con `loadLegacy`.
5. **UI**: usa componentes de `components/ui` y tokens de `globals.css` (sin colores sueltos); estados vacío,
   cargando y error; móvil revisado; textos en español de Chile ([diseno.md](diseno.md)).
6. **Docs**: si cambió un patrón, se actualizó el documento correspondiente.

Convención de comentarios: **"bloqueante:"** para lo que impide fusionar; lo demás es sugerencia y el autor
decide. Aprobar con sugerencias pendientes está bien.

---

## Qué hace el CI

`.github/workflows/ci.yml`, en cada PR y push a `main`:

| Job | Pasos | Si falla |
|---|---|---|
| **Formato, tipos y migraciones** | `format:check`, `guardas`, `typecheck`, `db:check`, y "esquema sin migración" (corre `db:generate` y exige que no cree archivos) | `npm run format` · ver mensaje de la guarda · `npm run db:generate -- --name x` |
| **Tests (dominio + Postgres)** | Postgres 17 de servicio, rol `winzer_app`, `db:migrate`, `npm test` | Reproducir con `npm test` (base local migrada) |
| **E2E (Playwright)** | build, app en :3000, seed, `test:e2e` en escritorio y móvil | Descargar el artefacto `e2e-resultados` (trazas y log del servidor) |

---

## Versiones y releases

- Versionado semántico con etiquetas `v2.MINOR.PATCH` sobre `main` (v1 conserva sus etiquetas `v1.x`).
- Para publicar: `gh release create v2.1.0 --generate-notes` arma las notas a partir de los títulos de los PRs
  fusionados. Luego se copian al `CHANGELOG.md` en un PR `chore(release): v2.1.0`.
- `main` debe poder desplegarse en cualquier momento; cuando exista el despliegue (Vercel + Neon), cada push
  a `main` va a *staging* y una etiqueta va a producción.

---

## Chuleta de comandos

```bash
# Día a día
git switch -c feat/x origin/main          # rama nueva
git fetch origin && git rebase origin/main  # ponerse al día
git push --force-with-lease               # publicar rama rebaseada
npm run check                             # todo lo del CI menos E2E
npm run format                            # formatear

# Base de datos
npm run db:generate -- --name <nombre>    # migración desde schema.ts
npm run db:rehacer -- <nombre>            # rehacer tus migraciones sobre las de main
npm run db:reset && npm run db:migrate    # base local desde cero (luego db:seed con la app corriendo)

# Conflictos típicos
git checkout origin/main -- package-lock.json && npm install
git rebase --abort                        # volver a como estabas antes del rebase

# PRs (GitHub CLI)
gh pr create --draft --fill               # abrir en borrador
gh pr ready                               # listo para revisión
gh pr checkout <n>                        # probar el PR del otro
gh pr merge --squash --delete-branch      # fusionar
```
