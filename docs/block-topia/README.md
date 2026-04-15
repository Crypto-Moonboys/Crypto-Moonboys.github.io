# Block Topia — Living Rebellion

Block Topia is being rebuilt as a living multiplayer city instead of a one-file prototype. This documentation tree locks the build direction so the game, wiki integrations, and multiplayer systems do not drift during development.

## Locked vision
- GitHub Pages continues to host the public wiki and arcade frontend.
- Contabo VPS hosts the authoritative multiplayer backend.
- Cloudflare handles DNS, SSL, caching, and WebSocket proxying.
- The wiki agent SAM acts as the city brain.
- Seasons, quests, NPC conflict, and city-state are driven by live world logic.
- No blockchain requirements are part of the gameplay build.

## Core systems
1. SAM Cycle
2. Season Engine
3. Signal Rush live-event system
4. NPC ecosystem and faction war
5. Living wiki quest engine
6. Mega NPC: SAM Unleashed
7. World state and room memory
8. XP economy, cosmetics, and player marketplace
9. Games-within-the-game integration
10. Multiplayer infrastructure

## Repo layout added on this branch
- `games/block-topia-revolt/` — new frontend prototype for the living-city rebuild
- `shared/block-topia/` — world rules, factions, season data, and event config
- `server/block-topia/` — Colyseus-ready backend scaffold
- `docs/block-topia/` — detailed design docs

## Build rule
Do not collapse logic back into giant HTML files. The rebuild must stay split across client, shared data, and server systems.