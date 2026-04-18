const TILE_W = 64;
const TILE_H = 32;
const HALF_TILE_W = TILE_W / 2;
const HALF_TILE_H = TILE_H / 2;
const NPC_FRAME_W = 32;
const NPC_FRAME_H = 48;
const NPC_FRAME_COUNT = 20;

const ZOOM_MIN = 0.82;
const ZOOM_MAX = 1.2;

const ROLE_STYLE = {
  vendor:       { color: '#ffd84d', factionRing: true },
  fighter:      { color: '#ff4fd8', factionRing: true },
  'lore-keeper':{ color: '#c77dff', factionRing: false },
  recruiter:    { color: '#8dff6a', factionRing: true },
  drifter:      { color: '#a0b0c8', factionRing: false },
  agent:        { color: '#ff9b42', factionRing: true },
  crowd:        { color: '#89a0ba', factionRing: false },
};

const FACTION_COLOR = {
  Liberators: '#5ef2ff',
  Wardens: '#ff9b42',
  Neutral: '#a0b0c8',
};

const DISTRICT_THEME = {
  'neon-slums': '#63f6ff',
  'signal-spire': '#ff7bcf',
  'crypto-core': '#ffd84d',
  'moonlit-underbelly': '#8dff6a',
  'revolt-plaza': '#5ef2ff',
};

const TILE_ASSETS = {
  water: '/games/block-topia/assets/tiles/water.svg',
  sand: '/games/block-topia/assets/tiles/sand.svg',
  pavement: '/games/block-topia/assets/tiles/pavement.svg',
  coastline: '/games/block-topia/assets/tiles/coastline-edge.svg',
  roadStraight: '/games/block-topia/assets/tiles/road-straight.svg',
  roadCorner: '/games/block-topia/assets/tiles/road-corner.svg',
  roadT: '/games/block-topia/assets/tiles/road-t.svg',
  roadCross: '/games/block-topia/assets/tiles/road-cross.svg',
  overlayNeon: '/games/block-topia/assets/tiles/district-overlay-neon.svg',
  overlayRevolt: '/games/block-topia/assets/tiles/district-overlay-revolt.svg',
};

const BUILDING_ASSETS = {
  shop: '/games/block-topia/assets/buildings/shop-small.svg',
  medium: '/games/block-topia/assets/buildings/medium-block.svg',
  tower: '/games/block-topia/assets/buildings/landmark-tower.svg',
  annex: '/games/block-topia/assets/buildings/tower-annex.svg',
  signBtc: '/games/block-topia/assets/buildings/crypto-sign-btc.svg',
  signWax: '/games/block-topia/assets/buildings/crypto-sign-wax.svg',
};

const PROP_ASSETS = {
  lamp: '/games/block-topia/assets/props/lamp.svg',
  sign: '/games/block-topia/assets/props/sign.svg',
  barrier: '/games/block-topia/assets/props/barrier.svg',
  bench: '/games/block-topia/assets/props/bench.svg',
  crate: '/games/block-topia/assets/props/crate.svg',
  graffiti: '/games/block-topia/assets/props/graffiti.svg',
  palm: '/games/block-topia/assets/props/palm.svg',
  smoke: '/games/block-topia/assets/props/smoke-puff.svg',
  bird: '/games/block-topia/assets/props/bird.svg',
};

const NPC_ASSETS = {
  player: '/games/block-topia/assets/npcs/player-base.svg',
  vendor: '/games/block-topia/assets/npcs/vendor.svg',
  fighter: '/games/block-topia/assets/npcs/fighter.svg',
  agent: '/games/block-topia/assets/npcs/agent.svg',
  recruiter: '/games/block-topia/assets/npcs/recruiter.svg',
  drifter: '/games/block-topia/assets/npcs/drifter.svg',
  crowd: '/games/block-topia/assets/npcs/crowd-citizen.svg',
  'lore-keeper': '/games/block-topia/assets/npcs/radio-tech.svg',
};

