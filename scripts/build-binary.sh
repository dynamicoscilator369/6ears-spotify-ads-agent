#!/usr/bin/env bash
# Build a downloadable binary release (Bun compile) + knowledge sidecar + checksums.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun required. Install: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) ARCH=x64 ;;
  aarch64|arm64) ARCH=arm64 ;;
esac
TARGET="${OS}-${ARCH}"
VERSION=$(node -p "require('$ROOT/packages/cli/package.json').version")
OUT_DIR="$ROOT/dist/6ears-spotify-ads-v${VERSION}-${TARGET}"
BIN_NAME="6ears-spotify-ads"

echo "→ building binary for $TARGET (v$VERSION)"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# Compile entrypoint (embeds JS runtime; knowledge shipped beside binary)
bun build "$ROOT/packages/cli/bin/6ears-spotify-ads.js" \
  --compile \
  --outfile "$OUT_DIR/$BIN_NAME"

# Sidecar knowledge pack (same as npm package)
rsync -a --delete \
  --exclude '.DS_Store' \
  "$ROOT/packages/cli/knowledge/" "$OUT_DIR/knowledge/"

cp "$ROOT/packages/cli/README.md" "$OUT_DIR/README.md"
cp "$ROOT/LICENSE" "$OUT_DIR/LICENSE"
cat > "$OUT_DIR/INSTALL.txt" << EOF
6EARS Spotify Ads Manager CLI v${VERSION} (${TARGET})

1. Keep this folder intact (binary + knowledge/ must stay together).
2. Add to PATH, e.g.:
     export PATH="\$PWD:\$PATH"
   or:
     sudo cp $BIN_NAME /usr/local/bin/
     # still need knowledge: export SIXEARS_KNOWLEDGE=/path/to/this/folder/knowledge
3. Run:
     ./$BIN_NAME doctor
     ./$BIN_NAME knowledge tip launch

Config lives in ~/.config/6ears-spotify-ads/
EOF

# Smoke
"$OUT_DIR/$BIN_NAME" doctor
"$OUT_DIR/$BIN_NAME" knowledge search "audio" >/dev/null

# Archive + checksums
cd "$ROOT/dist"
ARCHIVE="6ears-spotify-ads-v${VERSION}-${TARGET}.tar.gz"
tar -czf "$ARCHIVE" "6ears-spotify-ads-v${VERSION}-${TARGET}"
shasum -a 256 "$ARCHIVE" "6ears-spotify-ads-v${VERSION}-${TARGET}/$BIN_NAME" > "6ears-spotify-ads-v${VERSION}-${TARGET}.sha256"

echo "→ release artifacts:"
ls -lh "$ROOT/dist"/*"${VERSION}-${TARGET}"* 2>/dev/null || ls -lh "$ROOT/dist"
echo "build-binary: OK"
echo "$ARCHIVE" > "$ROOT/.last-binary-archive"
