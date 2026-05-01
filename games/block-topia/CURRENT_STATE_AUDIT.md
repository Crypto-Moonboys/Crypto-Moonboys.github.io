# Block Topia — Current State Audit

**Date:** 2026-04-26
**Branch context:** cleanup + truth-lock (no new gameplay)

---

## What Is Actually Built

Block Topia is a **clean 2-player isometric map skeleton**.

| Feature | Status |
|---|---|
| Isometric canvas map (20 × 20 grid, procedural terrain) | ✅ Built |
| Local player marker (L) with WASD + click-to-move | ✅ Built |
| Remote player marker (R), shown when P2 joins | ✅ Built |
| Canvas HUD: P1/P2 coords + NET status | ✅ Built |
| Multiplayer: Colyseus v0.16, `wss://game.cryptomoonboys.com` | ✅ Built |
| Server: `MinimalCityRoom` — maxClients=2, `move` handler only | ✅ Built |
| Server: SAM webhook stub at `/webhooks/sam` (stub, no logic) | ✅ Built (stub only) |
| Server: persistent city room pre-created on boot | ✅ Built |

## What Is Not Built

The following systems exist as **archive files only** and are **not imported or reachable from any active runtime entry point**:

- SAM UI / SAM pressure system
- Pressure Protocol
- Solo mode
- Old feed / event boxes / toast popups
- Old Street Signal / signal variants
- NPC / crowd / hunter systems
- Quest / covert-ops systems
- Duel / Signal Duel systems
- District capture / control-node interference
- Node Outbreak / Firewall Defense / Signal Router / Circuit Connect mini-games
- Economy system
- District theming / iso-renderer asset loader
- Faction / season / live-intelligence systems

---

## Active Runtime Files

### Client (`games/block-topia/`)

| File | Role |
|---|---|
| `index.html` | Entry point. Loads Colyseus CDN, imports `main.js` + `network.js`. |
| `main.js` | Self-contained canvas renderer. Tile grid, player markers, HUD, keyboard + click input. No external imports. |
| `network.js` | Client-side Colyseus v0.16 only. Exports: `connectMultiplayer`, `sendMovement`, `isConnected`, `getRoom`, `reconnectMultiplayer`. No old system handlers. |
| `styles.css` | Active stylesheet (linked from `index.html`). |

### Server (`server/block-topia/src/`)

| File | Role |
|---|---|
| `index.js` | Express + Colyseus server entry. Registers `MinimalCityRoom` and SAM webhook route. |
| `rooms/MinimalCityRoom.js` | Active Colyseus room. `maxClients=2`, `autoDispose=false`, `move` message handler only. |
| `webhooks/samWebhook.js` | SAM webhook stub. Registered at `POST /webhooks/sam`. Logs payload, returns `status: received`. No broadcast logic. |

---

## Dead / Archive Files

These files exist in the repository but are **not imported or reachable** from any active entry point (`index.html`, `main.js`, `network.js`, `server/index.js`). They are retained as archive/reference only.

### Client — `games/block-topia/world/` (old game systems)

| File | System |
|---|---|
| `game-state.js` | Full game state tree (districts, nodes, NPC entities, SAM, signal ops) |
| `data-loader.js` | Asset + district + node data loader |
| `npc-system.js` | NPC / crowd / hunter entity management |
| `sam-system.js` | SAM instability + pressure system |
| `quest-system.js` | Quest tracking |
| `signal-operation-system.js` | Signal Runner / covert operation execution |
| `signal-quest-generator.js` | Signal quest generation |
| `signal-router-system.js` | Signal router mini-game logic |
| `node-interference-system.js` | Control node interference |
| `node-outbreak-system.js` | Node Outbreak mini-game logic |
| `firewall-defense-system.js` | Firewall Defense mini-game logic |
| `circuit-connect-system.js` | Circuit Connect mini-game logic |
| `clue-signal-system.js` | Clue/signal detection |
| `control-grid.js` | Control node grid definition |
| `duel-system.js` | Player duel system |
| `canon-adapter.js` | Lore canon adapter |
| `canon-lore.js` | Lore canon data |
| `canon-signal-bridge.js` | Canon ↔ signal bridge |
| `live-intelligence.js` | Live intel aggregation |
| `memory-system.js` | Persistent memory / player history |
| `network-lines.js` | Network topology data |
| `tier-difficulty.js` | Tier + difficulty scaling |

### Client — `games/block-topia/ui/` (old overlay UIs)

