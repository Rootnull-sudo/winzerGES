# 0006. RLS y sync derivados del esquema; sin SQL por tabla

- Estado: Aceptado · Fecha: 2026-11-17

## Contexto
En la primera versión cada tabla nueva requería una migración SQL escrita a mano (política RLS, trigger de sync)
y agregarla a listas en `schema.ts`. Con dos personas migrando módulos en paralelo eso produce conflictos en
archivos que no se pueden regenerar, y un olvido deja una tabla sin aislamiento.

## Decisión
`packages/db/src/tables.ts` clasifica las tablas por sus columnas: con `org_id` → RLS (salvo `NO_RLS_TABLES`);
además con `xid` → sincronizable. `ensure.ts` aplica todo de forma idempotente después de cada `db:migrate`.
Un test falla si alguna tabla con `org_id` queda sin RLS o si tablas offline y `SYNC_ENTITIES` no coinciden.

## Consecuencias
Las migraciones de cada módulo son 100 % generadas → los conflictos se resuelven regenerando
(`npm run db:rehacer`). Agregar una tabla segura es solo escribirla en `schema.ts`.
