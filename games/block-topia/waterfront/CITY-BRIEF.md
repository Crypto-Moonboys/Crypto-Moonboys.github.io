# Lumina’s Waterfront city brief

Lumina’s Waterfront is Block Topia’s walkable island district. Build a dense, lived-in cyberpunk harbor inspired by Hong Kong at night. Anchor the city in docks, steep rooflines, narrow streets, neon storefronts, parks and graffiti. Keep the current visual language of deep blue shadows, amber windows, teal waterfront light and selective magenta accents. Use original art and the supplied faction designs.

## Districts and landmarks

These are design targets for future PRs. Check `workers/moonboys-api/blocktopia/waterfront-district.js` and the current renderer before choosing lots. Coordinates below are inclusive, zero-based world coordinates. The current grid is 56 by 34 with 32 map pixels per tile.

| Area | Build direction |
| --- | --- |
| Existing waterfront | Keep the lighthouse, mural, docks, shops and nightlife as the main arrival corridor. Add small storefront or market infill where there is room for a real entrance and path. |
| West Meadow (11–22, 20–23) | Create a walkable garden link between the older streets and the southern route. Use trees, low planted borders and a gathering spot. |
| Southwest Park (12–23, 25–28) | Build a neighborhood park with accessible entrances, benches and a small community art space. Leave open lawn and clear sightlines. |
| South Point (25–40, 25–29) | Build a lookout and shore promenade with paths to the water’s edge. Put a small shelter or beacon on land and preserve the coastline. |
| East Common (38–43, 15–22) | Build an outdoor market square with stalls, a clear walking loop and places for visitors to pause. |
| East Shore (45–47, 11–26) | Develop a narrow shoreline service strip. Use a few small utility buildings, lit landings and dockside props. |
| Offshore islands | Keep them visible across the water. Add access only as a separately scoped traversal feature. |

## Scale and movement

- Treat streets and paths as a connected network. Check access from spawn to each new public destination with the existing pathfinder. Use existing tile IDs and save migration conventions. Never make ordinary water walkable to solve a route.
- Start with one or two tiles of frontage for small buildings and use larger footprints only for landmarks. Model the actual footprint before adding the sprite. Place the visible front door over its reachable landing, keep the draw origin at the building base and respect depth sorting.
- Compare doors, benches and windows against the current 18-pixel player and 20-pixel faction NPC render sizes. Inspect normal zoom and close-up. Keep path access clear of foliage, signs, cargo and door overlays.
- Keep the player under player control. Let the nine faction pedestrians roam connected routes with correct facing and readable nearby labels. Cargo bots keep their delivery role. Graffiti bots work along the mural. Crew bots present actual build discussions.
- Preserve player skins and the faction names already mapped from the portrait filenames. All City Bulls and Nomad Bears are the main surface factions. Treat sightings and district flavor as local presence. Changes to faction affiliations, territory ownership or canon need explicit direction.

## AutoSprite production specs

| Asset | Prompt and input requirements | Game acceptance |
| --- | --- | --- |
| Building | Name its use, footprint, facade materials, signage colors and door position. Elevated front orthographic view with roof and front visible, horizontal frontage and consistent lighting. One full object, isolated. | Transparent alpha, no baked ground or background. Door aligns to the path. Footprint and base anchor verified against the current map. |
| Props and plants | Use weathered steel, concrete, wet wood and restrained neon. Use distinct small silhouettes. State intended height relative to the player. | Each prop fits its lot and reads at game size. Preserve small openings and remove visible fringe. |
| Terrain | Request a flat straight-down material swatch with edge-to-edge coverage. Omit scene, buildings and props. | Inspect a repeated patch at game scale. Avoid seams and keep lane paint and curbs aligned to routes. |
| Characters and vehicles | Reference the approved portrait or existing design. Use one consistent orthographic camera. Four rows in order south, west, east, north. Four columns in order idle, movement A, B, C. Include feet, wheels or treads in every frame. | Check all 16 frames individually, including the direction of both side rows. Apply the same scale and ground anchor across all frames. |
| Cargo | One isolated load with a visible top and a common bottom-center anchor. Use distinct shapes for packs, crates, drums and equipment. | Keep carried and dropped forms consistent. Fit the cargo to the existing pickup and drop system. |

Palette references are the current map and atlases. Before generating a batch, specify the asset ID, filename, variant count, reference source, facing, intended world size, atlas group and exact placement or animation role. Test one representative asset before producing many.

Pack accepted sprites into the existing atlas groups where practical. Generate frame rectangles from verified bounds and use padding between frames. Keep consistent baselines and preserve alpha. Verify each frame is isolated, no neighboring sprite is clipped in and west/east are correct. Update asset references and cache versions with integration. Use the existing sprite and renderer conventions.

AutoSprite generation currently runs on the owner’s PC. When new external art is needed, provide a ready-to-run prompt batch with output filenames and acceptance checks. Use existing art or pick another scoped change if a daily build can proceed independently. Never commit API keys or pretend generation has run. Review uploaded output before integration.

## Daily build order

1. Fix broken routes and close obvious gaps around the existing waterfront.
2. Add the park connections and East Common market in small, independently reviewable PRs.
3. Develop South Point and East Shore while keeping the island silhouette and waterfront sightlines.
4. Add street life and polish lighting, animations and transitions after the routes and landmarks work.

For each PR, identify the district, user-visible change, asset reuse or AutoSprite requirements, and test results. Check open Waterfront PRs before starting. Exercise changed routes, sprite loading and desktop and portrait layouts when applicable. If the discussion feed is available, record the actual proposals, tradeoffs, review feedback when available and decision in build-discussion.json. Only attribute independent reviewer turns to a reviewer that actually participated. Leave merging and deployment to the owner.

## VPS build worker

The VPS runs the [Block Topia build queue](../../../scripts/block-topia-build-queue.cjs) as the `mooncity` user. Its systemd user timer checks for open issues labelled `block-topia-approved` every five minutes. The installed runner is `~/.local/share/block-topia-art/build-queue.cjs`. Updating the repository and updating that installed copy are separate steps.

### Queue a sprite-library build

1. Open a GitHub issue describing the district, desired prop and placement intent.
2. Add `<!-- waterfront-production -->` to the issue body and apply both `block-topia-approved` and `block-topia-iterate`.
3. Keep the issue open while the worker should continue. Closing it or removing an approval label stops further work on that issue. Existing founder-preview issues use the original workflow.

The worker reads the district, renderer, city brief and [sprite library](SPRITE-LIBRARY.md) from the integration base. Local Ollama proposes one registered flower or furniture sprite per round. The runner validates the sprite and coordinates, checks the modified renderer's JavaScript syntax, and places the prop on open ground beside a street or footpath outside the original harbor core. The renderer hides it if a saved map edit changes the lot or adjoining route. The production workflow leaves map geometry and routes intact.

Each candidate gets a preview PR and a Codex review request. Review findings feed the next attempt. A clean review of the tested commit, continued issue approval and an unchanged base allow the worker to merge into `block-topia/waterfront-production-integration`. The branch starts from `main` when first created. The owner handles any merge to `main` and deployment. Production preview PRs still need a visual browser check.

From the VPS, the `mooncity` user can inspect the schedule with `systemctl --user list-timers block-topia-build.timer` and recent runs with `journalctl --user -u block-topia-build.service -n 50 --no-pager`.
