# 0009 — Dirección visual «v1 afinado»

- Estado: aceptada (reemplaza a [0008](0008-direccion-visual-marca-de-fuego.md))
- Fecha: 2026-11-17

## Contexto

La dirección «Marca de fuego» (0008) es blanco y negro estricto, con líneas y sellos. Quedó elegante, pero se
alejaba mucho de v1, que ya usan y conocen. De v1 se valoran:

- el menú lateral negro;
- las tarjetas de cifras con comparación entre temporadas;
- los filtros;
- el color para tinto y blanco.

Se compararon tres puntos medios en el lienzo de diseño:

- F · Fichas de bodega: más cerca de A.
- G · Tinta lateral: el centro.
- H · v1 afinado: más cerca de v1.

## Decisión

Se elige **H · v1 afinado**:

- **Se mantiene de v1**: la estructura (menú lateral negro con íconos, barra superior con usuario, tarjetas de
  cifras, tablas en tarjeta con filtros), las cápsulas de color para el tipo de uva y los estados, y la fuente
  Noto Sans.
- **Se cambia**: logo real en vez de la "W", Gilda Display en los títulos, íconos de línea en vez de emojis, y
  bordes en vez de sombras.
- **Color**: un acento vino para tinto y gráficos y un dorado para blanco, siempre con texto.

Detalle: [diseno.md](../diseno.md).

## Consecuencias

- Se abandona el blanco y negro estricto: el color vuelve a usarse para tipo de uva, estados y gráficos.
  `apps/web/PRODUCT.md` se actualizó.
- Desaparece el componente `Sello`. El código del registro va en negrita (`Codigo`), con un ícono azul cuando está
  pendiente de sincronizar.
- Hay dos piezas de v1 que H muestra pero v2 todavía no implementa: el selector de temporada y la campana de avisos.
  No se agregaron como controles vacíos. Se suman cuando existan las temporadas (con Cosecha) y las alertas (jobs en
  segundo plano).
- Si se confirma la licencia web de Agatho, puede reemplazar a Gilda Display cambiando `--font-display` en
  `layout.tsx`.
