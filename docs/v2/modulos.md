# Módulos: qué hace cada uno y qué falta

Una ficha por módulo de `packages/domain/src/modules.ts`. Cómo migrar: [migrar-modulo.md](migrar-modulo.md).
Tablas: [modelo-datos.md](modelo-datos.md). Reglas y fórmulas: [dominio.md](dominio.md). Orden y reparto:
[hoja-de-ruta.md](hoja-de-ruta.md).

**Tamaño** (esfuerzo relativo, incluye tests): S ≈ 1–2 días · M ≈ 3–5 · L ≈ 1–2 semanas.
**Hecho cuando** = criterio de aceptación del issue. Además, en todos: E2E del flujo principal, permisos `vcedx`
comprobados en el servidor y paridad con v1 en los cálculos portados.

Leyenda del estado: ✅ migrado · ⬜ pendiente.

---

## Inicio

### Dashboard · ⬜ parcial · F7 · L
- **Pantallas**: saludo, KPIs por área según los permisos del rol, gráficos y panel de alertas.
- **KPIs que vienen de v1**:
  - **Operación y bodega**: kg cosechados, litros producidos, litros envasados, mermas y vinagre, ocupación de
    bodega, lotes en fermentación, metabisulfito usado, granel en stock.
  - **Comercial, finanzas y tributario**: ventas, unidades, margen, cuentas por cobrar y pagar, IVA del mes.
  - Todos comparados contra la temporada anterior.
- **Gráficos**: kg vs litros de las últimas 5 temporadas, ocupación por estanque, SO₂ de las fichas activas,
  rentabilidad por cuartel.
- **Corrige**: todos los KPIs usan el rango de la temporada (v1 mezclaba temporada y año calendario).
- **Hecho cuando**: cada KPI coincide con v1 sobre el respaldo demo importado.

---

## Operación (offline)

### Catastro vitícola · ✅
- **Hecho en F1**: las variedades del formulario vienen del maestro `variedad` (con su tipo).
- **Falta**:
  - ficha del cuartel con historial por temporada (kg, kg/ha, costo, margen; `financial.rentabilidadCuarteles`);
  - adjuntar fotos.
  - Va en F1 y F7.

### Desborre y fenología · ✅ (F1-2)
- **Tablas**: `fenologia`, `clima`.
- **Pantallas**:
  - registros por cuartel y temporada, con gráfico del inicio de desborre en las últimas 3 temporadas;
  - pestaña Clima, con grados día acumulados de septiembre a abril y región Winkler.
- **Cálculos**: `oenology.gradosDia`, ya portado.
- **Alertas**: variación de 7 días o más, desborre sin fin después de 25 días, desborre sin registrar desde el 15 de
  octubre.
- **Hecho cuando**: se registran el desborre y el clima sin conexión, y Winkler coincide con v1.

### Insumos y labores · ✅ (F1-1, F1-3)
- **Tablas**: `insumo`, `insumo_precio`, `mov_insumo`, `aplicacion`, `labor`.
- **Pantallas**:
  - maestro de insumos, con campos que dependen de la categoría;
  - aplicaciones, con cantidad sugerida, costo y "cosechar desde";
  - labores.
- **Reacciones**: la aplicación escribe `mov_insumo` negativo. El maestro se lee offline, pero escribirlo exige
  conexión.
- **Alertas**: carencia (cosecha dentro del período y vencimientos próximos), stock bajo y vencimiento.
- **Nota**: es la base de vinificación, fermentación, envasado y compras.
- **Hecho cuando**: una aplicación hecha offline descuenta stock al sincronizar y `v_stock_insumo` coincide con v1.

### Cosecha · ✅ (F1-4; la reacción con el lote llega en F2-1)
- **Tablas**: `cosecha`, `jornal`.
- **Pantallas**:
  - registros con kg/cajón, kg/ha y costo/kg en vivo;
  - personal y pagos por cosecha, con tarifa por kg, cajón o día;
  - gráfico de kg por cuartel.