const ISLAND_CENTER_X = 9.5;
const ISLAND_CENTER_Y = 9.8;
const ISLAND_RADIUS_X = 8.4;
const ISLAND_RADIUS_Y = 7.5;

const SCENE_BUILDINGS = [
  { key: 'tower', col: 9, row: 8, w: 2, h: 2, yOffset: 296, drawW: 220, drawH: 360, smoke: true },
  { key: 'annex', col: 8, row: 10, w: 2, h: 2, yOffset: 146, drawW: 130, drawH: 176 },
  { key: 'annex', col: 11, row: 9, w: 2, h: 2, yOffset: 146, drawW: 130, drawH: 176 },
  { key: 'medium', col: 6, row: 8, w: 2, h: 2, yOffset: 130, drawW: 140, drawH: 150 },
  { key: 'medium', col: 12, row: 12, w: 2, h: 2, yOffset: 130, drawW: 140, drawH: 150 },
  { key: 'medium', col: 5, row: 12, w: 2, h: 2, yOffset: 130, drawW: 140, drawH: 150 },
  { key: 'shop', col: 4, row: 9, w: 2, h: 2, yOffset: 96, drawW: 118, drawH: 112 },
  { key: 'shop', col: 13, row: 8, w: 2, h: 2, yOffset: 96, drawW: 118, drawH: 112 },
  { key: 'shop', col: 14, row: 11, w: 2, h: 2, yOffset: 96, drawW: 118, drawH: 112 },
  { key: 'shop', col: 4, row: 13, w: 2, h: 2, yOffset: 96, drawW: 118, drawH: 112 },
  { key: 'signBtc', col: 6, row: 7, w: 1, h: 1, yOffset: 48, drawW: 68, drawH: 38 },
  { key: 'signWax', col: 13, row: 10, w: 1, h: 1, yOffset: 48, drawW: 68, drawH: 38 },
];

