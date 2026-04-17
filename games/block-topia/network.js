let room = null;
let client = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
}) {
  const endpoint = window.BLOCK_TOPIA_SERVER || 'https://game.cryptomoonboys.com';
  const retries = 2;
  let lastError = null;

  if (!window.Colyseus) {
    onStatus?.({ ws: 'failed', joined: false, error: 'Colyseus not loaded', roomId });
    return null;
  }

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      onStatus?.({ ws: 'connecting', joined: false, error: '', roomId });
      client = new window.Colyseus.Client(endpoint);
      room = await client.joinOrCreate(roomId, {
        name: playerName,
        faction: 'Liberators',
        district: roomIdentity?.districtId || 'neon-slums',
        roomIdentity,
      });

      onStatus?.({ ws: 'connected', joined: true, error: '', roomId: room.name || roomId, sessionId: room.sessionId || '' });
      onFeed?.(`Connected to ${room.name || roomId} (${room.sessionId || 'session pending'})`);

      let lastUpdate = 0;
      room.onStateChange((state) => {
        const now = performance.now();
        if (now - lastUpdate < 100) return;
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

      return room;
    } catch (error) {
      lastError = error;
      onStatus?.({ ws: 'failed', joined: false, error: String(error?.message || error), roomId });
      if (attempt < retries) {
        await wait(2500);
      }
    }
  }

  onFeed?.(`⚠️ Multiplayer unavailable: ${String(lastError?.message || lastError || 'unknown error')}`);
  return null;
}

export function sendMovement(x, y) {
  if (!room) return;
  room.send('move', { x, y });
}

export function getRoom() {
  return room;
}
