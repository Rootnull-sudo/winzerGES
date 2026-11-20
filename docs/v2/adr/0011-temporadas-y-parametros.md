# 0011. Temporadas y parámetros con vigencia

- Estado: Propuesto · Fecha: 2026-11-17

## Contexto
**La temporada en v1:**
- Es un número guardado en el navegador.
- Algunas entidades guardan `temporada` (fenología, cosecha, lote…) y otras se filtran por el año de la fecha.
- El dashboard mezcla los dos criterios.

**Los parámetros en v1:**
- Las tasas e indicadores (UF, UTM, IMM, IVA, PPM, tramos del impuesto único, rangos de SO₂) están en un solo
  registro `config` sin historia. Una liquidación de marzo recalculada en junio usa la UF de junio.
- Varios valores están fijos en el código: 8.000 kg/ha, 19 kg/cajón, 87,8 UF, rangos de laboratorio.

## Decisión
- **`temporada`** por viña:
  - Año de vendimia, inicio, fin (por defecto del 1 de julio al 30 de junio) y estado abierta o cerrada.
  - La **actual no se guarda**: es la que contiene la fecha de hoy en Chile (`temporadaActual()`). Así no hay una
    marca única que mantener ni que reaccionar al cambiar de temporada.
  - Es un maestro offline que reciben **todos los roles** (`readAll` en `SYNC_ENTITIES`), porque viñedo y bodega
    la necesitan sin señal. Crearla o cerrarla exige permiso en Configuración.
  - Las tablas de viñedo y bodega guardan `temporada_id`. Las comerciales, financieras y tributarias se filtran por
    `fecha` dentro del rango de la temporada.
  - Hay un **selector global** en la barra superior, con el estado en la URL (`?t=2026`). Todos los listados, KPIs
    y reportes usan `temporadaDe()` (`apps/web/src/lib/temporada.ts`).
  - Una temporada cerrada es de solo lectura: lo valida `repo.upsert` en las tablas con `temporada_id` (se agrega con
    la primera de ellas, en F1-2).
- **`indicador`** es una tabla **global**, sin RLS:
  - Guarda `clave` + `fecha` + `valor`: UF diaria, UTM e IMM mensuales, topes en UF, tasa de retención de honorarios
    y tramos del impuesto único.
  - La carga un job desde una fuente pública. Un seed cubre los años de demo.
- **`parametro_org`** por viña:
  - Guarda `clave` + `valor` + `vigente_desde`: tasas, régimen, umbrales de enología y rendimientos esperados.
  - Se lee con `getParametro(clave, fecha)`.
- **Foto de valores**: los cálculos que generan un documento (liquidación, F29, renta, costo congelado de un
  envasado) guardan en el documento los valores que usaron.

## Consecuencias
- Recalcular un periodo pasado da el mismo resultado.
- `organization.settings` queda solo para preferencias de interfaz. Los valores de negocio se mueven en F0-2.
- Hace falta definir la fuente de los indicadores (p. ej. la API pública de mindicador.cl) y qué hacer si falla:
  se usa el último valor conocido y se avisa.

## Alternativas consideradas
- **Temporada como número suelto en cada tabla**: es lo que hacía v1. No tiene fechas de inicio y fin, y no deja
  cerrar una temporada.
- **Indicadores por viña**: duplica datos públicos y obliga a cada viña a mantenerlos.
