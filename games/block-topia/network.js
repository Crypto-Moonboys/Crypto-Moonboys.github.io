let room = null;
let client = null;
let _reconnectOptions = null;
let _reconnecting = false;
// True while connectMultiplayer() is actively running for a reconnect.
// Prevents concurrent reconnect attempts from both _scheduleReconnect and
// direct callers (e.g. the node-click handler in main.js).
let _isConnecting = false;
// Set to true when the last connection attempt failed with 4211 (city not bootstrapped).
// Prevents the onLeave handler from triggering pointless reconnect loops.
let _cityUnavailable = false;
const STATE_CHANGE_THROTTLE_MS = 100;
// Throttle closed-room console warnings to once every 3 seconds per message type.
const CLOSED_ROOM_WARN_THROTTLE_MS = 3000;
const _closedRoomWarnAt = {};
// Maximum connection attempts before giving up.
const MAX_RETRIES = 3;
// Colyseus v0.16 error codes (ErrorCode enum from @colyseus/core):
//   MATCHMAKE_INVALID_CRITERIA = 4211  -- "no rooms found with provided criteria"
//   MATCHMAKE_UNHANDLED        = 4213  -- wraps SeatReservationError ("already full")
const ERR_ROOM_NOT_FOUND = 4211;
const ERR_ROOM_FULL = 4213;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRoomFullError(error) {
  return (
    error?.code === ERR_ROOM_FULL
    || /full|max.?client/i.test(String(error?.message || ''))
  );
}

function isRoomNotFoundError(error) {
  return (
    error?.code === ERR_ROOM_NOT_FOUND
    // Defence-in-depth: also match the exact human-readable message Colyseus v0.16 returns
    // ("no rooms found with provided criteria") and older variant phrases ("not found", "cannot find").
    || /no rooms found|not.?found|cannot find/i.test(String(error?.message || ''))
  );
}

function getEntryGateReason(error) {
  const message = String(error?.message || '').trim();
  if (message === 'telegram_required' || message === 'xp_required' || message === 'auth_invalid') {
    return message;
  }
  return null;
}

function toEntryGateMessage(reason) {
  if (reason === 'telegram_required') return 'Link Telegram to enter Block Topia multiplayer.';
  if (reason === 'xp_required') return 'You need 50 XP to enter Block Topia multiplayer. Play arcade games and sync Telegram to earn XP.';
  if (reason === 'auth_invalid') return 'Unable to verify multiplayer access right now. Please relink Telegram and try again.';
  return 'Multiplayer access blocked.';
}

// Join an existing server-created room only. Never creates a room from the browser.
// If the room does not exist (4211) a clean error with isCityUnavailable=true is thrown
// so the caller can fail fast without retrying or creating a fallback room.
async function joinCityOnly(colyseusClient, roomId, options) {
  console.log(`[BlockTopia] join attempt -> room "${roomId}"`);
  try {
    const joined = await colyseusClient.join(roomId, options);
    console.log(`[BlockTopia] join succeeded -> room "${joined.name || roomId}" session=${joined.sessionId}`);
    return joined;
  } catch (joinError) {
    if (isRoomNotFoundError(joinError)) {
      console.error(`[BlockTopia] Live city unavailable - server room not bootstrapped (code=${joinError?.code}).`);
      const err = new Error('Live city unavailable - server room not bootstrapped');
      err.code = ERR_ROOM_NOT_FOUND;
      err.isCityUnavailable = true;
      throw err;
    }
    console.warn(`[BlockTopia] join failed (code=${joinError?.code}): ${joinError?.message || joinError}`);
    throw joinError;
  }
}

function toPlayerList(playersState) {
  const list = [];
  if (!playersState) return list;

  // ArraySchema (and some schema proxy variants) expose toArray().
  if (typeof playersState.toArray === 'function') {
    return playersState.toArray().map((player, index) => ({
      id: player?.id || String(index),
      // player.id is set to client.sessionId on the server — expose it so
      // updatePlayers() can match the local player by sessionId.
      sessionId: player?.id || String(index),
      x: Number(player?.x) || 0,
      y: Number(player?.y) || 0,
      name: String(player?.name || ''),
      faction: String(player?.faction || ''),
      district: String(player?.district || ''),
    }));
  }

  // Array-like schema fallbacks where forEach is unavailable/unreliable.
  if (typeof playersState.length === 'number' && playersState.length >= 0) {
    for (let i = 0; i < playersState.length; i += 1) {
      const player = playersState[i];
      if (!player) continue;
      list.push({
        id: player?.id || String(i),
        sessionId: player?.id || String(i),
        x: Number(player?.x) || 0,
        y: Number(player?.y) || 0,
        name: String(player?.name || ''),
        faction: String(player?.faction || ''),
        district: String(player?.district || ''),
      });
    }
    return list;
  }

  if (typeof playersState.forEach === 'function') {
    playersState.forEach((player, id) => {
      list.push({
        id: player?.id || String(id),
        sessionId: player?.id || String(id),
        x: Number(player?.x) || 0,
        y: Number(player?.y) || 0,
        name: String(player?.name || ''),
        faction: String(player?.faction || ''),
        district: String(player?.district || ''),
      });
    });
    return list;
  }
  Object.entries(playersState).forEach(([id, player]) => {
    list.push({ id, sessionId: id, ...player });
  });
  return list;
}

