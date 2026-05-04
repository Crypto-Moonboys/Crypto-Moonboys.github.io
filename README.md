# Crypto Moonboys

Crypto Moonboys is the live website for the project, including the arcade and shared frontend support assets.

## Project Vision

Crypto Moonboys is a living Web3 wiki.

The wiki is the foundation. The system makes it alive.

**Core route:** Read → Play → Earn XP → Link → Battle Chamber → Block Topia → Build

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

## XP System — Distinct Progression Layers

These signals are not interchangeable.

| Signal | Source | Purpose |
|---|---|---|
| **Score** | Every accepted run | Leaderboard rank only — does not affect XP |
| **Arcade XP** | Accepted runs synced via Telegram | Server-side XP; gates Block Topia entry |
| **Faction XP** | Faction earn events | Faction alignment / status only |
| **Block Topia XP / City XP** | In-game Block Topia or City Block Topia progression | In-game progression inside those products only |
| **Rebel Ink** | City Block Topia in-game resource | City Block Topia resource only — not arcade XP or tokens |
| **Tokens / NFTs** | Future / optional | Ownership, identity, art, access, or cosmetic layer only — no passive reward or guaranteed financial return |

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

## Current Product Split

- `/games/block-topia/` = **Block Topia Live City** — current gated 2-player Colyseus survival/mission prototype.
- `/games/block-topia-quest-maze/` = **Block Topia Quest Maze** — separate arcade/RPG score game and Arcade XP path.
- `/games/city-block-topia/` or `/games/block-topia/neon-sprawl/` = **City Block Topia / Neon Sprawl** — planned deeper living-wiki layer; not the current live runtime.

## Block Topia Live City Status (Current)

`/games/block-topia/` is the current live gated 2-player Colyseus multiplayer survival/mission prototype.

What is live today:

- Telegram-linked account required. 50 Arcade XP required to enter.
- Colyseus multiplayer server (`MinimalCityRoom`). 2-player cap.
- NPCs exist. Attacks exist.
- HP, downs, and respawns exist.
- Ready / start / restart flow exists.
- World phases exist (FREE_ROAM → WARNING → EVENT_ACTIVE → RECOVERY → MISSION_COMPLETE).
- Objectives exist. Extraction exists.
- Upgrades and recovery exist.
- SAM webhook is a stub only — not live world control.

What is not live:

- No Pressure Protocol runtime.
- No solo mode.
- No old Block Topia variants.
- No old feed / event / SAM UI.
- SAM live integration, full economy, HODL Wars, and Neon Sprawl are not wired.

## Do Not Drift

- Do not describe Block Topia Live City as a clean map base only.
- Do not merge City Block Topia / Neon Sprawl into the current live Block Topia page.
- Do not preserve old wrong details in archive sections.
- Do not claim SAM, seasons, full economy, full HODL Wars, or Neon Sprawl integration are live unless the code is wired, accessible, tested, and documented.
- Do not blur Score, Arcade XP, Faction XP, Block Topia XP / City XP, Rebel Ink, tokens, or NFTs.
