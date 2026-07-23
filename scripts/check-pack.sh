#!/usr/bin/env bash
# Pack CLI and fail if tarball contains private markers or unexpected paths.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/privacy-audit.sh"

echo "→ npm pack (cli)"
# workspace name is package name
TARBALL=$(npm pack -w 6ears-spotify-ads 2>/dev/null | tail -1)
if [[ ! -f "$TARBALL" ]]; then
  # npm pack may print name only in some versions
  TARBALL=$(ls -t 6ears-spotify-ads-*.tgz 2>/dev/null | head -1 || true)
fi
if [[ -z "${TARBALL:-}" || ! -f "$TARBALL" ]]; then
  echo "FAIL: no tarball produced"
  exit 1
fi
echo "  packed: $TARBALL ($(du -h "$TARBALL" | awk '{print $1}'))"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
tar -xzf "$TARBALL" -C "$TMP"

# List top-level package contents
echo "→ tarball contents (sample)"
find "$TMP/package" -type f | sed "s|$TMP/package/||" | head -40
FILE_COUNT=$(find "$TMP/package" -type f | wc -l | tr -d ' ')
echo "  files: $FILE_COUNT"

# Must include knowledge
if [[ ! -f "$TMP/package/knowledge/PLAYBOOK.md" ]]; then
  echo "FAIL: PLAYBOOK.md missing from pack"
  exit 1
fi
if [[ ! -f "$TMP/package/bin/6ears-spotify-ads.js" ]]; then
  echo "FAIL: bin missing from pack"
  exit 1
fi

# Must NOT include secrets / agent / client creatives
BAD_PATHS=$(find "$TMP/package" \( -name '.dev.vars' -o -name 'operator.key' -o -name '*.mp3' -o -path '*/node_modules/*' \) 2>/dev/null || true)
if [[ -n "$BAD_PATHS" ]]; then
  echo "FAIL: forbidden paths in pack:"
  echo "$BAD_PATHS"
  exit 1
fi

# Private client ID markers (same denylist as privacy-audit, minus scanning the script)
PATTERNS=(
  'nikolesantic@'
  'df4abec8-fa02-47b6-a74d-8a34e0953210'
  '74cB0BzuYwRLiJU1OXcLsr'
  'c545388d-ff5a-4a83-b70a-f0fa977466dd'
  '6rALQM7P0x4JGS1vA0jo1Q'
)
FAIL=0
for p in "${PATTERNS[@]}"; do
  if rg -n -F "$p" "$TMP/package" 2>/dev/null; then
    echo "PRIVACY FAIL in tarball: $p"
    FAIL=1
  fi
done
if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi

echo "check-pack: OK ($TARBALL)"
# leave tarball in repo root for manual install smoke
echo "$TARBALL" > "$ROOT/.last-pack-name"
