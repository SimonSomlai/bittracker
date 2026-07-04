#!/bin/bash
# Uninstalls BitTracker: quits the app, then removes the app bundle and
# all locally stored data (wallets, transaction history, settings).
#
# This is a deliberate, user-run action — macOS has no way to run code
# automatically when an app is dragged to the Trash, so this script is
# the supported way to fully remove BitTracker and its data together.

set -euo pipefail

APP_PATH="/Applications/BitTracker.app"
DATA_DIR="$HOME/Library/Application Support/BitTracker"

CONFIRM=$(osascript <<'EOF'
display dialog "This will permanently delete BitTracker and all locally stored data (wallets, transaction history, settings). This cannot be undone." buttons {"Cancel", "Uninstall"} default button 1 cancel button 1 with icon caution with title "Uninstall BitTracker"
EOF
) || { echo "Cancelled."; exit 0; }

if [[ "$CONFIRM" != *"Uninstall"* ]]; then
  echo "Cancelled."
  exit 0
fi

# Quit the app if it's running
osascript -e 'tell application "BitTracker" to quit' 2>/dev/null || true
sleep 1

if [[ -d "$DATA_DIR" ]]; then
  rm -rf "$DATA_DIR"
  echo "Removed data directory: $DATA_DIR"
fi

if [[ -d "$APP_PATH" ]]; then
  rm -rf "$APP_PATH"
  echo "Removed application: $APP_PATH"
fi

osascript -e 'display dialog "BitTracker and its data have been removed." buttons {"OK"} default button 1 with title "Uninstall BitTracker"' >/dev/null 2>&1 || true
