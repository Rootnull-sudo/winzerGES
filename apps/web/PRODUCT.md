# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Administración y dueños de viña**: en la oficina, pantalla grande. Revisan ventas, cobranza, costos, tributario (F29, PPM) e inventario. Leen tablas largas y comparan cifras.
- **Equipo de campo y bodega** (agrónomo, enólogo, jefe de bodega): con el teléfono en el viñedo o la bodega, a veces a pleno sol y sin señal. Registran cuarteles, labores, cosecha, análisis y movimientos de estanques.
- **Contador o enólogo consultor**: trabaja en varias viñas y cambia entre ellas.

Ambos grupos pesan lo mismo: escritorio denso para la oficina y móvil robusto para el campo, con un mismo lenguaje visual.

## Product Purpose

Winzer Gestión es el sistema de gestión integral de una viña chilena: viñedo, vinificación y bodega, comercial, finanzas y tributario. Sustituye planillas y cuadernos por un registro único y trazable. El éxito es que cada persona encuentre y registre el dato que necesita sin fricción y que los números cuadren.

## Positioning

Cubre toda la cadena de una viña chilena en un solo sistema (del cuartel a la botella y al F29), con reglas tributarias chilenas (IVA, ILA, PPM), varias viñas por cuenta y módulos de campo y bodega que funcionan sin conexión.

## Operating Context

- 26 módulos agrupados en áreas: Operación, Vinificación y bodega, Comercial, Finanzas, Tributario, Administración.
- Las áreas Operación, Bodega y Administración funcionan offline; el resto solo con conexión.
- Vocabulario: viña, cuartel, variedad, tinto/blanco, estanque, lote, SO₂, cosecha, DTE, F29, RUT, CLP.

## Capabilities and Constraints

- App web Next.js (ver `docs/v2/arquitectura.md`); PWA instalable.
- Textos en español de Chile; montos en CLP sin decimales; decimales con coma.

## Brand Commitments

- **Nombre y logo**: WINZER®, palabra en mayúsculas en serif clásica de alto contraste (`../Logo Winzer.jpeg`, fuera del repo). Tipografía del logo: **Agatho RegularCaps** (comercial; licencia web sin confirmar, así que por ahora se usa solo el logo como imagen y fuentes libres afines en la interfaz).
- **Blanco y negro estricto**: la identidad es B/N. El color se reserva para estados (ok, advertencia, error, info) y nunca es el único indicador.
- Dirección buscada: elegancia, legibilidad y minimalismo, sin perder densidad de información.

## Evidence on Hand

- Datos de demo ficticios (seed). Nunca usar datos reales (RUT, clientes, montos) en diseños ni capturas.

## Product Principles

1. El dato manda: cifras legibles, alineadas y comparables antes que decoración.
2. La misma app en la oficina y en el viñedo: la densidad se adapta, el lenguaje no.
3. Sin señal no se pierde nada: el estado de sincronización siempre es visible.
4. Sobriedad de marca: el B/N del logo es la identidad, y el color significa algo.

## Accessibility & Inclusion

- Uso a pleno sol en móvil: contraste alto (WCAG AA mínimo en texto pequeño) y objetivos táctiles de al menos 44 px.
- El color nunca es el único indicador (tinto/blanco y estados siempre con texto o ícono).
