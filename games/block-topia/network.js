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

// Join an existing server-created room only. Never creates a room from the browser.
// If the room does not exist (4211) a clean error with isCityUnavailable=true is thrown
// so the caller can fail fast without retrying or creating a fallback room.
async function joinCityOnly(colyseusClient, roomId, options) {
  console.log(`[BlockTopia] join attempt → room "${roomId}"`);
  try {
    const joined = await colyseusClient.join(roomId, options);
    console.log(`[BlockTopia] join succeeded → room "${joined.name || roomId}" session=${joined.sessionId}`);
    return joined;
  } catch (joinError) {
    if (isRoomNotFoundError(joinError)) {
      console.error(`[BlockTopia] Live city unavailable — server room not bootstrapped (code=${joinError?.code}).`);
      const err = new Error('Live city unavailable — server room not bootstrapped');
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
  if (typeof playersState.forEach === 'function') {
    playersState.forEach((player, id) => {
      list.push({ id, ...player });
    });
    return list;
  }
  Object.entries(playersState).forEach(([id, player]) => {
    list.push({ id, ...player });
  });
  return list;
}

export async function connectMultiplayer({
  playerName,
  roomId = 'city',
  roomIdentity,
  onStatus,
  onPlayers,
  onWorldSnapshot,
  onFeed,
  onQuestCompleted,
  onSamPhaseChanged,
  onDistrictCaptureChanged,
  onNodeInterferenceChanged,
  onDistrictControlStateChanged,
  onPlayerWarImpact,
  onDuelRequested,
  onDuelStarted,
  onDuelActionSubmitted,
  onDuelResolved,
  onDuelEnded,
  onOperationStarted,
  onOperationResult,
  onCovertState,
}) {
  // Persist options/callbacks so reconnectMultiplayer() can reuse them.
  _reconnectOptions = {
    playerName, roomId, roomIdentity,
    onStatus, onPlayers, onWorldSnapshot, onFeed, onQuestCompleted,
    onSamPhaseChanged, onDistrictCaptureChanged, onNodeInterferenceChanged,
    onDistrictControlStateChanged, onPlayerWarImpact,
    onDuelRequested, onDuelStarted, onDuelActionSubmitted, onDuelResolved, onDuelEnded,
    onOperationStarted, onOperationResult, onCovertState,
  };

  // Use explicit wss:// so the transport protocol is unambiguous.
  // Normalise any https:// value from the runtime config to wss://.
  const rawEndpoint = window.BLOCK_TOPIA_SERVER || 'wss://game.cryptomoonboys.com';
  const endpoint = rawEndpoint.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
  let lastError = null;
  _cityUnavailable = false;

  console.log(`[BlockTopia] Multiplayer init — endpoint: ${endpoint} | room: "${roomId}"`);

  if (!window.Colyseus) {
    console.error('[BlockTopia] Colyseus client library not loaded — multiplayer unavailable.');
    onStatus?.({ ws: 'failed', joined: false, error: 'Colyseus not loaded', roomId });
    return null;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      onStatus?.({ ws: 'connecting', joined: false, error: '', roomId });
      console.log(`[BlockTopia] Connecting (attempt ${attempt}/${MAX_RETRIES}) → ${endpoint} room "${roomId}"`);
      client = new window.Colyseus.Client(endpoint);
      room = await joinCityOnly(client, roomId, {
        name: playerName,
        faction: 'Liberators',
        district: roomIdentity?.districtId || 'neon-slums',
        roomIdentity,
      });

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
        onFeed?.(`⚠️ Multiplayer connection lost (code: ${code})`);
        // Begin a silent background reconnect attempt.
        _scheduleReconnect();
      });

      let lastUpdate = 0;
      room.onStateChange((state) => {
        const now = performance.now();
        // Throttle state fan-out to avoid per-frame UI churn on large player maps.
        if (now - lastUpdate < STATE_CHANGE_THROTTLE_MS) return;
        lastUpdate = now;
        onPlayers?.(toPlayerList(state.players));
      });

      room.onMessage('system', (message) => {
        onFeed?.(`📢 ${message?.message || 'System update'}`);
      });

      room.onMessage('districtChanged', (message) => {
        onFeed?.(`🏙️ ${message?.playerId || 'Player'} entered ${message?.districtName || 'district'}`);
      });

      // Carried forward from Block Topia Revolt: award XP and report quest completion
      // Server broadcasts { playerId, questId, title, rewardXp, totalXp } — forward questId so
      // the client quest system can match and remove the correct active quest by id.
      room.onMessage('questCompleted', (message) => {
        const questId  = message?.questId  || '';
        const title    = message?.title    || 'Quest';
        const rewardXp = message?.rewardXp || 0;
        onFeed?.(`✅ ${title} (+${rewardXp} XP)`);
        onQuestCompleted?.({ questId, title, rewardXp });
      });

      room.onMessage('samPhaseChanged', (message) => {
        const phaseIndex = Number(message?.phaseIndex);
        if (Number.isFinite(phaseIndex)) {
          onSamPhaseChanged?.({ phaseIndex });
        }
      });

      room.onMessage('districtCaptureChanged', (message) => {
        const districtId = message?.districtId || '';
        const control = Number(message?.control);
        const owner = message?.owner || message?.factionOwner || message?.faction || '';
        if (districtId) {
          onDistrictCaptureChanged?.({ districtId, control, owner });
        }
      });

      room.onMessage('worldSnapshot', (data) => {
        onWorldSnapshot?.(data);
      });

      room.onMessage('nodeInterferenceChanged', (message) => {
        onNodeInterferenceChanged?.(message);
      });
      room.onMessage('districtControlStateChanged', (message) => {
        onDistrictControlStateChanged?.(message);
      });
      room.onMessage('playerWarImpact', (message) => {
        onPlayerWarImpact?.(message);
      });

      room.onMessage('duelRequested', (message) => {
        onDuelRequested?.(message);
      });

      room.onMessage('duelStarted', (message) => {
        onDuelStarted?.(message);
      });

      room.onMessage('duelActionSubmitted', (message) => {
        onDuelActionSubmitted?.(message);
      });

      room.onMessage('duelResolved', (message) => {
        onDuelResolved?.(message);
      });

      room.onMessage('duelEnded', (message) => {
        onDuelEnded?.(message);
      });

      room.onMessage('operationStarted', (message) => {
        onOperationStarted?.(message);
      });

      room.onMessage('operationResult', (message) => {
        onOperationResult?.(message);
      });

      room.onMessage('covertState', (message) => {
        onCovertState?.(message);
      });

      return room;
    } catch (error) {
      lastError = error;
      const roomFull = isRoomFullError(error);
      const cityUnavailable = error?.isCityUnavailable === true;
      const wsState = roomFull ? 'room-full' : cityUnavailable ? 'unavailable' : 'failed';
      console.error(
        `[BlockTopia] Connection attempt ${attempt}/${MAX_RETRIES} failed (${wsState}):`,
        error?.message || error,
      );
      onStatus?.({ ws: wsState, joined: false, error: String(error?.message || error), roomId, roomFull });
      if (roomFull) {
        // Room is at capacity — do not retry.
        onFeed?.('⛔ Block Topia is full (100 players). Try again later.');
        console.warn('[BlockTopia] Room full — aborting further connection attempts.');
        return null;
      }
      if (cityUnavailable) {
        // Server room not bootstrapped — fail cleanly once, no retry, no reconnect loop.
        _cityUnavailable = true;
        onFeed?.('⚠️ Live city unavailable — server room not bootstrapped.');
        console.warn('[BlockTopia] City unavailable — aborting connection attempts.');
        return null;
      }
      if (attempt < MAX_RETRIES) {
        await wait(2500);
      }
    }
  }

  console.error(`[BlockTopia] All ${MAX_RETRIES} connection attempts exhausted. endpoint=${endpoint} room="${roomId}" error:`, lastError?.message || lastError);
  onFeed?.(`⚠️ Multiplayer unavailable: ${String(lastError?.message || lastError || 'unknown error')}`);
  // city_status_fix rule 1: signal the UI that all retries are exhausted — marks live city unavailable.
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
  // Colyseus v0.16 wraps the WebSocket in a Transport/Connection object whose
  // raw socket is exposed as conn.ws (or falls back to conn itself for older builds).
  const ws = conn.ws || conn;
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

