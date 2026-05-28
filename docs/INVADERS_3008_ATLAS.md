# Invaders 3008 Sprite Atlas Map

Runtime file: `js/arcade/games/invaders/asset-system.js`.

The renderer draws a sprite only when the image is loaded and the named crop fits inside the sheet. If either condition fails, the original primitive rendering is used. These coordinates are presentation-only and must not be used for collision, timing, hitboxes, scoring, waves, or layout. Dark contact-sheet backgrounds are keyed transparent at runtime, and sprites are centered/aspect-fit inside the existing gameplay draw box.

## Sheet Paths

- enemies: `/games/invaders-3008/assets/enemies/enemy-sheet.png`
- bosses: `/games/invaders-3008/assets/bosses/boss-sheet.png`
- fx: `/games/invaders-3008/assets/fx/projectile-fx-sheet.png`
- ships: `/games/invaders-3008/assets/ships/player-ship-sheet.png`
- ui: `/games/invaders-3008/assets/ui/remaining-game-assets.png`

## Enemy Sheet

The enemy sheet is `576x464`, laid out as four 144px-wide columns and four 116px-tall production cells. The runtime uses explicit tight crops around the art, not the full cells, so labels and empty production padding are not drawn into gameplay.

| type | x | y | w | h |
| --- | ---: | ---: | ---: | ---: |
| basic | 34 | 24 | 82 | 64 |
| fast | 166 | 29 | 106 | 56 |
| tank | 312 | 22 | 116 | 70 |
| shooter | 463 | 25 | 90 | 68 |
| shield | 35 | 137 | 86 | 70 |
| bomber | 160 | 138 | 104 | 70 |
| hunter | 315 | 140 | 100 | 70 |
| zigzag | 461 | 140 | 96 | 70 |
| splitter | 35 | 255 | 82 | 66 |
| healer | 161 | 254 | 106 | 68 |
| sniper | 306 | 272 | 124 | 38 |
| kamikaze | 456 | 256 | 108 | 68 |
| cloaked | 43 | 371 | 74 | 66 |
| golden | 174 | 366 | 98 | 68 |
| cursed | 448 | 366 | 108 | 74 |
| mini_boss | 315 | 140 | 100 | 70 |

## Other Sheets

- Boss, ship, and safe FX maps use hand-selected art-only crops from the `576x464` production sheets. Pickup, small bullet, and asteroid contact-sheet rows remain on primitive fallback because their source art includes text/labels or does not provide clean standalone crops.
- In dev tools, inspect `window.__INVADERS_3008_ATLAS__.getDebugInfo()` to see load status and all rect maps.