- **Cálculos**: `financial.costoCosecha` y `pagoJornal` (portar con paridad).
- **Reacción**: crear una cosecha pasa el lote a "En vendimia".
- **Alerta**: cajones fuera de rango.
- **Hecho cuando**: una cuadrilla registrada en el viñedo sin señal queda con el pago calculado.

### Calendario de vendimia · ✅ (F2-1)
- **Tablas**: `lote`, `lote_cuartel`, `ventana`.
- **Pantallas**:
  - lotes de la temporada, con el plan de fases (molienda, FA, maceración, descube, FML, guarda);
  - **Gantt** mensual y semanal, con hitos reales y la línea de hoy;
  - ventanas de vendimia por variedad y valle.
- **Cálculos**: `plan()` y `desvios()` (`calendario/index.js:28-56`).
- **Alertas**: desvíos, fases que empiezan en 7 días o menos, más de 2 lotes el mismo día, recordatorios del SAG.
- **Hecho cuando**: el Gantt muestra plan y realidad de un lote demo y los desvíos coinciden con v1.

### Laboratorio · ⬜ · F2 · S
- **Tablas**: `analisis`.
- **Pantallas**: análisis por lote, con parámetros fuera de rango destacados y gráfico de SO₂ y acidez.
- **Adjunto**: informe del laboratorio en PDF.
- **Corrige**: los rangos dejan de estar fijos en el código y pasan a `parametro_org`.
- **Hecho cuando**: se ven los fuera de rango y se puede adjuntar el informe.

---

## Vinificación y bodega (offline)

### Control de bodega · ✅ (F2-2)
- **Tablas**: `estanque`, `mov_bodega`, vistas `v_stock_estanque`, `v_ocupacion` y `v_balance_lote`.
- **Pantallas**:
  - grilla de estanques con su nivel y KPIs de ocupación;
  - **Entrada**, **Trasiego** y **Merma / vinagre / ajuste**, con validación de capacidad y stock;
  - tabla de movimientos de la temporada;
  - balance de masa por lote.
- **Reacción**: una entrada que no es vino crea la ficha de fermentación y pasa el lote a "En molienda".
- **Alertas**: sobrecapacidad y mermas sobre el 3%.
- **Corrige**: el balance de masa pasa a compararse contra los kg de uva.
- **Hecho cuando**: un trasiego hecho offline se sincroniza como 2 o 3 movimientos con el mismo `grupo`, y la
  ocupación coincide con v1.

### Vinificación y aditivos · ⬜ · F2 · M
- **Tablas**: `aditivo`.
- **Pantallas**: aditivos por lote, con cálculo de SO₂ (modo suave o moderado) y dosis g/hL, y costo enológico
  acumulado por lote.
- **Cálculos**: `oenology` (SO₂, ya portado) y `financial.costoLitroLote` (parte enológica).
- **Reacción**: `mov_insumo` en la unidad correcta del insumo.
- **Hecho cuando**: la conversión de unidades tiene tests en g, kg y L, y el costo por lote coincide con v1.

### Fermentación · ⬜ · F2 · L (el más complejo)
- **Tablas**: `fermentacion`, `seguimiento`, `adicion_so2`.
- **Pantallas**:
  - tarjetas por ficha con su etapa;
  - detalle con 4 KPIs, alertas, 3 gráficos (°Brix y densidad, temperatura, SO₂ con su franja), hitos, adiciones y
    seguimiento;
  - formulario de seguimiento diario;
  - adición de metabisulfito con eficiencia;
  - reporte de cierre en CSV o PDF.
- **Cálculos**: `oenology.tiempos`, °Brix desde la densidad, alcohol probable y estado del SO₂ (ya portados).
- **Reacciones**:
  - inicio de FA → lote "Fermentando";
  - fin de FA → lote "FML" o "En guarda", más una tarea de trasiego para el enólogo;
  - adición de SO₂ → `mov_insumo` y `seguimiento`.
- **Corrige**: la temperatura sobre 32 °C pasa a ser un aviso y no bloquea.
- **Hecho cuando**: el ciclo completo de una ficha funciona offline en el celular, incluida la adición de SO₂ con
  confirmación por intervalo.

### Histórico kg y litros · ⬜ · F2 · S
- **Pantallas**: comparación entre temporadas (kg, L, L/kg, envasado, granel, mermas, variación) y detalle por lote
  con filtros. Exporta CSV.
