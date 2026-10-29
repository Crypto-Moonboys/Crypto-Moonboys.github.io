# NBG London: HD rendering and artwork replacement contract

## What this change does

The game still measures **480 × 270 logical units** and runs **course v8** unchanged. The visible canvas still occupies the same space on desktop and mobile; sprites, scenery, hitboxes, jump distances, timer, difficulty, score proof and the camera's 1× / 1.25× / 1.5× presets retain their original values.

Only its **drawing bitmap is now 960 × 540**. Every logical position is mapped to two backing pixels in each direction. The NBG canvas is no longer enlarged with CSS `image-rendering: pixelated`; the game renderer uses high-quality image sampling. This can make current source artwork look less jagged, but **does not invent detail that the PNG/JPG never contained**. Some older art will remain pixelated or may appear softer. Higher-resolution *source* files are required for truly more detailed artwork.

Neither the PNGs nor the original game world have been rescaled or re-generated in this PR. The removed wall-graffiti overlays stay removed.

## Replace artwork without enlarging it in-game

| Artwork | Current example source | Recommended 2× source | On-screen render size |
|---|---|---|---|
| Sky wallpaper | 480 × 270 JPEG | 960 × 540 | unchanged 480 × 270 logical units |
| London skyline panels (three) | 480 × 160 PNG each | 960 × 320 each | unchanged 480 × 160 logical units each |
| Main `wall-one.png` | 480 × 126 PNG | 960 × 252 | unchanged existing wall layer (drawn 88 logical px high) |
| Street SVG | vector | retain vector SVG or replace with clean vector | unchanged |
| Player's 128 × 128 source cells | e.g. run/idle | 256 × 256 cells | **keep** `renderWidth: 72`, `renderHeight: 86` |
| Player's 256 × 256 crouch/spray cells | sprite sheets | 512 × 512 cells | preserve existing `renderWidth`, `renderHeight` and offsets |
| Enemies, pickups, platforms, crates | mixed sources | clean art with twice the source pixel dimensions/aspect ratio | **keep their current destination sizes** |

These are **source-file targets**, not new game-world dimensions. Do not change the player's hitbox (24 × 34), `WORLD_WIDTH` (22,000), `FLOOR_Y` (214) or the course version merely because artwork was replaced. Likewise do not enlarge coins or crates by modifying their collision or layout coordinates.

For player animation replacements, update the **`sourceFrameWidth`/`sourceFrameHeight`** in `game/assets/player/nbg-runner-animation-manifest.json` to match the new image's pixel cells, while leaving the `renderWidth`, `renderHeight`, `renderOffsetY`, animation timing, columns and playable footprint unchanged. Crouch matte extraction now reads these source dimensions and the grid from this manifest rather than hard-coding 256px frames. Keep the original frame order and transparent/padded sprite boundaries.

Other animations still have image-specific metadata. In particular, Balloon Girl's `BALLOON_ANIMATIONS` dimensions and crop information live in `game/nbg-level1.js`; update those metadata values when supplying a differently sized sheet. Graffbot / rat / flying pig sheets determine the source crop from their loaded image dimensions and configured grid. Check alpha mattes and sprite foot anchors rather than shifting collision boxes to compensate for transparent padding.

## Quality and safety checks

- `node scripts/nbg-hd-render-contract.test.mjs` — 2× backing, original physics and manifest-driven crouch sheet acceptance.
- `npm run test:nbg-level1` — Playwright validates desktop/mobile canvas rendering, camera zoom presets, art/HUD sizes, animations, collisions and replay parity. Dedicated **NBG London Level 1 Browser Validation** runs the full browser suite.
- Signed Telegram start → complete → save should be rechecked before release; the server's scoring Worker is **not changed** by this graphics-only update.
- Monitor mobile frame rate and memory: a 960 × 540 canvas is four times the original pixel count. Do not upgrade all image file sizes blindly before checking startup costs.
- When replacing a source, confirm its actual pixel dimensions, aspect ratio, transparency and animation frame grid. Avoid reintroducing the removed `world.wallGraffiti` decals.

## Deployment

**GitHub Pages only** after tests and merge. **No Worker deployment, D1 migration or leaderboard reset.**
