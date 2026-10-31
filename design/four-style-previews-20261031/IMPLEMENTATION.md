# Four-theme game UI implementation

Implemented themes: 01 市井朱红, 04 奶油黏土, 08 青瓷雅韵, 09 宣纸朱印.

## Runtime implementation

- `app/HotPot/assets/scripts/core/HotPotGameLayout.ts`: viewport layout and separate system/capsule safety metrics.
- `app/HotPot/assets/scripts/core/HotPotGameArt.ts`: shared texture/frame cache; asynchronous theme changes reject stale callbacks.
- `app/HotPot/assets/scripts/data/GameInterfaceAssets.ts`: alpha bounds for the independently generated sprites.
- `app/HotPot/assets/resources/game-ui/`: eight compact runtime images: four transparent PNG component atlases and four JPEG continuous backgrounds.

## Image generation prompt set

Generated using built-in ImageGen from the four approved previews in this directory.
Atlas prompt: 1024 × 1536 transparent game UI sprite atlas. Match the approved theme materials, shadows and colors. Isolate a complete 锅里捞啥 logo, empty board frame, settings gear, chest, blank tile, recessed slot, empty tray frame, undo/bomb/shuffle controls, equal-width restart/sound controls, and blank stage lozenge. No background, food ingredients, counters, or runtime text outside the brand. Keep clear transparent gaps between sprites.
Background prompt: same portrait aspect ratio and approved theme environment. Remove every UI object, phone cutout, text, progress bar, food card, frame and button; reconstruct one seamless quiet scene. Keep theme-specific food, plants, gingham, ceramics, lanterns or ink scenery at the perimeter. No horizontal strips, mirrored textures, or baked interface elements.
Theme 01: red lantern tavern, warm dark wood, red lacquer, antique brass and jade green.
Theme 04: cream clay tabletop, peach/orange rims, green sculpted controls, golden embossed icons and corner vegetables/gingham.
Theme 08: ivory/celadon porcelain, pale jade tabletop, bamboo, natural window light and restrained gold detail.
Theme 09: rice paper, ink landscapes and plum blossom, walnut carving, vermilion lacquer and antique gold.

## Validation

TypeScript: 50 modules. Browser runtime: 16 device/theme combinations, native-size iPhone 17/Mate 60 ratio screenshots, settings/sound/restart clicks, actual card-to-tray transition, seven loaded slots, reserve clearance and no runtime/asset errors. WeChat build and shared packaging validation passed. Actual WeChat system overlays/sharing still need physical-device verification.

## Lossless PNG encoding

Source PNGs were re-encoded without palette quantization. Decoded RGBA bytes were compared for exact equality before replacing each file.

- bg-01.png: 2348713 → 2212696 bytes; decoded SHA-256 8267539b50e9a0105b8dfc9265c07c0e405f1713b508768ecf4ff3e752da0ba7
- bg-04.png: 1713248 → 1394644 bytes; decoded SHA-256 d55b022fbb4e54a7f10b2cb6d0a1463cf3bece88a10d73d6ba0fc1afad92922c
- bg-08.png: 2139038 → 1976798 bytes; decoded SHA-256 45c23a2999a5dfb7359210b3a1e2786b934805803701e326920382cf1300e380
- bg-09.png: 2806179 → 2628305 bytes; decoded SHA-256 7f464f60a5f15ec90917fcfa8b8d51487b036b9fc147c6564e78004f575debf0
- style-01.png: 2434842 → 2349675 bytes; decoded SHA-256 923a4ccd4e8e6cc63628cf9cb0b6da06816bb28bbfa0ab60b8a4b8f17f4f3c17
- style-04.png: 1779999 → 1648505 bytes; decoded SHA-256 b0079dd9a2979b808874786036a0da1add42df6ff180bf1c8ddfb359255b60b7
- style-08.png: 2349828 → 2238671 bytes; decoded SHA-256 f37659036180a816959716166cc2513b1853e540aa0a491a387659dc8b6c6f6d
- style-09.png: 2522056 → 2442618 bytes; decoded SHA-256 ce2c2853657977eb4f0b3fcce2a16eba61629b26a26fd1d1a8e642e8e4dbf179

## 4 MB delivery revision

The complete offline client, including every subpackage, must be below 4,000,000 bytes. The earlier 20 MB complete-package allowance has been removed. `prepare-compact-game-ui.cjs` preserves full-resolution masters in `production-masters/`, creates 576-pixel-wide indexed PNG atlases and 540-pixel-wide JPEG backgrounds, and archives unused legacy first-level backdrops. `HotPotGameArt.ts` maps original atlas coordinates to compact textures; counter-scaled nine-slice renderers retain border dimensions. Runtime derivatives use palette/JPEG compression; the prior lossless hashes above describe the preserved high-resolution originals, not these compact derivatives.

Build and package with the existing WeChat build config, run `verify-responsive-runtime.cjs`, then `package-four-style-ui.cjs`. The export includes a size/hash report and import instructions. All 16 device/theme combinations, buttons, actual card moves and reserve clearance were checked against the compact textures.
