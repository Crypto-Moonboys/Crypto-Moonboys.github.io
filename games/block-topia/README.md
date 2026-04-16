# Block Topia Unified Foundation (`games/block-topia/`)

This folder is the **single source of truth** for Block Topia going forward.
All net-new Block Topia development must land here.
Legacy variants (`block-topia-revolt/`, `block-topia-iso/`, `block-topia-street-signal-3008*.html`) are **reference sources only** — do not edit them.

---

## Legacy Sources Merged

| Source | What Was Taken |
|---|---|
| **Street Signal 3008 / Monster** | World identity, district DNA, NPC archetypes, quests/lore, day/night phase mechanic, district capture scoring, asset packs |
| **Block Topia Revolt** | Colyseus client flow, `joinOrCreate('city',…)` room join, remote player sync, `questCompleted` server message handler, endpoint override via `window.BLOCK_TOPIA_SERVER` |
| **Block Topia ISO** | Isometric renderer (`drawTile`, `toIso`), canvas layout, social-world framing |

---

## Architecture Overview

```
games/block-topia/
├─ index.html              entry — HUD shell, SAM popup, interact prompt
├─ style.css               HUD, world panels, night phase, SAM popup, responsive
├─ main.js                 boot orchestration, game loop, phase toggle, capture wiring
├─ network.js              Colyseus transport (room=city, questCompleted handler)
├─ README.md               ← this file
├─ render/
│  └─ iso-renderer.js      tile draw, NPC dots, day/night tinting, player+name render
├─ world/
│  ├─ data-loader.js       parallel JSON loader (unified + legacy packs)
│  ├─ game-state.js        world/room/player/phase/capture/NPC/SAM/quest/memory state
│  ├─ sam-system.js        3-phase SAM cycle, popup trigger, signal-rush hook
│  ├─ npc-system.js        active NPC grid positions, movement, faction switching
│  ├─ quest-system.js      daily/weekly/seasonal/prophecy quests, completeQuest()+XP
│  └─ memory-system.js     event log with type routing (district/sam/player/network)
├─ ui/
│  └─ hud.js               all HUD setters, SAM popup timer, interact prompt toggle
├─ data/
│  ├─ districts.json       5 canonical districts (grid-mapped)
│  ├─ factions.json        Liberators vs Wardens + switch-rules
│  ├─ sam-phases.json      3-phase SAM + post-mutation + signal-rush hooks
│  ├─ npc-archetypes.json  active/crowd split + 6 archetypes
│  ├─ quest-model.json     daily/weekly/seasonal/prophecy/dynamic hooks
│  ├─ season-model.json    90-day cycle, wiki hooks
│  └─ room-model.json      city room, 100 max, auto-scale, identity hooks
└─ assets/
   ├─ manifest.json        asset references (legacy SVGs + sub-packs)
   └─ README.md            asset strategy notes
```

---

## Systems Implemented (Working Now)

All systems below are wired end-to-end in the runtime loop.

### 🗺️ Isometric World Render
- Tile map drawn via `iso-renderer.js` using canonical district color grid
- Day/Night tinting applied per-tile (night darkens + blue-shifts colors)
- Local player rendered as colored dot with name label above
- Remote players rendered as cyan dots with name labels

### 🤖 NPC Rendering
- Active NPCs (default 60, cap 80): colored dots by role — vendor (gold), fighter (pink), lore-keeper (purple), recruiter (green), drifter (grey), agent (orange)
- Crowd NPCs (default 300): semi-transparent cyan dots
- All NPCs spawn in district-aware grid positions from `DISTRICT_SPAWN_REGIONS`
- NPCs walk randomly each 3–6 seconds; active NPCs can faction-switch

### 🌙 Day/Night Phase Toggle
- Press **Space** to toggle Day/Night
- Night tints canvas and tiles to a darker blue-purple palette
- District capture only accumulates during Night (mirrors Street Signal mechanic)

### 🏴 District Capture
- Standing in a district at Night ticks capture progress every 2 seconds
- Tipping past 90% control awards 80 XP + 250 score + memory event
- Control % displayed live in HUD

### 🧠 SAM Phase Cycle
- 3 phases run on a timer: **Signals → Conflict → SAM Event / Giant Encounter**
- Phase 3 fires the SAM popup overlay + `onSignalRush` hook for site/wiki sync
- Events logged in `state.memory.samEvents`

### 🎯 Quest System
- Daily, weekly, seasonal, **prophecy** quest types seeded from `data/quest-model.json`
- `completeQuest(id, xpOverride)` awards XP + score and removes from active list
- Server `questCompleted` messages wired through `network.js` → `onQuestCompleted` → `completeQuest`
- XP and score update HUD immediately after each award

