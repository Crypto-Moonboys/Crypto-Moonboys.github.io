# Block Topia — Current State Audit

Last audited: 2026-05

## Runtime truth

`/games/block-topia/` is the live gated 2-player Colyseus survival/mission prototype.

This document reflects the **actual running system** — not speculation or planned features.

---

## Gate

- Telegram-linked account required (`identity.isTelegramLinked()`)
- Minimum 50 Arcade XP required (`BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP`)
- Auth validated server-side on every join via `/blocktopia/progression`

---

## Live systems

### NPCs

- 14 NPCs seeded per room
- Two kinds: `drone` and `raider`
- NPC AI: pursue nearest alive, ready player during `EVENT_ACTIVE` phase
- NPCs roam randomly during `FREE_ROAM` and `RECOVERY` phases
- NPC HP scales with `eventLevel`
- NPCs target and track players by `sessionId`

### Attacks

- Player attack: Spacebar, range-limited, cooldown-gated
- Attack damage upgradeable via `spray_damage` upgrade
- Attack cooldown reduceable via `quick_trigger` upgrade
- Server authoritative — client sends intent, server validates range + cooldown

### HP and downs

- Player max HP starts at 100, upgradeable via `street_medic`
- NPC contact damage: 6 base, scales with level
- Armour plate upgrade reduces NPC damage by up to 20%
- Players downed at 0 HP — `player.downs` incremented
- `second_wind` upgrade: one emergency revive per level

### Respawns

- Players respawn after `RESPAWN_DELAY_MS` (3 seconds) at a random passable tile
- Spawn grace period: 5 seconds post-spawn immunity
- NPC respawn after 6.5 seconds, away from players and objective tiles

### Phases (world phases)

Cycle: `FREE_ROAM` → `WARNING` → `EVENT_ACTIVE` → `RECOVERY` → (repeat)

- `FREE_ROAM`: exploration, no combat obligation
- `WARNING`: event incoming alert
- `EVENT_ACTIVE`: active mission — combat enabled, NPC targeting aggressive
- `RECOVERY`: post-event cooldown, upgrade selection window
- `MISSION_COMPLETE`: all ready players extracted — upgrade window, then advance level

### Objectives

Two objective types rotate by `eventLevel`:

- `PATROL_SWEEP` (odd levels): neutralize N NPCs, then extract
- `SIGNAL_HACK` (even levels): hold the hack tile to accumulate progress, then extract

Objective target scales with `eventLevel`. `scanner` upgrade reduces target.

### Extraction

- Extraction tile placed at a random passable tile away from players
- Extraction requires: phase = `EVENT_ACTIVE`, mission survived ≥ 60 s, objective complete
- Both players must extract for `MISSION_COMPLETE` to trigger in duo mode

### Upgrades

Six upgrades available, selected from a random pool of 3 choices per recovery:

| ID | Effect |
|----|--------|
| `street_medic` | +25 max HP and full heal next level |
| `spray_damage` | +10 attack damage |
| `quick_trigger` | −150 ms attack cooldown |
| `armour_plate` | −20% NPC contact damage |
| `second_wind` | One emergency revive per level |
| `scanner` | Lower objective requirement this run |

### Recovery / upgrade flow

- Upgrade choices offered in `RECOVERY` and `MISSION_COMPLETE` phases
- Server generates 3 random choices from unowned pool
- Client picks; server validates against offered list and applies immediately
- `upgradeState` transitions: `pending` → `selected` | `missed`

### Restart flow

- `restartRun` message resets to `eventLevel + 1` in `MISSION_COMPLETE` phase
- `keepPlayerUpgrades: true` — upgrades carry forward on manual restart

### Level progression

- `eventLevel` starts at 1, increments on `_advanceToNextLevel`
- NPC HP scales: `NPC_MAX_HP + min(50, (eventLevel - 1) * 10)`
- Kill target scales: `MISSION_REQUIRED_KILLS + min(5, eventLevel - 1)`
- Hack progress target scales with `eventLevel`

### Persistence lite (Phase 2)

- 60-second warm-slot reconnect: unexpected disconnects hold the player slot
- On reconnect within 60 s: position, HP, upgrades, objective state restored from snapshot
- Expired or duplicate reconnect attempts are rejected
- Lightweight in-memory persistence: display name, last faction, district, run level

---

## Active runtime files

| File | Role |
|------|------|
| `index.html` | Gate logic, Telegram auth, XP check, game shell |
| `main.js` | Render loop, input, UI, game state |
| `network.js` | Colyseus client, warm-slot reconnect, message dispatch |
| `styles.css` | Visual layer |
| `server/block-topia/src/index.js` | Express + Colyseus server, room bootstrap |
| `server/block-topia/src/rooms/MinimalCityRoom.js` | Server-authoritative game room |
| `workers/moonboys-api/blocktopia/routes.js` | Progression API (XP gate) |

---

## What does NOT exist in this runtime

The following are explicitly absent and must not be reintroduced:

- `CityRoom.js` — replaced by `MinimalCityRoom.js`
- Space Agent — replaced by Hermes
- SAM world brain / SAM runtime
- Covert ops systems
- Old duel / economy systems
- District ownership runtime
- Faction war runtime
- Neon Sprawl merge
- Pressure Protocol
- Client-authoritative movement
- Browser room creation (`matchMaker.createRoom` must only exist server-side)
- Redis / Postgres / giant scaling systems
