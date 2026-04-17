const TILE_W = 72;
const TILE_H = 36;
const PROP_SPAWN_THRESHOLD = 0.2;
const PROP_PREVIEW_OVERLAY_ALPHA = 0.08;
const PROP_PREVIEW_OVERLAY_W = 240;
const PROP_PREVIEW_OVERLAY_H = 120;
const PROP_PREVIEW_OVERLAY_OFFSET_X = -300;
const PROP_PREVIEW_OVERLAY_OFFSET_Y = 20;

const ROLE_STYLE = {
  vendor: { color: '#ffd84d', radius: 5, glow: 'rgba(255,216,77,0.45)' },
  fighter: { color: '#ff4fd8', radius: 6, glow: 'rgba(255,79,216,0.5)' },
  'lore-keeper': { color: '#c77dff', radius: 5.5, glow: 'rgba(199,125,255,0.46)' },
  recruiter: { color: '#8dff6a', radius: 5, glow: 'rgba(141,255,106,0.45)' },
  drifter: { color: '#a0b0c8', radius: 4.5, glow: 'rgba(160,176,200,0.35)' },
  agent: { color: '#ff9b42', radius: 5.5, glow: 'rgba(255,155,66,0.48)' },
  crowd: { color: 'rgba(94,242,255,0.45)', radius: 3, glow: 'rgba(94,242,255,0.2)' },
};

function toIso(col, row) {
  return {
    x: (col - row) * (TILE_W / 2),
    y: (col + row) * (TILE_H / 2),
  };
}

function tintColor(hex, nightFactor, variant = 0) {
  if (nightFactor <= 0) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = Math.round(r * (1 - nightFactor * 0.5) + variant * 8);
  const ng = Math.round(g * (1 - nightFactor * 0.5) + variant * 4);
  const nb = Math.round(b * (1 - nightFactor * 0.35) + 40 * nightFactor + variant * 9);
  return `rgb(${nr},${ng},${nb})`;
}

