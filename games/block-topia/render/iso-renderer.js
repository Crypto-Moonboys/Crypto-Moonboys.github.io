const TILE_W = 72;
const TILE_H = 36;

// Faction/role colours for NPC dots
const ROLE_COLOR = {
  vendor:      '#ffd84d',
  fighter:     '#ff4fd8',
  'lore-keeper': '#c77dff',
  recruiter:   '#8dff6a',
  drifter:     '#a0b0c8',
  agent:       '#ff9b42',
  crowd:       'rgba(94,242,255,0.4)',
};

function toIso(col, row) {
  return {
    x: (col - row) * (TILE_W / 2),
    y: (col + row) * (TILE_H / 2),
  };
}

// Lighten/darken a hex color by a fraction (0 = original, 1 = white/black)
function tintColor(hex, nightFactor) {
  if (nightFactor <= 0) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = Math.round(r * (1 - nightFactor * 0.5));
  const ng = Math.round(g * (1 - nightFactor * 0.5));
  const nb = Math.round(b * (1 - nightFactor * 0.35) + 40 * nightFactor);
  return `rgb(${nr},${ng},${nb})`;
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

    const isNight   = state.phase === 'Night';
    const nightFactor = isNight ? 1 : 0;
    const originX   = canvas.width / 2 - state.camera.x;
    const originY   = 120 - state.camera.y;

    // Draw map tiles, color-shifted for district and night phase
    for (let row = 0; row < state.map.height; row += 1) {
      for (let col = 0; col < state.map.width; col += 1) {
        const district = state.districts.fromGrid(col, row);
        const baseColor = district?.color || '#1f2c4b';
        const fill = tintColor(baseColor, nightFactor);
        const iso = toIso(col, row);
        drawTile(originX + iso.x, originY + iso.y, fill);
      }
    }

    // Draw NPC entities (active + crowd)
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'center';
    const npcList = state.npc?.entities || [];
    for (const npc of npcList) {
      if (!npc || typeof npc.col !== 'number') continue;
      const iso = toIso(npc.col, npc.row);
      const sx = originX + iso.x;
      const sy = originY + iso.y - 6;
      const radius = npc.mode === 'active' ? 5 : 3;
      const color = ROLE_COLOR[npc.role] || ROLE_COLOR.crowd;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    // Draw remote players
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

    // Draw local player (on top of remote players)
    const playerIso = toIso(state.player.x, state.player.y);
    const px = originX + playerIso.x;
    const py = originY + playerIso.y - 14;
    ctx.beginPath();
    ctx.arc(px, py, 10, 0, Math.PI * 2);
    ctx.fillStyle = isNight ? '#ff9b42' : '#ff4fd8';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineWidth = 1;

    // Draw player name above dot
    ctx.fillStyle = '#eaf6ff';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText(state.player.name, px, py - 14);
  }

  return { render };
}
