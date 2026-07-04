#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pnpm run build

platform="$(uname -s)"

if [[ "$platform" == "Darwin" ]]; then
  if [[ -f .env.signing ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env.signing
    set +a
  fi

  if [[ -z "${APPLE_ID:-}" || -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" || -z "${APPLE_TEAM_ID:-}" ]]; then
    echo "Missing Apple notarization credentials (APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID)." >&2
    echo "Copy .env.signing.example to .env.signing or set GitHub Actions secrets." >&2
    exit 1
  fi

  if [[ -z "${CSC_LINK:-}" && -z "${CSC_NAME:-}" ]]; then
    echo "Missing code signing certificate (set CSC_LINK or CSC_NAME)." >&2
    exit 1
  fi

  echo "Building macOS DMG (signed + notarized)…"
  electron-builder --mac dmg
elif [[ "$platform" == MINGW* || "$platform" == MSYS* || "$platform" == CYGWIN* ]]; then
  echo "Building Windows NSIS installer (x64)…"
  electron-builder --win nsis --x64
else
  echo "Unsupported dist platform: $platform (use macOS or Windows)." >&2
  exit 1
fi

echo "Release artifacts:"
ls -lh release/*.{dmg,exe} 2>/dev/null || ls -lh release/

echo "Generating SHA256SUMS…"
bash scripts/generate-checksums.sh
