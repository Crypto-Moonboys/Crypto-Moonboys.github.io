# Pressure Protocol

Deterministic 2-player pressure warfare on a 20x20 isometric grid.

## Run

From this folder, launch any static server and open `index.html`.

Example:

```powershell
npx serve .
```

## Controls

- `Tab`: swap active commander (P1/P2 in hot-seat testing)
- `R`: send ready command for active commander
- `1` `2` `3`: select active commander NPC slot
- `Click passable tile`: queue move command (only while running)
- `Space`: queue Pulse from selected NPC (only while running)
- `D`: toggle debug overlay

## Match Flow

- Match starts in `waiting`
- Each player sends a lockstep `ready` command
- When both are ready, deterministic `countdown` runs for 30 ticks
- After countdown, state becomes `running`
- At end, state becomes `ended` and simulation freezes

## Win Conditions

- Primary: reduce enemy HP to 0
- Time cap: 5 minutes (`3000` ticks at `100ms`)
- Timeout winner order:
  1. Higher controlled tile count
  2. Higher total pressure advantage
  3. If equal, `DRAW`

End overlay shows winner (or draw), final control %, and `Refresh to rematch`.

## Core Mechanics

- Terrain:
  - `road` moveCost `0.5`
  - `grass` moveCost `2`
  - `block` moveCost `999`
- Pressure decay each tick (`* 0.98`)
- Local dominance bonus (`+0.3` / `-0.3`)
- Anchor lock tiles (enemy pressure into locked tile reduced to `30%`)
- Spawn-zone pressure bias
- Pulse ability: radius burst, tick-based cooldown (`50` ticks)

## Deterministic Lockstep Notes

- All gameplay actions are queued commands with future tick `t`
- Input delay is fixed (`INPUT_DELAY = 3`)
- Commands execute only when `command.t === state.tick`
- Command order per tick is deterministic:
  - `playerId`, then `npcId`, then `type`, then `targetTileId`
- No random/time-based logic in simulation loop
- Hard clamps each tick:
  - pressure in `[-100, 100]`
  - player HP `>= 0`

## Sync / Hash Hooks

These remain exported on `window.PressureProtocol`:

- `mount(options?)`
- `destroy()`
- `setCommandBroadcastSink(fn)`
- `receiveRemoteCommand(command)`
- `setHashBroadcastSink(fn)`
- `receiveRemoteHash({ t, hash })`
- `enqueueCommand(command)`
- `issueMove(playerId, slot, tileId)`
- `issuePulse(playerId, slot)`
- `issueReady(playerId)`
- `hashState()`
- `getSnapshot()`

A snapshot hash is emitted every 20 ticks and compared to remote hash for desync detection.

## Smoke Test

1. Open page and confirm only one canvas scene is visible (iso map + agents + minimal overlays).
2. Confirm there is no legacy UI: no bottom-left feed, no rotating text, no old event boxes.
3. Open browser console and confirm no mount/cleanup errors on load.
4. Press `R` on each commander (`Tab` between them) and verify countdown starts.
5. Press `1`, `2`, `3` and verify selected NPC ring changes.
6. Click a passable tile and verify target marker appears and selected agent begins moving.
7. Press `Space` and verify pulse fires from selected NPC.
8. Press `D` and verify debug overlay toggles on/off.
9. Resize browser window and verify map remains centered and canvas fills viewport.
10. In console run `window.PressureProtocol.mount()` twice; verify tick speed stays normal (no accelerated loop).
11. Refresh page and repeat step 10 to confirm no duplicate loop after reload.
