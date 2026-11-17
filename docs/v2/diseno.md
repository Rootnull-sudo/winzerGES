# Sistema de diseño — «Marca de fuego»

Elegida en noviembre de 2026 entre cinco alternativas (lienzo de exploración en claude.ai, privado del equipo;
decisión en [adr/0008](adr/0008-direccion-visual-marca-de-fuego.md)). Contexto de producto: `apps/web/PRODUCT.md`.

## Dirección

*Cada registro lleva su marca, como una barrica marcada a fuego.* Blanco y negro estricto, como el logo WINZER®.
Pensada por igual para la oficina (tablas largas, cifras) y para el viñedo y la bodega (teléfono a pleno sol).

- **Blanco y negro estricto.** El color solo comunica **estado** (advertencia, error, info) y nunca solo:
  siempre con texto o ícono. Lo normal ("Bueno", "Al día") no se pinta.
- **La forma reemplaza al color**:
  - tipo de uva: punto **relleno** = tinta, punto **vacío** = blanca (`UvaDot`, `TipoUva`);
  - sincronización: línea **continua** = guardado en el servidor, línea **de trazos** = pendiente (bajo el
    `Sello`, en el indicador del header y en la leyenda).
- **El sello** (`Sello`): el código de un registro (cuartel, estanque, lote, barrica) en la serif del logo dentro
  de un círculo de 1 px. Es la firma visual: úsalo en la primera columna de listados de entidades con código.
- **Profundidad solo con líneas de 1 px.** Sin sombras, sin tarjetas. Línea de tinta (`border-ink`) para cerrar
  encabezados y abrir tablas o secciones; línea suave (`border-rule`) entre filas. Esquinas rectas (2 px).
- **Tipografía**:
  - **Gilda Display** (`font-label`, `titulo`): serif de alto contraste afín a Agatho, la del logo. Solo peso 400
    (nunca `font-semibold`). Títulos de página en versales (`titulo`), títulos de sección y diálogos en
    caja normal (`font-label`), etiquetas de área del menú en versales pequeñas.
  - **Public Sans** (`font-sans`): cuerpo y datos, cifras `tabular`.
  - Agatho no se usa en la interfaz: su licencia web no está confirmada. El logo va como imagen
    (`public/winzer-logo.png`, negro con transparencia; la clase `logo` lo invierte en modo oscuro).
- **Sin etiquetas pequeñas sobre los títulos** (kicker/eyebrow): el título se sostiene solo y el menú ya dice el área.
- **Densidad**: filas de 48 px (el sello mide 52), controles de 40 px; en móvil botones de 52 px y listas de filas
  anchas con el sello a la izquierda.

## Tokens (`apps/web/src/app/globals.css`)

Siempre como clases de Tailwind, **nunca colores sueltos** (`bg-white`, `#333`, `text-gray-500`).

| Token / clase | Uso |
|---|---|
| `bg-paper` | Fondo (blanco; negro mate `#0f0f0e` en oscuro) |
| `bg-raised` | Diálogos, menús desplegables (se separan por borde, no por tono) |
| `bg-sunken` | Hover de filas, placeholders de carga |
| `text-ink` · `text-ink-2` · `text-ink-3` · `text-ink-4` | Principal · secundario · metadatos · deshabilitado |
| `border-ink` | Líneas de énfasis: bajo el título de página, sobre tablas y secciones, botones |
| `border-rule` · `border-rule-strong` | Entre filas · bordes de inputs |
| `bg-ink text-on-ink` | Acción primaria |
| `warn` `bad` `info` (+ `-soft`) | Estados que piden atención. `ok` existe pero casi no se usa: lo normal no se pinta |
| `rounded-control` · `rounded-card` | 2 px |
| `font-label` · `titulo` · `font-sans` · `tabular` | Serif del logo · título de página en versales · texto · cifras |
| `logo` · `logo-on-ink` | Filtro del logo según fondo y tema |
| `ease-out-quick` | Curva de animación (`cubic-bezier(.23,1,.32,1)`) |

Modo oscuro: automático por preferencia del sistema o manual (`data-theme` en `<html>`). Los tokens se redefinen;
los componentes no cambian.

