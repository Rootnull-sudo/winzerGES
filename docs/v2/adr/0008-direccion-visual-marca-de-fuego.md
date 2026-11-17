# 0008 — Dirección visual «Marca de fuego»

- Estado: aceptada
- Fecha: 2026-11-17

## Contexto

La primera base de v2 usaba la dirección «tinta sobre papel de etiqueta»: fondo crema, Fraunces e Instrument
Sans, y color para tinto/blanco. Era correcta, pero se parecía a lo que generan por defecto muchas herramientas
y no partía de la marca. El logo WINZER® es una palabra en mayúsculas en serif de alto contraste (Agatho
RegularCaps), en blanco y negro.

Se exploraron cinco direcciones sobre la misma pantalla (Catastro, escritorio y móvil):

- A · Marca de fuego: el código de cada registro como sello de barrica.
- B · Carta de vinos: listas con líneas de puntos.
- C · Retícula: grilla visible.
- D · Catálogo nocturno: negro mate y líneas blancas.
- E · Estándar SaaS: como referencia.

## Decisión

Se elige **A · Marca de fuego**:

- Blanco y negro estricto. El color queda solo para estados que piden atención.
- Tinto/blanco y sincronizado/pendiente se distinguen por forma, no por color.
- Gilda Display para títulos y códigos, y Public Sans para texto y datos.
- Líneas de 1 px y esquinas rectas.
- El componente `Sello` es la firma visual.
- Las páginas anchas suman una columna de composición con información real, para que no se vean vacías.

Detalle y reglas: [diseno.md](../diseno.md).

## Consecuencias

- Agatho queda solo en el logo (imagen) hasta confirmar su licencia web. Si se confirma, puede reemplazar a
  Gilda Display cambiando `--font-display` en `layout.tsx`.
- Los gráficos futuros deben funcionar en blanco y negro: tramas, grosores y etiquetas directas en vez de una
  paleta de colores.
- El modo oscuro hereda el negro mate de la dirección D.
