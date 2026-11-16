#!/bin/sh
# Winzer Gestión — abre la app en http://localhost:8642 (funciona en Chrome, Edge, Firefox y Safari).
# Deja abierta esta ventana mientras usas la app. Para cerrar: Ctrl+C o cierra la ventana.
cd "$(dirname "$0")" || exit 1
PORT=8642
URL="http://localhost:$PORT/"
if ! command -v python3 >/dev/null 2>&1; then
  echo "Se necesita python3 (en Mac se instala solo al aceptar las herramientas de desarrollo de Apple)."
  exit 1
fi
( sleep 1; if command -v open >/dev/null 2>&1; then open "$URL"; else xdg-open "$URL" >/dev/null 2>&1; fi ) &
echo ""
echo "  Winzer Gestión está funcionando en $URL"
echo "  Deja esta ventana abierta mientras usas la app."
echo ""
python3 -m http.server "$PORT" --bind 127.0.0.1
