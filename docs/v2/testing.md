# Pruebas

| Nivel | Dónde | Corre con | Qué cubre |
|---|---|---|---|
| Dominio | `packages/domain/test/` | `npm run test:domain` | Cálculos, permisos, esquemas Zod. **Paridad con v1** |
| Base de datos | `packages/db/test/` | `npm test` (Postgres migrado) | RLS, permisos en servidor, conflictos, idempotencia, cursor de sync, importador, guardas de esquema |
| E2E | `apps/web/e2e/` | `npm run test:e2e` | Flujos reales en Chromium escritorio y Pixel 7 |
| Guardas | `scripts/guardas.mjs` | `npm run guardas` | Reglas de arquitectura |

`npm run check` corre todo menos E2E.

## Paridad con v1

`packages/domain/test/legacy.ts` carga los scripts de v1 (`js/core/utils.js`, `js/calc/*.js`,
`js/auth/permissions.js`) en una VM de Node con un `window` mínimo y datos falsos. Así un test compara la
función portada con la original con los mismos datos:

```ts
const v1 = loadLegacy(['js/calc/tax.js']).calc.tax;
expect(tax.totales(neto, cfg.tributario)).toEqual(v1.totales(neto));
```

Al portar un cálculo, agrega casos normales y bordes (cero, strings con coma decimal, valores negativos).

## Tests contra Postgres

Necesitan `npm run db:up && npm run db:migrate`. Crean viñas y usuarios con un sufijo aleatorio y los borran al
terminar, así no chocan con los datos del seed ni entre corridas. Usan `adminDb()` solo para preparar datos y
verificar; lo que se prueba pasa por `withOrg` y el rol `winzer_app`, igual que la app.

## E2E

```bash
npm run build
AUTH_RATE_LIMIT=off npm start        # terminal 1
npm run db:seed                      # terminal 2 (una vez)
npm run test:e2e                     # capturas en apps/web/test-results/screens/
npx playwright test --ui             # modo interactivo (desde apps/web)
```

Cubre: un usuario en dos viñas, rol sin acceso (UI y API), crear un cuartel **sin conexión** y sincronizar
(`context.setOffline`), importar un respaldo de v1 (`e2e/fixtures/respaldo-v1.json`), validación de RUT y vista
móvil. Los tests marcados `@mobile` corren solo en el proyecto móvil.

Convenciones:
- Selectores por rol y texto visible (`getByRole`, `getByLabel`), como los usa una persona. Si un selector es
  ambiguo (el mismo enlace en el menú y en la página), acótalo: `getByRole('navigation', { name: 'Módulos' })`.
- Cada test crea sus propios datos con nombres únicos (`Date.now().toString(36)`) y limpia lo que crea.
- Un módulo migrado agrega al menos un E2E de su flujo principal; si es offline, una variante sin conexión.

## Prueba manual antes de un PR con UI

1. Escritorio y móvil (DevTools a 390 px), modo claro y oscuro.
2. Con un rol que **no** tenga permiso: no ve el botón y el servidor lo rechaza.
3. Si es offline: DevTools › Network › Offline, crear y editar, volver online, ver que sincroniza y que otra sesión lo ve.
4. Navegación con teclado: Tab, Enter, Esc en diálogos, Ctrl+K.
