# 0001. Una base Postgres con Row-Level Security por viña

- Estado: Aceptado · Fecha: 2026-11-17

## Contexto
Cada viña debe ver solo sus datos. Esperamos de decenas a miles de viñas pequeñas.

## Decisión
Una sola base PostgreSQL. Toda tabla de negocio lleva `org_id` y una política RLS que la compara con
`app.org_id`, fijado por transacción con `withOrg`. La app se conecta con un rol sin `BYPASSRLS`.

## Consecuencias
- Aislamiento garantizado por el motor aunque una consulta olvide filtrar; sin viña activa no se ve nada.
- Una sola base que operar, migrar y respaldar.
- Toda consulta de negocio debe ir dentro de `withOrg` (una guarda del CI impide usar la conexión admin en la app).
- Un cliente grande puede moverse a su propia base sin cambiar el código.

## Alternativas consideradas
Base o esquema por viña: aislamiento fuerte pero migraciones N veces y operación cara. Filtro solo en código: un olvido filtra datos.
