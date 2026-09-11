#!/bin/zsh
# Instala el host local para una copia descargada desde:
# https://github.com/Kilexmommm/Nex-b-Chrome-extension
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
exec /usr/bin/python3 -I "$script_dir/install_macos.py" "$@"