export async function connectMultiplayer({
  playerName,
  roomId = 'city',
  telegramAuth = null,
  onStatus,
  onPlayers,
  onFeed,
}) {
  // Persist options/callbacks so reconnectMultiplayer() can reuse them.
  _reconnectOptions = { playerName, roomId, telegramAuth, onStatus, onPlayers, onFeed };

  // Use explicit wss:// so the transport protocol is unambiguous.
  // Normalise any https:// value from the runtime config to wss://.
  const rawEndpoint = window.BLOCK_TOPIA_SERVER || 'wss://game.cryptomoonboys.com';
  const endpoint = rawEndpoint.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
  let lastError = null;
  _cityUnavailable = false;

  console.log(`[BlockTopia] Multiplayer init - endpoint: ${endpoint} | room: "${roomId}"`);

  if (!window.Colyseus) {
    console.error('[BlockTopia] Colyseus client library not loaded - multiplayer unavailable.');
    onStatus?.({ ws: 'failed', joined: false, error: 'Colyseus not loaded', roomId });
    return null;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      onStatus?.({ ws: 'connecting', joined: false, error: '', roomId });
      console.log(`[BlockTopia] Connecting (attempt ${attempt}/${MAX_RETRIES}) -> ${endpoint} room "${roomId}"`);
      client = new window.Colyseus.Client(endpoint);
      room = await joinCityOnly(client, roomId, { name: playerName, telegram_auth: telegramAuth });

      onStatus?.({ ws: 'connected', joined: true, error: '', roomId: room.name || roomId, sessionId: room.sessionId || '' });
      onFeed?.(`Connected to ${room.name || roomId} (${room.sessionId || 'session pending'})`);
      console.log(`[BlockTopia] Joined room "${room.name || roomId}" session=${room.sessionId}`);

      // Handle unexpected server-side disconnect after a successful join.
      // Each room object is independent: this handler is bound to the specific room instance
      // returned by joinCityOnly and will not accumulate across retry attempts.
      const capturedRoomRef = room;
      const joinedRoomName = room.name || roomId;
      room.onLeave((code) => {
        // Only act if this is still the active room (not already replaced by a reconnect).
        if (room === capturedRoomRef) {
          room = null;
        }
        console.error(`[BlockTopia] Disconnected from room "${joinedRoomName}" (code: ${code})`);
        onStatus?.({ ws: 'disconnected', joined: false, error: `Disconnected (code: ${code})`, roomId: joinedRoomName });
        onFeed?.(`Multiplayer connection lost (code: ${code})`);
        // Begin a silent background reconnect attempt.
        _scheduleReconnect();
      });

      room.onStateChange((state) => {
        // No throttle for the skeleton — propagate every server state change so
        // the client position stays in sync with the authoritative server state.
        const players = toPlayerList(state.players);
        onPlayers?.(players);
      });

      room.onMessage('system', (message) => {
        onFeed?.(`System: ${message?.message || 'System update'}`);
      });

      return room;
    } catch (error) {
      lastError = error;
      const gateReason = getEntryGateReason(error);
      if (gateReason) {
        const gateMessage = toEntryGateMessage(gateReason);
        onStatus?.({ ws: 'blocked', joined: false, error: gateMessage, roomId, reason: gateReason });
        onFeed?.(gateMessage);
        return null;
      }
      const roomFull = isRoomFullError(error);
      const cityUnavailable = error?.isCityUnavailable === true;
      const wsState = roomFull ? 'room-full' : cityUnavailable ? 'unavailable' : 'failed';
      console.error(
        `[BlockTopia] Connection attempt ${attempt}/${MAX_RETRIES} failed (${wsState}):`,
        error?.message || error,
      );
      onStatus?.({ ws: wsState, joined: false, error: String(error?.message || error), roomId, roomFull });
      if (roomFull) {
        // Room is at capacity - do not retry.
        onFeed?.('Block Topia is full (2 players). Try again later.');
        console.warn('[BlockTopia] Room full - aborting further connection attempts.');
        return null;
      }
      if (cityUnavailable) {
        // Server room not bootstrapped - fail cleanly once, no retry, no reconnect loop.
        _cityUnavailable = true;
        onFeed?.('Live city unavailable - server room not bootstrapped.');
        console.warn('[BlockTopia] City unavailable - aborting connection attempts.');
        return null;
      }
      if (attempt < MAX_RETRIES) {
        await wait(2500);
      }
    }
  }

  console.error(`[BlockTopia] All ${MAX_RETRIES} connection attempts exhausted. endpoint=${endpoint} room="${roomId}" error:`, lastError?.message || lastError);
  onFeed?.(`Multiplayer unavailable: ${String(lastError?.message || lastError || 'unknown error')}`);
  onStatus?.({ ws: 'disconnected', joined: false, error: String(lastError?.message || lastError || 'unknown error'), roomId });
  return null;
}

