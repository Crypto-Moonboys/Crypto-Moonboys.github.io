# Waterfront sprite library

The production atlases are in [assets/atlases](assets/atlases). Use the existing atlas loader and the frame rectangles in [harbor-art.js](harbor-art.js) as the source of truth. These are the sprites already available to any agent with repository access.

| Atlas | Registered sprite IDs |
| --- | --- |
| [cargo.png](assets/atlases/cargo.png) | `cargo-frames` |
| [factions.png](assets/atlases/factions.png) | `faction-frames` |
| [bots.png](assets/atlases/bots.png) | `bot-frames` |
| [hk-night.png](assets/atlases/hk-night.png) | `afterblock-club`, `apartments`, `block-exchange`, `cold-vault`, `graffiti-wall`, `hash-house`, `lighthouse`, `lucky-block-casino`, `neon-ledger-casino`, `record-shop`, `warehouse`, `workshop` |
| [trees.png](assets/atlases/trees.png) | `tree-banyan`, `tree-camphor`, `tree-casuarina`, `tree-frangipani`, `tree-mangrove`, `tree-ornamental`, `tree-palm`, `tree-paperbark` |
| [street-detail.png](assets/atlases/street-detail.png) | `flowers-0`, `flowers-1`, `flowers-2`, `flowers-3`, `flowers-4`, `flowers-5`, `flowers-6`, `flowers-7`, `flowers-8`, `flowers-9`, `flowers-10`, `flowers-11`, `furniture-0`, `furniture-1`, `furniture-2`, `furniture-3`, `furniture-4`, `furniture-5`, `furniture-6`, `furniture-7`, `furniture-8`, `furniture-9`, `furniture-10`, `furniture-11`, `grass` |
| [terrain.png](assets/atlases/terrain.png) | `curb-corner`, `curb-straight`, `footpath-pavers` |

## Detailed character atlases

[Faction characters](assets/atlases/factions-detail.webp) and [harbor robots](assets/atlases/bots-detail.webp) use the original animation sheets, packed into 192 × 192 WebP frames. Each model has four direction rows and four animation columns. The model blocks are packed three across in the same order as the smaller faction and robot atlases. The browser uses filtered scaling for these detailed frames and can fall back to the original compact atlases if a file fails to load.

## Island roamers

These 27 guest sprites come from GK’s November 24 Waterfront sheet batch. Every model uses a 4 × 4 block of 112 × 112 frames, packed three models across. Frames are cropped to the sprite and placed on a shared bottom-center anchor per model. Directions run south, west, east, north, with idle first in each row. Vehicles use travel frames and slightly faster patrol speeds.

| Atlas | Models in packing order with source job prefixes |
| --- | --- |
| [roamers-patrol.webp](assets/atlases/roamers-patrol.webp) | Police Robot (`c3a815e0`), Police Car (`8c3fd763`), Police Bike (`598578f2`), Blue Electric Bot (`fe4ae92b`), Green Electric Bot (`2d5f8e2e`), Walking Boombox (`2371547a`), Samurai (`d956997a`), Burglar Bear (`74cd153d`), Sailor Bear (`6e6d5634`) |
| [roamers-mechs.webp](assets/atlases/roamers-mechs.webp) | Allcity Bulls (`47412f05`), Blockstars (`8ad42761`), Blockchain Furies (`3194eb57`), GraffPunks (`84b01c4c`), Nomad Bears (`e317ac85`), HODL (`73c8e85b`), Hard Fork Rockers (`1064da43`), Moongirls (`2b60a2f3`), Nomad Bears block variant (`Nomad Bear waterfront mech sprites(1).png`), No Ball Games (`411f5153`), Graffiti Kings (`d1cdf6a8`) |
| [roamers-bears.webp](assets/atlases/roamers-bears.webp) | Jamaican Bear (`37961231`), Camo Bear (`55230f31`), Gentleman Bear (`73defe77`), Graff Bear (`533cbd83`), Posh Bear (`11e64d44`), St Patrick’s Day Bear (`2446ae85`), Straight Outta Ghetto Bear (`546d0448`) |

The Nomad Bears block variant’s source arranges directions in columns and poses in rows. Its own 16 frames are transposed to the atlas layout. The roamers share the existing walkable island loop at staggered starting points. The renderer skips offscreen roamers, shows idle frames while paused or in reduced-motion mode, and skips any guest atlas that fails to load so the rest of the map can still run.

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
