# 0012. Tareas en segundo plano con pg-boss; alertas guardadas

- Estado: Propuesto · Fecha: 2026-11-17

## Contexto
En v1, `js/core/alerts.js` recalcula unas 25 reglas en cada lectura, en el navegador del usuario. En v2 hacen falta
cosas que no dependen de que alguien abra la app:

- alertas que se avisan por correo;
- vencimientos tributarios y del SAG;
- carga de indicadores;
- procesamiento de webhooks del cobro;
- limpieza de adjuntos huérfanos.

## Decisión
- **pg-boss** como cola y planificador, sobre el mismo Postgres: no agrega infraestructura.
  - Esquema `pgboss` propio y fuera del RLS. Se accede con la conexión de administración, **solo desde el worker**.
  - El worker corre en un proceso Node aparte (`apps/worker`) o, en Vercel, en una ruta llamada por un cron.
  - Cada job que toca datos de una viña usa `withOrg(orgId, …)` como cualquier otra consulta.
- **Alertas guardadas**: el job `alertas.calcular` corre por viña (cada hora, encolado por el cron `alertas.programar`) y aplica
  un **motor de reglas**.
  - Cada regla es `{ id, modulo, severidad, evaluar(tx, ctx) → hallazgos[] }`, portada desde `alerts.js` con su
    test.
  - Los hallazgos se escriben en `alerta`, con un upsert por (regla, registro). Los que dejan de cumplirse pasan a
    `resuelta`.
  - La campana de la barra superior lee `alerta` (abiertas), filtrada por los permisos del rol.
  - `alerta_vista` guarda lo leído por usuario.
- **Correo** con Resend: invitaciones y un resumen diario opcional de alertas nuevas.
- **Tras un push de sync** la ruta del push recalcula las alertas de la viña con `after()` de Next, después de
  responder. No necesita pg-boss en la web ni la conexión de administración.
- **Implementación** (F0-5):
  - `packages/db/src/alertas/motor.ts` y `reglas/<modulo>.ts`, con una línea por módulo en `reglas/index.ts`.
  - El worker está en `packages/db/src/jobs/worker.ts` (`npm run worker`).
  - Una regla que falla corre en un savepoint y no bloquea a las demás.
- **Tareas** (`tarea`): las crean las reacciones y los servicios; se muestran en una bandeja personal. Se crean en
  F2-3, con la primera reacción que las usa.

## Consecuencias
- El costo de las alertas sale de la pantalla y la campana carga al instante.
- Una alerta puede atrasarse hasta una hora. Las críticas (SO₂) también se recalculan al terminar el push que las
  provoca.
- Hay un proceso más que desplegar y monitorear (worker o cron).

## Alternativas consideradas
- **Inngest / Trigger.dev**: buen modelo, pero es un servicio externo con costo y una dependencia más.
- **Calcular en cada lectura, como v1**: no permite avisar por correo y escala mal con muchos datos.
- **Redis + BullMQ**: infraestructura nueva sin ventaja clara para el volumen esperado.
