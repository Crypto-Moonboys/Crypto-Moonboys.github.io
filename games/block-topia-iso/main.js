const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const TILE_W = 64;
const TILE_H = 32;
const MAP_W = 12;
const MAP_H = 12;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function toIso(x, y) {
  return {
    x: (x - y) * (TILE_W / 2),
    y: (x + y) * (TILE_H / 2),
  };
}

function drawTile(screenX, screenY, fill = '#1f6f50') {
  ctx.beginPath();
  ctx.moveTo(screenX, screenY);
  ctx.lineTo(screenX + TILE_W / 2, screenY + TILE_H / 2);
  ctx.lineTo(screenX, screenY + TILE_H);
  ctx.lineTo(screenX - TILE_W / 2, screenY + TILE_H / 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = '#0b0f1a';
  ctx.stroke();
}

function draw() {
  ctx.fillStyle = '#0b0f1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const originX = canvas.width / 2;
  const originY = 120;

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const iso = toIso(x, y);
      drawTile(originX + iso.x, originY + iso.y);
    }
  }

  ctx.fillStyle = '#22c55e';
  ctx.font = '28px Arial';
  ctx.fillText('Block Topia ISO', 40, 50);
}

draw();
