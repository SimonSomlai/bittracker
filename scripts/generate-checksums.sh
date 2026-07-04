#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RELEASE_DIR="$ROOT/release"
SUMS_FILE="$RELEASE_DIR/SHA256SUMS"

if [[ ! -d "$RELEASE_DIR" ]]; then
  echo "Missing release directory: $RELEASE_DIR" >&2
  exit 1
fi

(
  cd "$RELEASE_DIR"
  : > SHA256SUMS
  for pattern in BitTracker-*.dmg BitTracker-*.exe; do
    for file in $pattern; do
      [[ -e "$file" ]] || continue
      shasum -a 256 "$file" >> SHA256SUMS
    done
  done
)

if [[ ! -s "$SUMS_FILE" ]]; then
  echo "No release artifacts found in $RELEASE_DIR" >&2
  exit 1
fi

echo "Wrote $SUMS_FILE:"
cat "$SUMS_FILE"