## Escala tipográfica

| Uso | Estilo |
|---|---|
| Título de página | `titulo text-[34px] sm:text-[44px]` (`PageHeader`) |
| Título de sección / diálogo | `font-label text-[22px]` / `text-[24px]` (`SectionTitle`, `Dialog`) |
| Área del menú | `font-label text-[13px] tracking-[0.12em] uppercase text-ink-3` |
| Encabezado de tabla | `text-[12px] tracking-[0.06em] text-ink-3` |
| Cifra destacada | `tabular text-[26px] font-semibold` (`Stat`) |
| Cuerpo / tablas | 14–15 px · ayuda y metadatos 12–13 px `text-ink-3` |

## Componentes (`apps/web/src/components/ui`)

| Componente | Notas |
|---|---|
| `Button` | `primary` (tinta) · `secondary` (borde de tinta) · `ghost` · `danger`; `md` 40 px · `sm` 32 px |
| `Field` + `Input` / `Select` / `Textarea` | Fondo papel, borde `rule-strong`, foco con línea de tinta; error junto al campo |
| `Dialog` | `<dialog>` nativo, rectangular, borde de tinta; en móvil se ancla abajo |
| `DataTable` | Abre con línea de tinta, filas separadas por `rule`, sin caja. Búsqueda, orden, CSV |
| `Sello` | Código en círculo + línea de sincronización (`pending` = trazos). `size="lg"` para fichas |
| `UvaDot`, `TipoUva` | Relleno = tinta, vacío = blanca, siempre con texto |
| `Badge` | Estado en texto; solo `warn` y `bad` llevan color |
| `PageHeader` | Título en versales + línea de hechos (`description`) + acciones; cierra con línea de tinta |
| `SectionTitle`, `Stat`, `EmptyState` | Título de sección, cifra, estado vacío con borde de trazos |

Shell (`components/shell`): logo arriba, viña activa entre una línea de tinta y una suave, menú solo de texto por
áreas (la activa con una raya corta; círculo vacío = el área funciona sin conexión; "v1" = no migrado), buscador
Ctrl+K como línea, indicador de sincronización con el mismo lenguaje de líneas.

## Patrones

- **Página de módulo**: `PageHeader` con una **línea de hechos** en vez de tarjetas de cifras
  ("7,70 ha en 3 cuarteles · 28.800 plantas · Tinta 5,20 ha…") → listado → columna de **composición**
  a la derecha en pantallas anchas (`xl`), al final en móvil.
- **Composición** (ver Catastro): reparto por categoría con barras de 3 px (tinta sobre `rule`), datos clave en
  pares etiqueta/valor separados por líneas, y la leyenda de las marcas. Llena la pantalla con información real,
  no con decoración.
- **Formularios**: secciones con título `font-label` sobre línea de tinta, grilla de 2–3 columnas en escritorio,
  1 en móvil; validación al enviar con error junto al campo; cálculos en vivo como ayuda del campo; coma decimal.
- **Estados obligatorios**: cargando (`animate-pulse bg-sunken`), vacío (`EmptyState`), error (mensaje
  accionable), sin permiso (`NoAccess`), pendiente de sincronizar (línea de trazos del `Sello`).
- **Móvil**: probar a 390 px; objetivos táctiles ≥ 44 px; acción principal ancha sobre el listado
  (`actionsDesktopOnly` en `PageHeader` y botón ancho en la vista).
- **Accesibilidad**: controles nativos, `aria-label` en botones de solo ícono, foco visible (línea de tinta),
  forma o texto además del color, `prefers-reduced-motion` respetado.
- **Movimiento**: < 300 ms, solo `transform`/`opacity`, curva `ease-out-quick`; nada en acciones repetitivas.

## Antes de agregar algo nuevo

1. ¿Existe en `components/ui`? Úsalo. ¿Necesitas una variante? Agrégala al componente (PR de código compartido).
2. ¿Se repite en 2+ módulos? Extráelo a `components/ui`.
3. ¿Nuevo color? Casi nunca: la identidad es blanco y negro. Si un estado nuevo lo exige, se agrega a
   `globals.css` (claro y oscuro) y a esta tabla.
