import { connectMultiplayer, sendMovement } from './network.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const popup = document.getElementById('sam-popup');
const statusEl = document.getElementById('status');
const questList = document.getElementById('quest-list');
const eventLog = document.getElementById('event-log');

const debugState = {
  wsStatus: 'connecting',
  roomJoined: false,
  sessionId: '',
  lastError: ''
};

const debugPanel = document.createElement('div');
debugPanel.id = 'debug-overlay';
Object.assign(debugPanel.style, {
  position: 'fixed',
  bottom: '10px',
  left: '10px',
  zIndex: '1000',
  background: 'rgba(0,0,0,0.8)',
  color: '#9effc7',
  font: '12px/1.4 monospace',
  padding: '10px',
  border: '1px solid rgba(158,255,199,0.45)',
  borderRadius: '8px',
  minWidth: '260px',
  pointerEvents: 'none',
  whiteSpace: 'pre-line'
});
document.body.appendChild(debugPanel);

function renderDebugOverlay() {
  debugPanel.textContent = [
    `WebSocket: ${debugState.wsStatus}`,
    `Room joined: ${debugState.roomJoined ? 'yes' : 'no'}`,
    `Session ID: ${debugState.sessionId || '-'}`,
    `Last error: ${debugState.lastError || '-'}`
  ].join('\n');
}

function updateConnectionDebug(next) {
  Object.assign(debugState, next);
  renderDebugOverlay();

  if (statusEl) {
    if (debugState.wsStatus === 'connected') {
      statusEl.textContent = 'Connected to Block Topia multiplayer';
    } else if (debugState.wsStatus === 'failed' && debugState.lastError) {
      statusEl.textContent = 'Retrying multiplayer connection...';
    } else {
      statusEl.textContent = 'Connecting to city...';
    }
  }
}

renderDebugOverlay();

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const TILE_W = 64;
const TILE_H = 32;
const MAP_SIZE = 20;
const ORIGIN_Y = 120;

const camera = { x: 0, y: 0 };
const keys = Object.create(null);
const remotePlayers = new Map();

const player = {
  x: 10,
  y: 10,
  speed: 0.12,
  color: '#ff4fd8',
  radius: 10
};

window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
});

window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

function toIso(x, y) {
  return {
    x: (x - y) * (TILE_W / 2),
    y: (x + y) * (TILE_H / 2)
  };
}

function worldToScreen(x, y) {
  const iso = toIso(x, y);
  return {
    x: canvas.width / 2 + iso.x - camera.x,
    y: ORIGIN_Y + iso.y - camera.y
  };
}

function showSignal(msg) {
  if (popup) {
    popup.textContent = msg;
    popup.classList.remove('hidden');
    setTimeout(() => popup.classList.add('hidden'), 3000);
  }

  if (eventLog) {
    const line = document.createElement('div');
    line.className = 'feed-line';
    line.textContent = msg;
    eventLog.prepend(line);
  }
}

function updateRemotePlayers(players) {
  const seen = new Set();

  players.forEach((p, id) => {
    // ignore invalid entries
    if (!p) return;

    // ignore our own player by matching exact position + default name edge-case is handled by network layer
    // safest here is just keep all remote state and let server/network decide identity
    remotePlayers.set(id, {
      x: typeof p.x === 'number' ? p.x : 0,
      y: typeof p.y === 'number' ? p.y : 0,
      name: p.name || 'Player',
      xp: typeof p.xp === 'number' ? p.xp : 0
    });

    seen.add(id);
  });

  for (const id of remotePlayers.keys()) {
    if (!seen.has(id)) {
      remotePlayers.delete(id);
    }
  }
}

function updatePlayer() {
  let moved = false;

  if (keys.w || keys.arrowup) {
    player.y -= player.speed;
    moved = true;
  }
  if (keys.s || keys.arrowdown) {
    player.y += player.speed;
    moved = true;
  }
  if (keys.a || keys.arrowleft) {
    player.x -= player.speed;
    moved = true;
  }
  if (keys.d || keys.arrowright) {
    player.x += player.speed;
    moved = true;
  }

  player.x = Math.max(0, Math.min(MAP_SIZE - 1, player.x));
  player.y = Math.max(0, Math.min(MAP_SIZE - 1, player.y));

  if (moved) {
    sendMovement(player.x, player.y);
  }
}

function drawTile(x, y, fill = '#1f6f50') {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + TILE_W / 2, y + TILE_H / 2);
  ctx.lineTo(x, y + TILE_H);
  ctx.lineTo(x - TILE_W / 2, y + TILE_H / 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = '#0b0f1a';
  ctx.stroke();
}

function drawMap() {
  ctx.fillStyle = '#071022';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const pos = worldToScreen(x, y);
      drawTile(pos.x, pos.y);
    }
  }
}

function drawPlayer() {
  const pos = worldToScreen(player.x, player.y);

  ctx.beginPath();
  ctx.fillStyle = player.color;
  ctx.arc(pos.x, pos.y - 12, player.radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawRemote() {
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';

  remotePlayers.forEach((p) => {
    const pos = worldToScreen(p.x, p.y);

    ctx.beginPath();
    ctx.fillStyle = '#00e5ff';
    ctx.arc(pos.x, pos.y - 12, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(p.name, pos.x, pos.y - 26);
  });
}

function gameLoop() {
  updatePlayer();

  const iso = toIso(player.x, player.y);
  camera.x = iso.x;
  camera.y = iso.y;

  drawMap();
  drawPlayer();
  drawRemote();

  requestAnimationFrame(gameLoop);
}

if (statusEl) {
  statusEl.textContent = 'Connecting to city...';
}
if (questList) {
  questList.innerHTML = '<div class="quest-item">Booting live ops...</div>';
}

connectMultiplayer(showSignal, updateRemotePlayers, updateConnectionDebug).then((connected) => {
  if (!connected && statusEl) {
    statusEl.textContent = 'Multiplayer server unavailable';
  }
});
gameLoop();
