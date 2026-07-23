#!/usr/bin/env bash
# Install 6ears-spotify-ads binary release into ~/.local
# Usage:
#   curl -fsSL …/install.sh | bash
#   OR: bash scripts/install.sh /path/to/6ears-spotify-ads-v0.1.0-darwin-arm64.tar.gz
set -euo pipefail

PREFIX="${SIXEARS_PREFIX:-$HOME/.local/share/6ears-spotify-ads}"
BIN_DIR="${SIXEARS_BIN:-$HOME/.local/bin}"

ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" ]]; then
  echo "Usage: $0 <path-to-release.tar.gz>"
  echo "Or build first: npm run build:binary"
  exit 1
fi
if [[ ! -f "$ARCHIVE" ]]; then
  echo "Archive not found: $ARCHIVE"
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
tar -xzf "$ARCHIVE" -C "$TMP"
SRC=$(find "$TMP" -maxdepth 1 -type d -name '6ears-spotify-ads-v*' | head -1)
if [[ -z "$SRC" ]]; then
  echo "Unexpected archive layout"
  exit 1
fi

mkdir -p "$PREFIX" "$BIN_DIR"
rsync -a --delete "$SRC/" "$PREFIX/"
ln -sfn "$PREFIX/6ears-spotify-ads" "$BIN_DIR/6ears-spotify-ads"

# Ensure bin dir on PATH hint
if ! echo ":$PATH:" | grep -q ":$BIN_DIR:"; then
  echo "Add to your shell profile:"
  echo "  export PATH=\"$BIN_DIR:\$PATH\""
fi

echo "Installed to $PREFIX"
echo "Binary link: $BIN_DIR/6ears-spotify-ads"
"$BIN_DIR/6ears-spotify-ads" doctor || true
