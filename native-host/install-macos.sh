#!/bin/zsh
# Instala el host local para una copia descargada desde:
# https://github.com/Kilexmommm/Nex-b-Chrome-extension
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
host_path="$script_dir/nex_b_native_host.py"
manifest_dir="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
manifest_path="$manifest_dir/com.kilex.nex_b.json"

if [[ ! -f "$host_path" ]]; then
  print -u2 "No se encontró nex_b_native_host.py junto al instalador."
  exit 1
fi

extension_id="${1:-}"
if [[ -z "$extension_id" ]]; then
  print "Abre chrome://extensions, activa Modo de desarrollador y copia el ID de nex.b."
  read "extension_id?ID de la extensión: "
fi
if [[ ! "$extension_id" =~ '^[a-p]{32}$' ]]; then
  print -u2 "El ID debe tener 32 letras entre a y p. No se instaló nada."
  exit 1
fi

chmod 700 "$host_path"
mkdir -p "$manifest_dir"
cat > "$manifest_path" <<EOF
{
  "name": "com.kilex.nex_b",
  "description": "Asistente local de nex.b para macOS",
  "path": "$host_path",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$extension_id/"]
}
EOF
chmod 600 "$manifest_path"
print "Instalado para nex.b. Recarga la extensión en chrome://extensions."
