# Block Topia — Current State

## What Exists Now

Block Topia Live City is the current gated 2-player Colyseus survival/mission prototype.

### Active files

| File | Role |
|---|---|
| `index.html` | Entry point. Loads Colyseus v0.16 CDN, mounts canvas, starts multiplayer. |
| `main.js` | Self-contained canvas renderer. Isometric tile grid, player markers, attack/HP/respawn rendering, phase and upgrade HUD. |
| `network.js` | Client-side Colyseus v0.16 only. Exports `connectMultiplayer`, `sendMovement`, `isConnected`, `getRoom`, `reconnectMultiplayer`. |
| `styles.css` | Active stylesheet. |
| `server/src/rooms/MinimalCityRoom.js` | Authoritative Colyseus room. `maxClients=2`, `autoDispose=false`, NPC patrols, attacks, HP, respawns, timed world phases, extraction, upgrade windows, chooseUpgrade handler. |
| `server/src/index.js` | Express + Colyseus server entry. Registers `MinimalCityRoom` + SAM webhook stub. |
| `server/src/webhooks/samWebhook.js` | SAM webhook stub. Logs payload, no broadcast. |

### Kept as archive / data

| Path | Notes |
|---|---|
| `assets/` | SVG tile, building, prop, NPC spritesheets. Not loaded by active renderer; retained for future use. |
| `data/` | Old data models (`districts.json`, `sam-phases.json`, etc.). Not imported. Retained as design reference. |
| `render/iso-renderer.js` | Full iso-renderer. Not imported by active code. Retained as reference for future renderer work. |

### Active tests

| File | What it checks |
|---|---|
| `tests/skeleton-smoke.test.mjs` | `network.js` exports, banned old-handler identifiers, `index.html` wiring. |
| `tests/pick-tile-roundtrip.test.mjs` | 2 400 tile pick round-trip assertions on `main.js` math. |

---

## What Was Removed (this PR)

The following directories and files were deleted. None were imported by any active entry point.

### Client — `games/block-topia/`

| Removed | Was |
|---|---|
| `world/` (20 files) | NPC, SAM, quest, signal ops, covert ops, duel, district, canon, economy, and iso-renderer support systems |
| `ui/` (6 files) | Duel, Firewall Defense, Node Outbreak, Signal Router, Circuit Connect overlay UIs; old HUD with feed/toast/district stream |
| `economy/economy-system.js` | Player economy system |
| `duel/signal-duel-system.js` | Signal Duel variant |
| `tests/npc-system-import-order.test.mjs` | Stale test that depended on deleted `world/npc-system.js` |

### Server — `server/block-topia/src/`

| Removed | Was |
|---|---|
| `rooms/CityRoom.js` | Full CityRoom: NPC/hunter, district capture, covert ops, duel, SAM pressure, 50 ms sim tick |
| `systems/covert-ops-system.js` | Covert operations |
| `systems/district-system.js` | District control |
| `systems/duel-system.js` | Player duel |
| `systems/hunter-system.js` | Hunter NPC patrols |
| `systems/player-system.js` | Player movement validation (used only by CityRoom) |
| `systems/quest-system.js` | Quest tracking |

---

## Next Build Direction

New gameplay is added in small, reviewable layers on top of this clean skeleton using the `/games/template` pattern:

1. **Player name display** — wire `playerName` through HUD.
2. **Chat / feed strip** — narrow bottom bar fed by `onFeed` (already called for `system` messages).
3. **Tile asset loader** — load `assets/manifest.json` with a procedural-colour fallback when SVGs are absent.
4. **Larger map** — increase `GRID_SIZE` in `main.js` and `MAP_WIDTH`/`MAP_HEIGHT` in `MinimalCityRoom.js` together.
5. **More players** — raise `maxClients`, update `updatePlayers()` to render more than 2 markers.

Do **not** re-introduce SAM, Pressure Protocol, NPC, quest, covert-ops, or duel systems until a dedicated gameplay PR has been reviewed and approved.
