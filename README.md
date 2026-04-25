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
- `hexgl-monster-max`
- `invaders-3008`
- `pac-chain`
- `snake-run`
- `tetris-block-topia`

## Block Topia Status (Current)

`/games/block-topia/` is now only a clean 2-player isometric map base.

What that means:

- No Pressure Protocol runtime
- No solo mode
- No old Block Topia variants
- No street-signal builds
- No old feed/event/SAM UI in Block Topia

The Block Topia page should remain a clean passive map foundation with local and remote player marker support and minimal connection HUD behavior only.
