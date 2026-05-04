# Block Topia Live City

Block Topia (`/games/block-topia/`) is the current live gated 2-player Colyseus multiplayer survival/mission prototype.

## Current State

- Telegram-linked account required. 50 Arcade XP required to enter.
- Colyseus multiplayer server (`MinimalCityRoom`). 2-player cap.
- NPCs exist. Attacks exist.
- HP, downs, and respawns exist.
- Ready / start / restart flow exists.
- World phases exist (FREE_ROAM → WARNING → EVENT_ACTIVE → RECOVERY → MISSION_COMPLETE).
- Objectives exist. Extraction exists.
- Upgrades and recovery exist.
- SAM webhook is a stub only — not live world control.

Not live:
- No Pressure Protocol runtime.
- No solo mode.
- No old Block Topia variants.
- No old feed / event / SAM UI.

## Current Product Split

- `/games/block-topia/` = Block Topia Live City, current gated 2-player Colyseus survival/mission prototype.
- `/games/block-topia-quest-maze/` = separate Quest Maze arcade/RPG score game.
- `/games/city-block-topia/` or `/games/block-topia/neon-sprawl/` = planned City Block Topia / Neon Sprawl deeper living-wiki layer, not current live runtime.

## Run

From this folder, launch any static server and open `index.html`.

Example:

```powershell
npx serve .
```

## Controls

- `W A S D` or arrow keys: move player
- Mouse wheel or `[` / `]`: zoom
- Left mouse button hold + drag: camera pan

## Do Not Drift

- Do not describe Block Topia Live City as a clean map base only.
- Do not merge City Block Topia / Neon Sprawl into the current live Block Topia page.
- Do not preserve old wrong details in archive sections.
- Do not claim SAM, seasons, full economy, full HODL Wars, or Neon Sprawl integration are live unless the code is wired, accessible, tested, and documented.
- Do not blur Score, Arcade XP, Faction XP, Block Topia XP / City XP, Rebel Ink, tokens, or NFTs.