| File | System |
|---|---|
| `hud.js` | Old HUD with feed, district stream, toast, LIVE LINK banner |
| `circuit-connect-overlay.js` | Circuit Connect mini-game UI |
| `duel-overlay.js` | Duel UI overlay |
| `firewall-defense-overlay.js` | Firewall Defense mini-game UI |
| `node-outbreak-overlay.js` | Node Outbreak mini-game UI |
| `signal-router-overlay.js` | Signal Router mini-game UI |

### Client — other dead directories/files

| Path | System |
|---|---|
| `render/iso-renderer.js` | Full iso-renderer with NPC/node/district/covert overlays |
| `economy/economy-system.js` | Player economy |
| `duel/signal-duel-system.js` | Signal Duel variant |
| `style.css` | Old stylesheet (targets `#world-canvas`, `#hud`, etc. — not present in active `index.html`) |
| `data/` (all files) | Old data models: `districts.json`, `npc-archetypes.json`, `sam-phases.json`, `quest-model.json`, `factions.json`, `node-interference-model.json`, `room-model.json`, `season-model.json`, `duel-fighter-config.js` |
| `assets/` (all files) | SVG tile / building / prop / NPC spritesheets — not referenced by active canvas renderer |

### Server — dead files

| File | System |
|---|---|
| `src/rooms/CityRoom.js` | Old full CityRoom: NPC, district capture, covert ops, duel, SAM pressure, hunt system, 50 ms simulation tick. **Not imported by `index.js`.** |
| `src/systems/covert-ops-system.js` | Covert ops (only imported by `CityRoom.js`) |
| `src/systems/district-system.js` | District (only imported by `CityRoom.js`) |
| `src/systems/duel-system.js` | Duel (only imported by `CityRoom.js`) |
| `src/systems/hunter-system.js` | Hunter NPC (only imported by `CityRoom.js`) |
| `src/systems/player-system.js` | Player movement validation (only imported by `CityRoom.js`) |
| `src/systems/quest-system.js` | Quest (only imported by `CityRoom.js`) |

### Tests — stale (test dead-code paths)

| File | Status |
|---|---|
| `tests/passive-map-smoke.test.mjs` | **Stale.** Tests old `main.js` patterns (`applyPassiveVisualModeGuards`, `state.controlNodes`, `iso-renderer.js` text labels) that no longer exist in the current `main.js`. |
| `tests/npc-system-import-order.test.mjs` | **Stale.** Tests `world/npc-system.js` and `render/iso-renderer.js` — both are dead archive files. |

### Tests — active

| File | Status |
|---|---|
| `tests/skeleton-smoke.test.mjs` | **Active.** Validates `network.js` exports and bans old handler identifiers. Validates `index.html` wires Colyseus + `connectMultiplayer`. |
| `tests/pick-tile-roundtrip.test.mjs` | **Active.** 2 400 round-trip assertions on `main.js` tile math functions. |

---

## Confirmed Clean Checks

- `network.js` contains **no** old handler identifiers (`questCompleted`, `samPhaseChanged`, `sendNodeInterference`, `sendWarAction`, `covertState`, etc.).
- `index.html` loads only Colyseus CDN + `main.js` + `network.js`. No old overlay scripts or feed containers.
- `main.js` has **no** `import` statements — it is fully self-contained.
- `server/index.js` imports only `MinimalCityRoom` and `samWebhookRouter`. `CityRoom.js` is not registered and not reachable.

---

## Next Safe Build Layer

The skeleton is ready to receive new gameplay on top of the clean base. Safe additions in the next PR:

1. **Player name display** — pass `playerName` through `onStatus` → `setLocalPlayer`, render name in HUD.
2. **Tile asset loader** — load `assets/manifest.json` only if tiles exist; fall back to procedural canvas colours (current behaviour) if assets missing. No behaviour change until assets are present.
3. **Chat / feed strip** — add a narrow bottom feed bar fed by `onFeed`; `network.js` already calls `onFeed` for `system` messages.
4. **Larger map** — increase `GRID_SIZE` constant in `main.js` and update `MAP_WIDTH`/`MAP_HEIGHT` in `MinimalCityRoom.js` together.
5. **Third/fourth player support** — raise `maxClients` in `MinimalCityRoom.js`; update `updatePlayers()` in `main.js` to render more than 2 markers.

Do **not** enable SAM, Pressure Protocol, NPC, quest, or covert-ops systems until a dedicated gameplay PR has been reviewed and approved.
