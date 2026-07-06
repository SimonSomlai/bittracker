#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# BitTracker routes all Esplora/CoinGecko requests through a bundled Tor daemon
# (see src/main/src/net/tor.ts) so a packaged build without the verified binary
# would silently fail to sync. Run `node scripts/fetch-tor-binaries.mjs` first,
# after pinning real checksums from the Tor Project's signed sha256sums file.
for platform_dir in resources/tor/darwin resources/tor/win32; do
  if [[ ! -f "$platform_dir/tor" && ! -f "$platform_dir/tor.exe" ]]; then
    echo "Missing bundled Tor binary in $platform_dir." >&2
    echo "Run: node scripts/fetch-tor-binaries.mjs (after pinning verified checksums)" >&2
    exit 1
  fi
done

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

  echo "Building uninstaller app…"
  UNINSTALLER_APP="$ROOT/resources/mac/BitTracker Uninstaller.app"
  osacompile -o "$UNINSTALLER_APP" "$ROOT/resources/mac/uninstall.applescript"
  cp "$ROOT/resources/mac/uninstaller.icns" "$UNINSTALLER_APP/Contents/Resources/applet.icns"

  # Sign it — required so Apple accepts it during DMG notarization
  _sign_id="${CSC_NAME:-}"
  if [[ -z "$_sign_id" ]]; then
    _sign_id="$(security find-identity -v -p codesigning 2>/dev/null \
      | grep -o '"Developer ID Application:[^"]*"' | head -1 | tr -d '"')"
  fi
  if [[ -n "$_sign_id" ]]; then
    codesign --force --sign "$_sign_id" --options runtime --deep "$UNINSTALLER_APP"
  else
    echo "Warning: no Developer ID signing identity found; uninstaller will not be signed." >&2
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