export function sendNodeInterference(nodeId, intent = 'disrupt') {
  if (!nodeId) return { ok: false, reason: 'no-node-id' };
  if (!isRoomOpen()) {
    warnClosedRoom('nodeInterfere');
    return { ok: false, reason: 'closed-room' };
  }
  room.send('nodeInterfere', { nodeId, intent });
  return { ok: true };
}

export function getRoom() {
  return room;
}

export function sendWarAction(actionType, payload = {}) {
  if (!actionType) return false;
  if (!isRoomOpen()) {
    warnClosedRoom('warAction');
    return false;
  }
  room.send('warAction', {
    actionType,
    ...payload,
  });
  return true;
}

export function sendCovertPressureSync(reports = []) {
  if (!Array.isArray(reports) || !reports.length) return false;
  if (!isRoomOpen()) {
    warnClosedRoom('covertPressureSync');
    return false;
  }
  room.send('covertPressureSync', { reports });
  return true;
}

export function challengePlayer(targetPlayerId) {
  if (!targetPlayerId) return false;
  if (!isRoomOpen()) {
    warnClosedRoom('duelChallenge');
    return false;
  }
  room.send('duelChallenge', { targetPlayerId });
  return true;
}

export function acceptDuel(duelId) {
  if (!duelId) return false;
  if (!isRoomOpen()) {
    warnClosedRoom('duelAccept');
    return false;
  }
  room.send('duelAccept', { duelId });
  return true;
}

