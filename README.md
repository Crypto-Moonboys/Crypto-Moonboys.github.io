# Crypto Moonboys

Crypto Moonboys is the live website repository for the project, including the wiki, arcade, shared frontend assets, and the active Block Topia runtime.

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
- Block Topia entry requires a Telegram-linked account and at least 50 Arcade XP.
- The authoritative gate value comes from `/blocktopia/progression` and is configured in `workers/moonboys-api/blocktopia/config.js`.

## Frontend API + Telegram Auth Contract

- `js/api-config.js` is the canonical frontend API source of truth for `MOONBOYS_API.BASE_URL`, `MOONBOYS_API.LEADERBOARD_URL`, runtime context detection, and production fallback policy.
- Production fallback is allowed only on the live production hosts. Local/dev/preview contexts must provide explicit API config or stay read-only / pending.
- Protected frontend writes must use fresh signed Telegram auth via `window.MOONBOYS_IDENTITY.getFreshTelegramAuth()` or the equivalent signed+restore path. Stale `getTelegramAuth()` cache alone is not proof of competitive write eligibility.
- Anonymous and unsigned users can play locally, but score writes are rejected and no local leaderboard/progression queue is saved for later XP.
- `ENV.BUILD_DATE` means an explicitly injected/static build timestamp only. Per-page-load timestamps must use `ENV.RUNTIME_LOADED_AT` and must not be shown as a build date.

## Block Topia Live Runtime

`/games/block-topia/` is the current gated 2-player Colyseus survival/mission prototype.

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
