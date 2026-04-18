# Block Topia Unified Multiplayer (`/games/block-topia/`)

This module is the merged Block Topia build that consolidates:

- **Street Signal 3008** (`/games/block-topia-street-signal-3008*.html`)
- **Block Topia Revolt** (`/games/block-topia-revolt/`)
- **Block Topia ISO** (`/games/block-topia-iso/`)

Block Topia is the shared cyberpunk city multiplayer experience where players move through isometric districts, complete live quests, and react to rotating SAM world events.

## What Was Merged

### Street Signal 3008
- Day/Night phase loop and phase toggle flow.
- District capture gameplay and score/XP progression hooks.
- SAM event framing and street-feed style event messaging.
- Street Signal district identity folded into the unified district map model.

### Block Topia Revolt
- Colyseus multiplayer connection flow (`city` room).
- Player movement replication and remote player rendering.
- Multiplayer event channels (`system`, `districtChanged`, `questCompleted`).
- Retry/error handling pattern for room join attempts.

### Block Topia ISO
- Isometric world rendering baseline and tile-space camera model.
- Canvas-first layout for full-screen social-city presentation.
- Lightweight world scaffolding used as the render foundation.

## New Unified Architecture

### Entry + Shell
- `index.html` loads the unified HUD shell and canvas.
- `main.js` orchestrates state, systems, rendering, and multiplayer.
- `style.css` provides unified visual language across district, feed, SAM, and multiplayer HUD panels.

### Multiplayer Layer
- `network.js` keeps Colyseus client behavior centralized.
- Endpoint remains the existing VPS route via:
  - `window.BLOCK_TOPIA_SERVER`, defaulting to `https://game.cryptomoonboys.com` (**backend-internal only — not a public user-facing URL**)
  - Colyseus connects over secure WebSocket transport to that same host, with retry handling implemented in `network.js` (2 attempts with a fixed 2.5s delay between tries)
- Room identity stays on `city` with room metadata hooks for shard/season context.

### Data-Driven World Layer
- `world/data-loader.js` loads merged data packs and legacy references.
- `data/*.json` defines merged rules and models:
  - Districts/map layout
  - Factions and switch rules
  - Quest model (daily/weekly/seasonal/prophecy)
  - SAM phases and post-mutation hooks
  - NPC archetypes + active/crowd split
  - Room model and scaling rules
  - Season model and wiki publish hooks
- Canon lore bridge:
  - Canon source priority is `/wiki/bibles/block-topia.json` (wiki/lore pipeline output).
  - Runtime lore lines and NPC rumor flavour should consume canon-fed data first.
  - Local lore feed (`/games/data/blocktopia-lore-feed.json`) is fallback-only and must be treated as non-canon.

### Runtime Systems
- `world/game-state.js`: canonical game state, movement, district capture, XP/score.
- `world/sam-system.js`: SAM phase timing + giant-encounter trigger.
- `world/npc-system.js`: active/crowd NPC simulation and faction drift.
- `world/quest-system.js`: active quest cards, completion XP, pulse hooks.
- `world/memory-system.js`: in-session world memory and event logging.
- `world/live-intelligence.js`: loads site-side transformed SAM signals from `data/live-signals.json`.
- `world/signal-quest-generator.js`: converts live signal pulses into temporary operation cards.
- `world/clue-signal-system.js`: rotates clue-event feed pulses for hidden-link hunts.
- `world/node-interference-system.js`: node interference orchestration for local pulse + server-applied ripple state.
- `ui/hud.js`: DOM HUD bindings for status, quests, multiplayer, feed, overlays.
- `render/iso-renderer.js`: district-aware isometric renderer for local/remote entities.

## Live Intelligence Wake-Up Layer (Site-Side)

- Signal source file: `/games/block-topia/data/live-signals.json`
- Generator: `/gigga-sam/generate-signals.mjs`
- Workflow: `/.github/workflows/gigga-sam-signals.yml`

This layer is **site-side only** and runs after SAM updates (or on schedule). It transforms lightweight external inputs into short in-game signals that feed:

- NPC dialogue variants
- temporary operation/quest pulses
- world feed bulletins
- clue signal events for hidden-link hunts

### Completed Runtime Signal Gameplay (Finalise Pass)

This pass completes the in-session signal layer to a clean stop point:

- **Live refresh loop** (`main.js` + `world/live-intelligence.js`)
  - Keeps polling `/games/block-topia/data/live-signals.json` on a 120s loop.
  - Detects meaningful snapshot changes (generated timestamp + signal fingerprint).
  - If changed, refreshes world feed bulletins, quest cards, clue pool state, and map operations.
  - Refresh failures never crash runtime; the previous snapshot remains active.
  - Feed dedupe prevents repeated refresh spam lines.

