# Crypto Moonboys

Crypto Moonboys is the live website repository for the project, including the wiki, arcade, shared frontend assets, and the active Block Topia runtime.

## Repository Scope

This repository should track only live routes, wired runtime systems, and active operator tooling.

- `README.md` is the top-level repo truth.
- `robots.txt` stays at the repository root.

## Active Runtime Areas

- Wiki and shared site shell
- Arcade routes under `/games/`
- Telegram-linked Arcade XP progression
- Block Topia live city runtime under `/games/block-topia/`

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

- Score is leaderboard rank only.
- Arcade XP is server-side progression after Telegram sync.
- Block Topia entry requires a Telegram-linked account and at least 50 Arcade XP.
- The authoritative gate value comes from `/blocktopia/progression` and is configured in `workers/moonboys-api/blocktopia/config.js`.

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
