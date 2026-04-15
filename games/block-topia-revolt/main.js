const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const popup = document.getElementById('sam-popup');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const TILE_W = 64;
const TILE_H = 32;
const MAP_SIZE = 20;

function toIso(x, y) {
  return {
    x: (x - y) * (TILE_W / 2),
    y: (x + y) * (TILE_H / 2)
  };
}

function drawTile(x, y) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + TILE_W / 2, y + TILE_H / 2);
  ctx.lineTo(x, y + TILE_H);
  ctx.lineTo(x - TILE_W / 2, y + TILE_H / 2);
  ctx.closePath();
  ctx.fillStyle = '#1f6f50';
  ctx.fill();
  ctx.strokeStyle = '#0b0f1a';
  ctx.stroke();
}

function drawMap() {
  ctx.fillStyle = '#0b0f1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const originX = canvas.width / 2;
  const originY = 120;

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const iso = toIso(x, y);
      drawTile(originX + iso.x, originY + iso.y);
    }
  }
}

function showSamSignal(message) {
  popup.textContent = message;
  popup.classList.remove('hidden');
  setTimeout(() => popup.classList.add('hidden'), 5000);
}

// Demo SAM Signal Rush event every 30 seconds
setInterval(() => {
  showSamSignal('SAM SIGNAL RUSH: First 5 players to reach the Central Plaza earn XP!');
}, 30000);

function gameLoop() {
  drawMap();
  requestAnimationFrame(gameLoop);
}

gameLoop();