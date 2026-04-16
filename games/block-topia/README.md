# Block Topia Unified Multiplayer (`/games/block-topia/`)

This module is the merged Block Topia build that consolidates:

- **Street Signal 3008** (`/games/block-topia-street-signal-3008*.html`)
- **Block Topia Revolt** (`/games/block-topia-revolt/`)
- **Block Topia ISO** (`/games/block-topia-iso/`)

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
  - `window.BLOCK_TOPIA_SERVER`, defaulting to `https://game.cryptomoonboys.com`
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

### Runtime Systems
- `world/game-state.js`: canonical game state, movement, district capture, XP/score.
- `world/sam-system.js`: SAM phase timing + giant-encounter trigger.
- `world/npc-system.js`: active/crowd NPC simulation and faction drift.
- `world/quest-system.js`: active quest cards, completion XP, pulse hooks.
- `world/memory-system.js`: in-session world memory and event logging.
- `ui/hud.js`: DOM HUD bindings for status, quests, multiplayer, feed, overlays.
- `render/iso-renderer.js`: district-aware isometric renderer for local/remote entities.

## Scaffolding for Future Expansion

The unified module is intentionally split into composable systems so new features can be added without rewriting the core loop:

- **Data-first expansion:** add districts/events/factions/quest arcs by extending `data/*.json`.
- **Server feature growth:** add new Colyseus messages in `network.js` and map them to HUD/system hooks.
- **Live ops hooks:** SAM, season, and quest dynamic hooks are already exposed for future automation.
- **World memory hooks:** event logging and memory channels are in place for persistence and future replay/story features.
- **Render extensibility:** `render/iso-renderer.js` can be upgraded to sprites/effects while preserving current state contracts.

## Legacy References

Legacy source references are tracked in `world/data-loader.js` (`legacy.sourceFiles`) so future updates can verify parity against Street Signal, Revolt, and ISO inputs.
