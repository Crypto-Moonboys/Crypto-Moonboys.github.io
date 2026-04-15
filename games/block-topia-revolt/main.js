import { connectMultiplayer, sendMovement } from './network.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const popup = document.getElementById('sam-popup');
const statusEl = document.getElementById('status');
const questList = document.getElementById('quest-list');
const eventLog = document.getElementById('event-log');

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

const player = { x: 10, y: 10, speed: 0.12, color: '#ff4fd8', radius: 10 };

window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

function toIso(x, y) {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) };
}

function worldToScreen(x, y) {
  const iso = toIso(x, y);
  return {
    x: canvas.width / 2 + iso.x - camera.x,
    y: ORIGIN_Y + iso.y - camera.y,
  };
}

function showSignal(msg) {
  popup.textContent = msg;
  popup.classList.remove('hidden');
  setTimeout(() => popup.classList.add('hidden'), 3000);

  const line = document.createElement('div');
  line.className = 'feed-line';
  line.textContent = msg;
  eventLog.prepend(line);
}

function updateRemotePlayers(players) {
  players.forEach((p, id) => {
    if (room && id === room.sessionId) return;
    remotePlayers.set(id, { x: p.x, y: p.y, name: p.name, xp: p.xp });
  });
}

function updatePlayer() {
  if (keys.w || keys.arrowup) player.y -= player.speed;
  if (keys.s || keys.arrowdown) player.y += player.speed;
  if (keys.a || keys.arrowleft) player.x -= player.speed;
  if (keys.d || keys.arrowright) player.x += player.speed;

  player.x = Math.max(0, Math.min(MAP_SIZE - 1, player.x));
  player.y = Math.max(0, Math.min(MAP_SIZE - 1, player.y));

  sendMovement(player.x, player.y);
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
  remotePlayers.forEach((p) => {
    const pos = worldToScreen(p.x, p.y);
    ctx.beginPath();
    ctx.fillStyle = '#00e5ff';
    ctx.arc(pos.x, pos.y - 12, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(p.name, pos.x, pos.y - 26);
  });
}

function gameLoop() {
  updatePlayer();
  camera.x = toIso(player.x, player.y).x;
  camera.y = toIso(player.x, player.y).y;
  drawMap();
  drawPlayer();
  drawRemote();
  requestAnimationFrame(gameLoop);
}

connectMultiplayer(showSignal, updateRemotePlayers);
gameLoop();
