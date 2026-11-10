# Pocket Field

Pocket Field is an open-source, portable Game Boy, Game Boy Color, and Game Boy Advance player for macOS. It combines a native Swift launcher and drive-backed save server with EmulatorJS, mGBA, and Gambatte in a polished handheld-style interface.

The app is designed to live on a removable drive. Games, saves, the emulator runtime, and the universal macOS app stay together, so the same drive can be opened on another compatible Mac.

No commercial game ROMs or save files are included in this repository. You must supply games you are legally entitled to use.

## Features

- Fully functional on-screen D-pad, A, B, Start, Select, L, and R controls
- Keyboard and gamepad support through EmulatorJS
- GB, GBC, and GBA support
- Automatic drive-backed save states every 20 seconds
- Explicit “Save to drive” action and previous-save backup
- Offline runtime after build; no CDN is required to play installed games
- Universal macOS app for Apple silicon and Intel
- Same-Wi-Fi phone play while the Mac app is running
- Local-only game library and save API with same-origin write checks

## Requirements

- macOS 13.3 or newer
- Xcode Command Line Tools to build
- A writable removable drive for portable use

## Build

```bash
./scripts/test.sh
```

The verified portable package is created at:

```text
dist/Pocket Field/
├── Pocket Field.app
├── Games/
├── Saves/
└── Software/
```

The application is ad-hoc signed for local use. The binary is universal (`arm64` and `x86_64`).

## Install on a removable drive

Connect the drive, confirm its exact mount path under `/Volumes`, then run:

```bash
./scripts/install-to-drive.sh "/Volumes/YOUR DRIVE"
```

The installer updates Pocket Field’s application and runtime but preserves existing `Games/` and `Saves/` directories. Open `Pocket Field/Pocket Field.app` directly from the drive.

If macOS blocks the first launch because the app is not notarized, Control-click the app, choose Open, and confirm once. Do not move the app away from the adjacent `Software`, `Games`, and `Saves` folders.

## Add games

Use **Add games** in Pocket Field and select extracted `.gba`, `.gb`, or `.gbc` files. The app rejects duplicate filenames rather than overwriting them. ROMs remain on the local drive and are excluded from Git by default.

## Controls

| Control | Keyboard |
|---|---|
| D-pad | Arrow keys |
| A / Confirm | X |
| B / Back | Z |
| Start | Enter |
| Select | Shift |
| L / R | A / S |

Every on-screen control supports press-and-hold pointer input, touch cancellation, keyboard activation, and accessibility activation. EmulatorJS’s controller settings can also map a physical gamepad.

## Architecture

- `app/PocketField.swift` — native Cocoa/WebKit launcher and restricted local HTTP server
- `web/` — library, responsive console UI, controller wiring, and bundled emulator runtime
- `scripts/build-portable.sh` — deterministic universal app build
- `scripts/install-to-drive.sh` — non-destructive removable-drive installation
- `scripts/test.sh` — syntax, privacy, controller mapping, build, signature, and architecture checks

Runtime defaults:

- `POCKET_ROOT` — data root containing `Games`, `Saves`, and `Software`
- `POCKET_WEB_ROOT` — optional alternate web runtime path
- `POCKET_PORT` — optional local server port; defaults to `18765`

## Security and privacy

Pocket Field serves only its own web runtime plus explicit game/save endpoints. Save and import writes require a same-origin request. The repository’s ignore rules and test gate reject ROM and save extensions so private game data cannot be accidentally published.

LAN clients on the same network can read the library while Pocket Field is open. Do not expose port 18765 through router port forwarding.

## Open-source licensing

Pocket Field is distributed under GPL-3.0 because the bundled EmulatorJS runtime is GPL-3.0. mGBA and Gambatte retain their own licenses. See `LICENSE`, `THIRD-PARTY.md`, and `web/emulator/LICENSE*`.

Pocket Field is not affiliated with Nintendo, GAME FREAK, Creatures, or the EmulatorJS project. Product and game names are used only to describe compatibility. No Nintendo artwork or ROMs are included.
