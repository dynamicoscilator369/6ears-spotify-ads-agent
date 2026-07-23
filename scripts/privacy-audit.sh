#!/usr/bin/env bash
# Fail if private client markers appear in publishable trees.
# Denylist is only in this file; we never scan this script.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Patterns that must never ship (real client markers)
PATTERNS=(
  'nikolesantic@'
  'df4abec8-fa02-47b6-a74d-8a34e0953210'
  '74cB0BzuYwRLiJU1OXcLsr'
  'c545388d-ff5a-4a83-b70a-f0fa977466dd'
  '6rALQM7P0x4JGS1vA0jo1Q'
)

SCAN_DIRS=(
  "$ROOT/packages"
  "$ROOT/docs"
  "$ROOT/examples"
  "$ROOT/README.md"
)

FAIL=0
for p in "${PATTERNS[@]}"; do
  hits=""
  for target in "${SCAN_DIRS[@]}"; do
    if [[ -e "$target" ]]; then
      found="$(rg -n --hidden -g '!node_modules' -g '!.git' -g '!*.lock' -F "$p" "$target" 2>/dev/null || true)"
      if [[ -n "$found" ]]; then
        hits+="$found"$'\n'
      fi
    fi
  done
  if [[ -n "$hits" ]]; then
    echo "PRIVACY FAIL: found pattern: $p"
    printf '%s' "$hits"
    FAIL=1
  fi
done

if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi
echo "privacy-audit: OK (no private client IDs in packages/docs/examples)"
