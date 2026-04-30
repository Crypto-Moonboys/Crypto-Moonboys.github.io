# Current Live System Truth

> Audit snapshot — reflects main branch as of 2026-04-30.
> Update this file whenever a system's status changes.

---

## Active Arcade Games

All games listed below are linked from `/games/index.html` and accept score submissions.

| Game | Folder | submitScore | ArcadeSync | Faction Effects |
|---|---|:---:|:---:|:---:|
| Invaders 3008 | `games/invaders-3008/` | ✅ | ✅ | ✅ |
| Pac-Chain | `games/pac-chain/` | ✅ | ✅ | ✅ |
| Asteroid Fork | `games/asteroid-fork/` | ✅ | ✅ | ✅ |
| Breakout Bullrun | `games/breakout-bullrun/` | ✅ | ✅ | ✅ |
| Tetris Block Topia | `games/tetris-block-topia/` | ✅ | ✅ | ✅ |
| Crystal Quest | `games/crystal-quest/` | ✅ | ✅ | ❌ |
| Block Topia Quest Maze | `games/block-topia-quest-maze/` | ✅ | ✅ | ❌ |
| SnakeRun 3008 | `games/snake-run/` | ✅ | ✅ | ✅ |

**Block Topia** (`games/block-topia/`) is listed on the arcade page but is a gated multiplayer map, not a score-submission arcade game.

---

## Deprecated Games

| Game | Folder | Status |
|---|---|---|
| HexGL Monster Max | `games/hexgl-monster-max/` | Archived — score submission disabled, not in arcade nav |
| HexGL Local | `games/hexgl-local/` | Archived — not in arcade nav |

---

## Score vs Arcade XP vs Faction XP vs Block Topia XP

These are four distinct progression signals. They are not interchangeable.

### Score (Leaderboard rank)
- Source: every accepted game-over run.
- Purpose: leaderboard rank only.
- Does **not** affect any XP type.
- Persisted to shared leaderboard via `submitScore()` in `js/leaderboard-client.js`.

### Arcade XP (Block Topia gate)
- Source: accepted runs synced via Telegram.
- Purpose: gates Block Topia entry; shared server-side progression.
- Requires Telegram link to persist beyond the browser.
- Stored server-side in `arcade_progression_state.arcade_xp_total`.
- Synced via `POST /arcade/progression/sync` in `workers/moonboys-api/worker.js`.
- Anti-farm controls: per-game ceiling, repeat-window detection, daily XP cap.
- **Block Topia entry gate: 50 Arcade XP** (`BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP = 50` in `shared/block-topia/constants.js`).

### Faction XP (Alignment level)
- Source: `POST /faction/earn` in `js/faction-alignment.js`.
- Purpose: tracks faction alignment level and displays faction status/bonuses.
- Does **not** count toward Block Topia gate.
- Server-backed via `/faction/status`, `/faction/join`, `/faction/earn`.

### Block Topia XP (In-game progression)
- Source: in-game actions inside Block Topia.
- Purpose: in-game progression within Block Topia only.
- Separate from Arcade XP and Faction XP.
- Gated behind Arcade XP entry requirement.

---

## Telegram Sync Rules

1. Link via `/gklink` in [@WIKICOMSBOT](https://t.me/WIKICOMSBOT).
2. Unsynced runs are queued locally via `ArcadeSync.queuePendingProgress()`.
3. On link completion, pending queue is flushed via `ArcadeSync.syncPendingArcadeProgress()`.
4. Server validates signed `telegram_auth` payload on every sync.
5. Rejected or unlinked runs are **not** queued — no XP for rejected scores.
6. Sync expires; re-run `/gklink` if status panel shows red.

---

## Block Topia 50 XP Gate

- Requirement: Telegram-linked account **AND** ≥ 50 Arcade XP.
- Gate enforced by `/blocktopia/progression` route in `workers/moonboys-api/blocktopia/routes.js`.
- Returns `can_enter_multiplayer: true/false` and `required_xp` from server.
- Constant source: `shared/block-topia/constants.js` → `BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP = 50`.

---

## What Is Live Now

| System | Status | Notes |
|---|---|---|
| Arcade score submission | ✅ Live | All active games call `submitScore()` |
| Arcade XP sync (server) | ✅ Live | All active games queue/sync via `ArcadeSync` after Telegram link |
| Telegram link (`/gklink`) | ✅ Live | Via `@WIKICOMSBOT` |
| Block Topia entry gate | ✅ Live | 50 Arcade XP + Telegram required |
| Block Topia multiplayer map | ✅ Live | 2-player isometric base, clean map only |
| Faction join/status/earn | ✅ Live | Server-backed via `/faction/*` routes |
| Faction gameplay effects | ✅ Live | Wired into Invaders, Pac-Chain, Tetris, Breakout, Asteroid Fork, SnakeRun |
| Leaderboard (score rank) | ✅ Live | Score-only ranking, XP does not affect rank |
| Block Topia Quest Maze | ✅ Live | Phaser 3 RPG dungeon crawler, full submitScore + ArcadeSync |

---

## What Is Partial / Scaffolded

| System | Status | Notes |
|---|---|---|
| Cross-Game Modifiers | ⚠️ Partially wired | Modifier defs + compatibility tags active in games; modifier state is **localStorage-only**, not server-backed |
| Daily Missions | ⚠️ Scaffolded · local only | Mission pool defined in `faction-missions.js`; progress stored in `fw_missions_v1` localStorage key; no server sync |
| Faction war standings | ⚠️ Scaffolded · local only | War state in `faction-war-system.js` is localStorage-only; cross-player war results not server-backed |
| Faction streaks | ⚠️ Scaffolded | `faction-streaks.js` is localStorage-based |

---

## What Is Not Built Yet

| System | Notes |
|---|---|
| Season competitions | Season windows and resets not yet active; leaderboard is all-time |
| Block Topia NPC battles | Planned but not built |
| Block Topia HODL Wars | Planned but not built |
| Block Topia upgrades | Planned but not built |
| Cross-device modifier sync | Modifiers are browser-local only |
| Cross-player faction war server backend | Faction war is local simulation only |

---

## Key Files

| Purpose | File |
|---|---|
| Arcade XP sync path doc | `docs/arcade-xp-sync-path.md` |
| Block Topia XP gate constant | `shared/block-topia/constants.js` |
| Faction effect system | `js/arcade/systems/faction-effect-system.js` |
| Cross-game modifier system | `js/arcade/systems/cross-game-modifier-system.js` |
| Daily missions (local) | `js/arcade/systems/faction-missions.js` |
| Faction war (local) | `js/arcade/systems/faction-war-system.js` |
| Score submission | `js/leaderboard-client.js` |
| Arcade XP sync client | `js/arcade-sync.js` |
| Faction API client | `js/faction-alignment.js` |
| Block Topia progression API | `workers/moonboys-api/blocktopia/routes.js` |
