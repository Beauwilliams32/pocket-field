#!/bin/bash
set -euo pipefail
if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /Volumes/DRIVE" >&2
  exit 64
fi
MOUNT="$1"
[[ -d "$MOUNT" ]] || { echo "Drive is not mounted: $MOUNT" >&2; exit 66; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/dist/Pocket Field"
DEST="$MOUNT/Pocket Field"
"$ROOT/scripts/build-portable.sh" "$BUILD"
mkdir -p "$DEST/Games" "$DEST/Saves" "$DEST/Software"
ditto "$BUILD/Pocket Field.app" "$DEST/Pocket Field.app"
ditto "$BUILD/Software/player" "$DEST/Software/player"
cp "$BUILD/Software/PocketField.swift" "$DEST/Software/PocketField.swift"
cp "$BUILD/Software/LICENSE" "$DEST/Software/LICENSE"
cp "$BUILD/Software/THIRD-PARTY.md" "$DEST/Software/THIRD-PARTY.md"
sync
codesign --verify --deep --strict "$DEST/Pocket Field.app"
echo "Installed Pocket Field without touching existing Games or Saves: $DEST"
