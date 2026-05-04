# Block Topia Live City — Current State

## What Exists Now

Block Topia (`/games/block-topia/`) is the current live gated 2-player Colyseus multiplayer survival/mission prototype.

### Active files

| File | Role |
|---|---|
| `index.html` | Entry point. Entry gate check (Telegram-linked + 50 Arcade XP). Loads Colyseus v0.16 CDN, mounts canvas, starts multiplayer. Ready/Start/Restart flow controls input enable/disable. |
| `main.js` | Canvas renderer. 20×20 isometric tile grid. Renders P1/P2 markers, NPCs, and combat animations. Handles WASD + click-to-move, attacks, upgrade UI, and phase HUD. |
| `network.js` | Client-side Colyseus v0.16 only. Exports `connectMultiplayer`, `sendMovement`, `isConnected`, `getRoom`, `reconnectMultiplayer`. |
| `styles.css` | Active stylesheet. |
| `server/src/rooms/MinimalCityRoom.js` | Authoritative Colyseus room. `maxClients=2`, `autoDispose=false`. Tracks HP, downs, respawns, NPCs, attacks, world phases (FREE_ROAM → WARNING → EVENT_ACTIVE → RECOVERY → MISSION_COMPLETE), objectives, extraction, and upgrade choices. |
| `server/src/index.js` | Express + Colyseus server entry. Registers `MinimalCityRoom` + SAM webhook stub. |
| `server/src/webhooks/samWebhook.js` | SAM webhook stub. Logs payload, no live broadcast. |

### Kept as dormant scaffolding / data

| Path | Notes |
|---|---|
| `assets/` | SVG tile, building, prop, NPC spritesheets. Not all loaded by active renderer; retained for future use. |
| `data/` | Old data models (`districts.json`, `sam-phases.json`, etc.). Not all imported. Retained as design reference. |
| `render/iso-renderer.js` | Full iso-renderer. Not imported by active code. Retained as reference. |

### Active tests

| File | What it checks |
|---|---|
| `tests/skeleton-smoke.test.mjs` | `network.js` exports, banned old-handler identifiers, `index.html` wiring. |
| `tests/pick-tile-roundtrip.test.mjs` | 2 400 tile pick round-trip assertions on `main.js` math. |

---

## What Was Removed (earlier PRs)

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

## Current Product Split

- `/games/block-topia/` = Block Topia Live City, current gated 2-player Colyseus survival/mission prototype.
- `/games/block-topia-quest-maze/` = separate Quest Maze arcade/RPG score game.
- `/games/city-block-topia/` or `/games/block-topia/neon-sprawl/` = planned City Block Topia / Neon Sprawl deeper living-wiki layer, not current live runtime.

---

## Do Not Drift

- Do not describe Block Topia Live City as a clean map base only.
- Do not re-introduce SAM, Pressure Protocol, full NPC ecosystem, covert-ops, or duel systems until a dedicated gameplay PR has been reviewed and approved.
- Do not merge City Block Topia / Neon Sprawl into this runtime without a separate phase decision.
