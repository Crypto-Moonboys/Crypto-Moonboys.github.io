# Crypto Moonboys

Crypto Moonboys is the live website for the project, including the arcade and shared frontend support assets.

## Repository Scope

This repository is the active website runtime and should stay clean and focused.

- `README.md` is the single source of truth for repo-level documentation.
- `robots.txt` stays at root.

## Arcade Structure

The arcade lives under `/games/`.

Key shared files/folders that must remain:

- `/games/index.html`
- `/games/leaderboard.html` (shared leaderboard page)
- `/games/assets` (shared assets)
- `/games/core` (shared core modules)
- `/games/data` (shared data)
- `/games/js` (shared game/frontend scripts)

## Current Live Arcade Games

- `asteroid-fork`
- `breakout-bullrun`
- `crystal-quest`
- `invaders-3008` — **Current arcade XP & leaderboard source of truth**
- `pac-chain`
- `snake-run`
- `tetris-block-topia`

## Arcade XP Source

**Invaders 3008** is the active arcade season game and the sole source of arcade leaderboard submissions and XP conversion.

- Telegram-linked users auto-submit scores on game over.
- Unsynced users stay local and are prompted to sync.
- Score submits once per game over event.

## HexGL Status (Deprecated)

`hexgl-monster-max` and `hexgl-local` are **archived and not active**.

- HexGL is deprecated as an XP source.
- Score submission is fully disabled in `js/arcade/games/hexgl-monster-max/bootstrap.js`.
- HexGL pages are kept for archival/test purposes only.
- HexGL does not appear in the active arcade navigation.

## Block Topia Status (Current)

`/games/block-topia/` is now only a clean 2-player isometric map base.

What that means:

- No Pressure Protocol runtime
- No solo mode
- No old Block Topia variants
- No street-signal builds
- No old feed/event/SAM UI in Block Topia

The Block Topia page should remain a clean passive map foundation with local and remote player marker support and minimal connection HUD behavior only.
