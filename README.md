# Crypto Moonboys

Crypto Moonboys is the live website for the project, including the arcade and shared frontend support assets.

## Project Vision

Crypto Moonboys is a living Web3 wiki.

The wiki is the foundation. The system makes it alive.

**Live loop:** Arcade → Score → Arcade XP → Telegram Sync → Battle Chamber → Block Topia

**Vision loop:** Read → Play → Earn → Stay → Build → Own → Control

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
- `block-topia-quest-maze`
- `breakout-bullrun`
- `crystal-quest`
- `invaders-3008` — **Current season anchor game**
- `pac-chain`
- `snake-run`
- `tetris-block-topia`

## XP System — Four Distinct Layers

The arcade tracks four separate XP/progression signals. They are not interchangeable.

| Signal | Source | Purpose |
|---|---|---|
| **Score** | Every accepted run | Leaderboard rank only — does not affect XP |
| **Arcade XP** | Accepted runs synced via Telegram | Gates Block Topia entry; shared server-side progression |
| **Faction XP** | Faction earn events | Faction alignment level — affects faction HUD and status only |
| **Block Topia XP** | In-game Block Topia progression | In-game progression inside Block Topia (separate from arcade XP) |

## Arcade XP Source

All active arcade games participate in shared Arcade XP progression after Telegram sync.

- Telegram-linked users auto-submit scores on game over.
- Unsynced users stay local and are prompted to sync.
- Score submits once per game over event.
- Invaders 3008 is the current season anchor game but is not the sole XP source.

## Block Topia Entry Gate

Block Topia multiplayer requires:

1. A Telegram-linked account (`/gklink` in @WIKICOMSBOT).
2. At least **50 Arcade XP** accumulated across accepted synced runs.

The authoritative gate value is returned by the server as `progression.required_xp` from `/blocktopia/progression`. The server-side configuration is in `workers/moonboys-api/blocktopia/config.js`. `shared/block-topia/constants.js` provides a matching shared/client default and must stay aligned with the server config.

## Block Topia Status (Current)

`/games/block-topia/` is now only a clean 2-player isometric map base.

What that means:

- No Pressure Protocol runtime
- No solo mode
- No old Block Topia variants
- No street-signal builds
- No old feed/event/SAM UI in Block Topia

The Block Topia page should remain a clean passive map foundation with local and remote player marker support and minimal connection HUD behavior only.

Entry requires: Telegram-linked account + 50 Arcade XP.
