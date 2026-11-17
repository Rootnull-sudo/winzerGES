# Sistema de diseño

## Dirección

*Tinta sobre papel de etiqueta.* Mantiene la identidad blanco y negro de v1, pensada para quien trabaja en el
viñedo y la bodega con el teléfono en la mano, y en la oficina con tablas largas.

- **Color escaso y con significado**: estados (ok, advertencia, error, info) y **tinto / blanco** solo para el
  tipo de uva — siempre acompañados de texto o ícono, nunca solo color.
- **Profundidad solo con bordes** sutiles (sin sombras). Superficies: papel (`paper`), elevada (`raised`:
  tarjetas, diálogos, tablas) y hundida (`sunken`: inputs, hover).
- **Tipografía**: títulos en **Fraunces** (`font-label`, serif de etiqueta de vino); cuerpo y datos en
  **Instrument Sans** (`font-sans`); cifras con `tabular` (números tabulares).
- **Densidad de herramienta** en escritorio (filas de 40 px, controles de 36 px); en móvil los listados pasan a
  tarjetas grandes y la acción principal ocupa todo el ancho.

## Tokens (`apps/web/src/app/globals.css`)

Se usan siempre como clases de Tailwind, **nunca colores sueltos** (`bg-white`, `#333`, `text-gray-500`).

| Token / clase | Uso |
|---|---|
| `bg-paper` | Fondo de la app |
| `bg-raised` | Tarjetas, tablas, diálogos |
| `bg-sunken` | Inputs, hover de filas, placeholders de carga |
| `text-ink` · `text-ink-2` · `text-ink-3` · `text-ink-4` | Principal · secundario · metadatos · deshabilitado |
| `border-rule` · `border-rule-strong` | Bordes normales · énfasis (controles, diálogos) |
| `bg-ink text-on-ink` | Acción primaria |
| `ok` `warn` `bad` `info` (+ `-soft`) | Estados: texto en el color, fondo en `-soft` |
| `bg-tinto` · `bg-blanco` | Tipo de uva |
| `rounded-control` (6 px) · `rounded-card` (10 px) | Radios |
| `font-label` · `font-sans` · `tabular` | Títulos · texto · cifras |
| `ease-out-quick` | Curva de animación (`cubic-bezier(.23,1,.32,1)`) |

Modo oscuro: automático por preferencia del sistema o manual (`data-theme` en `<html>`, guardado en `localStorage`).
Los tokens se redefinen; los componentes no cambian.

## Escala tipográfica

| Uso | Estilo |
|---|---|
| Título de página | `font-label text-[28px] font-semibold tracking-[-0.015em]` (`PageHeader`) |
| Título de sección / diálogo | `font-label text-[20px] font-semibold` |
| Kicker (área, etiquetas de cifras) | `text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3` |
| Cifra destacada | `tabular text-[24px] font-semibold` (`Stat`) |
| Cuerpo / tablas | 14 px · ayuda y metadatos 12–13 px `text-ink-3` |

## Componentes (`apps/web/src/components/ui`)

| Componente | Notas |
|---|---|
| `Button` | `variant`: `primary` · `secondary` · `ghost` · `danger`; `size`: `md` (36 px) · `sm` (30 px). Presión `scale(.97)` |
| `Field` + `Input` / `Select` / `Textarea` | `Field` da label, unidad, ayuda y error junto al campo; pasa `id` y `aria-describedby` al control por render-prop |
| `Dialog` | Sobre `<dialog>` nativo (foco atrapado, Esc). En móvil se ancla abajo como hoja. `footer` para acciones |
| `DataTable` | Búsqueda sin tildes, orden por columna, CSV (`;` + BOM para Excel), primera columna fija, `empty` |
| `Badge`, `TipoUva` | Estados y tipo de uva (punto de color + texto) |
| `PageHeader`, `Stat`, `EmptyState` | Encabezado con kicker, cifra destacada, estado vacío con acción |
| `useToast()` | Confirmaciones (`ok`), avisos (`info`) y errores (`bad`, `role="alert"`) |

Shell (`components/shell`): menú por áreas (punto verde = funciona offline; "v1" = no migrado), selector de viña,
Ctrl+K (`cmdk`, sin animación porque se usa mucho), indicador de sincronización y franja de avisos.

## Patrones

- **Página de módulo**: `PageHeader` (kicker = área) → franja de `Stat` entre bordes (si hay cifras útiles) →
  `DataTable` con la acción primaria en `toolbar` → `Dialog` de formulario.
- **Formularios**: secciones con kicker, grilla de 2–3 columnas en escritorio, 1 en móvil; validación al enviar
  con error junto al campo; cálculos en vivo como ayuda del campo (p. ej. plantas = densidad × superficie);
  decimales con coma chilena aceptados.
- **Estados obligatorios**: cargando (bloque `animate-pulse bg-sunken`), vacío (`EmptyState` con qué hacer),
  error (mensaje accionable), sin permiso (`NoAccess`), pendiente de sincronizar (ícono `CloudUpload` en `text-info`).
- **Móvil**: probar en 390 px; objetivos táctiles ≥ 40 px; acción principal ancha arriba del listado.
- **Accesibilidad**: controles nativos, `aria-label` en botones de solo ícono, foco visible, color nunca como
  único indicador, `prefers-reduced-motion` respetado.
- **Movimiento**: < 300 ms, solo `transform`/`opacity`, curva `ease-out-quick`; nada en acciones repetitivas.

## Antes de agregar algo nuevo

1. ¿Existe en `components/ui`? Úsalo. ¿Necesitas una variante? Agrégala al componente (PR de código compartido).
2. ¿Se repite en 2+ módulos? Extráelo a `components/ui`.
3. ¿Nuevo color o tamaño? Casi nunca: usa un token. Si de verdad falta, se agrega a `globals.css` y a esta tabla.
