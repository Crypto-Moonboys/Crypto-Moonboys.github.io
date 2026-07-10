# Crypto Moonboys

Crypto Moonboys is the world's first Living Web3 Wiki.
It is built from 40+ years of Graffiti Kings street culture.
GKniftyHEADS provides the foundation.
The community builds on top.
Before the wallet, there was the wall.
The wiki is alive.

Get Your 1/1 Moonboy -> Community / Battle Chamber -> Link Telegram Identity -> Choose a Faction -> Complete Live Missions -> Play the Arcade -> Earn Server-Backed XP + Eligible NFT Drops -> Burn / Evolve -> Forge a Unique 1/1 Moonboy

This repository is the live website repo for the project, including the wiki, arcade, shared frontend assets, and the active Block Topia runtime.

## Repository Scope

This repository should track only live routes, wired runtime systems, and active operator tooling.

- `README.md` is the top-level repo truth.
- `robots.txt` stays at the repository root.
- `docs/nft-rarity-methodology.md` explains the GKniftyHEADS and NoBallGames NFT rarity tracker methodology for collectors and developers.

## Active Runtime Areas

- GitHub Pages static frontend
- Wiki and shared site shell
- Arcade routes under `/games/`
- Telegram-linked Arcade XP progression
- `moonboys-api` Cloudflare Worker
- leaderboard worker
- anti-cheat worker
- Block Topia live city runtime under `/games/block-topia/`
- Block Topia server files under `server/block-topia/`
- worker configs under `workers/`

## Active Arcade Routes

- `/games/index.html`
- `/games/leaderboard.html`
- `/games/asteroid-fork/`
- `/games/block-topia/`
- `/games/block-topia-quest-maze/`
- `/games/breakout-bullrun/`
- `/games/crystal-quest/`
- `/games/invaders-3008/`
- `/games/pac-chain/`
- `/games/snake-run/`
- `/games/tetris-block-topia/`

## Arcade XP Truth

- Score writes require fresh signed Telegram auth.
- Arcade XP is server-side progression after Telegram sync.
- Block Topia entry requires a Telegram-linked account and 5000 Arcade XP.
- The authoritative gate value comes from `/blocktopia/progression` and is configured in `workers/moonboys-api/blocktopia/config.js`.

## Target Public Contract

Telegram identity is a hard prerequisite for the competitive ecosystem:

- Unlinked users cannot enter the competitive Arcade.
- No unlinked scores are submitted, saved, or calculated.
- No unlinked Arcade XP is earned or retained.
- No anonymous or hidden leaderboard exists.
- Leaderboards represent Telegram-linked identities only.
- Users must remain authenticated while grinding progression.

## Progression Tracks

Once identity and faction onboarding are active, both tracks open. The Creator Track begins immediately and runs in parallel with the Player Track — it does not wait for Block Topia.

**Player Track (Live)**

Battle Chamber missions + Arcade activity → server-backed XP → faction clout/progression → 5000 Arcade XP → Block Topia public beta

**Creator Track (SWARMSY Live / Forge Pipeline Coming Soon)**

SWARMSY is live now: begin building website, lore, media, games, merchandise and community as soon as identity and faction are active → the future forged 1/1 Moonboy anchors the creator world → approved creator-world links connect into dedicated Living Wiki pages and subpages → SAM indexes and connects the creator world → future persistent 24/7 Block Topia NPC identity with spine, skills, memory, relationships, faction history and lore continuity

Coming soon: eligible NFT drops → 3-NFT limit per Telegram account → burn/evolve → forge a unique 1/1 Moonboy → creator/IP layer → dedicated Wiki pipeline → NPC integration

## Status Truth

**Live:**

- SWARMSY, in its dedicated repository
- Telegram identity link
- Faction selection
- Full Battle Chamber faction activity / missions / wars
- Arcade and server-backed XP progression
- Block Topia multiplayer survival/mission game server in public beta

**Coming Soon:**

- Eligible NFT drop and burn-to-forge creator pipeline
- 1/1 Moonboy creator/IP layer
- Dedicated creator-world Wiki page/subpage pipeline
- Persistent 24/7 1/1 Moonboy NPC integration in Block Topia

## Frontend API + Telegram Auth Contract

- `js/api-config.js` is the canonical frontend API source of truth for `MOONBOYS_API.BASE_URL`, `MOONBOYS_API.LEADERBOARD_URL`, runtime context detection, and production fallback policy.
- Production fallback is allowed only on the live production hosts. Local/dev/preview contexts must provide explicit API config or stay read-only / pending.
- Protected frontend writes must use fresh signed Telegram auth via `window.MOONBOYS_IDENTITY.getFreshTelegramAuth()` or the equivalent signed+restore path. Stale `getTelegramAuth()` cache alone is not proof of competitive write eligibility.
- Anonymous and unsigned users are blocked from the competitive Arcade. Score writes are rejected, no unlinked scores are submitted or saved, and no local leaderboard or progression queue exists for later XP.
- `ENV.BUILD_DATE` means an explicitly injected/static build timestamp only. Per-page-load timestamps must use `ENV.RUNTIME_LOADED_AT` and must not be shown as a build date.

## Block Topia Live Runtime

Block Topia is the live multiplayer survival/mission game server currently operating in public beta.

Live now:

- NPCs
- attacks
- HP
- respawns
- phases
- extraction
- upgrades
- ready/start/restart
- Telegram + XP gate

Active server/runtime files:

- `games/block-topia/index.html`
- `games/block-topia/main.js`
- `games/block-topia/network.js`
- `server/block-topia/src/index.js`
- `server/block-topia/src/rooms/MinimalCityRoom.js`
- `workers/moonboys-api/blocktopia/routes.js`

## Drift Rules

- Do not add archived or placeholder runtime claims.
- Do not reintroduce removed admin shells, disabled route families, or legacy Block Topia systems.
- Do not document speculative systems as if they are live.
- Do not keep dead routes, dead docs, or disabled compatibility shells.
