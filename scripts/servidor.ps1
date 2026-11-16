# Winzer Gestión — mini servidor local para Windows (sin instalar nada).
# Sirve la carpeta del sistema en http://localhost:8642 y abre el navegador predeterminado.
# Permite usar la app en cualquier navegador (incluido Firefox) con los datos guardados de forma estable.
# Solo escucha en este computador (localhost): no es accesible desde otros equipos.
$ErrorActionPreference = 'Stop'
$port = 8642
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$url  = "http://localhost:$port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
try { $listener.Start() }
catch {
  # Si el puerto ya está en uso, probablemente el servidor ya está abierto: solo abrimos el navegador.
  Start-Process $url
  exit
}

$tipos = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'application/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.svg' = 'image/svg+xml'
  '.ico' = 'image/x-icon'; '.md' = 'text/plain; charset=utf-8'; '.woff2' = 'font/woff2'
}

Write-Host ''
Write-Host '  Winzer Gestion esta funcionando en' $url
Write-Host '  Deja esta ventana abierta mientras usas la app. Para cerrar: cierra esta ventana.'
Write-Host ''
Start-Process $url

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
    # Seguridad: solo archivos dentro de la carpeta del sistema
    if ($file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $res.ContentType = if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-cache')
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.Close()
  }
}
