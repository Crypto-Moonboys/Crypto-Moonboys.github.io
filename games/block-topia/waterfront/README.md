# Lumina’s Waterfront

The public entry is `/games/block-topia/waterfront/`. Serve the repository over HTTP and open that route.

- `district.js` holds the playable rows, spawn and tile definitions. Keep every row the same width and the spawn on a walkable tile. Keep the existing tile IDs for older saves.
- `harbor-art.js` draws original terrain and objects separately from collision. Its horizontal return offset maps screen positions back to the editable grid. Terrain beyond the grid is scenery.
- `index.html` owns movement, canvas sizing, editor, browser storage and JSON export. A saved grid is used only when its dimensions, tiles and spawn are compatible.

## NPC art handover

For a new sprite, keep the ground footprint in the district and draw its visual from the bottom center of that footprint. Draw ground first and objects and actors in order of their ground position. Put generated images in this directory under `assets/`, use transparent PNGs at a consistent pixel scale, and record the source or generation job in the PR. Keep generation credentials on the runner. The current art is drawn in Canvas and has no external assets.

For map changes, check route connectivity between spawn and dock, collisions beside buildings, editor placement after viewport resize, and a reload with saved edits. Use the usual branch and PR workflow. The existing NPC runner output is a separate preview, so a future runner handover should explicitly target this district file.
