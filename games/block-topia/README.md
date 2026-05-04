# Block Topia

Block Topia Live City is the current gated 2-player Colyseus survival/mission prototype.

## Current State

- 2-player isometric multiplayer with NPCs, attacks, HP, and respawns.
- Timed world phases: FREE_ROAM → WARNING → EVENT_ACTIVE → RECOVERY → MISSION_COMPLETE.
- Extraction mechanic (SIGNAL_HACK objective progress).
- Upgrade windows in RECOVERY and MISSION_COMPLETE phases.
- Ready / Start / Continue / Restart flow.
- Minimal connection HUD (connect / disconnect status).
- Telegram-linked account required. 50 Arcade XP required to enter.

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

## More Gameplay

Additional gameplay systems will be added from `/games/template` as they are built.
