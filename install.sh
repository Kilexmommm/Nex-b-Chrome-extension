#!/usr/bin/env bash
# Instala o actualiza nex.b desde GitHub (rama main).
#   curl -fsSL https://raw.githubusercontent.com/Kilexmommm/Nex-b-Chrome-extension/main/install.sh | bash
# Carpeta de destino: ~/nex.b (cámbiala con NEXB_DIR=/otra/ruta).
# Tus datos no están en esta carpeta: viven en Chrome y no se tocan.
set -euo pipefail

REPO="Kilexmommm/Nex-b-Chrome-extension"
BRANCH="${NEXB_BRANCH:-main}"
TARGET="${NEXB_DIR:-$HOME/nex.b}"

say() { printf '%s\n' "$*"; }
fail() { printf 'nex.b: %s\n' "$*" >&2; exit 1; }

is_nexb() { [ -f "$1/manifest.json" ] && grep -q '"name": "nex.b"' "$1/manifest.json"; }
version_of() { sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$1/manifest.json" | head -n 1; }

command -v curl >/dev/null || fail "hace falta curl."
command -v tar >/dev/null || fail "hace falta tar."

# Un clon de Git se actualiza con git pull para no pisar su historial.
if [ -d "$TARGET/.git" ]; then
  is_nexb "$TARGET" || fail "$TARGET es un repositorio de Git que no es nex.b; no se toca."
  before="$(version_of "$TARGET")"
  git -C "$TARGET" pull --ff-only
  after="$(version_of "$TARGET")"
  say "nex.b actualizado en $TARGET: $before → $after."
  say "Abre nex.b y pulsa «Recargar nex.b» (o ↻ en chrome://extensions)."
  exit 0
fi

if [ -e "$TARGET" ] && ! is_nexb "$TARGET"; then
  fail "$TARGET ya existe y no es una carpeta de nex.b; no se reemplaza. Usa NEXB_DIR=/otra/ruta."
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
say "Descargando nex.b ($BRANCH) desde GitHub…"
curl -fsSL "https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz" | tar -xz -C "$work"
source_dir="$(find "$work" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
is_nexb "$source_dir" || fail "la descarga no contiene nex.b; no se ha cambiado nada."
new_version="$(version_of "$source_dir")"

if [ -e "$TARGET" ]; then
  old_version="$(version_of "$TARGET")"
  # Se reemplaza de golpe: la carpeta vieja solo se borra si la nueva ya está en su sitio.
  mv "$TARGET" "$work/anterior"
  mv "$source_dir" "$TARGET"
  say "nex.b actualizado en $TARGET: $old_version → $new_version."
  say "Abre nex.b y pulsa «Recargar nex.b» (o ↻ en chrome://extensions)."
else
  mkdir -p "$(dirname "$TARGET")"
  mv "$source_dir" "$TARGET"
  say "nex.b $new_version instalado en $TARGET."
  say ""
  say "Último paso (solo esta vez):"
  say "  1. Abre chrome://extensions y activa «Modo de desarrollador»."
  say "  2. Pulsa «Cargar descomprimida» y elige la carpeta $TARGET"
  say "Para actualizar en el futuro, vuelve a pegar el mismo comando."
fi