- **Signal quest cards** (`world/signal-quest-generator.js`)
  - Temporary cards generated from active signal lanes (`world`, `ops`, `clue`, `quest`).
  - Max **2** live signal cards at a time.
  - Each card includes id/title/objective/xp plus district hint + expiresAt metadata.
  - Cards are runtime-only and rotate as live signals rotate.

- **Signal operations on map** (`world/signal-operation-system.js` + `render/iso-renderer.js`)
  - Runtime operations derived from active live signals only.
  - Max **3** active operations at once.
  - Spawned onto valid in-bounds district tile positions.
  - Rendered with distinct pulse rings + glow areas separate from capture effects.
  - Entering an operation radius resolves it immediately in runtime.
  - Resolution triggers feed response (`✔ SIGNAL STABILISED — TRACE COMPLETE`) and short visual success pulse.
  - Unresolved operations auto-expire and are removed cleanly.

- **NPC signal integration boost** (`world/npc-system.js`)
  - If a district has active operation pressure, NPCs in that district are more likely to produce live signal dialogue.
  - Role-aware operation language is applied for vendor/fighter/agent/lore-keeper/recruiter.
  - Fallback dialogue paths stay intact, so not every line is signal-only.

- **Clue pulse finishing pass** (`world/clue-signal-system.js`)
  - Clue pool refreshes on signal refresh.
  - Clue pulses rotate with anti-repeat memory to avoid repeating the same clue too often.
  - Clue feed lines remain temporary, with no click logging or player tracking.

### Privacy Rule

The live intelligence layer stores **zero player behavior data**. It does not add clue click logging, player tracking, analytics, persistent quest history, or permanent operation records.

### Zero-Data / Runtime-Only Rule

- Signal operation resolution is runtime-only in memory.
- Resolved/expired signal operations are not persisted across reloads.
- No player heatmaps, no behavior analytics, no clue-discovery history, no identity tracking.

### Finished-For-Now Stop Point

Block Topia’s current signal layer is complete enough to stop cleanly here:

- refresh loop live
- feed + quest + clue refresh integration complete
- NPC live signal dialogue integrated with district pressure context
- map operation gameplay loop fully playable (spawn → chase → resolve/expire)
- strict runtime-only data handling preserved

## Scaffolding for Future Expansion

The unified module is intentionally split into composable systems so new features can be added without rewriting the core loop:

- **Data-first expansion:** add districts/events/factions/quest arcs by extending `data/*.json`.
- **Server feature growth:** add new Colyseus messages in `network.js` and map them to HUD/system hooks.
  - Node interference contract: outbound `nodeInterfere` (`{ nodeId }`), inbound `nodeInterferenceChanged` (node state + district ripple + SAM pressure delta).
- **Live ops hooks:** SAM, season, and quest dynamic hooks are already exposed for future automation.
- **World memory hooks:** event logging and memory channels are in place for persistence and future replay/story features.
- **Render extensibility:** `render/iso-renderer.js` can be upgraded to sprites/effects while preserving current state contracts.

Current state contracts are defined by `world/game-state.js` and consumed by `main.js`, `ui/hud.js`, and `render/iso-renderer.js`:

- `state.player`: position, district identity, xp, score, faction.
- `state.remotePlayers`: normalized replicated player snapshots.
- `state.districtState`: district control and event markers.
- `state.phase` + `state.sam`: world phase state and SAM progression.
- `state.quests` + `state.memory`: quest lifecycle and in-session event memory.

## Legacy References

Legacy source references are tracked in `world/data-loader.js` (`legacy.sourceFiles`) so future updates can verify parity against Street Signal, Revolt, and ISO inputs.

## Replaced Entry Points + Link Routing

- Unified game entry point (public URL): `/games/block-topia/`
- Legacy Street Signal monster page is treated as retired and should only redirect to the unified module:
  - `/games/block-topia-street-signal-3008-monster.html` → `/games/block-topia/`
- Arcade/home/game navigation links should resolve to `/games/block-topia/` instead of legacy Block Topia variants.

## Extension Rules (For Future Agents)

- Build new Block Topia features only inside `/games/block-topia/`.
- Keep legacy inputs (`/games/block-topia-revolt/`, `/games/block-topia-iso/`, `/games/block-topia-street-signal-3008*.html`) as reference sources; do not extend gameplay there.
- Keep the flat map architecture as the main world surface (no globe/surface swap work in this module).
- Treat lore/SAM wiki pipeline output as canon truth authority; do not invent conflicting district/faction/SAM canon in this repo.
- Any local lore fallback text must be clearly marked fallback in runtime/UI messaging.
- Keep Colyseus endpoint and room identity stable:
  - endpoint: `https://game.cryptomoonboys.com`
  - room id: `city`
- Add gameplay/world expansion through `data/*.json` and existing world systems (`sam-system`, `quest-system`, `npc-system`, `memory-system`) instead of hardcoding new one-off logic in `main.js`.
- Preserve ISO-first rendering in `render/iso-renderer.js` so all local players, remote players, and NPCs remain visible in the same isometric scene.

