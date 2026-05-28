# Invaders 3008 Sprite Atlas Map

Runtime file: `js/arcade/games/invaders/asset-system.js`.

The renderer draws a sprite only when the image is loaded and the named crop fits inside the sheet. If either condition fails, the original primitive rendering is used. These coordinates are presentation-only and must not be used for collision, timing, hitboxes, scoring, waves, or layout.

## Sheet Paths

- enemies: `/games/invaders-3008/assets/enemies/enemy-sheet.png`
- bosses: `/games/invaders-3008/assets/bosses/boss-sheet.png`
- fx: `/games/invaders-3008/assets/fx/projectile-fx-sheet.png`
- ships: `/games/invaders-3008/assets/ships/player-ship-sheet.png`
- ui: `/games/invaders-3008/assets/ui/remaining-game-assets.png`

## Enemy Sheet

The enemy sheet is `576x464`, laid out as four 144px-wide columns and four 116px-tall production cells. The runtime crops only the art band from each cell so labels are not drawn into gameplay.

| type | x | y | w | h |
| --- | ---: | ---: | ---: | ---: |
| basic | 0 | 0 | 144 | 88 |
| fast | 144 | 0 | 144 | 88 |
| tank | 288 | 0 | 144 | 88 |
| shooter | 432 | 0 | 144 | 88 |
| shield | 0 | 116 | 144 | 88 |
| bomber | 144 | 116 | 144 | 88 |
| hunter | 288 | 116 | 144 | 88 |
| zigzag | 432 | 116 | 144 | 88 |
| splitter | 0 | 232 | 144 | 88 |
| healer | 144 | 232 | 144 | 88 |
| sniper | 288 | 232 | 144 | 88 |
| kamikaze | 432 | 232 | 144 | 88 |
| cloaked | 0 | 348 | 144 | 88 |
| golden | 144 | 348 | 144 | 88 |
| cursed | 432 | 348 | 144 | 88 |
| mini_boss | 288 | 116 | 144 | 88 |

## Other Sheets

- Boss, ship, projectile, pickup, and UI maps use hand-selected art-only crops from the `576x464` production sheets. Shield pickups use the shield-break FX crop so they stay visually distinct from rapid-fire pickups.
- In dev tools, inspect `window.__INVADERS_3008_ATLAS__.getDebugInfo()` to see load status and all rect maps.