const STATIC_PROP_SPECS = [
  { type: 'lamp', col: 7, row: 9 }, { type: 'lamp', col: 8, row: 9 }, { type: 'lamp', col: 11, row: 9 }, { type: 'lamp', col: 12, row: 9 },
  { type: 'lamp', col: 8, row: 12 }, { type: 'lamp', col: 11, row: 12 }, { type: 'lamp', col: 6, row: 11 }, { type: 'lamp', col: 13, row: 11 },
  { type: 'sign', col: 5, row: 9 }, { type: 'sign', col: 14, row: 10 },
  { type: 'barrier', col: 8, row: 8, scale: 0.7 }, { type: 'barrier', col: 11, row: 11, scale: 0.7 },
  { type: 'bench', col: 7, row: 13, scale: 0.7 }, { type: 'bench', col: 12, row: 7, scale: 0.7 },
  { type: 'crate', col: 5, row: 10, scale: 0.65 }, { type: 'crate', col: 13, row: 12, scale: 0.65 }, { type: 'crate', col: 10, row: 6, scale: 0.65 },
  { type: 'graffiti', col: 6, row: 6, scale: 0.62 }, { type: 'graffiti', col: 14, row: 9, scale: 0.62 },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toIso(col, row) {
  return {
    x: (col - row) * HALF_TILE_W,
    y: (col + row) * HALF_TILE_H,
  };
}

function loadImage(path, imageRegistry) {
  if (!path || imageRegistry[path]) return;
  const img = new Image();
  img.src = path;
  imageRegistry[path] = img;
}

function deterministicNoise2D(x, y) {
  const value = Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function terrainDistance(col, row) {
  const dx = (col - ISLAND_CENTER_X) / ISLAND_RADIUS_X;
  const dy = (row - ISLAND_CENTER_Y) / ISLAND_RADIUS_Y;
  return Math.sqrt(dx * dx + dy * dy);
}

function classifyTerrain(col, row) {
  const dist = terrainDistance(col, row);
  if (dist > 1.12) return 'water';
  if (dist > 0.98) return 'coast';
  if (dist > 0.86) return 'sand';
  return 'land';
}

function isRoadCell(col, row) {
  const terrain = classifyTerrain(col, row);
  if (terrain === 'water' || terrain === 'coast') return false;
  const centralCross = Math.abs(col - 9.5) <= 0.5 || Math.abs(row - 9.5) <= 0.5;
  const innerRing = Math.abs((col - 9.5) + (row - 9.5)) <= 0.6 && Math.abs(col - row) > 2;
  const districtLane = (col === 6 && row >= 7 && row <= 13) || (row === 13 && col >= 7 && col <= 13);
  return centralCross || innerRing || districtLane;
}

function getRoadType(col, row) {
  const n = isRoadCell(col, row - 1);
  const s = isRoadCell(col, row + 1);
  const w = isRoadCell(col - 1, row);
  const e = isRoadCell(col + 1, row);
  const count = Number(n) + Number(s) + Number(w) + Number(e);

  if (count >= 4) return { key: 'roadCross', rotate: 0 };
  if (count === 3) {
    if (!n) return { key: 'roadT', rotate: Math.PI };
    if (!e) return { key: 'roadT', rotate: Math.PI / 2 };
    if (!s) return { key: 'roadT', rotate: 0 };
    return { key: 'roadT', rotate: -Math.PI / 2 };
  }
  if (count === 2) {
    if (n && s) return { key: 'roadStraight', rotate: 0 };
    if (w && e) return { key: 'roadStraight', rotate: Math.PI / 2 };
    if (n && e) return { key: 'roadCorner', rotate: 0 };
    if (e && s) return { key: 'roadCorner', rotate: Math.PI / 2 };
    if (s && w) return { key: 'roadCorner', rotate: Math.PI };
    return { key: 'roadCorner', rotate: -Math.PI / 2 };
  }
  return { key: 'roadStraight', rotate: 0 };
}

function getTileElevation(col, row) {
  const terrain = classifyTerrain(col, row);
  if (terrain === 'water') return 0;
  if (terrain === 'coast') return 1;
  if (terrain === 'sand') return 2;
  return 3 + Math.floor(deterministicNoise2D(col * 5, row * 7) * 2);
}

function getNpcSheet(role) {
  if (NPC_ASSETS[role]) return NPC_ASSETS[role];
  if (role === 'lore-keeper') return NPC_ASSETS['lore-keeper'];
  return NPC_ASSETS.drifter;
}

function getNpcFrame(entity, now, emphasis = false) {
  const t = Math.floor(now / 140) % 5;
  if (emphasis) return 10 + t;
  if (entity.mode === 'crowd') return 15 + t;
  if (entity.mode === 'active') return 5 + t;
  return t;
}

export function createIsoRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const imageRegistry = Object.create(null);
  let scenePropCache = null;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  window.addEventListener('resize', resize);
  resize();

  Object.values(TILE_ASSETS).forEach((path) => loadImage(path, imageRegistry));
  Object.values(BUILDING_ASSETS).forEach((path) => loadImage(path, imageRegistry));
  Object.values(PROP_ASSETS).forEach((path) => loadImage(path, imageRegistry));
  Object.values(NPC_ASSETS).forEach((path) => loadImage(path, imageRegistry));

  function drawIsoTile(path, x, y, elevation = 0, rotate = 0) {
    const img = imageRegistry[path];
    if (!img?.complete) return;
    ctx.save();
    ctx.translate(x, y - elevation);
    if (rotate) ctx.rotate(rotate);
    ctx.drawImage(img, -HALF_TILE_W, 0, TILE_W, TILE_H);
    ctx.restore();
  }

  function drawTileDepth(x, y, elevation) {
    if (elevation <= 0) return;
    const topY = y - elevation;

    ctx.beginPath();
    ctx.moveTo(x, topY + TILE_H);
    ctx.lineTo(x + HALF_TILE_W, topY + HALF_TILE_H);
    ctx.lineTo(x + HALF_TILE_W, y + HALF_TILE_H);
    ctx.lineTo(x, y + TILE_H);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x, topY + TILE_H);
    ctx.lineTo(x - HALF_TILE_W, topY + HALF_TILE_H);
    ctx.lineTo(x - HALF_TILE_W, y + HALF_TILE_H);
    ctx.lineTo(x, y + TILE_H);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fill();
  }

  function drawBackdrop(now, isNight) {
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.6);
    if (isNight) {
      sky.addColorStop(0, '#11081f');
      sky.addColorStop(0.6, '#28112e');
      sky.addColorStop(1, '#10203a');
    } else {
      sky.addColorStop(0, '#f57a2b');
      sky.addColorStop(0.55, '#f0a03f');
      sky.addColorStop(1, '#21639f');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const horizonY = Math.round(canvas.height * 0.23);
    ctx.fillStyle = 'rgba(34,22,39,0.72)';
    for (let i = 0; i < 14; i += 1) {
      const px = i * (canvas.width / 13);
      const peak = 26 + ((i % 3) * 16);
      ctx.beginPath();
      ctx.moveTo(px - 80, horizonY + 42);
      ctx.lineTo(px, horizonY - peak);
      ctx.lineTo(px + 80, horizonY + 42);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = '#3a2a33';
    ctx.fillRect(0, horizonY + 34, canvas.width, 68);
    ctx.fillStyle = '#f1852f';
    ctx.globalAlpha = isNight ? 0.35 : 0.55;
    ctx.fillRect(0, horizonY + 92, canvas.width, 5);
    ctx.globalAlpha = 1;

    const waveGrad = ctx.createLinearGradient(0, horizonY + 95, 0, canvas.height);
    waveGrad.addColorStop(0, '#205b90');
    waveGrad.addColorStop(1, '#07264b');
    ctx.fillStyle = waveGrad;
    ctx.fillRect(0, horizonY + 96, canvas.width, canvas.height - horizonY);

    const birdImage = imageRegistry[PROP_ASSETS.bird];
    if (birdImage?.complete) {
      for (let i = 0; i < 5; i += 1) {
        const phase = (now / 9000 + i * 0.17) % 1;
        const x = phase * (canvas.width + 120) - 60;
        const y = horizonY - 25 - Math.sin((now / 1000) + i) * 8 - i * 6;
        ctx.globalAlpha = 0.9;
        ctx.drawImage(birdImage, x, y, 36, 18);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawDistrictLabel(originX, originY, district) {
    if (!district?.grid) return;
    const cx = district.grid.col + district.grid.w / 2;
    const cy = district.grid.row + district.grid.h / 2;
    const iso = toIso(cx, cy);
    const accent = DISTRICT_THEME[district.id] || '#eaf6ff';

    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.font = '700 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(district.name.toUpperCase(), originX + iso.x + 1, originY + iso.y - 20 + 1);
    ctx.fillStyle = accent;
    ctx.fillText(district.name.toUpperCase(), originX + iso.x, originY + iso.y - 20);
  }

  function buildSceneProps(state) {
    if (scenePropCache && scenePropCache.w === state.map.width && scenePropCache.h === state.map.height) {
      return scenePropCache.items;
    }

    const items = [...STATIC_PROP_SPECS];
    for (let row = 0; row < state.map.height; row += 1) {
      for (let col = 0; col < state.map.width; col += 1) {
        const terrain = classifyTerrain(col, row);
        if (terrain === 'sand' && deterministicNoise2D(col * 7, row * 13) > 0.7) {
          items.push({ type: 'palm', col, row, scale: 0.5 });
        }
      }
    }

    scenePropCache = { w: state.map.width, h: state.map.height, items };
    return items;
  }

  function drawSceneProp(originX, originY, prop) {
    const path = PROP_ASSETS[prop.type];
    const img = imageRegistry[path];
    if (!img?.complete) return;

    const iso = toIso(prop.col, prop.row);
    const elevation = getTileElevation(prop.col, prop.row);
    const sx = originX + iso.x;
    const sy = originY + iso.y - elevation;
    const scale = prop.scale || 0.56;
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    ctx.drawImage(img, sx - drawW / 2, sy - drawH + 18, drawW, drawH);
  }

  function drawBuildings(originX, originY, now) {
    const sorted = [...SCENE_BUILDINGS].sort((a, b) => (a.row + a.h) - (b.row + b.h));

    for (const building of sorted) {
      const path = BUILDING_ASSETS[building.key];
      const img = imageRegistry[path];
      if (!img?.complete) continue;

      const anchorCol = building.col + (building.w / 2) - 0.5;
      const anchorRow = building.row + (building.h / 2) - 0.5;
      const iso = toIso(anchorCol, anchorRow);
      const elevation = getTileElevation(anchorCol, anchorRow);
      const baseX = originX + iso.x - building.drawW / 2;
      const baseY = originY + iso.y - building.yOffset - elevation;
      ctx.drawImage(img, baseX, baseY, building.drawW, building.drawH);

      if (building.smoke) {
        const puff = imageRegistry[PROP_ASSETS.smoke];
        if (puff?.complete) {
          for (let i = 0; i < 4; i += 1) {
            const offset = (now / 1800 + i * 0.22) % 1;
            const px = originX + iso.x + (i - 1.5) * 10;
            const py = baseY - offset * 68;
            const size = 20 + offset * 14;
            ctx.globalAlpha = 0.42 * (1 - offset);
            ctx.drawImage(puff, px - size / 2, py - size / 2, size, size);
          }
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  function drawNpcSprite(sx, sy, role, frame, scale = 1) {
    const sheetPath = getNpcSheet(role);
    const sheet = imageRegistry[sheetPath];
    if (!sheet?.complete) return;

    const safeFrame = clamp(frame, 0, NPC_FRAME_COUNT - 1);
    const drawW = NPC_FRAME_W * scale;
    const drawH = NPC_FRAME_H * scale;
    ctx.drawImage(
      sheet,
      safeFrame * NPC_FRAME_W,
      0,
      NPC_FRAME_W,
      NPC_FRAME_H,
      sx - drawW / 2,
      sy - drawH,
      drawW,
      drawH,
    );
  }

  function drawNpc(originX, originY, npc, now, isNearby) {
    const iso = toIso(npc.col, npc.row);
    const elevation = getTileElevation(npc.col, npc.row);
    const sx = originX + iso.x;
    const sy = originY + iso.y - elevation - 4;
    const style = ROLE_STYLE[npc.role] || ROLE_STYLE.crowd;

    ctx.globalAlpha = npc.mode === 'active' ? 0.35 : 0.16;
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.ellipse(sx, sy - 2, npc.mode === 'active' ? 11 : 8, npc.mode === 'active' ? 6 : 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    drawNpcSprite(sx, sy + 2, npc.role || 'drifter', getNpcFrame(npc, now, isNearby), npc.mode === 'active' ? 1.28 : 1.05);

    if (npc.mode === 'active' && style.factionRing && npc.faction) {
      ctx.fillStyle = FACTION_COLOR[npc.faction] || FACTION_COLOR.Neutral;
      ctx.beginPath();
      ctx.arc(sx, sy + 5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isNearby) {
      const pulse = 0.5 + (Math.sin(now / 220) + 1) * 0.2;
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(sx, sy - 2, 14, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (npc.mode === 'active') {
      ctx.font = '700 8px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(npc.roleLabel || npc.role || 'NPC', sx + 1, sy - 44 + 1);
      ctx.fillStyle = style.color;
      ctx.fillText(npc.roleLabel || npc.role || 'NPC', sx, sy - 44);
      if (isNearby) {
        ctx.fillStyle = '#ffffff';
        ctx.fillText(npc.name || 'Citizen', sx, sy - 54);
      }
    }
  }

  function drawRemotePlayer(originX, originY, remote, now) {
    const iso = toIso(remote.x, remote.y);
    const elevation = getTileElevation(remote.x, remote.y);
    const sx = originX + iso.x;
    const sy = originY + iso.y - elevation - 4;
    drawNpcSprite(sx, sy + 2, 'agent', getNpcFrame({ mode: 'active' }, now, false), 1.3);
    ctx.fillStyle = '#d7fbff';
    ctx.font = '600 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(remote.name || 'Player', sx, sy - 44);
  }

  function drawPlayer(originX, originY, state, now) {
    const iso = toIso(state.player.x, state.player.y);
    const elevation = getTileElevation(state.player.x, state.player.y);
    const sx = originX + iso.x;
    const sy = originY + iso.y - elevation - 4;

    ctx.globalAlpha = 0.34;
    ctx.fillStyle = '#ff9b42';
    ctx.beginPath();
    ctx.ellipse(sx, sy - 2, 13, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const movingFrame = Math.floor(now / 130) % 5;
    const frame = (state.player.nearbyNpcId ? 10 : 5) + movingFrame;
    drawNpcSprite(sx, sy + 2, 'player', frame, 1.38);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.player.name, sx, sy - 47);
  }

  function drawSignalOperation(originX, originY, operation, now) {
    const iso = toIso(operation.x, operation.y);
    const centerX = originX + iso.x;
    const centerY = originY + iso.y + 11;
    const radiusPx = clamp((operation.radius || 1.5) * HALF_TILE_H, 16, 54);
    const pulse = 0.7 + Math.sin(now / 350) * 0.3;

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = 'rgba(0,255,213,0.22)';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusPx, radiusPx * 0.54, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = 'rgba(0,255,213,0.92)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusPx * pulse, radiusPx * 0.54 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#eaffff';
    ctx.font = '700 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OP', centerX, centerY - 8);
    ctx.restore();
  }

  function drawOperationSuccess(originX, originY, pulse, now, pulseUntil) {
    if (!pulse || !Number.isFinite(pulse.x) || !Number.isFinite(pulse.y)) return;
    const iso = toIso(pulse.x, pulse.y);
    const centerX = originX + iso.x;
    const centerY = originY + iso.y + 10;
    const remaining = Math.max(0, (pulseUntil || now) - now);
    const t = clamp(1 - (remaining / 1300), 0, 1);
    const radiusPx = 20 + t * 18;
    const alpha = 0.62 * (1 - t);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(141,255,106,0.8)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusPx, radiusPx * 0.52, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function render(state) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = Date.now();
    const isNight = state.phase === 'Night';

    drawBackdrop(now, isNight);

    const samImpact = state.effects?.samImpactUntil > now;
    const shakeX = samImpact ? (Math.random() * 8 - 4) : 0;
    const shakeY = samImpact ? (Math.random() * 6 - 3) : 0;
    const zoom = clamp(state.camera?.zoom ?? 1, ZOOM_MIN, ZOOM_MAX);
    const originX = -state.camera.x;
    const originY = -state.camera.y;

    ctx.save();
    ctx.translate(canvas.width / 2 + shakeX, 140 + shakeY);
    ctx.scale(zoom, zoom);

    for (let row = 0; row < state.map.height; row += 1) {
      for (let col = 0; col < state.map.width; col += 1) {
        const iso = toIso(col, row);
        const x = originX + iso.x;
        const y = originY + iso.y;
        const terrain = classifyTerrain(col, row);
        const elevation = getTileElevation(col, row);

        drawTileDepth(x, y, elevation);

        if (terrain === 'water') {
          drawIsoTile(TILE_ASSETS.water, x, y, 0);
          continue;
        }

        if (isRoadCell(col, row)) {
          const road = getRoadType(col, row);
          drawIsoTile(TILE_ASSETS[road.key], x, y, elevation, road.rotate);
        } else if (terrain === 'sand' || terrain === 'coast') {
          drawIsoTile(TILE_ASSETS.sand, x, y, elevation);
        } else {
          drawIsoTile(TILE_ASSETS.pavement, x, y, elevation);
        }

        const district = state.districts.fromGrid(col, row);
        if (district?.id === 'signal-spire' && deterministicNoise2D(col, row) > 0.76) {
          drawIsoTile(TILE_ASSETS.overlayRevolt, x, y, elevation);
        }
        if (district?.id === 'revolt-plaza' && deterministicNoise2D(col * 3, row * 5) > 0.78) {
          drawIsoTile(TILE_ASSETS.overlayNeon, x, y, elevation);
        }
      }
    }

    for (let row = 0; row < state.map.height; row += 1) {
      for (let col = 0; col < state.map.width; col += 1) {
        const terrain = classifyTerrain(col, row);
        if (terrain !== 'sand' && terrain !== 'coast') continue;
        const iso = toIso(col, row);
        const x = originX + iso.x;
        const y = originY + iso.y;
        const elevation = getTileElevation(col, row);

        if (classifyTerrain(col, row - 1) === 'water') drawIsoTile(TILE_ASSETS.coastline, x, y, elevation, 0);
        if (classifyTerrain(col + 1, row) === 'water') drawIsoTile(TILE_ASSETS.coastline, x, y, elevation, Math.PI / 2);
        if (classifyTerrain(col, row + 1) === 'water') drawIsoTile(TILE_ASSETS.coastline, x, y, elevation, Math.PI);
        if (classifyTerrain(col - 1, row) === 'water') drawIsoTile(TILE_ASSETS.coastline, x, y, elevation, -Math.PI / 2);
      }
    }

    for (const prop of buildSceneProps(state)) {
      drawSceneProp(originX, originY, prop);
    }

    drawBuildings(originX, originY, now);

    for (const operation of state.signalOperations?.active || []) {
      if (!operation || operation.resolved) continue;
      drawSignalOperation(originX, originY, operation, now);
    }

    const layers = [];
    for (const npc of state.npc?.entities || []) {
      if (!npc || typeof npc.col !== 'number') continue;
      layers.push({ type: 'npc', y: npc.row, entity: npc });
    }
    for (const remote of state.remotePlayers || []) {
      if (typeof remote.x !== 'number' || typeof remote.y !== 'number') continue;
      layers.push({ type: 'remote', y: remote.y, entity: remote });
    }
    layers.push({ type: 'player', y: state.player.y, entity: state.player });
    layers.sort((a, b) => a.y - b.y);

    for (const layer of layers) {
      if (layer.type === 'npc') {
        drawNpc(originX, originY, layer.entity, now, state.player?.nearbyNpcId === layer.entity.id);
      } else if (layer.type === 'remote') {
        drawRemotePlayer(originX, originY, layer.entity, now);
      } else {
        drawPlayer(originX, originY, state, now);
      }
    }

    for (const districtState of state.districtState) {
      const district = state.districts.byId.get(districtState.id);
      drawDistrictLabel(originX, originY, district);
    }

    if (state.effects?.signalOperationPulseUntil > now) {
      drawOperationSuccess(originX, originY, state.effects.signalOperationPulse, now, state.effects.signalOperationPulseUntil);
    }

    ctx.restore();

    if (isNight) {
      ctx.fillStyle = 'rgba(8,3,20,0.38)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (samImpact) {
      ctx.fillStyle = 'rgba(255,79,216,0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  return { render };
}
