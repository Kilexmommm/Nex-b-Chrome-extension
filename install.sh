#!/usr/bin/env bash
# Optional installer: download/review this script first, then pass a full commit SHA.
# Usage: bash install.sh <40-character-commit> [destination]
set -euo pipefail
REPO="Kilexmommm/Nex-b-Chrome-extension"
COMMIT="${1:-}"
TARGET="${2:-${NEXB_DIR:-$HOME/nex.b}}"
say() { printf '%s\n' "$*"; }
fail() { printf 'nex.b: %s\n' "$*" >&2; exit 1; }
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || fail "Indica el SHA completo de un commit publicado; no se ejecutan actualizaciones desde main."
command -v curl >/dev/null || fail "hace falta curl."
command -v tar >/dev/null || fail "hace falta tar."
is_nexb() { [ -f "$1/manifest.json" ] && grep -q '"name": "nex.b"' "$1/manifest.json"; }
[ ! -L "$TARGET" ] || fail "El destino es un enlace simbólico; no se reemplaza."
[ ! -d "$TARGET/.git" ] || fail "El destino es un clon de Git. Actualízalo con Git al commit elegido."
if [ -e "$TARGET" ] && ! is_nexb "$TARGET"; then
  fail "$TARGET ya existe y no es una carpeta de nex.b; no se reemplaza."
fi
work="$(mktemp -d)"
backup=""
installed=0
cleanup() {
  result=$?
  if [ "$installed" -eq 0 ] && [ -n "$backup" ] && [ -e "$backup" ] && [ ! -e "$TARGET" ]; then
    mv "$backup" "$TARGET" || say "La copia anterior sigue disponible en $backup"
  fi
  rm -rf "$work"
  exit "$result"
}
trap cleanup EXIT
curl --proto '=https' --tlsv1.2 -fsSL --connect-timeout 20 --max-time 180 "https://github.com/$REPO/archive/$COMMIT.tar.gz" -o "$work/release.tar.gz"
tar -xz -f "$work/release.tar.gz" -C "$work"
source_dir="$work/Nex-b-Chrome-extension-$COMMIT"
is_nexb "$source_dir" || fail "La descarga no contiene nex.b; no se ha cambiado nada."
mkdir -p "$(dirname "$TARGET")"
if [ -e "$TARGET" ]; then
  backup="${TARGET}.previous-$(date +%Y%m%d-%H%M%S)-$$"
  mv "$TARGET" "$backup"
fi
mv "$source_dir" "$TARGET"
installed=1
say "nex.b instalado desde el commit $COMMIT en $TARGET."
[ -z "$backup" ] || say "Archivos anteriores conservados en $backup."
say "Carga la carpeta o recarga la extensión en chrome://extensions. No la desinstales."
