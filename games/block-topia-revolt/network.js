// Multiplayer networking for Block Topia
export let room = null;
export let client = null;

export async function connectMultiplayer(showSignal, onPlayersUpdate) {
  try {
    const endpoint = window.BLOCK_TOPIA_SERVER || 'wss://your-domain.com';
    client = new window.Colyseus.Client(endpoint);

    room = await client.joinOrCreate('city', {
      name: `Rebel_${Math.floor(Math.random() * 9999)}`
    });

    showSignal('Connected to Block Topia server');

    room.onStateChange((state) => {
      onPlayersUpdate(state.players);
    });

    room.onMessage('districtChanged', (data) => {
      showSignal(`🏙️ ${data.playerId} entered ${data.districtName}`);
    });

    room.onMessage('questCompleted', (data) => {
      showSignal(`✅ ${data.title} (+${data.rewardXp} XP)`);
    });

    room.onMessage('system', (data) => {
      showSignal(`📢 ${data.message}`);
    });

  } catch (err) {
    console.error('Multiplayer connection failed', err);
    showSignal('⚠️ Multiplayer server unavailable');
  }
}

export function sendMovement(x, y) {
  if (room) {
    room.send('move', { x, y });
  }
}