### 🌐 Multiplayer
- Colyseus `joinOrCreate('city', {...})` room join
- Endpoint: `window.BLOCK_TOPIA_SERVER || 'https://game.cryptomoonboys.com'`
- 2-attempt retry with 2.5s delay
- Remote player sync from `room.onStateChange`
- Messages handled: `system`, `districtChanged`, **`questCompleted`** (new)

### 🎛️ HUD (Single Unified Shell)
- World panel: player name, status, district, control %, factions, SAM phase, day/night phase, score, XP
- Quest panel: active quest list with type and XP value
- Multiplayer panel: WS status, room name, player count
- Street feed: rolling 16-line feed (network events, SAM, captures, quests, phase shifts)
- SAM popup overlay: auto-dismissing modal for giant encounter events
- Interact prompt: contextual overlay (hidden by default, extensible)

### 💾 Memory System
- Rolling log (max 200 entries) with typed entries: `district`, `sam`, `player`, `network`
- Routed to sub-lists: `districtChanges`, `samEvents`, `playerActions`

---

## Systems Scaffolded (Architecture Ready, Not Yet Full Logic)

| System | Status | Extension Path |
|---|---|---|
| XP progression tiers / cosmetics | State tracked, no tier thresholds yet | Add tier table to `data/season-model.json`; read in `game-state.js` |
| Dynamic quest generation from faction/SAM pressure | Hook present in `quest-model.json` | Wire `dynamicHooks[0]` into a real generator in `quest-system.js` |
| Prophecy quest unlock conditions | Quests seeded, no unlock gate logic | Add unlock predicate function in `quest-system.js` |
| NPC dialogue + interaction (E key) | Interact prompt element present | Wire `keydown E` → nearest NPC lookup in `npc-system.js` |
| District event spawning during SAM events | `activeEvents` array on each district | Populate from `sam-system.js` phase-change hook |
| Season rollover + faction win tally | Season index computed | Hook `season.rollover` in `season-model.json` to trigger at end of 90-day cycle |
| Wiki/lore publish hooks | `signalRushHook` in SAM data | Call external endpoint or dispatch event on Signal Rush |
| Room auto-scale sibling room | Schema in `room-model.json` | Implement via server; client reads overflow policy |

---

## Multiplayer Compatibility Guarantees

These assumptions are locked and must not be changed without updating the server contract:

- Room id: **`city`**
- Join strategy: **`joinOrCreate`**
- Endpoint: **`window.BLOCK_TOPIA_SERVER || 'https://game.cryptomoonboys.com'`**
- Player metadata sent on join: `{ name, faction, district, roomIdentity }`
- Messages handled: `system`, `districtChanged`, `questCompleted`
- Movement send: `room.send('move', { x, y })`

---

## Canonical 5 Districts

| ID | Name | Color | Legacy Source |
|---|---|---|---|
| `neon-slums` | Neon Slums | `#4f6dff` | neon-exchange + mural-sector |
| `signal-spire` | Signal Spire | `#ff4fd8` | moon-gate |
| `crypto-core` | Crypto Core | `#ffd84d` | chain-plaza |
| `moonlit-underbelly` | Moonlit Underbelly | `#8dff6a` | dead-rail + black-fork-alley |
| `revolt-plaza` | Revolt Plaza | `#5ef2ff` | living-rebellion city hub |

---

## Extension Rules for Future Agents

### ✅ Must Extend In
- All new Block Topia features go inside `games/block-topia/`
- Add new data to `data/` JSON files
- Add new modules to `world/`, `render/`, or `ui/`
- Keep room id `city`, keep `joinOrCreate` pattern, keep endpoint override

### ❌ Must Not Do
- Do not fork a new Block Topia folder outside `games/block-topia/`
- Do not edit legacy folders (`block-topia-revolt/`, `block-topia-iso/`, street signal HTML files)
- Do not reintroduce wallet/blockchain gating in core progression
- Do not collapse the modular structure back into a monolithic file
- Do not invent new room IDs or server endpoints without coordinating with the server team

### 📁 Legacy Files (Reference Only — Do Not Edit)
- `/games/block-topia-revolt/`
- `/games/block-topia-iso/`
- `/games/block-topia-street-signal-3008.html`
- `/games/block-topia-street-signal-3008-phaser.html`
- `/games/block-topia-street-signal-3008-monster.html`
- `/games/js/blocktopia-phaser-game.js`
- `/games/data/blocktopia-*.json` (data packs kept for legacy loader compatibility)

---

## Anti-Drift Summary

`games/block-topia/` is the unified base.
Legacy files are source references.
All new Block Topia development lands here, in the existing modular structure.

