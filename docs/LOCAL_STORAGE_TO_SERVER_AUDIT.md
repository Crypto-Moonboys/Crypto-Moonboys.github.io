# LOCAL STORAGE TO SERVER AUDIT

**Date:** 2026-04-30  
**Purpose:** Enumerate every localStorage key used in Crypto Moonboys JS, classify it, and document the server-backed replacement status.

---

## Categories

| Category | Description |
|----------|-------------|
| **A** | Must be server-backed when Telegram linked |
| **B** | Guest/pre-link temporary only |
| **C** | UI cache only after server hydration |
| **D** | Local preference allowed |
| **E** | Dead/legacy key to remove later |

---

## Audit Table

| Key | File(s) | Purpose | Used when linked? | Should remain local? | Server replacement needed? | Category |
|-----|---------|---------|-------------------|---------------------|---------------------------|----------|
| `cm_modifiers_unlocked_v1` | `js/arcade/systems/cross-game-modifier-system.js` | Which modifiers are unlocked | Yes (was) | Cache only | Yes → `player_modifier_state.unlocked_modifiers_json` | A → C |
| `cm_modifier_active_v1` | `js/arcade/systems/cross-game-modifier-system.js` | Currently active modifier id | Yes (was) | Cache only after server hydration | Yes → `player_modifier_state.active_modifier_id` | A → C |
| `cm_modifier_history_v1` | `js/arcade/systems/cross-game-modifier-system.js` | Modifier use history (dedup) | Yes | Yes (history log only) | No | C |
| `fw_missions_v1` | `js/arcade/systems/faction-missions.js` | Daily + seasonal mission progress | Yes (was) | Cache only after server hydration | Yes → `player_daily_mission_state` | A → C |
| `fw_war_state_v1` | `js/arcade/systems/faction-war-system.js` | Faction contribution/power/momentum | Yes (was) | Cache only for display | Yes → `player_faction_signal_state` | A → C |
| `fw_streaks_v1` | `js/arcade/systems/faction-streaks.js` | Login/mission/contribution streaks | Yes (was) | Cache only after server hydration | Yes → `player_streak_state` | A → C |
| `moonboys_state_v1` | `js/core/moonboys-state.js` | XP + faction state cache | Yes | Cache only (server overrides on hydration) | Partially — XP from `arcade_progression_state` | C |
| `moonboys_tg_id` | `js/identity-gate.js` | Telegram numeric ID | Yes | Yes (browser identity) | No — identity management | D |
| `moonboys_tg_name` | `js/identity-gate.js` | Telegram display name | Yes | Yes (display only) | No | D |
| `moonboys_tg_linked` | `js/identity-gate.js` | Bot link completion flag | Yes | Yes (client-side gate) | No — server-confirmed on restore | D |
| `moonboys_tg_auth` | `js/identity-gate.js` | Signed Telegram auth payload | Yes | Yes (auth credential) | No — auth infrastructure | D |
| `MOONBOYS_TELEGRAM_AUTH` | `js/identity-gate.js` | Legacy auth key alias | Yes | Legacy — reads from both | No | E |
| `moonboys_tg_sync_health` | `js/identity-gate.js` | Sync health metadata | Yes | Yes (session diagnostic) | No | D |
| `moonboys_presence_hidden` | `js/arcade-leaderboard.js` | Presence visibility preference | Yes | Yes (UI preference) | No | D |
| `moonboys_season_banner_dismissed` | `js/site-season-banner.js` | Banner dismiss state | Yes | Yes (UI preference) | No | D |
| `invaders3008_meta_v1` | `js/arcade/games/invaders/meta-system.js` | Invaders personal best / mastery | Yes (was) | Cache only after server hydration | Yes → `player_game_mastery_state` | A → C |
| `asteroid_fork_meta_v1` | `js/arcade/games/asteroid-fork/meta-system.js` | Asteroid Fork personal best / mastery | Yes (was) | Cache only | Yes → `player_game_mastery_state` | A → C |
| `snake_meta_v1` | `js/arcade/games/snake/meta-system.js` | Snake personal best / mastery | Yes (was) | Cache only | Yes → `player_game_mastery_state` | A → C |
| `btqm_meta_v1` | `js/arcade/games/block-topia-quest-maze/meta-system.js` | BTQM personal best / mastery | Yes (was) | Cache only | Yes → `player_game_mastery_state` | A → C |
| `btqm_player_v2` | `js/arcade/games/block-topia-quest-maze/bootstrap.js` | BTQM player run state | Yes | Cache between sessions | Partially — mastery via server | C |
| `btqm_daily_v2_<date>` | `js/arcade/games/block-topia-quest-maze/bootstrap.js` | BTQM daily progress | Yes | Cache | Server missions handle persistence | C |
| `btqm_widget_v1` | `js/arcade/games/block-topia-quest-maze/bootstrap.js` | BTQM widget display data | No | Yes (display cache) | No | C |
| `asteroid_fork_last_run` | `js/arcade/games/asteroid-fork/bootstrap.js` | Last run summary for display | No | Yes (display cache) | No | C |
| `asteroidForkQa` | `js/arcade/games/asteroid-fork/bootstrap.js` | QA debug flag | No | Yes (dev only) | No | D |
| `moonboys_faction_status_v1` | `js/arcade/core/` (inferred from CSP/state refs) | Faction status cache | Yes | Cache only | Provided by `/faction/status` | C |

