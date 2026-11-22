# Lumina’s Waterfront

The public entry is `/games/block-topia/waterfront/`. Serve the repository over HTTP and open that route. Click or tap a street or dock to move. On narrow screens the canvas scrolls horizontally at a readable tile size.

- `district.js` defines the playable rows, spawn and tile properties. Every row must have the same width. Connect new docks and streets to the spawn. Keep tile IDs stable for browser saves.
- `harbor-art.js` draws the terrain first, then objects and the player in row order. Building art is anchored to its ground tile and can extend upward. Collision uses the district data.
- `index.html` handles routing, editor, browser saves and JSON export. Version 1 edits are carried into the central block by comparing them with the old default layout. Version 2 saves take precedence.

## NPC handover

Keep the night-time harbor palette, original graffiti, and consistent top-down building fronts. For generated art, use transparent PNGs at a consistent pixel scale, place files under `assets/`, and record their source or generation job in the PR. Keep generation credentials on the runner.

For map changes, check all walkable tiles are reachable from spawn. Check click and tap placement after scrolling, collisions, and existing saved edits. The NPC runner currently writes to its separate preview. Update it to target this district before resuming the live build loop.

The six building sprites are AutoSprite originals. Their transparent game PNGs and source metadata are in `assets/night-harbor/`. The renderer keeps the base of each sprite inside its original tile footprint. Its fallback art is available while assets load or when an image fails.
