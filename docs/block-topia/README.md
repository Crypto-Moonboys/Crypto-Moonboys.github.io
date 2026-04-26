# Block Topia — Living Rebellion

Block Topia is being rebuilt as a living multiplayer city. This documentation tree tracks both what is **currently running** and the long-term build direction so the game, wiki integrations, and multiplayer systems do not drift during development.

---

## CURRENT RUNTIME

> **What is actually built and running right now is a minimal 2-player isometric map skeleton.**
> See [CURRENT_RUNTIME_TRUTH.md](./CURRENT_RUNTIME_TRUTH.md) for the full authoritative breakdown.

### What is live today
- A 20×20 isometric tile map rendered in the browser canvas.
- Up to 2 players can join the same Colyseus "city" room simultaneously.
- Server-authoritative movement (WASD or tile-click, clamped to grid bounds).
- P1 (blue) and P2 (red) markers with a simple HUD showing connection status.
- Colyseus v0.16 server hosted on Contabo VPS; GitHub Pages hosts the static frontend.

### What is NOT yet live
SAM, seasons, Signal Rush, NPC ecosystem, quests, XP economy, cosmetics, marketplace, district control, Redis, Postgres, and games-within-the-game integration are **not built**. See [CURRENT_RUNTIME_TRUTH.md](./CURRENT_RUNTIME_TRUTH.md) for the full list and the recommended build phases.

### Key files for the running skeleton
```
games/block-topia/index.html
games/block-topia/main.js
games/block-topia/network.js
server/block-topia/src/index.js
server/block-topia/src/rooms/MinimalCityRoom.js
```

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

### Planned repo layout (future)
- `games/block-topia/` — evolving frontend (currently the 2-player skeleton)
- `shared/block-topia/` — world rules, factions, season data, and event config
- `server/block-topia/` — Colyseus backend (currently MinimalCityRoom only)
- `docs/block-topia/` — detailed design docs

### Build rule
Do not collapse logic back into giant HTML files. The rebuild must stay split across client, shared data, and server systems. Do not reintroduce removed systems without a deliberate phase decision.