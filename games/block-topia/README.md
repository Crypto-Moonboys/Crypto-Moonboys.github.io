# Block Topia Unified Foundation (`games/block-topia/`)

This folder is the **single source of truth** foundation for Block Topia going forward.

## Canonical Direction

This module unifies three legacy lines into one build path:

1. **Street Signal 3008 / Monster**
   - Reused as identity/data/asset source:
     - lore DNA
     - district and event tone
     - seasonal data and quest flavor
     - existing asset-pack references
2. **Block Topia Revolt**
   - Reused as multiplayer source:
     - Colyseus client flow
     - endpoint fallback behavior
     - room join behavior aligned to room id `city`
     - remote player sync baseline
3. **Block Topia ISO**
   - Reused as visual/source direction:
     - isometric scene presentation
     - social-world framing
     - cleaner world readability

## Legacy Source Inputs (Reference-Only)

These files are now legacy references and **not** the forward architecture:

- `/games/block-topia-revolt/`
- `/games/block-topia-iso/`
- `/games/block-topia-street-signal-3008.html`
- `/games/block-topia-street-signal-3008-phaser.html`
- `/games/block-topia-street-signal-3008-monster.html`
- `/games/js/blocktopia-phaser-game.js`
- `/games/data/blocktopia-*.json` (source packs reused where needed)

## New Unified Architecture

Top-level:
- `index.html` — unified entry with one HUD shell
- `style.css` — single HUD + world styling
- `main.js` — orchestration root
- `network.js` — multiplayer transport layer

Modules:
- `render/iso-renderer.js` — isometric renderer foundation
- `world/data-loader.js` — unified + legacy data ingestion layer
- `world/game-state.js` — world state, room identity, districts, player, remote sync state
- `world/sam-system.js` — SAM phased event cycle
- `world/npc-system.js` — active/crowd NPC split scaffolding
- `world/quest-system.js` — daily/weekly/seasonal/dynamic hooks
- `world/memory-system.js` — memory tracking hooks
- `ui/hud.js` — world/quest/multiplayer/feed HUD controller

Data layer:
- `data/districts.json`
- `data/factions.json`
- `data/sam-phases.json`
- `data/npc-archetypes.json`
- `data/quest-model.json`
- `data/season-model.json`
- `data/room-model.json`

Assets layer:
- `assets/manifest.json`
- `assets/README.md`

## What Is Implemented Now

Implemented in code and wired end-to-end:

- Unified module entry under `games/block-topia/`
- Single clean HUD with:
  - world/district status
  - quest/live ops area
  - multiplayer status
  - event/street feed
- Isometric rendering baseline
- Colyseus multiplayer compatibility path:
  - endpoint from `window.BLOCK_TOPIA_SERVER` with default `https://game.cryptomoonboys.com`
  - `joinOrCreate('city', ...)`
  - remote player sync from room state
- Canonical five-district data model seeded in the new data layer
- Faction model seeded as **Liberators vs Wardens**
- SAM 3-phase cycle scaffolding running in runtime loop
- Quest model runtime hooks (daily/weekly/seasonal + dynamic hook pulse)
- Memory event recording hooks in runtime flow

## What Is Scaffolded and Ready for Next Phase

Structured and ready for extension without re-architecture:

- 100-player room cap and auto-scaled room model schema
- Room identity + room-specific state hooks
- NPC split model:
  - active NPC target 60 (cap 80)
  - crowd NPC target 300+
  - role scaffolds: vendors, fighters, lore keepers, recruiters, drifters, agents
  - behavior hook surfaces: faction alignment, side switching, player reaction, routines, memory, dialogue
- SAM event scaffolding:
  - Phase 1 Signals
  - Phase 2 Conflict
  - Phase 3 SAM event / giant encounter
  - post-event world mutation hooks
  - SAM Signal Rush hook for live site/wiki update flow
- 90-day season hooks
- XP-only progression model hooks
- Wiki/lore integration hooks for future live publishing
- Social MMO expansion direction via modular state + systems split

## Multiplayer Compatibility Guarantees Preserved

The unified base preserves core live assumptions from Revolt fixes:

- Room id remains `city`
- Colyseus client flow remains `joinOrCreate`
- Endpoint logic remains override-capable via `window.BLOCK_TOPIA_SERVER`
- Remote player sync remains event/state driven

## Arcade Transition Wiring

Arcade should point to this module as the future main Block Topia path while legacy pages remain accessible during transition.

## Extension Rules for Future Agents

### Must Extend

- Extend within `games/block-topia/` modules and data files.
- Add features via the existing `world/`, `render/`, `ui/`, `data/`, `assets/` boundaries.
- Keep multiplayer compatibility with room `city` unless server contract changes explicitly.

### Must Not Replace

- Do not fork new Block Topia variants outside `games/block-topia/`.
- Do not reintroduce blockchain/crypto wallet progression loops into core progression.
- Do not rewrite legacy pages as the primary extension path.
- Do not collapse this modular structure back into a monolithic single-file prototype.

## Anti-Drift Summary

`games/block-topia/` is the unified base to evolve.
Legacy variants are source references only.
All net-new Block Topia development should land in this module.