function deterministicNoise2D(x, y) {
  // Standard GLSL-inspired pseudo-random hash coefficients for deterministic variation.
  const value = Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function createIsoRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const districtLabelPulse = new Map();
  const imageRegistry = Object.create(null);
  let propCache = null;

  function loadImage(path) {
    if (!path || imageRegistry[path]) return;
    const img = new Image();
    img.src = path;
    imageRegistry[path] = img;
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  window.addEventListener('resize', resize);
  resize();

  loadImage('/games/assets/blocktopia/props/preview.svg');
  loadImage('/games/assets/blocktopia/buildings/preview.svg');
  loadImage('/games/assets/blocktopia-tiles.svg');
  loadImage('/games/assets/blocktopia-sprites.svg');

  function drawTile(screenX, screenY, fill, variant) {
    // variant is expected in [0,1], used for deterministic surface micro-variation.
    ctx.beginPath();
    ctx.moveTo(screenX, screenY);
    ctx.lineTo(screenX + TILE_W / 2, screenY + TILE_H / 2);
    ctx.lineTo(screenX, screenY + TILE_H);
    ctx.lineTo(screenX - TILE_W / 2, screenY + TILE_H / 2);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (variant > 0.72) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(screenX - TILE_W * 0.22, screenY + TILE_H * 0.57);
      ctx.lineTo(screenX + TILE_W * 0.2, screenY + TILE_H * 0.35);
      ctx.stroke();
    } else if (variant < 0.18) {
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.moveTo(screenX, screenY + TILE_H * 0.25);
      ctx.lineTo(screenX, screenY + TILE_H * 0.8);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(8,12,28,0.85)';
    ctx.stroke();
  }

  function drawProp(screenX, screenY, type, districtColor, nightFactor) {
    const anchorY = screenY + TILE_H * 0.3;
    if (type === 'crate') {
      ctx.fillStyle = `rgba(255, 155, 66, ${0.4 + (1 - nightFactor) * 0.2})`;
      ctx.fillRect(screenX - 6, anchorY - 8, 12, 10);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.strokeRect(screenX - 6, anchorY - 8, 12, 10);
      return;
    }
    if (type === 'terminal') {
      ctx.fillStyle = 'rgba(16,24,45,0.95)';
      ctx.fillRect(screenX - 5, anchorY - 12, 10, 14);
      ctx.fillStyle = 'rgba(94,242,255,0.8)';
      ctx.fillRect(screenX - 3, anchorY - 10, 6, 6);
      return;
    }
    if (type === 'graffiti') {
      ctx.fillStyle = districtColor;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(screenX - 6, anchorY + 4, 4, 0, Math.PI * 2);
      ctx.arc(screenX + 2, anchorY + 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    if (type === 'light') {
      ctx.fillStyle = '#eaf6ff';
      ctx.fillRect(screenX - 1, anchorY - 11, 2, 11);
      ctx.fillStyle = 'rgba(94,242,255,0.7)';
      ctx.beginPath();
      ctx.arc(screenX, anchorY - 11, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function getProps(state) {
    const districtSignature = state.districtState
      .map((d) => `${d.id}:${Math.round(d.control)}:${d.owner}`)
      .join('|');
    if (
      propCache
      && propCache.w === state.map.width
      && propCache.h === state.map.height
      && propCache.districtSignature === districtSignature
    ) {
      return propCache.items;
    }
    const items = [];
    const types = ['crate', 'terminal', 'graffiti', 'light'];
    for (let row = 0; row < state.map.height; row += 1) {
      for (let col = 0; col < state.map.width; col += 1) {
        const roll = deterministicNoise2D(col * 11, row * 7);
        if (roll > PROP_SPAWN_THRESHOLD) continue;
        items.push({
          col,
          row,
          type: types[Math.floor(deterministicNoise2D(col * 3, row * 5) * types.length)],
        });
      }
    }
    propCache = { w: state.map.width, h: state.map.height, districtSignature, items };
    return items;
  }

  function drawDistrictLabel(originX, originY, district) {
    if (!district?.grid) return;
    const cx = district.grid.col + district.grid.w / 2;
    const cy = district.grid.row + district.grid.h / 2;
    const iso = toIso(cx, cy);
    const pulse = districtLabelPulse.get(district.id) || 0;
    if (pulse > 0.01) districtLabelPulse.set(district.id, pulse * 0.94);
    ctx.save();
    ctx.globalAlpha = 0.17 + pulse * 0.5;
    ctx.fillStyle = '#eaf6ff';
    ctx.font = '700 14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(district.name.toUpperCase(), originX + iso.x, originY + iso.y + 7);
    ctx.restore();
  }

  function drawNpc(sx, sy, npc, isNearby) {
    const style = ROLE_STYLE[npc.role] || ROLE_STYLE.crowd;
    const r = npc.mode === 'active' ? style.radius : ROLE_STYLE.crowd.radius;

    // Soft glow halo for active NPCs
    if (npc.mode === 'active') {
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = style.glow;
      ctx.beginPath();
      ctx.arc(sx, sy, r + 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = style.color;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 1;

    switch (npc.role) {
      case 'fighter': {
        // Upward-pointing triangle — aggressive stance
        ctx.beginPath();
        ctx.moveTo(sx,         sy - r - 1);
        ctx.lineTo(sx + r + 1, sy + r);
        ctx.lineTo(sx - r - 1, sy + r);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'vendor': {
        // Rotated diamond — market stall
        ctx.beginPath();
        ctx.moveTo(sx,     sy - r);
        ctx.lineTo(sx + r, sy);
        ctx.lineTo(sx,     sy + r);
        ctx.lineTo(sx - r, sy);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'agent': {
        // Circle with orbit ring — wired courier
        ctx.beginPath();
        ctx.arc(sx, sy, r - 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(sx, sy, r + 2.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'recruiter': {
        // Cross/plus — outreach role
        const t = 1.3;
        ctx.fillRect(sx - t,     sy - r,  t * 2,    r * 2);
        ctx.fillRect(sx - r,     sy - t,  r * 2,    t * 2);
        break;
      }
      default: {
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }

    ctx.lineWidth = 1;

    // Proximity interaction ring
    if (isNearby) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(sx, sy, r + 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    }
  }

  function render(state) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const isNight   = state.phase === 'Night';
    const nightFactor = isNight ? 1 : 0;
    const now = Date.now();
    const samImpact = state.effects?.samImpactUntil > now;
    const shakeX = samImpact ? (Math.random() * 8 - 4) : 0;
    const shakeY = samImpact ? (Math.random() * 6 - 3) : 0;
    const originX   = canvas.width / 2 - state.camera.x + shakeX;
    const originY   = 120 - state.camera.y + shakeY;

    // Street Signal feature reintroduced: denser district visuals + tile variation.
    for (let row = 0; row < state.map.height; row += 1) {
      for (let col = 0; col < state.map.width; col += 1) {
        const district = state.districts.fromGrid(col, row);
        const baseColor = district?.color || '#1f2c4b';
        const variant = deterministicNoise2D(col, row);
        const fill = tintColor(baseColor, nightFactor, variant - 0.5);
        const iso = toIso(col, row);
        drawTile(originX + iso.x, originY + iso.y, fill, variant);
      }
    }

    for (const prop of getProps(state)) {
      const district = state.districts.fromGrid(prop.col, prop.row);
      const iso = toIso(prop.col, prop.row);
      drawProp(originX + iso.x, originY + iso.y, prop.type, district?.color || '#5ef2ff', nightFactor);
    }

    const spritePreview = imageRegistry['/games/assets/blocktopia/props/preview.svg'];
    if (spritePreview?.complete) {
      // Street Signal prop-pack stamp for district ambience using existing legacy assets.
      ctx.globalAlpha = PROP_PREVIEW_OVERLAY_ALPHA;
      ctx.drawImage(
        spritePreview,
        originX + PROP_PREVIEW_OVERLAY_OFFSET_X,
        originY + PROP_PREVIEW_OVERLAY_OFFSET_Y,
        PROP_PREVIEW_OVERLAY_W,
        PROP_PREVIEW_OVERLAY_H,
      );
      ctx.globalAlpha = 1;
    }

    for (const districtState of state.districtState) {
      const district = state.districts.byId.get(districtState.id);
      drawDistrictLabel(originX, originY, district);
      if (state.effects?.districtPulseId === districtState.id && state.effects?.districtPulseUntil > now) {
        districtLabelPulse.set(districtState.id, 1);
      }
    }

    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'center';
    const npcList = state.npc?.entities || [];
    for (const npc of npcList) {
      if (!npc || typeof npc.col !== 'number') continue;
      const iso = toIso(npc.col, npc.row);
      const sx = originX + iso.x;
      const bobOffset = Math.sin(npc.bobPhase || 0) * (npc.mode === 'active' ? 1.7 : 0.8);
      const sy = originY + iso.y - 6 - bobOffset;
      drawNpc(sx, sy, npc, state.player?.nearbyNpcId === npc.id);
    }

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

    const playerIso = toIso(state.player.x, state.player.y);
    const px = originX + playerIso.x;
    const py = originY + playerIso.y - 14;

    // Player glow aura
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = isNight ? 'rgba(255, 155, 66, 0.7)' : 'rgba(255, 79, 216, 0.6)';
    ctx.beginPath();
    ctx.arc(px, py, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fillStyle = isNight ? '#ff9b42' : '#ff4fd8';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;

    ctx.fillStyle = '#eaf6ff';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText(state.player.name, px, py - 14);

    if (isNight) {
      ctx.fillStyle = 'rgba(10, 4, 24, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (samImpact) {
      ctx.fillStyle = 'rgba(255, 79, 216, 0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  return { render };
}
