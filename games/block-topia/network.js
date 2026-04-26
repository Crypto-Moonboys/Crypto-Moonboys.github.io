let room = null;
let client = null;
let _reconnectOptions = null;
let _reconnecting = false;
let _isConnecting = false;
const STATE_CHANGE_THROTTLE_MS = 100;
const CLOSED_ROOM_WARN_THROTTLE_MS = 3000;
const _closedRoomWarnAt = {};
const MAX_RETRIES = 3;
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

// Join or create the single city room. The server still enforces maxClients = 2.
// This avoids Colyseus v0.16 local/live mismatch where a pre-created room can exist
// server-side but client.join('city') still returns 4211/no rooms found.
async function joinCity(colyseusClient, roomId, options) {
  console.log(`[BlockTopia] joinOrCreate attempt → room "${roomId}"`);
  const joined = await colyseusClient.joinOrCreate(roomId, options);
  console.log(`[BlockTopia] joinOrCreate succeeded → room "${joined.name || roomId}" session=${joined.sessionId}`);
  return joined;
}

function toPlayerList(playersState) {
  const list = [];
  if (!playersState) return list;
  if (typeof playersState.forEach === 'function') {
    playersState.forEach((player, id) => {
      list.push({ id, sessionId: id, ...player });
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
  _reconnectOptions = {
    playerName, roomId, roomIdentity,
    onStatus, onPlayers, onWorldSnapshot, onFeed, onQuestCompleted,
    onSamPhaseChanged, onDistrictCaptureChanged, onNodeInterferenceChanged,
    onDistrictControlStateChanged, onPlayerWarImpact,
    onDuelRequested, onDuelStarted, onDuelActionSubmitted, onDuelResolved, onDuelEnded,
    onOperationStarted, onOperationResult, onCovertState,
  };

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
      room = await joinCity(client, roomId, {
        name: playerName,
        faction: 'Liberators',
        district: roomIdentity?.districtId || 'neon-slums',
        roomIdentity,
      });

      onStatus?.({ ws: 'connected', joined: true, error: '', roomId: room.name || roomId, sessionId: room.sessionId || '' });
      onFeed?.(`Connected to ${room.name || roomId} (${room.sessionId || 'session pending'})`);
      console.log(`[BlockTopia] Joined room "${room.name || roomId}" session=${room.sessionId}`);

      const capturedRoomRef = room;
      const joinedRoomName = room.name || roomId;
      room.onLeave((code) => {
        if (room === capturedRoomRef) {
          room = null;
        }
        console.error(`[BlockTopia] Disconnected from room "${joinedRoomName}" (code: ${code})`);
        onStatus?.({ ws: 'disconnected', joined: false, error: `Disconnected (code: ${code})`, roomId: joinedRoomName });
        onFeed?.(`⚠️ Multiplayer connection lost (code: ${code})`);
        _scheduleReconnect();
      });

      let lastUpdate = 0;
      room.onStateChange((state) => {
        const now = performance.now();
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

      room.onMessage('questCompleted', (message) => {
        const questId = message?.questId || '';
        const title = message?.title || 'Quest';
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

      room.onMessage('worldSnapshot', (data) => onWorldSnapshot?.(data));
      room.onMessage('nodeInterferenceChanged', (message) => onNodeInterferenceChanged?.(message));
      room.onMessage('districtControlStateChanged', (message) => onDistrictControlStateChanged?.(message));
      room.onMessage('playerWarImpact', (message) => onPlayerWarImpact?.(message));
      room.onMessage('duelRequested', (message) => onDuelRequested?.(message));
      room.onMessage('duelStarted', (message) => onDuelStarted?.(message));
      room.onMessage('duelActionSubmitted', (message) => onDuelActionSubmitted?.(message));
      room.onMessage('duelResolved', (message) => onDuelResolved?.(message));
      room.onMessage('duelEnded', (message) => onDuelEnded?.(message));
      room.onMessage('operationStarted', (message) => onOperationStarted?.(message));
      room.onMessage('operationResult', (message) => onOperationResult?.(message));
      room.onMessage('covertState', (message) => onCovertState?.(message));

      return room;
    } catch (error) {
      lastError = error;
      const roomFull = isRoomFullError(error);
      const wsState = roomFull ? 'room-full' : 'failed';
      console.error(`[BlockTopia] Connection attempt ${attempt}/${MAX_RETRIES} failed (${wsState}):`, error?.message || error);
      onStatus?.({ ws: wsState, joined: false, error: String(error?.message || error), roomId, roomFull });
      if (roomFull) {
        onFeed?.('⛔ Block Topia is full (2 players). Try again later.');
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
  onStatus?.({ ws: 'disconnected', joined: false, error: String(lastError?.message || lastError || 'unknown error'), roomId });
  return null;
}

function isRoomOpen() {
  if (!room || !room.sessionId) return false;
  const conn = room.connection;
  if (!conn) return false;
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
  const OPEN = (typeof WebSocket !== 'undefined' && WebSocket.OPEN) || 1;
  return ws.readyState === OPEN;
}

export function isConnected() {
  return isRoomOpen();
}

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
  room.send('warAction', { actionType, ...payload });
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

export function sendDuelChallenge(targetId) {
  return challengePlayer(targetId);
}

export function sendDuelAccept(duelId) {
  return acceptDuel(duelId);
}

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

function _scheduleReconnect() {
  if (_reconnecting || !_reconnectOptions) return;
  _reconnecting = true;
  setTimeout(() => {
    reconnectMultiplayer().finally(() => {
      _reconnecting = false;
    });
  }, 2500);
}

export async function reconnectMultiplayer() {
  if (!_reconnectOptions) {
    console.warn('[BlockTopia] reconnectMultiplayer: no saved connection options — ignoring.');
    return null;
  }
  if (isRoomOpen()) return null;
  if (_isConnecting) {
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
