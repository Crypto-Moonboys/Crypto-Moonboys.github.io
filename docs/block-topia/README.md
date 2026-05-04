# Block Topia — Living Rebellion

Block Topia is a living multiplayer city. This documentation tree tracks both what is **currently running** and the long-term build direction so the game, wiki integrations, and multiplayer systems do not drift during development.

---

## CURRENT RUNTIME

> **See [CURRENT_RUNTIME_TRUTH.md](./CURRENT_RUNTIME_TRUTH.md) for the full authoritative breakdown.**

### What is live today (`/games/block-topia/`)

- 20×20 isometric tile map rendered in the browser canvas.
- Up to 2 players can join the same Colyseus `MinimalCityRoom` simultaneously.
- Server-authoritative movement (WASD or tile-click, clamped to grid bounds).
- Local and remote player markers with connection-status HUD.
- Colyseus v0.16 server hosted on Contabo VPS; GitHub Pages hosts the static frontend.
- NPCs exist. Attacks exist.
- HP, downs, and respawns exist.
- Ready / start / restart flow exists.
- World phases (FREE_ROAM → WARNING → EVENT_ACTIVE → RECOVERY → MISSION_COMPLETE) exist.
- Objectives exist. Extraction exists.
- Upgrades and recovery exist.
- SAM webhook is a stub only — not live world control.

### What is NOT yet live

SAM live integration, seasons, Signal Rush, full NPC ecosystem, quests, XP economy, cosmetics, marketplace, district control, Redis, Postgres, and games-within-the-game integration are **not built**. See [CURRENT_RUNTIME_TRUTH.md](./CURRENT_RUNTIME_TRUTH.md) for the full list.

### Key files for the running city

```
games/block-topia/index.html
games/block-topia/main.js
games/block-topia/network.js
server/block-topia/src/index.js
server/block-topia/src/rooms/MinimalCityRoom.js
```

---

## Current Product Split

- `/games/block-topia/` = Block Topia Live City, current gated 2-player Colyseus survival/mission prototype.
- `/games/block-topia-quest-maze/` = separate Quest Maze arcade/RPG score game.
- `/games/city-block-topia/` or `/games/block-topia/neon-sprawl/` = planned City Block Topia / Neon Sprawl deeper living-wiki layer, not current live runtime.

---

## FUTURE VISION

The sections below describe the intended long-term direction. **None of this is currently active.** Each system will be built in deliberate phases (see [CURRENT_RUNTIME_TRUTH.md § Next safe build phase](./CURRENT_RUNTIME_TRUTH.md#next-safe-build-phase)).

### Locked vision

- GitHub Pages continues to host the public wiki and arcade frontend.
- Contabo VPS hosts the authoritative multiplayer backend.
- Cloudflare handles DNS, SSL, caching, and WebSocket proxying.
- The wiki agent SAM acts as the city brain.
- Seasons, quests, NPC conflict, and city-state are driven by live world logic.
- No blockchain requirements are part of the gameplay build.

### Core systems (future)

1. SAM Cycle
2. Season Engine
3. Signal Rush live-event system
4. NPC ecosystem and faction war
5. Living wiki quest engine
6. Mega NPC: SAM Unleashed
7. World state and room memory
8. XP economy, cosmetics, and player marketplace
9. Games-within-the-game integration
10. Multiplayer infrastructure at scale

### City Block Topia / Neon Sprawl (future, separate route)

City Block Topia / Neon Sprawl / GraffPunk Infiltration is a **separate deeper living-wiki territory layer** planned for future integration.

- Preferred future route: `/games/city-block-topia/`
- Alternative future route: `/games/block-topia/neon-sprawl/`
- Deeper Three.js / Neon Sprawl / GraffPunk tagging and zone-control world.
- Click → Tag → Zone reacts → Rebel Ink → Rebellion rises → Zone captured.
- Wiki-linked districts/zones. Battle Chamber events planned. Telegram save/sync planned.
- Treat advanced modules as planned or package-present unless imported, wired, smoke-tested, and documented.

This is **not** the current `/games/block-topia/` runtime.

### Planned repo layout (future)

- `games/block-topia/` — evolving frontend (currently the live survival/mission city)
- `shared/block-topia/` — world rules, factions, season data, and event config
- `server/block-topia/` — Colyseus backend (currently MinimalCityRoom only)
- `docs/block-topia/` — detailed design docs

### Build rule

Do not collapse logic back into giant HTML files. The rebuild must stay split across client, shared data, and server systems. Do not reintroduce removed systems without a deliberate phase decision.

---

## Do Not Drift

- Do not describe Block Topia Live City as a clean map base only.
- Do not merge City Block Topia / Neon Sprawl into the current live Block Topia page.
- Do not preserve old wrong details in archive sections.
- Do not claim SAM, seasons, full economy, full HODL Wars, or Neon Sprawl integration are live unless the code is wired, accessible, tested, and documented.
- Do not blur Score, Arcade XP, Faction XP, Block Topia XP / City XP, Rebel Ink, tokens, or NFTs.