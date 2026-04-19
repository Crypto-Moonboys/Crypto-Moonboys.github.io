# Block Topia Visual Scale Test Pack

This asset pack is a production-usable **visual scale lock slice** for `/games/block-topia/`.

## Tile footprint
- Logical grid remains square for gameplay.
- Isometric render footprint is locked to **64px wide / 32px tall** tiles.
- Terrain modules live in `assets/tiles/` (water, coastline edge, sand, pavement, road variants, district overlays).

## Sprite scale
- Base character frame size is **32x48** with `shape-rendering: crispEdges`.
- Each NPC sheet has **20 frames**:
  - idle: 0–4
  - walk: 5–9
  - interact/turn: 10–14
  - pause/scan: 15–19
- Runtime draws active entities around ~1.28x scale for readability against roads/buildings.

## Building footprint sizes (visual test)
- Small shop: ~2x2 tiles
- Medium block: ~2x2 to 3x2 visual mass
- Tall landmark tower: central **2x2** footprint with high vertical silhouette
- Annex towers/sign blocks provide comparative skyline scale references

## Keep for final art production
- Keep the 64px iso tile standard and current camera zoom presets (far/default/close).
- Keep the landmark + small/medium building size relationship for character readability.
- Keep modular folder split:
  - `assets/tiles/`
  - `assets/buildings/`
  - `assets/props/`
  - `assets/npcs/`
- Replace SVG art later without changing world logic contracts or render routing.


## Duel fighter replacement layer
- Duel placeholder art lives in `assets/duel-fighters/`.
- Keep fighter art on transparent backgrounds for clean overlay compositing.
- Swap visuals by editing `games/block-topia/data/duel-fighter-config.js` mappings; no duel logic changes required.
