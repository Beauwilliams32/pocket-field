#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist/Pocket Field}"
APP="$OUT/Pocket Field.app"
BUILD="${TMPDIR:-/tmp}/pocket-field-build-$$"
trap 'rm -rf "$BUILD"' EXIT

mkdir -p "$BUILD" "$APP/Contents/MacOS" "$APP/Contents/Resources" "$OUT/Games" "$OUT/Saves" "$OUT/Software"
for arch in arm64 x86_64; do
  xcrun swiftc -O -target "$arch-apple-macos13.3" \
    -framework Cocoa -framework WebKit -framework CryptoKit \
    "$ROOT/app/PocketField.swift" -o "$BUILD/PocketField-$arch"
done
lipo -create "$BUILD/PocketField-arm64" "$BUILD/PocketField-x86_64" -output "$APP/Contents/MacOS/PocketField"
cp "$ROOT/app/Info.plist" "$APP/Contents/Info.plist"
cp "$ROOT/app/PocketField.icns" "$APP/Contents/Resources/PocketField.icns"
rm -rf "$OUT/Software/player"
ditto "$ROOT/web" "$OUT/Software/player"
cp "$ROOT/app/PocketField.swift" "$OUT/Software/PocketField.swift"
cp "$ROOT/LICENSE" "$OUT/Software/LICENSE"
cp "$ROOT/THIRD-PARTY.md" "$OUT/Software/THIRD-PARTY.md"
xattr -cr "$APP"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
printf 'Built %s\n' "$OUT"
lipo -info "$APP/Contents/MacOS/PocketField"
