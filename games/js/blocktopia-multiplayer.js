const WS_URL = 'wss://blocktopia-realtime.yourdomain.workers.dev';

let socket;

export function connectMultiplayer(playerName, onUpdate) {
  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'join', player: playerName }));
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (onUpdate) onUpdate(data);
  };

  socket.onclose = () => {
    console.warn('Multiplayer connection closed. Reconnecting...');
    setTimeout(() => connectMultiplayer(playerName, onUpdate), 3000);
  };
}

export function sendPlayerUpdate(position) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'update', position }));
  }
}
