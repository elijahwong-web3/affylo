#!/usr/bin/env bash
# Build the macOS .dmg from a copy on local disk (e.g. Desktop) to avoid
# ETIMEDOUT / copyfile failures when the project lives on iCloud Drive.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${GROUP_CHART_BUILD_DIR:-$HOME/Desktop/Group-Chart-electron-build}"

echo "→ Syncing project to: $DEST"
echo "  (Set GROUP_CHART_BUILD_DIR to override the destination folder)"
rm -rf "$DEST"
mkdir -p "$DEST"
rsync -a \
  --exclude dist-electron \
  --exclude node_modules \
  --exclude .git \
  --exclude .DS_Store \
  "$ROOT/" "$DEST/"

cd "$DEST"
echo "→ npm install"
npm install
echo "→ npm run electron:build"
npm run electron:build

echo ""
echo "Done. Look for the .dmg under:"
echo "  $DEST/dist-electron/"
ls -la "$DEST/dist-electron/"*.dmg 2>/dev/null || echo "  (no .dmg found — check build errors above)"
