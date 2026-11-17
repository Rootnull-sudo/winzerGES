# Documentación de Winzer v2

Plataforma en la nube multi-viña de Winzer Gestión. v1 (app de escritorio sin servidor) está documentada en
[`../architecture.md`](../architecture.md) y sigue en la raíz del repo mientras se migra.

## Empieza aquí

| Si quieres… | Lee |
|---|---|
| Entender el sistema en 10 minutos | [arquitectura.md](arquitectura.md) |
| Instalar y correr en tu equipo | [desarrollo.md](desarrollo.md) |
| Trabajar en paralelo e integrar con PRs | [colaboracion.md](colaboracion.md) |
| Migrar un módulo de v1 | [migrar-modulo.md](migrar-modulo.md) |

## Referencia

| Tema | Documento |
|---|---|
| Tablas, multi-viña (RLS), migraciones, importador | [datos.md](datos.md) |
| Funcionamiento sin conexión | [sync-offline.md](sync-offline.md) |
| Autenticación, permisos, auditoría | [seguridad.md](seguridad.md) |
| Tokens, componentes y patrones de UI | [diseno.md](diseno.md) |
| Tests (paridad v1, Postgres, E2E) | [testing.md](testing.md) |
| Decisiones de arquitectura | [adr/](adr/README.md) |

## Estado de los módulos

La fuente de verdad es `packages/domain/src/modules.ts` (`status: 'v2'`). Hoy: Catastro (offline), Clientes y
cobranza, Usuarios y permisos, Configuración. El trabajo pendiente se reserva con issues *Migrar módulo*.

## Glosario

| Término | Significado |
|---|---|
| Viña / organización / tenant | Cliente de la plataforma; todos sus datos llevan su `org_id` |
| Actor | Usuario + viña + rol de la petición en curso (`Actor` en `packages/db/src/repo.ts`) |
| `withOrg` | Ejecuta consultas con la viña fijada para RLS |
| RLS | Row-Level Security de Postgres: filtra filas por viña en el motor |
| Entidad offline / sincronizable | Tabla con `syncCols()`, disponible sin conexión |
| Outbox | Cola local de cambios pendientes de enviar |
| Cursor | Posición `xid:seq` hasta donde el cliente recibió cambios |
| Paridad | Test que compara una función portada con la de v1 |
| Cuartel | Unidad de manejo del viñedo (v1: catastro) |
| `vcedx` | Permisos: ver, crear, editar, eliminar, exportar |