---

## Keys That Remain Local (Summary)

| Key | Reason |
|-----|--------|
| `moonboys_tg_id`, `moonboys_tg_name`, `moonboys_tg_linked`, `moonboys_tg_auth` | Auth/identity infrastructure — must be local for browser session management |
| `moonboys_tg_sync_health` | Session diagnostic only |
| `moonboys_presence_hidden` | UI display preference (Part 11 — allowed) |
| `moonboys_season_banner_dismissed` | UI display preference (Part 11 — allowed) |
| `asteroidForkQa` | Dev QA flag, never affects server state |
| All `*_last_run` and widget cache keys | Display-only cache; cleared by localStorage clear but restored on next play |

---

## Systems Now Server-Backed (for Telegram-linked users)

| System | Write path | Read path |
|--------|-----------|-----------|
| Cross-Game Modifiers | `setActiveModifier()` → POST `/player/modifiers/active` | `hydrateModifiersFromServer()` → GET `/player/modifiers` → localStorage cache |
| Daily Missions | `recordMissionProgress()` → POST `/player/daily-missions/progress` | `hydrateMissionsFromServer()` → GET `/player/daily-missions` → localStorage cache |
| Faction Signal / War | `recordContribution()` → POST `/faction/signal/contribute` | GET `/faction/signal` (aggregate) |
| Faction Streaks | Server-updated via mission/contribution endpoints | `hydrateStreaksFromServer()` → GET `/player/daily-missions` |
| Game Mastery / Personal Best | POST `/player/mastery/update` (from game bootstrap on score accept) | GET `/player/state` |
| MOONBOYS_STATE | `hydrateState()` → POST `/blocktopia/progression` → `setState({ linked, source, syncedAt })` | Server overrides localStorage cache on hydration |

---

## New Server Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/player/state` | Full player state snapshot |
| GET/POST | `/player/modifiers` | Active modifier state |
| POST | `/player/modifiers/active` | Set active modifier |
| GET/POST | `/player/daily-missions` | Daily mission progress |
| POST | `/player/daily-missions/progress` | Increment mission progress |
| GET/POST | `/faction/signal` | Faction signal aggregate |
| POST | `/faction/signal/contribute` | Record faction contribution |
| POST | `/player/mastery/update` | Update game mastery/personal best |

---

## New D1 Tables

| Table | Purpose |
|-------|---------|
| `player_modifier_state` | Active modifier per player |
| `player_daily_mission_state` | Daily mission progress per player per day |
| `player_faction_signal_state` | Faction signal contribution per player per faction per day |
| `player_streak_state` | Mission and contribution streaks per player |
| `player_game_mastery_state` | Game personal best and mastery XP per player per game |

Migration: `workers/moonboys-api/migrations/015_player_server_state.sql`

---

## Remaining Local-Only Systems

| System | Status | Reason |
|--------|--------|--------|
| Seasonal missions | Local only | Seasonal state not yet fully defined server-side; will use `fw_missions_v1` seasonal key until next migration |
| Game meta-systems (invaders, asteroid, snake, btqm) | Cache only | Personal best is synced server-side on score accept via `/player/mastery/update`; historical meta-data remains local |
| Login streak | Local only | Login streak is a display convenience; server authority not needed for login events |

---

## Safe to Merge?

**Yes**, with the following caveats:
- The 5 new D1 tables in `015_player_server_state.sql` must be applied to the production database before the new endpoints serve real data.
- Until the migration is applied, the worker endpoints return `{ error: 'missing_required_table:...' }` — this is safe (existing localStorage path continues working as fallback).
- No XP math was changed. No submitScore formula was changed. Anti-farm controls are unchanged.
- Guest/pre-link queue is intact. Linked users now write to server on progression events.
