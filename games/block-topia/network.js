let room = null;
let client = null;
const STATE_CHANGE_THROTTLE_MS = 100;
// Maximum connection attempts before giving up.
const MAX_RETRIES = 3;
// Colyseus error codes used for room-full and not-found detection.
const ERR_ROOM_FULL = 4215;
const ERR_ROOM_NOT_FOUND = 4212;

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
    || /not.?found|cannot find/i.test(String(error?.message || ''))
  );
}

// Join an existing room. If the room doesn't exist yet (first boot / server restart),
// create it. Never create a second room if the first is already full.
async function joinOrBootstrap(colyseusClient, roomId, options) {
  try {
    return await colyseusClient.join(roomId, options);
  } catch (joinError) {
    if (!isRoomNotFoundError(joinError)) throw joinError;
    // Room not yet created — bootstrap it once, then let subsequent clients join it.
    console.warn(`[BlockTopia] Room "${roomId}" not found — bootstrapping new room instance.`);
    return colyseusClient.create(roomId, options);
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
}) {
  // Use explicit wss:// so the transport protocol is unambiguous.
  const endpoint = window.BLOCK_TOPIA_SERVER || 'wss://game.cryptomoonboys.com';
  let lastError = null;

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
      room.onLeave((code) => {
        console.error(`[BlockTopia] Disconnected from room "${roomId}" (code: ${code})`);
        onStatus?.({ ws: 'disconnected', joined: false, error: `Disconnected (code: ${code})`, roomId });
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

  console.error('[BlockTopia] All connection attempts exhausted:', lastError?.message || lastError);
  onFeed?.(`⚠️ Multiplayer unavailable: ${String(lastError?.message || lastError || 'unknown error')}`);
  return null;
}

export function sendMovement(x, y) {
  if (!room) return;
  room.send('move', { x, y });
}

export function sendNodeInterference(nodeId, intent = 'disrupt') {
  if (!room || !nodeId) return;
  room.send('nodeInterfere', { nodeId, intent });
}

export function getRoom() {
  return room;
}

export function sendWarAction(actionType, payload = {}) {
  if (!room || !actionType) return;
  room.send('warAction', {
    actionType,
    ...payload,
  });
}

export function sendCovertPressureSync(reports = []) {
  if (!room || !Array.isArray(reports) || !reports.length) return;
  room.send('covertPressureSync', { reports });
}

export function challengePlayer(targetPlayerId) {
  if (!room || !targetPlayerId) return;
  room.send('duelChallenge', { targetPlayerId });
}

export function acceptDuel(duelId) {
  if (!room || !duelId) return;
  room.send('duelAccept', { duelId });
}

export function submitDuelAction(duelId, action) {
  if (!room || !duelId || !action) return;
  room.send('duelAction', { duelId, action });
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
