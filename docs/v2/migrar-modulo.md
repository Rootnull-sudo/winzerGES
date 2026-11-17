# Cómo migrar un módulo de v1 a v2

Hay dos patrones, con un módulo de referencia cada uno. Mira primero en `packages/domain/src/modules.ts`
si el área del módulo es offline (`operacion`, `bodega`, `administracion`) u online.

| Patrón | Referencia | Lee/escribe |
|---|---|---|
| **Online** | `apps/web/src/app/[org]/clientes/` | Server Component lee con `withOrg`; Server Actions escriben con `upsert` |
| **Offline** | `apps/web/src/app/[org]/catastro/` | Componente cliente lee con `useEntity`; escribe con `engine.write` |

## Pasos (ambos patrones)

1. **Dominio** — `packages/domain/src/entities/<modulo>.ts`: esquema Zod con los campos de `js/modules/<modulo>/`
   (v1). Usa los mismos nombres de campo que v1 (así el importador es directo). Si el módulo tiene cálculos en
   `js/calc/*`, pórtalos como funciones puras que reciben los datos y la `OrgConfig`, y agrega un test de paridad
   en `packages/domain/test/` con `loadLegacy([...])` (ver `tax.test.ts`).
2. **Tabla** — en `packages/db/src/schema.ts`, en un bloque propio al final (`/* --- <Módulo> --- */`), con
   `...base()` y además `...syncCols()` si es offline. **No hay que escribir SQL ni registrar la tabla en listas**:
   al migrar, toda tabla con `org_id` recibe RLS y toda tabla con `xid` queda sincronizable (ver
   [adr/0006](adr/0006-rls-automatica.md)). Genera la migración **al final, justo antes del PR**:
   ```bash
   npm run db:generate -- --name <modulo>
   npm run db:migrate
   ```
   Si al integrar `main` choca con una migración del otro: `npm run db:rehacer -- <modulo>`
   ([colaboracion.md](colaboracion.md#migraciones-de-base-de-datos-en-paralelo)).
3. **Importador** — agrega la entidad a `IMPORTERS` en `packages/db/src/import-v1.ts` (en orden: maestros antes que
   lo que los referencia; lista en `refs` los campos que apuntan a otras entidades).
4. **Página** — `apps/web/src/app/[org]/<modulo>/page.tsx` con `orgWith(slug, '<modulo>')` y `<NoAccess>`.
5. **Marcar como migrado** — `status: 'v2'` en `MODULES` (`packages/domain/src/modules.ts`). El menú y el buscador
   Ctrl+K lo enlazan solos.
6. **Tests** — un E2E en `apps/web/e2e/` con el flujo principal y, si es offline, una variante con `context.setOffline(true)`.
7. **PR** — reserva antes el módulo con un issue *Migrar módulo*; si necesitas tocar código compartido (`components/ui`,
   `repo`, sync), hazlo en un PR previo y pequeño. Checklist en la plantilla del PR.

## Solo offline

- Registra la entidad en `SYNC_ENTITIES` (`packages/domain/src/sync.ts`) con su `module`, `schema` y `unique`
  (un test verifica que coincida con las tablas que tienen `syncCols()`).
- Lee con `useEntity<T>('<entidad>')` (devuelve `undefined` mientras carga: muestra un esqueleto).
- Escribe con `useSync()?.write('<entidad>', 'upsert' | 'delete', id | null, data)`. Lanza `Error` con el mensaje
  de Zod si los datos son inválidos; muéstralo junto al campo.
- Prefiere **movimientos append-only** (como `movBodega` en v1) a contadores editables: no conflictúan.
- Las reacciones entre módulos de v1 (`js/integrations/domain.js`, p. ej. envasado → descuenta bodega) se hacen en el
  **servidor** dentro de la misma transacción del push o de la Server Action, nunca en el cliente.

## Orden sugerido para los 22 restantes

1. **Configuración** (variedades, parámetros tributarios en `organization.settings`) — la usan casi todos.
2. **Operación** (offline): fenología, insumos y labores, cosecha, calendario, laboratorio.
3. **Bodega** (offline): estanques y `movBodega` primero; luego vinificación, fermentación, histórico.
4. **Comercial**: envasado → inventarios → ventas (dependen de bodega) → marca.
5. **Finanzas**: proveedores y compras, sueldos y gastos, costos, financiero (portar `js/calc/financial.js` e `inventory.js`).
6. **Tributario**: DTE, conciliación, cumplimiento, F29/PPM/Renta (`tax.f29` ya está portado y probado).
7. Dashboard gerencial y alertas (cuando existan los datos que resumen).
