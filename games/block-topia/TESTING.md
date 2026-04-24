# Block-Topia — Manual Smoke Tests

## Multiplayer HUD / Live City Status (city_status_fix)

These manual steps validate that the LIVE LINK HUD banner and multiplayer status display
correctly after the `city_status_fix` changes and do **not** flip to "unavailable" due to
mini-game or node events while world traffic is still arriving.

### Test 1 — Normal connect flow

1. Load the game (`/games/block-topia/index.html` or equivalent).
2. **Expected**: HUD shows "LIVE LINK — CONNECTING" briefly, then "LIVE LINK — CONNECTED".
3. **Expected**: `mp-status` element reads "Connected (live city)".

### Test 2 — Click a node (should not change multiplayer status)

1. While connected, click a glowing control node on the map.
2. **Expected**: LIVE LINK banner remains "LIVE LINK — CONNECTED".
3. **Expected**: `wsConnectionFailed` is NOT set (can verify via `console.debug` in browser devtools).

### Test 3 — Open a mini-game, then fail it

1. Click a node that opens a mini-game overlay (Firewall Defense, Node Outbreak, Signal Router, or Circuit Connect).
2. Intentionally fail the mini-game (let the timer run out or submit a losing action).
3. **Expected**: LIVE LINK banner remains "LIVE LINK — CONNECTED" if world traffic (nodeInterferenceChanged, worldSnapshot, player updates) continues to arrive.
4. **Expected**: No "Live city unavailable. Try again later." text in the HUD.
5. **Expected**: Mini-game failure is reflected as a node interference/combat HUD alert, NOT a multiplayer status change.

### Test 4 — Mini-game succeed

1. Repeat Test 3 but win the mini-game.
2. **Expected**: Same as Test 3 — LIVE LINK banner remains "LIVE LINK — CONNECTED".

### Test 5 — Real disconnect (server-side)

1. Disconnect the browser from the network (DevTools → Network → Offline) **after** the game is connected.
2. **Expected**: HUD shows "LIVE LINK — LIVE CITY UNAVAILABLE. TRY AGAIN LATER."
3. **Expected**: Browser console contains: `[BlockTopia] LIVE LINK marked unavailable from: network-disconnect`
4. Re-enable the network. If the server sends a `nodeInterferenceChanged` or `worldSnapshot` message on reconnect:
5. **Expected**: HUD automatically reverts to "LIVE LINK — CONNECTED".

### Test 6 — Room full

1. Simulate a room-full scenario (requires a test server or full room).
2. **Expected**: HUD shows "LIVE LINK — LIVE CITY UNAVAILABLE. TRY AGAIN LATER."
3. **Expected**: Browser console contains: `[BlockTopia] LIVE LINK marked unavailable from: room-full`

### Test 7 — All connection retries exhausted

1. Point the game at an unreachable server endpoint (modify `window.BLOCK_TOPIA_SERVER`).
2. Wait for all 3 retries to fail.
3. **Expected**: HUD shows "LIVE LINK — LIVE CITY UNAVAILABLE. TRY AGAIN LATER."
4. **Expected**: Browser console contains: `[BlockTopia] LIVE LINK marked unavailable from: network-disconnect`

---

## Key Rules (city_status_fix)

1. **Only real network lifecycle events** may set the HUD to unavailable: `room-full`, `room.onLeave`/disconnect, or all retries exhausted before join.
2. **Mini-game failure** must NEVER call `setMultiplayerStatus`, set `wsConnectionFailed = true`, or display "Live city unavailable".
3. **Node click / node cooldown / action rejection** must NEVER change multiplayer status.
4. If `onPlayers`, `onWorldSnapshot`, or `onNodeInterferenceChanged` arrives → force `hud.setMultiplayerStatus('Connected (live city)')` and `wsConnectionFailed = false`.
5. Every time unavailable is set, `console.warn('[BlockTopia] LIVE LINK marked unavailable from:', reason)` is logged.
