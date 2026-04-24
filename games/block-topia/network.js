let room = null;
let client = null;
const STATE_CHANGE_THROTTLE_MS = 100;
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

// Join an existing room. If the room doesn't exist yet (first boot / server restart),
// create it. Never create a second room if the first is already full.
async function joinOrBootstrap(colyseusClient, roomId, options) {
  console.log(`[BlockTopia] join attempt → room "${roomId}"`);
  try {
    const joined = await colyseusClient.join(roomId, options);
    console.log(`[BlockTopia] join succeeded → room "${joined.name || roomId}" session=${joined.sessionId}`);
    return joined;
  } catch (joinError) {
    if (!isRoomNotFoundError(joinError)) {
      console.warn(`[BlockTopia] join failed (code=${joinError?.code}): ${joinError?.message || joinError}`);
      throw joinError;
    }
    // Room not yet created — bootstrap it once, then let subsequent clients join it.
    console.warn(`[BlockTopia] Room "${roomId}" not found (code=${joinError?.code}) — bootstrapping new room instance.`);
    const created = await colyseusClient.create(roomId, options);
    console.log(`[BlockTopia] create succeeded → room "${created.name || roomId}" session=${created.sessionId}`);
    return created;
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
  // Use explicit wss:// so the transport protocol is unambiguous.
  // Normalise any https:// value from the runtime config to wss://.
  const rawEndpoint = window.BLOCK_TOPIA_SERVER || 'wss://game.cryptomoonboys.com';
  const endpoint = rawEndpoint.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
  let lastError = null;

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
      room = await joinOrBootstrap(client, roomId, {
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
      // returned by joinOrBootstrap and will not accumulate across retry attempts.
      const joinedRoomName = room.name || roomId;
      room.onLeave((code) => {
        console.error(`[BlockTopia] Disconnected from room "${joinedRoomName}" (code: ${code})`);
        onStatus?.({ ws: 'disconnected', joined: false, error: `Disconnected (code: ${code})`, roomId: joinedRoomName });
        onFeed?.(`⚠️ Multiplayer connection lost (code: ${code})`);
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
      const wsState = roomFull ? 'room-full' : 'failed';
      console.error(
        `[BlockTopia] Connection attempt ${attempt}/${MAX_RETRIES} failed (${wsState}):`,
        error?.message || error,
      );
      onStatus?.({ ws: wsState, joined: false, error: String(error?.message || error), roomId, roomFull });
      if (roomFull) {
        // Room is at capacity — do not retry, and never create a second room.
        onFeed?.('⛔ Block Topia is full (100 players). Try again later.');
        console.warn('[BlockTopia] Room full — aborting further connection attempts.');
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

export function sendMovement(x, y) {
  if (!isRoomOpen()) {
    console.warn('[BlockTopia] skipped send on closed room:', 'move');
    return false;
  }
  room.send('move', { x, y });
  return true;
}

export function sendNodeInterference(nodeId, intent = 'disrupt') {
  if (!nodeId) return false;
  if (!isRoomOpen()) {
    console.warn('[BlockTopia] skipped send on closed room:', 'nodeInterfere');
    return false;
  }
  room.send('nodeInterfere', { nodeId, intent });
  return true;
}

export function getRoom() {
  return room;
}

export function sendWarAction(actionType, payload = {}) {
  if (!actionType) return false;
  if (!isRoomOpen()) {
    console.warn('[BlockTopia] skipped send on closed room:', 'warAction');
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
    console.warn('[BlockTopia] skipped send on closed room:', 'covertPressureSync');
    return false;
  }
  room.send('covertPressureSync', { reports });
  return true;
}

export function challengePlayer(targetPlayerId) {
  if (!targetPlayerId) return false;
  if (!isRoomOpen()) {
    console.warn('[BlockTopia] skipped send on closed room:', 'duelChallenge');
    return false;
  }
  room.send('duelChallenge', { targetPlayerId });
  return true;
}

export function acceptDuel(duelId) {
  if (!duelId) return false;
  if (!isRoomOpen()) {
    console.warn('[BlockTopia] skipped send on closed room:', 'duelAccept');
    return false;
  }
  room.send('duelAccept', { duelId });
  return true;
}

export function submitDuelAction(duelId, action) {
  if (!duelId || !action) return false;
  if (!isRoomOpen()) {
    console.warn('[BlockTopia] skipped send on closed room:', 'duelAction');
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
    console.warn('[BlockTopia] skipped send on closed room:', 'deployOperative');
    return false;
  }
  room.send('deployOperative', { nodeId });
  return true;
}
