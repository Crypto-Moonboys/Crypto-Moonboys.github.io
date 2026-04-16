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
  onFeed,
  onQuestCompleted,
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

      room.onStateChange((state) => {
        onPlayers?.(toPlayerList(state.players));
      });

      room.onMessage('system', (message) => {
        onFeed?.(`📢 ${message?.message || 'System update'}`);
      });

      room.onMessage('districtChanged', (message) => {
        onFeed?.(`🏙️ ${message?.playerId || 'Player'} entered ${message?.districtName || 'district'}`);
      });

      // Carried forward from Block Topia Revolt: award XP and report quest completion
      room.onMessage('questCompleted', (message) => {
        const title = message?.title || 'Quest';
        const rewardXp = message?.rewardXp || 0;
        onFeed?.(`✅ ${title} (+${rewardXp} XP)`);
        onQuestCompleted?.({ title, rewardXp });
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
