# Block Topia (`/games/block-topia/`)

This README describes the **current runtime on main** for the Block Topia web client.

## Current Build Summary

Block Topia is a browser-based isometric city client that:

- renders a full-screen canvas world (`render/iso-renderer.js`),
- connects to a Colyseus room (`network.js`),
- runs local HUD/interaction systems (`main.js`, `ui/hud.js`),
- applies server-driven world updates for districts, node interference, SAM phases, and duels.

The default multiplayer endpoint is `https://game.cryptomoonboys.com` (override via `window.BLOCK_TOPIA_SERVER`).

## Runtime Entry and File Roles

- `index.html`
  - Declares the canvas and HUD shell.
  - Loads Colyseus from CDN and boots `main.js` as an ES module.
- `main.js`
  - Bootstraps data/state.
  - Connects multiplayer.
  - Runs input handling, local tick loop, and render loop.
  - Coordinates HUD updates and gameplay event wiring.
- `style.css`
  - Styles the canvas overlays, feed streams, popups, interaction prompt, and duel card.
- `ui/hud.js`
  - Handles HUD text, stream logs, alerts/toasts, and entry banner behavior.
- `render/iso-renderer.js`
  - Draws terrain, roads, props, NPCs, remote players, control nodes, and interaction highlights.
- `network.js`
  - Owns Colyseus connect/retry flow and message/event forwarding.

## World Systems Currently Wired in `main.js`

The current client initializes and uses these systems:

- `world/game-state.js` — canonical local runtime state, movement helpers, remote player merge, visual capture preview.
- `world/sam-system.js` — SAM phase runtime model used for phase labels/effects.
- `world/npc-system.js` — NPC simulation + interaction lookup.
- `world/quest-system.js` — active quest list + quest tick pulses.
- `world/memory-system.js` — in-session event logging memory.
- `world/live-intelligence.js` — live signal snapshot refresh + canon signal bridge.
- `world/clue-signal-system.js` — clue pulse output tied to live signals.
- `world/signal-operation-system.js` — operation spawn/resolve/expire loop.
- `world/node-interference-system.js` — local pulse + server interference state sync.
- `world/duel-system.js` — duel request/action/result state machine.

## Multiplayer Contract (Current)

### Outbound messages

- `move` `{ x, y }`
- `nodeInterfere` `{ nodeId }`
- `duelChallenge` `{ targetPlayerId }`
- `duelAccept` `{ duelId }`
- `duelAction` `{ duelId, action }`

### Inbound messages handled

- `system`
- `districtChanged`
- `questCompleted`
- `samPhaseChanged`
- `districtCaptureChanged`
- `worldSnapshot`
- `nodeInterferenceChanged`
- `duelRequested`
- `duelStarted`
- `duelActionSubmitted`
- `duelResolved`
- `duelEnded`

`room.onStateChange` is throttled to reduce high-frequency player map churn before updating remote player state.

## Current Controls and Interaction

- **Move:** `WASD` or arrow keys.
- **Click:** select tile / select remote player target / interact with node or NPC when applicable.
- **Double-click:** move toward clicked valid tile.
- **Interact with nearby NPC:** `E`.
- **Challenge selected remote player:** `F`.
- **Zoom presets:** `[` and `]`.
- **Mouse wheel:** smooth zoom in/out.
- **Mouse drag (LMB hold + move):** camera pan.

## Current HUD/UX Behavior

- Entry identity panel is shown on load and auto-dismisses (or dismisses after successful multiplayer join).
- Top HUD shows player, XP/level, district, phase, SAM status, room, and population.
- Three stream panels separate combat, SAM/quest, and system-style feed output.
- Quest completion, district capture, SAM/node alerts, and NPC dialogue use transient overlays.
- Multiplayer live banner text reflects current connection status (connecting/connected/failed states).

## Known Current Limitations

- Many world effects are **server-authoritative**; local client visuals (e.g., node pulse and district capture preview) are feedback only.
- If Colyseus is unavailable, the client still runs rendering/local systems but multiplayer status remains failed.
- AI runtime config probe is present (`window.BLOCK_TOPIA_AI`, `window.blockTopiaAiProbe()`), but this build does not execute OpenAI requests.

## Scope Notes

This README intentionally documents only what is currently present in `/games/block-topia/` runtime code and wiring.
