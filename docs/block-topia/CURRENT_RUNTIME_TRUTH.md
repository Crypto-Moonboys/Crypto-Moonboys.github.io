# Block Topia — Current Runtime Truth

**Last updated:** 2026-05-04
**Purpose:** Anti-drift handover doc. Describes what is actually running today vs. what is documented as future vision elsewhere.

---

## What is currently live / built

### Client frontend
| File | Role |
|------|------|
| `games/block-topia/index.html` | Single-page shell. Mounts canvas, loads `main.js` and `network.js` via ESM `<script type="module">`. Entry gate: Telegram-linked account + 50 Arcade XP check before connect. Ready/Start/Restart flow controls input enable/disable. |
| `games/block-topia/main.js` | Isometric map renderer. Renders local and remote player markers, NPCs, objective markers, and combat/mission HUD state. Exposes `window.BlockTopiaMap` API. Handles WASD / tile-click movement, attacks, upgrade UI, and phase HUD. |
| `games/block-topia/network.js` | Colyseus v0.16 client wrapper. Exports `connectMultiplayer`, `sendMovement`, `isConnected`, `getRoom`, `reconnectMultiplayer`. Joins the persistent server-created "city" room only — never creates a room from the browser. Handles reconnect with MAX\_RETRIES=3. Error codes: 4211 (city not bootstrapped), 4213 (room full). |
| `games/block-topia/styles.css` | Basic game shell styling. |

### Server backend
| File | Role |
|------|------|
| `server/block-topia/src/index.js` | Express + Colyseus v0.16 server. Registers `MinimalCityRoom` as the "city" room. Pre-creates the persistent "city" room on boot via `matchMaker.createRoom`. Health check at `/health`. SAM webhook router mounted at `/webhooks/sam` (stub only — not live world control). Colyseus monitor at `/colyseus`. |
| `server/block-topia/src/rooms/MinimalCityRoom.js` | The only active game room. `maxClients = 2`. `autoDispose = false`. Tracks timed world phases: FREE_ROAM → WARNING → EVENT_ACTIVE → RECOVERY → MISSION_COMPLETE. `PlayerState` includes: `id`, `x`, `y`, `name`, `faction`, `district`, `hp`, `downs`, `upgradeState`. NPCs exist and are server-ticked. Attacks exist. HP, downs, and respawns exist. Objectives and extraction exist. Upgrade choices are generated/ensured during RECOVERY and MISSION_COMPLETE; `chooseUpgrade` is accepted during RECOVERY and MISSION_COMPLETE. |

### What the room actually does
- Accepts up to 2 browser clients.
- Assigns deterministic spawn positions (slot 0 → (6,10), slot 1 → (14,10)).
- Validates and applies `move` messages (server-authoritative x/y, clamped to 20×20 grid).
- Ticks world phases with timers; broadcasts phase state to clients.
- Ticks NPC positions and behaviour server-side.
- Handles combat: player attacks, NPC attacks, HP damage, downs, and respawns.
- Evaluates objectives and extraction signal.
- Generates upgrade choices and applies chosen upgrades in RECOVERY / MISSION_COMPLETE.
- Broadcasts player join/leave system messages.
- Syncs full room state (players, NPCs, world phase, objectives) to all clients via Colyseus schema delta.
- SAM webhook stub: receives events but does not drive live world state.

---

## What is NOT currently built

The following systems are described elsewhere as part of the vision but have **zero runtime code** in this repository:

- SAM live integration (wiki agent / city brain) — webhook stub only
- Season Engine — not implemented
- Signal Rush live-event system — not implemented
- Full NPC ecosystem and faction war — current NPCs are minimal server-ticked entities only
- Living wiki quest engine — not implemented
- Mega NPC "SAM Unleashed" — not implemented
- XP economy, cosmetics, player marketplace — not implemented
- Games-within-the-game integration — not implemented
- District control / district entry validation — `PlayerState.district` field exists but is static
- Reconnect warm-slot (60-second hold) — not implemented; `onLeave` removes the player immediately
- Redis — not installed or wired
- Postgres — not installed or wired
- Interest management / area-of-interest filtering — not implemented
- Anti-cheat (beyond basic coord clamping) — not implemented
- Room scaling (100-player cap, auto-open new rooms) — not implemented; hard cap is 2 clients
- City Block Topia / Neon Sprawl / GraffPunk Infiltration — separate future route (`/games/city-block-topia/`), not the current runtime

