#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
node --check "$ROOT/web/player.js"
plutil -lint "$ROOT/app/Info.plist"
python3 - "$ROOT" <<'PY'
import pathlib,re,sys
root=pathlib.Path(sys.argv[1])
for p in root.rglob('*'):
    if p.is_file() and p.suffix.lower() in {'.gba','.gb','.gbc','.sav','.state'}:
        raise SystemExit(f'Private game/save file must not be published: {p}')
html=(root/'web/index.html').read_text()
expected={'L shoulder button':10,'R shoulder button':11,'Up':4,'Down':5,'Left':6,'Right':7,'B button':0,'A button':8,'Select':2,'Start':3}
found={label:int(value) for value,label in re.findall(r'data-input="(\d+)"[^>]*aria-label="([^"]+)"',html)}
assert found==expected,(found,expected)
js=(root/'web/player.js').read_text()
assert 'gameManager.simulateInput(0,Number(button.dataset.input),pressed?1:0)' in js
assert "'pointerup'" in js and "'pointercancel'" in js and "'lostpointercapture'" in js
print('Controller mapping and release paths PASS')
PY
"$ROOT/scripts/build-portable.sh"
APP="$ROOT/dist/Pocket Field/Pocket Field.app"
codesign --verify --deep --strict "$APP"
lipo "$APP/Contents/MacOS/PocketField" -verify_arch arm64
lipo "$APP/Contents/MacOS/PocketField" -verify_arch x86_64
echo 'Pocket Field verification PASS'
