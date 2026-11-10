# Included software

- EmulatorJS 4.2.3: https://github.com/EmulatorJS/EmulatorJS/tree/v4.2.3, GPL-3.0, full license in `web/emulator/LICENSE`.
- mGBA: https://github.com/mgba-emu/mgba, MPL-2.0. EmulatorJS WebAssembly build, binary in `web/emulator/cores/`.
- Gambatte libretro: https://github.com/libretro/gambatte-libretro, GPL-2.0. EmulatorJS WebAssembly build, binary in `web/emulator/cores/`.
- Pocket Field cartridge illustrations are original project assets licensed under GPL-3.0 with the rest of Pocket Field.
- Taste design guidance: https://github.com/Leonxlnx/taste-skill, MIT. Guidance only; no skill runtime code bundled.

User-supplied ROMs and saves are private library files, not part of this source code or its releases. Pocket Field is not affiliated with Nintendo.

Local modification (2026-11-09): the EmulatorJS update-check URL in emulator.min.js points to the bundled /emulator/version.json so normal gameplay makes no external network request. Other runtime behavior is unchanged.
