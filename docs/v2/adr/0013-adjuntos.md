# 0013. Archivos adjuntos en almacenamiento S3 (Cloudflare R2)

- Estado: Propuesto · Fecha: 2026-11-17

## Contexto
v1 no tiene adjuntos: el XML de los DTE se guarda como texto y las cartolas se importan sin guardar el archivo. Para
operar de verdad hace falta guardar:

- cartolas bancarias;
- facturas de proveedores;
- informes de laboratorio;
- certificados (D.O., INAPI, SAG);
- diseños de etiqueta;
- fotos de cuarteles;
- XML de DTE y CAF.

Postgres no es buen lugar para archivos.

## Decisión
- **Almacenamiento**: compatible con S3, **Cloudflare R2** por defecto (sin costo de salida de datos). El cliente
  es `@aws-sdk/client-s3`, así que se puede cambiar a S3 o MinIO en local.
- **Metadatos** en la tabla `adjunto (org, entidad, registro_id, clave_objeto, nombre, mime, bytes, subido_por)`,
  con RLS como cualquier tabla.
- **Subida directa** desde el navegador con URL firmada:
  1. Una Server Action verifica el permiso `e` sobre el módulo dueño de la entidad.
  2. Valida el tipo y el tamaño.
  3. Firma un PUT por 5 minutos con la clave `org_id/entidad/registro_id/uuid-nombre`.
  4. El navegador sube el archivo y confirma.
- **Descarga** con una URL firmada de corta duración, generada después de verificar el permiso `v`. El bucket nunca
  es público.
- **Límites**: por archivo (20 MB) y por viña según el plan ([0014](0014-planes-y-cobro.md)). El uso se calcula con
  Σ `bytes`.
- **Borrado**: el borrado lógico del registro deja el archivo. Un job semanal elimina los objetos de adjuntos
  borrados hace más de 30 días.
- **Componente**: `<Adjuntos entidad="compra" id={…} />` en `components/ui`.

## Consecuencias
- Hay que manejar variables de entorno y credenciales de R2. En desarrollo: MinIO en `docker-compose` o un bucket de
  prueba.
- Los adjuntos **no están disponibles offline** (solo los metadatos). Es aceptable: subir requiere conexión.

## Alternativas consideradas
- **Guardar en Postgres (`bytea`)**: infla la base y los respaldos.
- **Vercel Blob / Supabase Storage**: amarran a un proveedor; R2 es más barato y estándar.