---

## What was deliberately removed in earlier branches

The following systems existed in earlier branches but were deliberately stripped when the codebase was reset:

- `CityRoom.js` — full living-city room with 50 ms simulation tick, district decay, NPC ticks, SAM state
- `covert-ops-system.js` — Signal Runner heat, Pressure Protocol
- `sam-system.js` — SAM spawn/chase/phase logic
- `npc-system.js` — full NPC ecosystem
- `quest-system.js` — quest validation
- `signal-rush-system.js` — live events
- `district-system.js` — district ownership/control
- Duel system (`games/block-topia/duel/`) — directory exists in client tree but is **not loaded or used**
- `economy/` client folder — exists in client tree but is **not loaded or used**

> **Do not reintroduce these systems** without a deliberate phase decision documented in a new ADR or build-phase doc.

---

## Files that control the current live city

```
games/block-topia/index.html          ← page entry point
games/block-topia/main.js             ← renderer + input + combat + upgrade UI + BlockTopiaMap API
games/block-topia/network.js          ← Colyseus client wrapper
games/block-topia/styles.css          ← shell CSS
server/block-topia/src/index.js       ← server entry point
server/block-topia/src/rooms/MinimalCityRoom.js  ← the only game room
```

All other files and folders under `games/block-topia/` (e.g. `render/`, `world/`, `duel/`, `economy/`, `ui/`, `data/`) and `server/block-topia/src/systems/` are **not imported** by the active runtime and should be treated as dormant scaffolding.

---

## What should NOT be reintroduced accidentally

- Do not import or activate `CityRoom.js`, `covert-ops-system.js`, or any legacy system file.
- Do not add client-authoritative game logic (server owns positions and state).
- Do not raise `maxClients` without a deliberate design decision and matching server load testing.
- Do not wire Redis or Postgres without a corresponding migration plan and env-var documentation.
- Do not wire SAM live integration until the SAM webhook stub is properly specced and tested.
- Do not create rooms from the browser (`colyseusClient.create()`); the server pre-creates the persistent "city" room.
- Do not describe Block Topia Live City as a clean map base only — NPCs, attacks, HP, phases, objectives, upgrades, and extraction are live.
- Do not merge City Block Topia / Neon Sprawl into this runtime without a separate phase decision.

---

## Current Product Split

- `/games/block-topia/` = Block Topia Live City, current gated 2-player Colyseus survival/mission prototype.
- `/games/block-topia-quest-maze/` = separate Quest Maze arcade/RPG score game.
- `/games/city-block-topia/` or `/games/block-topia/neon-sprawl/` = planned City Block Topia / Neon Sprawl deeper living-wiki layer, not current live runtime.

---

## Next safe build phase

The survival/mission prototype is stable. Safe next steps in recommended order:

1. **Phase 2 — Persistence lite**
   - Add a simple Postgres (or D1 via Cloudflare Workers) store for player names and last-known positions.
   - Implement the 60-second warm-slot reconnect so players can reload without losing their spot.
   - No new gameplay systems yet.

2. **Phase 3 — Map expansion**
   - Grow the grid to support more than 2 players (raise `maxClients`, update spawn slots, update client HUD).
   - Introduce basic district boundaries server-side (validate `player.district` on move).

3. **Phase 4 — NPC expansion**
   - Expand NPC variety and AI ticks beyond current minimal entities.
   - Validate that client rendering handles a mixed player+NPC entity list cleanly.

4. **Phase 5 — Events / Signal Rush lite**
   - Wire SAM webhook stub to trigger server-broadcast timed events.

5. **Phase 6 — Economy scaffolding**
   - XP grant on event completion.
   - Cosmetic unlock table (no marketplace yet).

Each phase should have its own ADR before merging to main.

---

## References

- Active server room: `server/block-topia/src/rooms/MinimalCityRoom.js`
- Active client entry: `games/block-topia/index.html`
- Future vision docs (not current state): `docs/block-topia/README.md`, `docs/block-topia/multiplayer-architecture.md`