export function submitDuelAction(duelId, action) {
  if (!duelId || !action) return false;
  if (!isRoomOpen()) {
    warnClosedRoom('duelAction');
    return false;
  }
  room.send('duelAction', { duelId, action });
  return true;
}

/** sendDuelChallenge — spec-required alias of challengePlayer */
export function sendDuelChallenge(targetId) {
  return challengePlayer(targetId);
}

/** sendDuelAccept — spec-required alias of acceptDuel */
export function sendDuelAccept(duelId) {
  return acceptDuel(duelId);
}

/** sendDuelAction — spec-required alias of submitDuelAction */
export function sendDuelAction(duelId, action) {
  return submitDuelAction(duelId, action);
}

export function sendDeployOperative(nodeId) {
  if (!nodeId) return false;
  if (!isRoomOpen()) {
    warnClosedRoom('deployOperative');
    return false;
  }
  room.send('deployOperative', { nodeId });
  return true;
}

/**
 * Schedule a silent background reconnect after a short delay.
 * Guards against concurrent reconnect attempts.
 */
function _scheduleReconnect() {
  if (_reconnecting || !_reconnectOptions) return;
  if (_cityUnavailable) {
    console.warn('[BlockTopia] _scheduleReconnect: city unavailable — not scheduling reconnect.');
    return;
  }
  _reconnecting = true;
  // Wait 2.5 s before trying — gives the server time to clean up the old session.
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
    console.warn('[BlockTopia] reconnectMultiplayer: no saved connection options — ignoring.');
    return null;
  }
  if (isRoomOpen()) {
    // Already connected — nothing to do.
    return null;
  }
  if (_isConnecting) {
    // A reconnect attempt is already in flight (from _scheduleReconnect or another caller).
    console.log('[BlockTopia] reconnectMultiplayer: reconnect already in progress — ignoring duplicate call.');
    return null;
  }
  _isConnecting = true;
  console.log('[BlockTopia] reconnectMultiplayer: attempting silent reconnect…');
  try {
    return await connectMultiplayer(_reconnectOptions);
  } finally {
    _isConnecting = false;
  }
}
