# Cómo contribuir a Winzer Gestión

> **¿Trabajas en v2 (la plataforma en la nube, `apps/` y `packages/`)?** Sigue
> [docs/v2/colaboracion.md](docs/v2/colaboracion.md) (ramas, PRs, conflictos, migraciones) y
> [docs/v2/desarrollo.md](docs/v2/desarrollo.md) (entorno y convenciones). Índice: [docs/v2/README.md](docs/v2/README.md).
> Lo que sigue aplica a **v1** (`index.html`, `js/`, `css/`).

¡Gracias por tu interés! Este proyecto es 100% frontend y no requiere herramientas de build: basta un navegador y un editor.

## Flujo de trabajo

1. Haz un fork y crea una rama desde `main`:
   - `feature/modulo-barricas`, `feature/reporte-exportaciones`
   - `fix/calculo-ppm`, `fix/validacion-rut`
   - `docs/guia-conciliacion`
2. Haz commits pequeños con **Conventional Commits**:
   - `feat(fermentacion): alerta de temperatura sobre 30 °C`
   - `fix(tax): remanente de IVA cuando no hay ventas`
   - `docs(readme): capturas actualizadas`
   - `refactor(ui): extraer componente de tabla`
   - `chore(release): v1.1.0`
3. Abre un Pull Request hacia `main` usando la plantilla. `main` debe quedar siempre desplegable.

## Estilo de código

- JavaScript vanilla ES2022, **scripts clásicos** (sin `import`/`export`) para que la app funcione con `file://`.
- Todo cuelga del espacio de nombres global `VG` (`VG.db`, `VG.ui`, `VG.calc`, …).
- 2 espacios de indentación, comillas simples, punto y coma (ver `.editorconfig`).
- JSDoc en funciones públicas; **toda fórmula financiera, tributaria o enológica debe llevar un comentario con la fórmula**.
- Textos de interfaz en español de Chile, claros y sin jerga técnica ("Guardar cambios", no "Submit").
- Colores, espacios y radios **solo** mediante variables de `css/tokens.css`.

## Pruebas manuales antes de un PR

1. Abre `index.html?dev=1` en un navegador limpio (ventana privada).
2. Carga los datos de ejemplo y recorre todos los módulos del menú: no debe aparecer ningún error en consola.
3. Prueba el flujo integrado: registrar cosecha → entrada a bodega → seguimiento de fermentación → orden de envasado (confirmar) → venta con DTE → F29 del mes.
4. Ingresa con un usuario de rol **Ventas** y verifica que no ve sueldos ni tributario.
5. Revisa modo oscuro, vista móvil (≤ 900 px) y navegación con teclado (Tab / Esc / Enter).
6. Exporta un respaldo JSON, borra todo y restáuralo.

## Proponer un módulo nuevo

1. Abre un issue con la plantilla **Nuevo módulo** (objetivo, entidades, eventos que publica/escucha).
2. Sigue la guía paso a paso de [docs/modules.md](docs/modules.md).
3. Documenta los eventos nuevos en [docs/api-hooks.md](docs/api-hooks.md).

## Adaptar a otro país

Los maestros (variedades, valles, formatos, ventanas de vendimia) son editables desde la UI. Para otra legislación: ajusta `js/calc/tax.js` (tasas, tramos, formularios), `js/integrations/dte.js` (formato de documento electrónico) y los textos de cumplimiento en `js/modules/cumplimiento/`.

## Datos

**Nunca** incluyas datos reales (RUT, clientes, precios, DTE) en commits, issues ni capturas. Usa los datos demo.
