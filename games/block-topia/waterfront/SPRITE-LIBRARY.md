# Waterfront sprite library

The production PNGs are in [assets/atlases](assets/atlases). Use the existing atlas loader and the frame rectangles in [harbor-art.js](harbor-art.js) as the source of truth. These are the sprites already available to any agent with repository access.

| Atlas | Registered sprite IDs |
| --- | --- |
| [cargo.png](assets/atlases/cargo.png) | `cargo-frames` |
| [factions.png](assets/atlases/factions.png) | `faction-frames` |
| [bots.png](assets/atlases/bots.png) | `bot-frames` |
| [hk-night.png](assets/atlases/hk-night.png) | `afterblock-club`, `apartments`, `block-exchange`, `cold-vault`, `graffiti-wall`, `hash-house`, `lighthouse`, `lucky-block-casino`, `neon-ledger-casino`, `record-shop`, `warehouse`, `workshop` |
| [trees.png](assets/atlases/trees.png) | `tree-banyan`, `tree-camphor`, `tree-casuarina`, `tree-frangipani`, `tree-mangrove`, `tree-ornamental`, `tree-palm`, `tree-paperbark` |
| [street-detail.png](assets/atlases/street-detail.png) | `flowers-0`, `flowers-1`, `flowers-2`, `flowers-3`, `flowers-4`, `flowers-5`, `flowers-6`, `flowers-7`, `flowers-8`, `flowers-9`, `flowers-10`, `flowers-11`, `furniture-0`, `furniture-1`, `furniture-2`, `furniture-3`, `furniture-4`, `furniture-5`, `furniture-6`, `furniture-7`, `furniture-8`, `furniture-9`, `furniture-10`, `furniture-11`, `grass` |
| [terrain.png](assets/atlases/terrain.png) | `curb-corner`, `curb-straight`, `footpath-pavers` |

## Multi-frame atlases

- **Cargo:** 24 static objects, eight 32 × 32 cells per row. The first 12 are harbor freight and the next 12 are construction freight. Inspect the sheet when selecting a specific object.
- **Bots:** Eight designs with 16 frames each, using 32 × 32 cells. Model order is Builder, Surveyor, Graffiti, Courier, Dock Loader, Patrol, Sweeper, Welder.
- **Factions:** Nine designs with 16 frames each, using 36 × 36 cells. Follow the `waterfrontFactions` array for model order and spelling. Both character atlases use south, west, east, north rows and idle followed by three movement columns.
- **Street detail:** The flower IDs are 0–11. Furniture IDs 0–3 are bins, 4–7 are benches and 8–11 are streetlights. The grass frame repeats as a terrain pattern.

## Reuse in daily builds

1. Read [CITY-BRIEF.md](CITY-BRIEF.md) and inspect the district, renderer and relevant atlas. Choose sprites by their registered IDs. Verify art and direction visually whenever assigning a new role.
2. Use existing art for layout, route, bot activity, cargo and streetscape work. Keep the existing scale, ground anchors and animation order. Avoid duplicating PNGs or repacking an atlas just to reuse an existing frame.
3. If a change genuinely needs new art, describe the gap and supply the AutoSprite prompt, references, intended dimensions and acceptance checks. Keep the current PR playable with approved assets. Raw AutoSprite outputs and alternate drafts may exist outside this repository and are outside this catalog.
4. Update this catalog when adding an atlas group or changing its layout. Describe new assets and verification in the same PR.
