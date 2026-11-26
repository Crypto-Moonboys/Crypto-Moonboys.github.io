**AGENT CHECK REQUIRED — Before changing this game or its assets, audit every wired runtime image and loading path. Confirm that master PNG/JPG files are preserved, smaller transparent WebP derivatives are used at runtime without lost dimensions or sharpness, non-critical art is staged or lazy-loaded where safe, duplicate or unused requests are removed, and gameplay and animation speed are not harmed. Report exactly what already passes, what still needs doing, the affected files and size/performance impact, and any test or visual check that could not be completed. Never assume optimization is finished.**

# NBG London Graffiti Run

Level 1 browser game prototype.

## Current systems

- SNES-style canvas engine
- London graffiti theme
- NBG player controller
- XP coin system
- HUD framework
- Camera scrolling
- Level loader

## Test page

Open `game/play.html` through GitHub Pages.

## Runtime performance

- PNG/JPG masters remain the edit sources. The ranked runtime uses generated WebP derivatives.
- The three historical skyline masters are decoded-pixel-identical; the runtime downloads and decodes one lossless WebP and reuses it in all three skyline slots.
- Player spray and crouch matte cleanup is prebuilt into transparent runtime WebPs. The two unused crouch-sheet source rows are not shipped.
- Oversized rat-attack cells use 256px runtime cells, while normal rats, parachutes and coins use 128px cells and bots use 160px cells. Every runtime cell remains at least as large as its maximum physical-canvas draw.
- Leaderboard and read-only modifier requests wait for the game asset-ready event so they do not compete with the playable startup path.

Regenerate and verify with:

```sh
node scripts/build-nbg-london-runtime-assets.mjs
npm run test:nbg-london-performance
```

## Next development

- Import final PNG sprite assets
- Add tile collision
- Add enemy behaviour
- Add leaderboard backend
