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

[Faction characters](assets/atlases/factions-detail.webp) and [harbor robots](assets/atlases/bots-detail.webp) use the original animation sheets, packed into 192 × 192 WebP frames. Each model has four direction rows and four animation columns. The model blocks are packed three across in the same order as the smaller faction and robot atlases. The harbor paints with compact sprites first. The detailed frames load at low priority and replace the compact sprites when decoded. The renderer uses filtered scaling for detailed frames.

## Island roamers

These 26 roaming guests come from GK’s November 24 Waterfront sheet batch. Every model uses a 4 × 4 block of 112 × 112 frames, packed three models across. Frames are cropped to the sprite and placed on a shared bottom-center anchor per model. Directions run south, west, east, north, with idle first in each row. Vehicles use travel frames and slightly faster patrol speeds.

| Atlas | Models in packing order with source job prefixes |
| --- | --- |
| [roamers-patrol.webp](assets/atlases/roamers-patrol.webp) | Police Robot (`c3a815e0`), Police Car (`8c3fd763`), Police Bike (`598578f2`), Blue Electric Bot (`fe4ae92b`), Green Electric Bot (`2d5f8e2e`), Walking Boombox (`2371547a`), Samurai (`d956997a`), Burglar Bear (`74cd153d`), Sailor Bear (`6e6d5634`) |
| [roamers-mechs.webp](assets/atlases/roamers-mechs.webp) | Allcity Bulls (`47412f05`), Blockstars (`8ad42761`), Blockchain Furies (`3194eb57`), GraffPunks (`84b01c4c`), Retired rounded Nomad Bears slot (`e317ac85`), HODL (`73c8e85b`), Hard Fork Rockers (`1064da43`), Moongirls (`2b60a2f3`), Nomad Bears block variant (`Nomad Bear waterfront mech sprites(1).png`), No Ball Games (`411f5153`), Graffiti Kings (`d1cdf6a8`) |
| [roamers-bears.webp](assets/atlases/roamers-bears.webp) | Jamaican Bear (`37961231`), Camo Bear (`55230f31`), Gentleman Bear (`73defe77`), Graff Bear (`533cbd83`), Posh Bear (`11e64d44`), St Patrick’s Day Bear (`2446ae85`), Straight Outta Ghetto Bear (`546d0448`) |

The Nomad Bears block variant’s source arranges directions in columns and poses in rows. Its own 16 frames are transposed to the atlas layout. The roamers share the existing walkable island loop at staggered starting points. The renderer skips offscreen roamers, shows idle frames while paused or in reduced-motion mode, and skips any guest atlas that fails to load so the rest of the map can still run.

After the first compact harbor paint, a roamer atlas loads when a member of its group approaches the visible area. The camera's two-tile margin gives the group time to load before coming into view. Each group is requested once per visit, with the original art and frame rectangles. The map repaints as each group becomes available, including when reduced motion is enabled.

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

## Harbor kaiju

[Harbor kaiju atlas](assets/atlases/harbor-kaiju.webp) packs the two GK-approved generated sheets into 144 × 128 frames with a waterline anchor at (72, 110). Rows 0–1 contain the eight emergence frames. Rows 2–5 loop the four south, west, east and north walk frames with footstep splashes. The final emergence frame and walk rows share a nominal 104-pixel crown-to-waterline height. The renderer loads the atlas when the hidden K shortcut summons it near its offshore patrol. The patrol is visual and uses the static final emergence pose with reduced motion.

[Landfall atlas](assets/atlases/harbor-kaiju-landfall.webp) uses the same registered frame size, anchor and nominal height. Row 0 is the four-frame shoreline transition. Rows 1–3 are the west, east and north mud-and-stone walk cycles. Landfall uses the north shore at column 43, with one natural encounter after 20–40 minutes when the area is visible. Double-tap K within 300 ms for a preview. A single tap still summons the offshore patrol. Debris is visual and never changes saved terrain.

[Landfall fire atlas](assets/atlases/harbor-kaiju-fire.webp) has four 128 × 72 frames with a nozzle anchor at (122, 36). The landfall animation attaches one brief flame burst to each horizontal leg. Right-facing breath mirrors the effect at the right-facing mouth.

[Harbor Nessie atlas](assets/atlases/harbor-nessie.webp) contains eight 128 × 72 frames, read row-major for surfacing, swimming and diving. [Angry Nessie atlas](assets/atlases/harbor-nessie-angry.webp) uses the same frame grid and swim cycle. Regular waves recur after 45–100 seconds and angry waves after 110–185 seconds. Each random wave chooses one to three distinct open-water locations and waits for any active Nessies to dive. Each tap of L shows one Nessie, replacing any current sighting, alternating variants and advancing through the nine map locations. Nessie sightings never trigger the kaiju warning.

## November 24 guest characters

The 24 additional guests use sheets supplied or generated in GK’s Waterfront sprite session. Each model is packed as a 4 × 4 block of 112 × 112 frames, three models across per atlas. Direction rows are south, west, east and north. All four columns are used for movement. The first pose also serves as the still frame for inspection and reduced motion. Each guest starts once at a staggered point on the reachable island loop. The two eyeballs flap above the route.

| Atlas | Models in packing order with source job prefixes |
| --- | --- |
| [roamers-guest-street.webp](assets/atlases/roamers-guest-street.webp) | Police Captain (`50aba9af`), Riot Cop (`7e7dde5c`), Shamrock Cat (`cd2ba4be`), Basketball Cat (`7bdb3c68`) |
| [roamers-guest-night.webp](assets/atlases/roamers-guest-night.webp) | Red Mask Cat (`57b98a72`), GK Niftyhead (`773aad35`), Joker (`71f5d1d3`), Higher Purpose (`19869d73`) |
| [roamers-guest-artists.webp](assets/atlases/roamers-guest-artists.webp) | Charlie Buster (`016e6c5f`), Bone Idol Ink (`448135aa`), Delicious Again Peter (`562f7167`), Dude Got Game (`28f9fbd0`) |
| [roamers-guest-mascots.webp](assets/atlases/roamers-guest-mascots.webp) | GREGZ Robot Chef (`0be4df7e`), Graffiti Kings Crowned Robot (`0ec0b565`), Mypetspace Mascot (`40ff3bb1`), Sticker Bot (`f2e92ac0`) |
| [roamers-guest-pets.webp](assets/atlases/roamers-guest-pets.webp) | Wuffi (`caa541de`), Wuffi’s Companion (`3a034f64`), Laughing Rat (`a886db60`), Bratty (`bb482b4a`) |
| [roamers-guest-curios.webp](assets/atlases/roamers-guest-curios.webp) | WAX Builder (`2aa55eaa`), Muscle Mascot (`84942711`), Gold-Winged Eyeball (`fea4de8d`), Purple-Winged Eyeball (`a7d01cb5`) |

The guest atlases load in groups as the camera approaches. Selecting one of these guests opens the same NPC info panel with the guest’s name. Guests have no dialogue entry.
