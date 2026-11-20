# Sistema de diseño — «v1 afinado»

Elegida en noviembre de 2026, después de probar una dirección en blanco y negro estricto (A, «Marca de fuego»)
y tres puntos medios entre esa y v1 ([adr/0009](adr/0009-direccion-visual-v1-afinado.md)). Contexto de producto:
`apps/web/PRODUCT.md`.

## Dirección

*La estructura que ya conoce quien usa Winzer, con la marca nueva.* Se mantiene lo que funcionaba en v1:

- el menú lateral negro con íconos;
- las tarjetas de cifras y las tablas en tarjeta;
- las cápsulas de color para el tipo de uva y los estados;
- la fuente Noto Sans.

Se afina con:

- el logo real (WINZER®) en el menú;
- **Gilda Display** en los títulos, afín a Agatho, la del logo;
- íconos de línea (lucide) en vez de emojis;
- bordes en vez de sombras y un solo acento de color con significado.

- **Color con significado, siempre con texto**:
  - **vino** (`tinto`) para uva tinta y gráficos;
  - **dorado** (`blanco`) para uva blanca;
  - verde, ámbar y rojo para estados (`ok`, `warn`, `bad`);
  - azul (`info`) para "pendiente de sincronizar".
- **Superficies**: fondo gris muy claro (`paper`); tarjetas, tablas, diálogos y barra superior en blanco
  (`raised`), separados por borde de 1 px. Sin sombras. Esquinas de 6 px (controles) y 8 px (tarjetas).
- **Menú lateral** siempre oscuro (tokens `side-*`), también en modo claro: logo invertido, viña activa,
  áreas en versalitas, ítem activo con fondo `side-raised`. Ícono de "sin señal" junto a las áreas que
  funcionan offline; "v1" en los módulos no migrados.
- **Barra superior**: buscador Ctrl+K, estado de sincronización y usuario (iniciales, nombre y rol).
- **Tipografía**:
  - **Gilda Display** (`font-label`, `titulo`): títulos de página y de sección, solo peso 400 (nunca
    `font-semibold`).
  - **Noto Sans** (`font-sans`): todo lo demás, con cifras `tabular`. Etiquetas en 600, cifras en 700.
  - Agatho no se usa en la interfaz: su licencia web no está confirmada.
- **Densidad**: filas de 48 px, controles de 36–40 px. En móvil, tarjetas tocables y botón principal a todo el ancho.

## Tokens (`apps/web/src/app/globals.css`)

Siempre como clases de Tailwind, **nunca colores sueltos** (`bg-white`, `#333`, `text-gray-500`).

| Token / clase | Uso |
|---|---|
| `bg-paper` | Fondo del área de trabajo |
| `bg-raised` | Tarjetas, tablas, diálogos, barra superior |
| `bg-sunken` | Hover de filas, recuadro de íconos, placeholders de carga |
| `text-ink` · `text-ink-2` · `text-ink-3` · `text-ink-4` | Principal · secundario · metadatos · deshabilitado |
| `border-rule` · `border-rule-strong` | Bordes de tarjetas · bordes de controles |
| `bg-ink text-on-ink` | Acción primaria |
| `bg-side` · `bg-side-raised` · `text-side-ink(-2/-3)` · `border-side-rule` | Menú lateral |
| `ok` `warn` `bad` `info` (+ `-soft`) | Estados: texto en el color, fondo en `-soft` |
| `tinto` · `tinto-soft` · `blanco` · `blanco-soft` · `blanco-fill` | Tipo de uva y gráficos |
| `rounded-control` (6 px) · `rounded-card` (8 px) | Radios |
| `font-label` · `titulo` · `font-sans` · `tabular` | Serif del logo · título de página · texto · cifras |
| `logo` · `logo-on-ink` | Filtro del logo según fondo y tema |
| `ease-out-quick` | Curva de animación (`cubic-bezier(.23,1,.32,1)`) |

