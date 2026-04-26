# Block Topia — Current Runtime Truth

**Last updated:** 2026-04-26
**Purpose:** Anti-drift handover doc. Describes what is actually running today vs. what is documented as future vision elsewhere.

---

## What is currently live / built

### Client frontend
| File | Role |
|------|------|
| `games/block-topia/index.html` | Single-page shell. Mounts canvas, loads `main.js` and `network.js` via ESM `<script type="module">`. Connects to the Colyseus "city" room on load. |
| `games/block-topia/main.js` | Isometric map renderer for a 20×20 grid. Draws 3 terrain types (grass, road, block). Renders P1 (blue) and P2 (red) markers. Exposes `window.BlockTopiaMap` API: `mount`, `destroy`, `setConnectionStatus`, `setLocalPlayer`, `updatePlayers`, `setPositionBroadcastSink`. Supports WASD keyboard movement and tile-click movement. Simple HUD showing connection status and player name. |
| `games/block-topia/network.js` | Colyseus v0.16 client wrapper. Exports `connectMultiplayer`, `sendMovement`, `isConnected`, `getRoom`, `reconnectMultiplayer`. Joins the persistent server-created "city" room only — never creates a room from the browser. Handles reconnect with MAX\_RETRIES=3. Error codes: 4211 (city not bootstrapped), 4213 (room full). |
| `games/block-topia/styles.css` | Basic game shell styling. |

### Server backend
| File | Role |
|------|------|
| `server/block-topia/src/index.js` | Express + Colyseus v0.16 server. Registers `MinimalCityRoom` as the "city" room. Pre-creates the persistent "city" room on boot via `matchMaker.createRoom`. Health check at `/health`. SAM webhook router mounted at `/webhooks/sam` (stub only — see below). Colyseus monitor at `/colyseus`. |
| `server/block-topia/src/rooms/MinimalCityRoom.js` | The only active game room. `maxClients = 2`. `autoDispose = false`. `PlayerState` has: `id`, `x`, `y`, `name`, `faction`, `district`. Handles one message type: `move` (validates finite coords, clamps to 0–19). Spawns P1 at (6,10) and P2 at (14,10). Broadcasts `system` messages on join/leave. |

### What the room actually does
- Accepts up to 2 browser clients.
- Assigns deterministic spawn positions (slot 0 → (6,10), slot 1 → (14,10)).
- Validates and applies `move` messages (server-authoritative x/y, clamped to 20×20 grid).
- Broadcasts player join/leave system messages.
- Syncs `state.players` (ArraySchema) to all clients via Colyseus schema delta.
- **Nothing else.** No NPC tick, no district logic, no economy, no events, no persistence, no quests.

---

## What is NOT currently built

The following systems are described in `docs/block-topia/README.md` and `docs/block-topia/multiplayer-architecture.md` as part of the vision but have **zero runtime code** in this repository:

- SAM (wiki agent / city brain) — no runtime integration; the SAM webhook route is a stub
- Season Engine — not implemented
- Signal Rush live-event system — not implemented
- NPC ecosystem and faction war — no NPC state, no NPC ticks
- Living wiki quest engine — not implemented
- Mega NPC "SAM Unleashed" — not implemented
- XP economy, cosmetics, player marketplace — not implemented
- Games-within-the-game integration — not implemented
- District control / district entry validation — `PlayerState.district` field exists but is static (set at join, never changed)
- Reconnect warm-slot (60-second hold) — not implemented; `onLeave` removes the player immediately
- Redis — not installed or wired
- Postgres — not installed or wired
- Interest management / area-of-interest filtering — not implemented
- Anti-cheat (beyond basic coord clamping) — not implemented
- Room scaling (100-player cap, auto-open new rooms) — not implemented; hard cap is 2 clients

---

## What was deliberately removed in recent PRs

The following systems existed in earlier branches (visible in server-side artifacts like `server/block-topia/src/rooms/CityRoom.js` and supporting systems under `server/block-topia/src/systems/`) but were deliberately stripped when the codebase was reset to the minimal 2-player skeleton:

- `CityRoom.js` — full living-city room with 50 ms simulation tick, district decay, NPC ticks, SAM state
- `covert-ops-system.js` — Signal Runner heat, Pressure Protocol
- `sam-system.js` — SAM spawn/chase/phase logic
- `npc-system.js` — NPC ecosystem
- `quest-system.js` — quest validation
- `signal-rush-system.js` — live events
- `district-system.js` — district ownership/control
- Duel system (`games/block-topia/duel/`) — the directory exists in the client tree but is **not loaded or used** by `index.html` or `main.js`
- `economy/` client folder — exists in the client tree but is **not loaded or used**

> **Do not reintroduce these systems** without a deliberate phase decision documented in a new ADR or build-phase doc.

---

## Files that control the current 2-player skeleton

If you want to understand or modify the running game, these are the only files that matter:

```
games/block-topia/index.html          ← page entry point
games/block-topia/main.js             ← renderer + input + BlockTopiaMap API
games/block-topia/network.js          ← Colyseus client wrapper
games/block-topia/styles.css          ← shell CSS
server/block-topia/src/index.js       ← server entry point
server/block-topia/src/rooms/MinimalCityRoom.js  ← the only game room
```

All other files and folders under `games/block-topia/` (e.g. `render/`, `world/`, `duel/`, `economy/`, `ui/`, `data/`) and `server/block-topia/src/systems/` are **not imported** by the active skeleton and should be treated as dormant scaffolding.

---

## What should NOT be reintroduced accidentally

- Do not import or activate `CityRoom.js`, `covert-ops-system.js`, or any legacy system file.
- Do not add client-authoritative game logic (server owns positions).
- Do not raise `maxClients` without a deliberate design decision and matching server load testing.
- Do not wire Redis or Postgres without a corresponding migration plan and env-var documentation.
- Do not add SAM live-integration until the SAM webhook stub (`server/block-topia/src/webhooks/samWebhook.js`) is properly specced and tested.
- Do not create rooms from the browser (`colyseusClient.create()`); the server pre-creates the persistent "city" room.

---

## Next safe build phase

The skeleton is stable. The safe next steps in recommended order are:

1. **Phase 2 — Persistence lite**
   - Add a simple Postgres (or D1 via Cloudflare Workers) store for player names and last-known positions.
   - Implement the 60-second warm-slot reconnect so players can reload without losing their spot.
   - No new gameplay systems yet.

2. **Phase 3 — Map expansion**
   - Grow the grid to support more than 2 players (raise `maxClients`, update spawn slots, update client HUD).
   - Introduce basic district boundaries server-side (validate `player.district` on move).
   - Still no NPC or economy.

3. **Phase 4 — NPC lite**
   - Add a single deterministic ambient NPC type (no AI, just a server-ticked position).
   - Validate that client rendering handles a mixed player+NPC entity list cleanly.

4. **Phase 5 — Events / Signal Rush lite**
   - Add a single server-broadcast timed event (no quest validation, just a countdown + winner log).
   - SAM webhook stub can be wired to trigger these events.

5. **Phase 6 — Economy scaffolding**
   - XP grant on event completion.
   - Cosmetic unlock table (no marketplace yet).

Each phase should have its own ADR before merging to main.

---

## References

- Active server room: `server/block-topia/src/rooms/MinimalCityRoom.js`
- Active client entry: `games/block-topia/index.html`
- Future vision docs (not current state): `docs/block-topia/README.md`, `docs/block-topia/multiplayer-architecture.md`
