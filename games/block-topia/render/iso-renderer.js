const TILE_W = 72;
const TILE_H = 36;

function toIso(col, row) {
  return {
    x: (col - row) * (TILE_W / 2),
    y: (col + row) * (TILE_H / 2),
  };
}

export function createIsoRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  window.addEventListener('resize', resize);
  resize();

  function drawTile(screenX, screenY, fill) {
    ctx.beginPath();
    ctx.moveTo(screenX, screenY);
    ctx.lineTo(screenX + TILE_W / 2, screenY + TILE_H / 2);
    ctx.lineTo(screenX, screenY + TILE_H);
    ctx.lineTo(screenX - TILE_W / 2, screenY + TILE_H / 2);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(8,12,28,0.85)';
    ctx.stroke();
  }

  function render(state) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const originX = canvas.width / 2 - state.camera.x;
    const originY = 120 - state.camera.y;

    for (let row = 0; row < state.map.height; row += 1) {
      for (let col = 0; col < state.map.width; col += 1) {
        const district = state.districts.fromGrid(col, row);
        const iso = toIso(col, row);
        drawTile(originX + iso.x, originY + iso.y, district?.color || '#1f2c4b');
      }
    }

    const playerIso = toIso(state.player.x, state.player.y);
    ctx.beginPath();
    ctx.arc(originX + playerIso.x, originY + playerIso.y - 14, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#ff4fd8';
    ctx.fill();

    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';

    state.remotePlayers.forEach((remote) => {
      const iso = toIso(remote.x, remote.y);
      ctx.beginPath();
      ctx.arc(originX + iso.x, originY + iso.y - 14, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#5ef2ff';
      ctx.fill();
      ctx.fillStyle = '#eaf6ff';
      ctx.fillText(remote.name || 'Player', originX + iso.x, originY + iso.y - 26);
    });
  }

  return { render };
}