Modo oscuro: automático por preferencia del sistema o manual (botón en el pie del menú; `data-theme` en `<html>`).
Los tokens se redefinen; los componentes no cambian.

## Escala tipográfica

| Uso | Estilo |
|---|---|
| Ruta | `text-[13px] text-ink-3` ("Inicio / Operación / Catastro vitícola") |
| Título de página | `titulo text-[30px] sm:text-[36px]` (`PageHeader`) |
| Título de sección / diálogo | `font-label text-[21px]` / `text-[24px]` |
| Grupo de tarjetas | `text-[12px] font-bold tracking-[0.08em] uppercase text-ink-2` (`StatGrid title`) |
| Encabezado de tabla | `text-[12px] font-bold tracking-[0.05em] uppercase text-ink-3` |
| Cifra | `tabular text-[28px] font-bold` (`Stat`) |
| Cuerpo / tablas | 14–15 px · ayuda y metadatos 12–13 px `text-ink-3` |

## Componentes (`apps/web/src/components/ui`)

| Componente | Notas |
|---|---|
| `Button` | `primary` (tinta) · `secondary` (borde) · `ghost` · `danger`; `md` 40 px · `sm` 32 px |
| `Field` + `Input` / `Select` / `Textarea` | Fondo blanco, borde `rule-strong`, anillo de foco suave; error junto al campo |
| `Dialog` | `<dialog>` nativo, esquinas de 12 px; en móvil se ancla abajo como hoja |
| `DataTable` | Tarjeta con barra de búsqueda, conteo y CSV arriba; orden por columna; primera columna fija |
| `Stat`, `StatGrid` | Tarjeta de cifra (etiqueta, ícono en recuadro, valor, contexto); grilla de 4 (2 en móvil) |
| `TipoUva`, `UvaDot` | Cápsula vino/dorado con texto; punto para gráficos y leyendas |
| `Badge` | Estado en cápsula (`ok`, `warn`, `bad`, `info`, `neutral`) |
| `Codigo` | Código del registro en negrita + ícono azul si está pendiente de sincronizar |
| `PageHeader` | Ruta + título + descripción + acciones (`actionsDesktopOnly` para móvil) |
| `SectionTitle`, `EmptyState` | Título de sección; estado vacío con borde de trazos |

## Patrones

- **Página de módulo**: `PageHeader` → `StatGrid` con 4 cifras útiles → `DataTable` → `Dialog` de formulario.
- **Inicio**: saludo, grilla de cifras por área, módulos agrupados en tarjetas por área.
- **Barra superior**: buscador (Ctrl K), selector de temporada (`?t=`; neutro en la actual, `tinto-soft` en otra),
  estado de sincronización y usuario.
- **Formularios**: secciones con título `font-label`, grilla de 2–3 columnas en escritorio, 1 en móvil;
  validación al enviar con error junto al campo; cálculos en vivo como ayuda del campo; coma decimal.
- **Estados obligatorios**: cargando (`animate-pulse bg-sunken`), vacío (`EmptyState`), error (mensaje
  accionable), sin permiso (`NoAccess`), pendiente de sincronizar (`Codigo` con ícono azul).
- **Móvil**: probar a 390 px; objetivos táctiles ≥ 44 px; acción principal ancha sobre el listado.
- **Accesibilidad**: controles nativos, `aria-label` en botones de solo ícono, foco visible, texto además
  del color, `prefers-reduced-motion` respetado.
- **Movimiento**: < 300 ms, solo `transform`/`opacity`, curva `ease-out-quick`; nada en acciones repetitivas.

## Antes de agregar algo nuevo

1. ¿Existe en `components/ui`? Úsalo. ¿Necesitas una variante? Agrégala al componente (PR de código compartido).
2. ¿Se repite en 2+ módulos? Extráelo a `components/ui`.
3. ¿Nuevo color? Casi nunca: hay acento vino, dorado y estados. Si de verdad falta, se agrega a `globals.css`
   (claro y oscuro) y a esta tabla.