- **Lee**: `v_balance_lote`, cosecha y orden de envasado.
- **Hecho cuando**: los totales por temporada coinciden con v1.

---

## Comercial (online)

### Envasado y etiquetado · ⬜ · F5 · L (espera a Bodega)
- **Tablas**: `formato`, `orden_envasado`, `mov_producto`.
- **Pantallas**:
  - órdenes de envasado, con costo unitario por componente en vivo y litros necesarios vs disponibles;
  - formatos;
  - validador de etiqueta (Ley 18.455).
- **Cálculos**: `financial.costoEnvasado` y `prorrateoEtiqueta`.
- **Servicio `confirmarEnvasado`**:
  - escribe `mov_bodega` (−L), `mov_insumo` de los materiales y `mov_producto` (+unidades);
  - congela el costo;
  - pasa el lote a "Envasado" si quedan menos de 1 L.
- **Validación D.O.**: 75% de uva de la zona y certificado.
- **Hecho cuando**: confirmar una orden descuenta bodega e insumos en una sola transacción y el costo unitario
  coincide con v1.

### Marca y etiquetas · ⬜ · F5 · S
- **Tablas**: `marca`, `etiqueta`.
- **Pantallas**: marcas con su estado de vigencia INAPI; etiquetas por versión, con costos y declaraciones.
- **Adjuntos**: certificado INAPI y diseños.
- **Alerta**: marca por vencer (180 días o menos).

### Inventarios · ⬜ · F5 · M
- **Pantallas**: producto terminado, granel, insumos de envasado, insumos agrícolas y enológicos, y movimientos.
- **Ajustes de inventario**: insumos (`mov_insumo`) y botellas (`mov_producto`, nuevo: quiebre, muestra, conteo).
- **Lee**: las vistas `v_stock_*`.
- **Hecho cuando**: el valor del inventario coincide con v1.

### Ventas · ⬜ · F5 · L
- **Tablas**: `venta`, `venta_linea`, `cobro_aplicacion` (migración de `cobro.venta_id`).
- **Pantallas**:
  - registro **con varias líneas** (envasado o granel), con margen en vivo si el rol puede ver costos;
  - borrador imprimible;
  - anular;
  - reportes por mes, canal y formato, y conciliación de litros.
- **Servicios**:
  - `confirmarVenta`: stock, congela el costo, `mov_producto` o `mov_bodega` y DTE.
  - `anularVenta`: nota de crédito 61 o boleta anulada, y reversa.
- **Hecho cuando**: una venta con una línea envasada y otra a granel descuenta ambos stocks y genera un DTE simulado.

### Clientes y cobranza · ✅ (ampliar en F5)
- **Falta**:
  - cuentas por cobrar con antigüedad (por vencer, 1–30, 31–60, > 60 días);
  - cobros parciales aplicados a varias ventas;
  - ficha con historial de compras.

---

## Finanzas (online)

### Proveedores y compras · ⬜ · F3 · L
- **Tablas**: `proveedor`, `compra`, `compra_linea`, `pago`, `pago_aplicacion`, `insumo_precio`.
- **Pantallas**:
  - compras **con varias líneas** y factura adjunta;
  - maestro de proveedores;
  - cuentas por pagar;
  - evolución de precios por insumo.
- **Servicio `registrarCompra`**: `mov_insumo`, precio e historial, y DTE recibido.
- **Corrige**: las notas de crédito se guardan en positivo; el signo lo pone el tipo.
- **Hecho cuando**: una NC baja el crédito de IVA y el stock (lo contrario de v1, que estaba mal).

### Sueldos y gastos · ⬜ · F3 (gastos y presupuesto) + F4 (personas) · L
- **Tablas**: `gasto`, `presupuesto`, `trabajador`, `remuneracion`, `honorario`.
- **Pantallas**:
  - trabajadores, con liquidación estimada en vivo;
  - remuneraciones ("calcular mes", liquidación imprimible, marcar pagada);
  - honorarios;
  - gastos (factura afecta → DTE recibido);
  - presupuesto vs real.
