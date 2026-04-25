import { connectMultiplayer, sendMovement } from './network.js';
import { loadUnifiedData } from './world/data-loader.js';

const canvas = document.getElementById('world-canvas');
const ctx = canvas.getContext('2d');

const hudPlayer = document.getElementById('player-name');
const hudRoom = document.getElementById('room-status');
const hudPopulation = document.getElementById('population-status');
const hudConnection = document.getElementById('hud-connection');
const statusLine = document.getElementById('status-line');
const errorBanner = document.getElementById('error-banner');

const input = Object.create(null);

const state = {
  map: { width: 20, height: 20, tile: 44 },
  roomId: 'city',
  maxPlayers: 2,
  player: {
    id: '',
    name: `Player_${Math.floor(Math.random() * 9000) + 1000}`,
    x: 6,
    y: 10,
    moveTarget: null,
  },
  opponents: [],
  connection: 'connecting',
  message: 'Starting Block Topia 2-player base...',
  tickAt: performance.now(),
};

function setMessage(text) {
  state.message = String(text || '').trim();
  statusLine.textContent = state.message;
}

function setError(text) {
  const line = String(text || '').trim();
  if (!line) {
    errorBanner.classList.add('hidden');
    errorBanner.textContent = '';
    return;
  }
  errorBanner.textContent = line;
  errorBanner.classList.remove('hidden');
}

function updateHud() {
  hudPlayer.textContent = `Player: ${state.player.name}`;
  hudRoom.textContent = `Room: ${state.roomId}`;
  hudPopulation.textContent = `Players: ${state.opponents.length + (state.player.id ? 1 : 0)} / ${state.maxPlayers}`;
  hudConnection.textContent = `Connection: ${state.connection}`;
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.floor(window.innerWidth * dpr);
  const height = Math.floor(window.innerHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function worldToScreen(x, y) {
  const tile = state.map.tile;
  return {
    x: 28 + x * tile,
    y: 86 + y * tile,
  };
}

function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left - 28) / state.map.tile;
  const y = (clientY - rect.top - 86) / state.map.tile;
  return {
    x: Math.max(0, Math.min(state.map.width - 1, x)),
    y: Math.max(0, Math.min(state.map.height - 1, y)),
  };
}

function drawGrid() {
  const tile = state.map.tile;
  const start = worldToScreen(0, 0);
  const width = state.map.width * tile;
  const height = state.map.height * tile;

  ctx.fillStyle = 'rgba(8, 12, 18, 0.7)';
  ctx.fillRect(start.x, start.y, width, height);

  ctx.strokeStyle = 'rgba(97, 124, 170, 0.3)';
  ctx.lineWidth = 1;

  for (let c = 0; c <= state.map.width; c += 1) {
    const x = start.x + c * tile;
    ctx.beginPath();
    ctx.moveTo(x, start.y);
    ctx.lineTo(x, start.y + height);
    ctx.stroke();
  }

  for (let r = 0; r <= state.map.height; r += 1) {
    const y = start.y + r * tile;
    ctx.beginPath();
    ctx.moveTo(start.x, y);
    ctx.lineTo(start.x + width, y);
    ctx.stroke();
  }
}

function drawPlayer(x, y, color, label) {
  const p = worldToScreen(x, y);
  const cx = p.x + state.map.tile * 0.5;
  const cy = p.y + state.map.tile * 0.5;

  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(cx, cy, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (label) {
    ctx.fillStyle = '#ecf4ff';
    ctx.font = '700 11px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy - 16);
  }
}

function render() {
  resizeCanvas();

  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  drawGrid();

  drawPlayer(state.player.x, state.player.y, '#61c2ff', 'YOU');

  for (const opponent of state.opponents) {
    drawPlayer(opponent.x, opponent.y, '#ff8c6b', 'OPPONENT');
  }

  requestAnimationFrame(render);
}

function tickMovement() {
  const now = performance.now();
  const dt = Math.min((now - state.tickAt) / 1000, 0.05);
  state.tickAt = now;

  let moved = false;
  const speed = 3.2;

  if (input.w || input.arrowup) {
    state.player.y -= speed * dt;
    moved = true;
  }
  if (input.s || input.arrowdown) {
    state.player.y += speed * dt;
    moved = true;
  }
  if (input.a || input.arrowleft) {
    state.player.x -= speed * dt;
    moved = true;
  }
  if (input.d || input.arrowright) {
    state.player.x += speed * dt;
    moved = true;
  }

  const target = state.player.moveTarget;
  if (!moved && target) {
    const dx = target.x - state.player.x;
    const dy = target.y - state.player.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0.04) {
      state.player.moveTarget = null;
    } else {
      const step = speed * dt;
      const ratio = Math.min(1, step / dist);
      state.player.x += dx * ratio;
      state.player.y += dy * ratio;
      moved = true;
    }
  }

  state.player.x = Math.max(0, Math.min(state.map.width - 1, state.player.x));
  state.player.y = Math.max(0, Math.min(state.map.height - 1, state.player.y));

  if (moved) {
    sendMovement(state.player.x, state.player.y);
  }

  setTimeout(tickMovement, 50);
}

function bindInput() {
  window.addEventListener('keydown', (event) => {
    input[event.key.toLowerCase()] = true;
  });

  window.addEventListener('keyup', (event) => {
    input[event.key.toLowerCase()] = false;
  });

  canvas.addEventListener('click', (event) => {
    const target = screenToWorld(event.clientX, event.clientY);
    state.player.moveTarget = target;
  });
}

async function boot() {
  const bundle = await loadUnifiedData();
  state.maxPlayers = Number(bundle?.roomModel?.maxPlayers) || 2;
  state.roomId = String(bundle?.roomModel?.id || 'city');
  state.map.width = Number(bundle?.districts?.mapWidth) || 20;
  state.map.height = Number(bundle?.districts?.mapHeight) || 20;

  updateHud();
  bindInput();
  tickMovement();
  render();

  await connectMultiplayer({
    playerName: state.player.name,
    roomId: state.roomId,
    onStatus: (status) => {
      if (status?.sessionId) state.player.id = String(status.sessionId);

      if (status?.joined) {
        state.connection = 'connected';
        setError('');
      } else {
        state.connection = String(status?.ws || 'disconnected');
      }

      if (status?.ws === 'room-full') {
        setError('Room is full. Block Topia is now limited to 2 players.');
      } else if (status?.ws === 'unavailable' || status?.ws === 'failed' || status?.ws === 'disconnected') {
        if (status?.error) setError(status.error);
      }

      updateHud();
    },
    onPlayers: (players) => {
      const list = Array.isArray(players) ? players : [];
      const local = list.find((player) => player.id === state.player.id);
      if (local) {
        state.player.x = Number.isFinite(local.x) ? local.x : state.player.x;
        state.player.y = Number.isFinite(local.y) ? local.y : state.player.y;
        state.player.name = local.name || state.player.name;
      }

      state.opponents = list
        .filter((player) => player.id !== state.player.id)
        .slice(0, 1)
        .map((player) => ({
          id: player.id,
          name: player.name || 'Opponent',
          x: Number(player.x) || 0,
          y: Number(player.y) || 0,
        }));

      updateHud();
    },
    onFeed: (message) => {
      if (message) setMessage(message);
    },
  });
}

boot().catch((error) => {
  setError(`Game boot failed: ${String(error?.message || error)}`);
  state.connection = 'error';
  updateHud();
});