/**
 * Returns true only when the room is fully open and ready for sends:
 * - room exists and has a sessionId (i.e. we completed the join handshake)
 * - the underlying WebSocket connection object exists and is in OPEN state (readyState === 1)
 */
function isRoomOpen() {
  if (!room || !room.sessionId) return false;
  const conn = room.connection;
  if (!conn) return false;
  // Colyseus client builds expose the browser socket through different shapes:
  // - room.connection.ws
  // - room.connection.transport.ws
  // - room.connection.transport.socket
  // - room.connection.socket / room.connection.websocket
  // - room.connection itself (older/minified builds with readyState)
  const wsCandidates = [
    conn.ws,
    conn.transport?.ws,
    conn.transport?.socket,
    conn.socket,
    conn.websocket,
    conn,
  ];
  const ws = wsCandidates.find((candidate) => (
    candidate
    && typeof candidate === 'object'
    && typeof candidate.readyState === 'number'
  ));
  if (!ws) return false;
  // WebSocket.OPEN === 1; use the constant when available, fall back to the literal
  // in environments where the global WebSocket may not be defined (e.g. unit-test VMs).
  const OPEN = (typeof WebSocket !== 'undefined' && WebSocket.OPEN) || 1;
  return ws.readyState === OPEN;
}

/** Returns true when the multiplayer room is open and ready for sends. */
export function isConnected() {
  return isRoomOpen();
}

/**
 * Throttled closed-room warning: logs at most once per CLOSED_ROOM_WARN_THROTTLE_MS per msgType.
 */
function warnClosedRoom(msgType) {
  const now = Date.now();
  if (!_closedRoomWarnAt[msgType] || now - _closedRoomWarnAt[msgType] >= CLOSED_ROOM_WARN_THROTTLE_MS) {
    console.warn('[BlockTopia] skipped send on closed room:', msgType);
    _closedRoomWarnAt[msgType] = now;
  }
}

export function sendMovement(x, y) {
  if (!isRoomOpen()) {
    warnClosedRoom('move');
    return false;
  }
  room.send('move', { x, y });
  return true;
}

export function getRoom() {
  return room;
}

/**
 * Schedule a silent background reconnect after a short delay.
 * Guards against concurrent reconnect attempts.
 */
function _scheduleReconnect() {
  if (_reconnecting || !_reconnectOptions) return;
  if (_cityUnavailable) {
    console.warn('[BlockTopia] _scheduleReconnect: city unavailable - not scheduling reconnect.');
    return;
  }
  _reconnecting = true;
  // Wait 2.5 s before trying - gives the server time to clean up the old session.
  setTimeout(() => {
    reconnectMultiplayer().finally(() => {
      _reconnecting = false;
    });
  }, 2500);
}

/**
 * Re-run connectMultiplayer using the options saved from the last successful call.
 * Silently no-ops if there are no saved options, if a reconnect is already in progress,
 * or if the room is already open.
 */
export async function reconnectMultiplayer() {
  if (!_reconnectOptions) {
    console.warn('[BlockTopia] reconnectMultiplayer: no saved connection options - ignoring.');
    return null;
  }
  if (isRoomOpen()) {
    // Already connected - nothing to do.
    return null;
  }
  if (_isConnecting) {
    // A reconnect attempt is already in flight (from _scheduleReconnect or another caller).
    console.log('[BlockTopia] reconnectMultiplayer: reconnect already in progress - ignoring duplicate call.');
    return null;
  }
  _isConnecting = true;
  console.log('[BlockTopia] reconnectMultiplayer: attempting silent reconnect...');
  try {
    return await connectMultiplayer(_reconnectOptions);
  } finally {
    _isConnecting = false;
  }
}