- **Cálculos**: `tax.liquidacion` (ya portado), usando los **indicadores del mes** y guardando la foto de los
  valores. Se agregan días trabajados, horas extra, anticipos y el tope de AFC.
- **Hecho cuando**: la liquidación de un mes pasado usa la UF y la UTM de ese mes.

### Costos por botella/litro · ⬜ · F7 · M
- **Tablas**: `activo`.
- **Pantallas**:
  - resumen: costo por litro ponderado, indirectos y costo de ventas;
  - tarjetas por formato con costo directo + indirecto y margen;
  - costo directo por lote;
  - activos fijos con su depreciación.
- **Cálculos**: `financial.costoLitroLote`, depreciación y amortización.
- **Corrige**: la depreciación termina al cumplir la vida útil y se prorratea desde la fecha de compra.

### Financiero · ⬜ · F7 · L
- **Pantallas**: estado de resultados, 13 ratios con semáforo, punto de equilibrio, simulador con escenarios, flujo
  de caja mensual, rankings y BCG, resumen ejecutivo.
- **Cálculos**: `financial.js:145-345`, con paridad salvo los bugs que se corrigen.
- **Corrige**: el flujo de caja usa el líquido y el F29, sin contar dos veces.
- **Hecho cuando**: el estado de resultados coincide con v1 sobre el respaldo demo.

---

## Tributario (online)

### DTE (SII) · ⬜ · F6 · L
- **Tablas**: `dte`, `dte_linea`, `caf`, `secuencia`.
- **Pantallas**:
  - documentos emitidos y recibidos, con XML y estados;
  - nota de crédito total o parcial, y nota de débito (falta en v1);
  - libros de compras y ventas;
  - folios (CAF);
  - datos del emisor.
- **Integración**: `ProveedorDTE` con implementación `simulado` (paridad con v1). El XML se guarda como adjunto.
- **Corrige**: los folios no se reutilizan y el XML usa una codificación correcta.

### Tributario (F29, PPM, Renta) · ⬜ · F6 · L
- **Tablas**: `f29`, `renta`, `pago_impuesto`, `obligacion`.
- **Pantallas**: F29 con códigos del formulario y estados, PPM, renta, calendario tributario y configuración del
  régimen.
- **Cálculos**:
  - `tax.f29` (ya portado);
  - portar `remanente`, `ppmAnual`, `renta` y `calendario`.
- **Servicio `pagarF29`**: crea los pagos de impuesto y cumple la obligación.
- **Alertas**: vencimientos del calendario.

### Conciliación bancaria · ⬜ · F6 · L
- **Tablas**: `cuenta_banco`, `cartola`, `mov_banco`, `conciliacion_match`.
- **Pantallas**:
  - cuentas;
  - importar cartola en CSV, con mapeo de columnas, vista previa y la cartola adjunta;
  - movimientos con conciliación automática y manual;
  - diferencia → gasto financiero;
  - resumen por cuenta.
- **Cálculos**: `recon.candidatos` y la regla de matching (monto ±1, fecha ±7 días).
- **Corrige**: usa los cobros y pagos parciales, y filtra por cuenta.

### Cumplimiento normativo · ⬜ · F6 · M
- **Tablas**: `cumplimiento`.
- **Pantallas**:
  - registro con vencimientos;
  - recordatorios del SAG;
  - controles automáticos (lotes sin análisis SAG, D.O. sin respaldo);
  - libro de existencias en CSV.
- **Adjuntos**: resoluciones y certificados.

---

## Administración

### Usuarios y permisos · ✅
- **Falta**:
  - auditoría consultable con filtros y exportación;
  - bandeja de **tareas** (F0);
  - límite de usuarios según el plan (F0).

### Configuración y datos · ✅
- **Falta**:
  - parámetros con vigencia (`parametro_org`, F0);
  - temporadas (F0);
  - exportar todos los datos de la viña (JSON y CSV por tabla);
  - importar CSV por tabla;
  - plan y facturación (F8).

### Ayuda · ⬜ · F7 · S
- Guía estática por módulo, atajos de teclado y avisos legales. Contenido en MDX dentro de la app.