## Arcade + VPS Integration Checklist

- Arcade index card links point to `/games/block-topia/` (**always use this clean public route, never the backend URL**).
- Legacy Block Topia navigation links across game pages point to `/games/block-topia/`.
- Unified module keeps `window.BLOCK_TOPIA_SERVER` defaulting to `https://game.cryptomoonboys.com` — this is **backend-internal only** and must not appear in any user-facing HTML as a clickable link.
- Multiplayer joins the existing Colyseus `city` room and reflects room population in HUD.

## Public URL Reference

| Destination | URL |
|---|---|
| Public game (user-facing) | `/games/block-topia/` |
| Backend VPS (internal only) | `https://game.cryptomoonboys.com` — **never expose to users** |

- All arcade + navigation links must use the public route `/games/block-topia/`.
- The multiplayer banner inside the game is a non-clickable status badge only — it has no `href` and does not link to the backend.

---

## Bug Fix Log (Merge Verification Passes)

All fixes below were discovered through agent verification passes and addressed in-place.
Legacy source files were not modified in any case.

### Pass 1 — Logic Audit

**Bug 1 · `network.js` — `questId` dropped from `questCompleted` message**
The server broadcasts `{ playerId, questId, title, rewardXp, totalXp }`.
The handler extracted only `title`/`rewardXp`, discarding `questId`.
Fix: extract and forward `questId` through the `onQuestCompleted` callback.

**Bug 2 · `main.js` — quest matched by title instead of id**
`completeQuest(title, rewardXp)` was passing the display title as the lookup key;
since `completeQuest` matches by `q.id`, no server-pushed quest was ever removed.
Fix: pass `questId` to `completeQuest`.

**Bug 3 · `quest-system.js` — double XP/score on quest completion**
`completeQuest` mutated `state.player.xp`/`score` internally, then `main.js` also
called `awardXp(state, awarded)` on the returned value — every completion doubled both.
Fix: `completeQuest` is now a pure remove-and-return function; `main.js` owns the single `awardXp` call.

**Bug 4 · `game-state.js` — district capture awarded 370 score instead of 250**
`tickDistrictCapture` called `awardXp(XP_DISTRICT_CAPTURE)` (adds 80 XP + 120 score
via the 1.5× multiplier) then also added `SCORE_DISTRICT_CAPTURE = 250` — total was 370.
Fix: increment `state.player.xp` and `state.player.score` directly with their canonical constants.

### Pass 2 — Memory System Audit

**Bug 5 · `game-state.js` + `main.js` — double write to `districtChanges`**
`tickDistrictCapture` pushed a structured object directly into `state.memory.districtChanges`,
then `main.js` called `memory.record('district', stringMessage)` which also unshifts into
`districtChanges` via `memory-system.js` — every capture created two entries of mixed type.
Fix: removed the direct push from `tickDistrictCapture`; `main.js` now passes a structured
object `{ at, district, event }` to `memory.record('district', ...)` so all `districtChanges`
entries have a consistent shape.

**Bug 6 · `sam-system.js` + `main.js` — double write to `samEvents` for `sam-event` phase**
`sam-system.js` pushed a structured object directly into `state.memory.samEvents` for the
`sam-event` phase, while `main.js`'s `onPhaseChanged` hook called `memory.record('sam', stringMessage)`
which also unshifted into `samEvents` — the giant encounter phase created two entries of mixed type.
Fix: removed the direct push from `sam-system.js`; `main.js`'s `onPhaseChanged` hook now passes a
structured object `{ at, phase, [type] }` to `memory.record('sam', ...)` (including `type: 'giant_encounter'`
when the `sam-event` phase fires) so all `samEvents` entries have a consistent shape.

### Pass 3 — Final Authority & Redirect Fixes

- Legacy pages were converted to redirect-only stubs:
  - `/games/block-topia-street-signal-3008.html` → `/games/block-topia/`
  - `/games/block-topia-street-signal-3008-phaser.html` → `/games/block-topia/`
- A fixed in-game multiplayer banner was added in `index.html` + `style.css`:
  - Text: `LIVE MULTIPLAYER — CONNECTED`
  - Non-clickable status badge only (`<div role="status">`) — no href, no link to backend
- SAM phase is now server-authoritative:
  - Client listens for `samPhaseChanged` and overrides local `state.sam.currentIndex`.
  - Local phase auto-advance is no longer used as authority.
- District capture is now server-authoritative:
  - Client listens for `districtCaptureChanged` and overrides district `control` and `owner`.
  - Local district capture progression is no longer used as authority.

### Memory System Rule (for future agents)

`state.memory.districtChanges`, `state.memory.samEvents`, and `state.memory.playerActions` are
**secondary indexes** maintained exclusively by `world/memory-system.js` via `memory.record()`.
No other module should push, unshift, or splice these arrays directly.
Always call `memory.record(type, structuredObject)` — pass a structured object, not a plain string.
