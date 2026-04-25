import { NETWORK_LINES } from '../world/network-lines.js';

const TILE_W = 64;
const TILE_H = 32;
const HALF_TILE_W = TILE_W / 2;
const HALF_TILE_H = TILE_H / 2;
const NPC_FRAME_W = 32;
const NPC_FRAME_H = 48;
const NPC_FRAME_COUNT = 20;

const ZOOM_MIN = 0.7;
const ZOOM_MAX = 1.4;
const CAMERA_BASELINE_Y = 140;
const HOVER_PULSE_PERIOD_MS = 260;
const TILE_PICK_TOLERANCE = 1.001;
const NPC_HITBOX_HALF_WIDTH = 15;
const NPC_HITBOX_HALF_HEIGHT = 25;
const CROWD_VISIBILITY_ZOOM_THRESHOLD = 1;
const CULL_MARGIN = 120;
const MAGENTA_OVERLAY_COLOR = 'rgba(255,79,216,0.16)';
const CONTROL_NODE_PICK_RADIUS_SQ = 22 * 22;
const UNSTABLE_FLICKER_BASE = 0.7;
const UNSTABLE_FLICKER_RATE = 60;
const UNSTABLE_FLICKER_AMPLITUDE = 0.45;
const UNSTABLE_PULSE_BASE = 0.95;
const UNSTABLE_PULSE_RATE = 240;
const UNSTABLE_PULSE_AMPLITUDE = 0.15;
const HALO_PULSE_RATE = 180;
const HALO_PULSE_AMPLITUDE = 0.22;
const DATA_PACKET_SPEED = 0.00018;
const SURFACE_SCAN_SPEED = 0.00011;
const NODE_SPARK_SPEED = 0.0018;
const DISTRICT_LABEL_FONT = '700 12px Inter, sans-serif';
const DISTRICT_LABEL_GLOW_FONT = '700 18px "Rajdhani", Inter, sans-serif';
const DISTRICT_STATE_STYLE = {
  secure: { fill: 'rgba(94,242,255,0.14)', stroke: 'rgba(94,242,255,0.66)' },
  contested: { fill: 'rgba(255,216,77,0.12)', stroke: 'rgba(255,216,77,0.6)' },
  unstable: { fill: 'rgba(255,126,79,0.14)', stroke: 'rgba(255,126,79,0.72)' },
  collapsing: { fill: 'rgba(255,79,216,0.18)', stroke: 'rgba(255,79,216,0.86)' },
  captured: { fill: 'rgba(141,255,106,0.14)', stroke: 'rgba(141,255,106,0.68)' },
};

const ROLE_STYLE = {
  vendor: { color: '#ffd84d', factionRing: true },
  fighter: { color: '#ff4fd8', factionRing: true },
  'lore-keeper': { color: '#c77dff', factionRing: false },
  recruiter: { color: '#8dff6a', factionRing: true },
  drifter: { color: '#a0b0c8', factionRing: false },
  agent: { color: '#ff9b42', factionRing: true },
  'sam-hunter': { color: '#7ae8ff', factionRing: false },
  crowd: { color: '#89a0ba', factionRing: false },
};

const FACTION_COLOR = {
  Liberators: '#5ef2ff',
  Wardens: '#ff9b42',
  Neutral: '#a0b0c8',
};

const DISTRICT_THEME = {
  'neon-slums': {
    color: '#63f6ff',
    accent: '#7dd8ff',
    label: 'NEON SLUMS',
    sublabel: 'Relay swarm / rogue street mesh',
    glyph: 'RLY',
  },
  'signal-spire': {
    color: '#ff7bcf',
    accent: '#d9a3ff',
    label: 'SIGNAL SPIRE',
    sublabel: 'AI observatory / surveillance towers',
    glyph: 'AI',
  },
  'crypto-core': {
    color: '#ffd84d',
    accent: '#ff9347',
    label: 'CRYPTO CORE',
    sublabel: 'Mining pressure / heat exchangers',
    glyph: 'BTC',
  },
  'moonlit-underbelly': {
    color: '#8dff6a',
    accent: '#73f7c8',
    label: 'MOONLIT UNDERBELLY',
    sublabel: 'Utility routes / covert support lattice',
    glyph: 'UTL',
  },
  'revolt-plaza': {
    color: '#5ef2ff',
    accent: '#ff6ca8',
    label: 'REVOLT PLAZA',
    sublabel: 'Control conflict / influence spikes',
    glyph: 'CTL',
  },
};

const DISTRICT_BOUNDARY_STYLE = {
  'neon-slums': { stroke: 'rgba(94,242,255,0.7)', fill: 'rgba(40,125,160,0.1)' },
  'signal-spire': { stroke: 'rgba(255,79,216,0.72)', fill: 'rgba(168,48,130,0.12)' },
  'crypto-core': { stroke: 'rgba(255,216,77,0.7)', fill: 'rgba(180,138,46,0.12)' },
  'moonlit-underbelly': { stroke: 'rgba(141,255,106,0.68)', fill: 'rgba(51,130,82,0.12)' },
  'revolt-plaza': { stroke: 'rgba(114,176,255,0.68)', fill: 'rgba(47,96,180,0.12)' },
};

const NODE_CLASS_THEME = {
  mining: { color: '#ff7b43', accent: '#ffd76d', label: 'BTC RIG', icon: '₿', size: 1.3 },
  ai: { color: '#6ce7ff', accent: '#d8f9ff', label: 'AI STACK', icon: 'AI', size: 1.32 },
  relay: { color: '#7dbbff', accent: '#cdf0ff', label: 'RELAY', icon: '↯', size: 1.05 },
  control: { color: '#ff5fd3', accent: '#ffd4f1', label: 'CONTROL', icon: '◎', size: 1.15 },
  hub: { color: '#c08dff', accent: '#efe0ff', label: 'HUB', icon: '◆', size: 1.24 },
  utility: { color: '#8dff6a', accent: '#defed5', label: 'UTILITY', icon: '⊙', size: 1 },
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
};

const NPC_ASSETS = {
  player: '/games/block-topia/assets/npcs/player-base.svg',
  vendor: '/games/block-topia/assets/npcs/vendor.svg',
  fighter: '/games/block-topia/assets/npcs/fighter.svg',
  agent: '/games/block-topia/assets/npcs/agent.svg',
  recruiter: '/games/block-topia/assets/npcs/recruiter.svg',
  drifter: '/games/block-topia/assets/npcs/drifter.svg',
  'sam-hunter': '/games/block-topia/assets/npcs/sam-hunter.svg',
  crowd: '/games/block-topia/assets/npcs/crowd-citizen.svg',
  'lore-keeper': '/games/block-topia/assets/npcs/radio-tech.svg',
};

const SCENE_BUILDING_TEMPLATE = [
  { key: 'tower', dCol: 0, dRow: -1, w: 2, h: 2, yOffset: 296, drawW: 220, drawH: 360 },
  { key: 'annex', dCol: -2, dRow: 2, w: 2, h: 2, yOffset: 146, drawW: 130, drawH: 176 },
  { key: 'annex', dCol: 2, dRow: 1, w: 2, h: 2, yOffset: 146, drawW: 130, drawH: 176 },
  { key: 'medium', dCol: -5, dRow: -1, w: 2, h: 2, yOffset: 130, drawW: 140, drawH: 150 },
  { key: 'medium', dCol: 4, dRow: 4, w: 2, h: 2, yOffset: 130, drawW: 140, drawH: 150 },
  { key: 'medium', dCol: -6, dRow: 4, w: 2, h: 2, yOffset: 130, drawW: 140, drawH: 150 },
  { key: 'shop', dCol: -8, dRow: 0, w: 2, h: 2, yOffset: 96, drawW: 118, drawH: 112 },
  { key: 'shop', dCol: 6, dRow: -1, w: 2, h: 2, yOffset: 96, drawW: 118, drawH: 112 },
  { key: 'shop', dCol: 8, dRow: 3, w: 2, h: 2, yOffset: 96, drawW: 118, drawH: 112 },
  { key: 'shop', dCol: -8, dRow: 5, w: 2, h: 2, yOffset: 96, drawW: 118, drawH: 112 },
  { key: 'signBtc', dCol: -5, dRow: -2, w: 1, h: 1, yOffset: 48, drawW: 68, drawH: 38 },
  { key: 'signWax', dCol: 6, dRow: 1, w: 1, h: 1, yOffset: 48, drawW: 68, drawH: 38 },
];

const STATIC_PROP_TEMPLATE = [
  { type: 'lamp', dCol: -3, dRow: 0 }, { type: 'lamp', dCol: -2, dRow: 0 }, { type: 'lamp', dCol: 1, dRow: 0 }, { type: 'lamp', dCol: 2, dRow: 0 },
  { type: 'lamp', dCol: -2, dRow: 3 }, { type: 'lamp', dCol: 1, dRow: 3 }, { type: 'lamp', dCol: -4, dRow: 2 }, { type: 'lamp', dCol: 3, dRow: 2 },
  { type: 'sign', dCol: -6, dRow: 0 }, { type: 'sign', dCol: 4, dRow: 1 },
  { type: 'barrier', dCol: -2, dRow: -1, scale: 0.7 }, { type: 'barrier', dCol: 1, dRow: 2, scale: 0.7 },
  { type: 'bench', dCol: -3, dRow: 4, scale: 0.7 }, { type: 'bench', dCol: 2, dRow: -2, scale: 0.7 },
  { type: 'crate', dCol: -6, dRow: 1, scale: 0.65 }, { type: 'crate', dCol: 3, dRow: 3, scale: 0.65 }, { type: 'crate', dCol: 0, dRow: -3, scale: 0.65 },
  { type: 'graffiti', dCol: -5, dRow: -3, scale: 0.62 }, { type: 'graffiti', dCol: 4, dRow: 0, scale: 0.62 },
];

const DISTRICT_SUPPORT_BUILDING_TEMPLATE = [
  { key: 'medium', dCol: 0, dRow: 0, w: 2, h: 2, yOffset: 138, drawW: 148, drawH: 162 },
  { key: 'shop', dCol: 2, dRow: 1, w: 2, h: 2, yOffset: 102, drawW: 112, drawH: 108 },
  { key: 'annex', dCol: -2, dRow: 2, w: 2, h: 2, yOffset: 132, drawW: 118, drawH: 160 },
  { key: 'tower', dCol: 1, dRow: -2, w: 2, h: 2, yOffset: 238, drawW: 164, drawH: 276 },
];

const DISTRICT_SUPPORT_PROP_RING = [
  { type: 'lamp', dCol: -2, dRow: -1, scale: 0.52 },
  { type: 'lamp', dCol: 2, dRow: -1, scale: 0.52 },
  { type: 'lamp', dCol: -2, dRow: 2, scale: 0.52 },
  { type: 'lamp', dCol: 2, dRow: 2, scale: 0.52 },
  { type: 'barrier', dCol: -3, dRow: 1, scale: 0.62 },
  { type: 'barrier', dCol: 3, dRow: 0, scale: 0.62 },
  { type: 'crate', dCol: -1, dRow: 3, scale: 0.58 },
  { type: 'crate', dCol: 1, dRow: -2, scale: 0.58 },
  { type: 'sign', dCol: 0, dRow: -3, scale: 0.56 },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function edgeKey(aId, bId) {
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

function toIso(col, row) {
  return {
    x: (col - row) * HALF_TILE_W,
    y: (col + row) * HALF_TILE_H,
  };
}

function fromIso(isoX, isoY) {
  return {
    col: (isoY / HALF_TILE_H + isoX / HALF_TILE_W) / 2,
    row: (isoY / HALF_TILE_H - isoX / HALF_TILE_W) / 2,
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

function applyGlow(targetCtx, color, blur, alpha = 1) {
  targetCtx.shadowColor = color;
  targetCtx.shadowBlur = blur;
  targetCtx.globalAlpha *= alpha;
}

function drawDiamondPath(targetCtx, x, y, width = HALF_TILE_W, height = HALF_TILE_H) {
  targetCtx.beginPath();
  targetCtx.moveTo(x, y);
  targetCtx.lineTo(x + width, y + height);
  targetCtx.lineTo(x, y + (height * 2));
  targetCtx.lineTo(x - width, y + height);
  targetCtx.closePath();
}

function getDistrictTheme(districtId) {
  return DISTRICT_THEME[districtId] || {
    color: '#5ef2ff',
    accent: '#d8f9ff',
    label: String(districtId || 'UNKNOWN').replace(/-/g, ' ').toUpperCase(),
    sublabel: 'surveillance corridor',
    glyph: 'NET',
  };
}

function getDistrictAt(state, col, row) {
  if (!state?.districts?.all?.length) return null;
  return state.districts.all.find((district) => (
    col >= district.grid.col
    && row >= district.grid.row
    && col < district.grid.col + district.grid.w
    && row < district.grid.row + district.grid.h
  )) || null;
}

function getNodeTheme(nodeClass) {
  const base = NODE_CLASS_THEME[nodeClass] || NODE_CLASS_THEME.utility;
  const defaults = {
    mining: { icon: 'BTC', size: 1.38, tower: 52, radius: 22, aura: 32 },
    ai: { icon: 'AI', size: 1.42, tower: 58, radius: 22, aura: 34 },
    relay: { icon: 'SIG', size: 1.08, tower: 46, radius: 18, aura: 28 },
    control: { icon: 'CTL', size: 1.22, tower: 50, radius: 20, aura: 30 },
    hub: { icon: 'HUB', size: 1.52, tower: 64, radius: 24, aura: 38 },
    utility: { icon: 'UTL', size: 1.02, tower: 40, radius: 16, aura: 24 },
  }[nodeClass] || { icon: 'NET', size: 1.08, tower: 46, radius: 18, aura: 28 };
  return { ...defaults, ...base };
}

function isAnchorNode(node) {
  return ['core', 'north', 'east', 'south', 'west'].includes(node?.id);
}

function canPlaceStructureCell(col, row, metrics) {
  const terrain = classifyTerrain(col, row, metrics);
  return terrain === 'land' && !isRoadCell(col, row, metrics);
}

function getSceneMetrics(state) {
  const width = Math.max(1, state?.map?.width || 48);
  const height = Math.max(1, state?.map?.height || 48);
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const radiusX = Math.max(8, width * 0.36);
  const radiusY = Math.max(8, height * 0.34);
  const roadHalfSpan = Math.max(4, Math.round(Math.min(width, height) * 0.16));
  const districtLaneOffset = Math.max(4, Math.round(width * 0.12));
  return {
    width,
    height,
    centerX,
    centerY,
    radiusX,
    radiusY,
    roadHalfSpan,
    districtLaneOffset,
    districtLaneMinRow: Math.floor(centerY - roadHalfSpan),
    districtLaneMaxRow: Math.ceil(centerY + roadHalfSpan),
    districtLaneMinCol: Math.floor(centerX - roadHalfSpan),
    districtLaneMaxCol: Math.ceil(centerX + roadHalfSpan),
  };
}

function terrainDistance(col, row, metrics) {
  const dx = (col - metrics.centerX) / metrics.radiusX;
  const dy = (row - metrics.centerY) / metrics.radiusY;
  return Math.sqrt(dx * dx + dy * dy);
}

function classifyTerrain(col, row, metrics) {
  const dist = terrainDistance(col, row, metrics);
  if (dist > 1.12) return 'water';
  if (dist > 0.98) return 'coast';
  if (dist > 0.86) return 'sand';
  return 'land';
}

function isRoadCell(col, row, metrics) {
  const terrain = classifyTerrain(col, row, metrics);
  if (terrain === 'water' || terrain === 'coast') return false;
  const centralCross = Math.abs(col - metrics.centerX) <= 0.5 || Math.abs(row - metrics.centerY) <= 0.5;
  const innerRing = Math.abs((col - metrics.centerX) + (row - metrics.centerY)) <= 0.6 && Math.abs(col - row) > 2;
  const verticalLane = col === Math.floor(metrics.centerX - metrics.districtLaneOffset)
    && row >= metrics.districtLaneMinRow
    && row <= metrics.districtLaneMaxRow;
  const horizontalLane = row === Math.floor(metrics.centerY + metrics.districtLaneOffset)
    && col >= metrics.districtLaneMinCol
    && col <= metrics.districtLaneMaxCol;
  return centralCross || innerRing || verticalLane || horizontalLane;
}

function getRoadType(col, row, metrics) {
  const n = isRoadCell(col, row - 1, metrics);
  const s = isRoadCell(col, row + 1, metrics);
  const w = isRoadCell(col - 1, row, metrics);
  const e = isRoadCell(col + 1, row, metrics);
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

function getTileElevation(col, row, metrics) {
  const terrain = classifyTerrain(col, row, metrics);
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

function createLayerCanvas(width, height) {
  const layer = document.createElement('canvas');
  layer.width = Math.max(1, Math.ceil(width));
  layer.height = Math.max(1, Math.ceil(height));
  return layer;
}

export function createIsoRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const imageRegistry = Object.create(null);
  const renderLayers = [];

  const layerState = {
    baseGrid: { canvas: null, width: 0, height: 0, dirty: true },
    roadBlocks: { canvas: null, dirty: true },
    worldObjects: { canvas: null, dirty: true },
    worldOffsetX: 0,
    worldOffsetY: 0,
    worldWidth: 0,
    worldHeight: 0,
    mapKey: '',
  };

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    layerState.baseGrid.dirty = true;
  }

  window.addEventListener('resize', resize);
  resize();

  Object.values(TILE_ASSETS).forEach((path) => loadImage(path, imageRegistry));
  Object.values(BUILDING_ASSETS).forEach((path) => loadImage(path, imageRegistry));
  Object.values(PROP_ASSETS).forEach((path) => loadImage(path, imageRegistry));
  Object.values(NPC_ASSETS).forEach((path) => loadImage(path, imageRegistry));

  function getCameraFrame(state) {
    if (!state.camera) {
      state.camera = { x: 0, y: 0, zoom: 1, zoomIndex: 1, panX: 0, panY: 0 };
    }
    const camera = state.camera;
    const zoom = clamp(camera.zoom ?? 1, ZOOM_MIN, ZOOM_MAX);
    const rawPanX = Number.isFinite(camera.panX) ? camera.panX : 0;
    const rawPanY = Number.isFinite(camera.panY) ? camera.panY : 0;
    const worldBounds = getWorldBounds(state);
    const viewportLeft = -((canvas.width / 2) / zoom);
    const viewportRight = ((canvas.width / 2) / zoom);
    const viewportTop = -(CAMERA_BASELINE_Y / zoom);
    const viewportBottom = ((canvas.height - CAMERA_BASELINE_Y) / zoom);
    const viewportWidth = viewportRight - viewportLeft;
    const viewportHeight = viewportBottom - viewportTop;

    const leftBoundWorldDrawX = viewportRight - worldBounds.width;
    const rightBoundWorldDrawX = viewportLeft;
    const topBoundWorldDrawY = viewportBottom - worldBounds.height;
    const bottomBoundWorldDrawY = viewportTop;

    let panX;
    if (worldBounds.width <= viewportWidth) {
      const centeredWorldDrawX = (viewportLeft + viewportRight - worldBounds.width) / 2;
      panX = centeredWorldDrawX + camera.x + worldBounds.offsetX;
    } else {
      const rawWorldDrawX = -camera.x + rawPanX - worldBounds.offsetX;
      const clampedWorldDrawX = clamp(rawWorldDrawX, leftBoundWorldDrawX, rightBoundWorldDrawX);
      panX = clampedWorldDrawX + camera.x + worldBounds.offsetX;
    }

    let panY;
    if (worldBounds.height <= viewportHeight) {
      const centeredWorldDrawY = (viewportTop + viewportBottom - worldBounds.height) / 2;
      panY = centeredWorldDrawY + camera.y + worldBounds.offsetY;
    } else {
      const rawWorldDrawY = -camera.y + rawPanY - worldBounds.offsetY;
      const clampedWorldDrawY = clamp(rawWorldDrawY, topBoundWorldDrawY, bottomBoundWorldDrawY);
      panY = clampedWorldDrawY + camera.y + worldBounds.offsetY;
    }

    if (state.camera) {
      state.camera.panX = panX;
      state.camera.panY = panY;
    }

    return {
      zoom,
      originX: -camera.x + panX,
      originY: -camera.y + panY,
      translateX: canvas.width / 2,
      translateY: CAMERA_BASELINE_Y,
    };
  }

  function clientToWorldPoint(clientX, clientY, state) {
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const frame = getCameraFrame(state);
    return {
      x: (localX - frame.translateX) / frame.zoom,
      y: (localY - frame.translateY) / frame.zoom,
      frame,
    };
  }

  function isTileBlocked(col, row, metrics) {
    const terrain = classifyTerrain(col, row, metrics);
    return terrain === 'water' || terrain === 'coast';
  }

  function drawIsoTile(targetCtx, path, x, y, elevation = 0, rotate = 0) {
    const img = imageRegistry[path];
    if (!img?.complete) return;
    targetCtx.save();
    targetCtx.translate(x, y - elevation);
    if (rotate) targetCtx.rotate(rotate);
    targetCtx.drawImage(img, -HALF_TILE_W, 0, TILE_W, TILE_H);
    targetCtx.restore();
  }

  function drawTileDepth(targetCtx, x, y, elevation) {
    if (elevation <= 0) return;
    const topY = y - elevation;

    targetCtx.beginPath();
    targetCtx.moveTo(x, topY + TILE_H);
    targetCtx.lineTo(x + HALF_TILE_W, topY + HALF_TILE_H);
    targetCtx.lineTo(x + HALF_TILE_W, y + HALF_TILE_H);
    targetCtx.lineTo(x, y + TILE_H);
    targetCtx.closePath();
    targetCtx.fillStyle = 'rgba(0,0,0,0.16)';
    targetCtx.fill();

    targetCtx.beginPath();
    targetCtx.moveTo(x, topY + TILE_H);
    targetCtx.lineTo(x - HALF_TILE_W, topY + HALF_TILE_H);
    targetCtx.lineTo(x - HALF_TILE_W, y + HALF_TILE_H);
    targetCtx.lineTo(x, y + TILE_H);
    targetCtx.closePath();
    targetCtx.fillStyle = 'rgba(0,0,0,0.28)';
    targetCtx.fill();
  }

  function getWorldBounds(state) {
    const corners = [
      toIso(0, 0),
      toIso(state.map.width - 1, 0),
      toIso(0, state.map.height - 1),
      toIso(state.map.width - 1, state.map.height - 1),
    ];
    const minX = Math.min(...corners.map((p) => p.x)) - TILE_W * 3;
    const maxX = Math.max(...corners.map((p) => p.x)) + TILE_W * 3;
    const minY = Math.min(...corners.map((p) => p.y)) - TILE_H * 10;
    const maxY = Math.max(...corners.map((p) => p.y)) + TILE_H * 10;
    return {
      minX,
      minY,
      width: Math.ceil(maxX - minX),
      height: Math.ceil(maxY - minY),
      offsetX: -minX,
      offsetY: -minY,
    };
  }

  function mapToLayerXY(col, row, elevation = 0) {
    const iso = toIso(col, row);
    return {
      x: layerState.worldOffsetX + iso.x,
      y: layerState.worldOffsetY + iso.y - elevation,
    };
  }

  function rebuildBaseGridLayer() {
    if (!layerState.baseGrid.dirty && layerState.baseGrid.width === canvas.width && layerState.baseGrid.height === canvas.height) return;
    const layerCanvas = createLayerCanvas(canvas.width, canvas.height);
    const layerCtx = layerCanvas.getContext('2d');
    const bg = layerCtx.createRadialGradient(
      canvas.width * 0.52,
      canvas.height * 0.48,
      20,
      canvas.width * 0.52,
      canvas.height * 0.48,
      Math.max(canvas.width, canvas.height) * 0.75,
    );
    bg.addColorStop(0, '#07111e');
    bg.addColorStop(0.4, '#030913');
    bg.addColorStop(1, '#000000');
    layerCtx.fillStyle = bg;
    layerCtx.fillRect(0, 0, canvas.width, canvas.height);

    layerCtx.globalAlpha = 0.18;
    layerCtx.strokeStyle = 'rgba(94,242,255,0.16)';
    layerCtx.lineWidth = 1;
    for (let y = -40; y < canvas.height + 40; y += 48) {
      layerCtx.beginPath();
      layerCtx.moveTo(0, y);
      layerCtx.lineTo(canvas.width, y - 22);
      layerCtx.stroke();
    }
    layerCtx.globalAlpha = 1;
    layerState.baseGrid.canvas = layerCanvas;
    layerState.baseGrid.width = canvas.width;
    layerState.baseGrid.height = canvas.height;
    layerState.baseGrid.dirty = false;
  }

  function ensureWorldLayers(state, metrics) {
    const mapKey = `${state.map.width}x${state.map.height}`;
    if (layerState.mapKey === mapKey && !layerState.roadBlocks.dirty && !layerState.worldObjects.dirty) return;

    const bounds = getWorldBounds(state);
    layerState.worldOffsetX = bounds.offsetX;
    layerState.worldOffsetY = bounds.offsetY;

    layerState.roadBlocks.canvas = createLayerCanvas(bounds.width, bounds.height);
    layerState.worldObjects.canvas = createLayerCanvas(bounds.width, bounds.height);

    const roadCtx = layerState.roadBlocks.canvas.getContext('2d');
    roadCtx.clearRect(0, 0, bounds.width, bounds.height);

    for (let row = 0; row < state.map.height; row += 1) {
      for (let col = 0; col < state.map.width; col += 1) {
        const tilePos = mapToLayerXY(col, row, 0);
        const terrain = classifyTerrain(col, row, metrics);
        const district = getDistrictAt(state, col, row);
        const districtTheme = getDistrictTheme(district?.id);
        const noise = deterministicNoise2D(col * 3, row * 5);
        const isRoad = isRoadCell(col, row, metrics);
        const elevation = getTileElevation(col, row, metrics);

        roadCtx.save();
        if (terrain === 'water') {
          drawDiamondPath(roadCtx, tilePos.x, tilePos.y);
          roadCtx.fillStyle = `rgba(6,20,34,${0.88 - (noise * 0.08)})`;
          roadCtx.fill();
          roadCtx.strokeStyle = 'rgba(70,143,190,0.16)';
          roadCtx.lineWidth = 0.8;
          roadCtx.stroke();
          roadCtx.restore();
          continue;
        }

        const baseAlpha = terrain === 'coast' ? 0.48 : terrain === 'sand' ? 0.58 : 0.74;
        drawDiamondPath(roadCtx, tilePos.x, tilePos.y);
        roadCtx.fillStyle = terrain === 'coast'
          ? `rgba(16,34,48,${baseAlpha})`
          : `rgba(8,16,28,${baseAlpha})`;
        roadCtx.fill();

        roadCtx.strokeStyle = `rgba(94,242,255,${isRoad ? 0.24 : 0.12 + (noise * 0.06)})`;
        roadCtx.lineWidth = isRoad ? 1.15 : 0.8;
        roadCtx.stroke();

        if (terrain === 'land' || terrain === 'sand') {
          roadCtx.globalAlpha = isRoad ? 0.28 : 0.12;
          roadCtx.strokeStyle = districtTheme.color;
          roadCtx.lineWidth = isRoad ? 1.2 : 0.7;
          roadCtx.beginPath();
          roadCtx.moveTo(tilePos.x - (HALF_TILE_W * 0.52), tilePos.y + (HALF_TILE_H * 0.94));
          roadCtx.lineTo(tilePos.x + (HALF_TILE_W * 0.52), tilePos.y + (HALF_TILE_H * 0.94));
          roadCtx.stroke();

          roadCtx.beginPath();
          roadCtx.moveTo(tilePos.x, tilePos.y + (HALF_TILE_H * 0.26));
          roadCtx.lineTo(tilePos.x, tilePos.y + (HALF_TILE_H * 1.72));
          roadCtx.stroke();
        }

        if (!isRoad && terrain === 'land') {
          roadCtx.globalAlpha = 0.16;
          roadCtx.fillStyle = districtTheme.accent;
          roadCtx.fillRect(tilePos.x - 1, tilePos.y + (HALF_TILE_H * 0.72), 2, 2 + (noise * 3));
        }

        if (isRoad) {
          roadCtx.globalAlpha = 0.24;
          applyGlow(roadCtx, districtTheme.color, 12, 1);
          roadCtx.strokeStyle = districtTheme.color;
          roadCtx.lineWidth = 2.2;
          roadCtx.beginPath();
          roadCtx.moveTo(tilePos.x - (HALF_TILE_W * 0.58), tilePos.y + HALF_TILE_H);
          roadCtx.lineTo(tilePos.x + (HALF_TILE_W * 0.58), tilePos.y + HALF_TILE_H);
          roadCtx.stroke();
          roadCtx.shadowBlur = 0;
          roadCtx.globalAlpha = 0.75;
          roadCtx.fillStyle = districtTheme.color;
          roadCtx.fillRect(tilePos.x - 1, tilePos.y + HALF_TILE_H - 1, 2, 2);
        }

        if (terrain === 'land' && elevation >= 4 && noise > 0.62) {
          roadCtx.globalAlpha = 0.08;
          roadCtx.fillStyle = districtTheme.color;
          roadCtx.beginPath();
          roadCtx.arc(tilePos.x + ((noise - 0.5) * 10), tilePos.y + HALF_TILE_H + ((noise - 0.5) * 6), 1.5, 0, Math.PI * 2);
          roadCtx.fill();
        }
        roadCtx.restore();
      }
    }

    layerState.mapKey = mapKey;
    layerState.roadBlocks.dirty = false;
    layerState.worldObjects.dirty = false;
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

  function getVisibleWorldRect(frame) {
    return {
      left: (-frame.translateX / frame.zoom),
      right: ((canvas.width - frame.translateX) / frame.zoom),
      top: (-frame.translateY / frame.zoom),
      bottom: ((canvas.height - frame.translateY) / frame.zoom),
    };
  }

  function isWorldPointVisible(x, y, visible, margin = 40) {
    return x >= visible.left - margin && x <= visible.right + margin && y >= visible.top - margin && y <= visible.bottom + margin;
  }

  function drawHoveredTile(originX, originY, hoverTile, now) {
    if (!hoverTile?.valid) return;
    const iso = toIso(hoverTile.col, hoverTile.row);
    const x = originX + iso.x;
    const y = originY + iso.y;
    const centerY = y + HALF_TILE_H;
    const pulse = 0.5 + (Math.sin(now / HOVER_PULSE_PERIOD_MS) + 1) * 0.15;

    ctx.save();
    ctx.globalAlpha = 0.18 + pulse * 0.08;
    ctx.fillStyle = '#2dff9b';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + HALF_TILE_W, y + HALF_TILE_H);
    ctx.lineTo(x, y + TILE_H);
    ctx.lineTo(x - HALF_TILE_W, y + HALF_TILE_H);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.62 + pulse * 0.2;
    ctx.strokeStyle = '#7dffb0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + HALF_TILE_W, y + HALF_TILE_H);
    ctx.lineTo(x, y + TILE_H);
    ctx.lineTo(x - HALF_TILE_W, y + HALF_TILE_H);
    ctx.closePath();
    ctx.stroke();

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#8dffca';
    ctx.beginPath();
    ctx.ellipse(x, centerY, HALF_TILE_W * 0.58, HALF_TILE_H * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSelectedTile(originX, originY, tile, now) {
    if (!tile?.inBounds) return;
    const isValid = Boolean(tile.valid);
    const fillColor = isValid ? '#5ef2ff' : '#ff6c8f';
    const outlineColor = isValid ? '#8dfbff' : '#ff9bb1';
    const iso = toIso(tile.col, tile.row);
    const x = originX + iso.x;
    const y = originY + iso.y;
    const centerY = y + HALF_TILE_H;
    const pulse = 0.75 + (Math.sin(now / 210) + 1) * 0.16;
    ctx.save();
    ctx.globalAlpha = isValid ? 0.2 : 0.28;
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + HALF_TILE_W, y + HALF_TILE_H);
    ctx.lineTo(x, y + TILE_H);
    ctx.lineTo(x - HALF_TILE_W, y + HALF_TILE_H);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + HALF_TILE_W, y + HALF_TILE_H);
    ctx.lineTo(x, y + TILE_H);
    ctx.lineTo(x - HALF_TILE_W, y + HALF_TILE_H);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(x, centerY, HALF_TILE_W * 0.66 * pulse, HALF_TILE_H * 0.58 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawMoveTarget(originX, originY, target, now) {
    if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return;
    const iso = toIso(target.x, target.y);
    const x = originX + iso.x;
    const y = originY + iso.y + HALF_TILE_H;
    const pulse = 0.6 + (Math.sin(now / 260) + 1) * 0.2;

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#5ef2ff';
    ctx.beginPath();
    ctx.ellipse(x, y, 16 * pulse, 9 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = '#5ef2ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, 19 * pulse, 11 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer(originX, originY, state, now, metrics) {
    const iso = toIso(state.player.x, state.player.y);
    const elevation = getTileElevation(state.player.x, state.player.y, metrics);
    const sx = originX + iso.x;
    const sy = originY + iso.y - elevation - 4;

    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ff5adf';
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

  function drawNpc(originX, originY, npc, now, isNearby, isHovered, metrics, visible) {
    const iso = toIso(npc.col, npc.row);
    const elevation = getTileElevation(npc.col, npc.row, metrics);
    const sx = originX + iso.x;
    const sy = originY + iso.y - elevation - 4;
    if (!isWorldPointVisible(sx, sy, visible, 48)) return;

    const style = ROLE_STYLE[npc.role] || ROLE_STYLE.crowd;
    const isHunter = npc.role === 'sam-hunter' || npc.mode === 'hunter';
    const hunterPulse = 0.86 + ((Math.sin(now / 260) + 1) * 0.12);

    ctx.globalAlpha = isHunter ? 0.26 : npc.mode === 'active' ? 0.35 : 0.16;
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.ellipse(
      sx,
      sy - 2,
      isHunter ? 13 * hunterPulse : npc.mode === 'active' ? 11 : 8,
      isHunter ? 7 * hunterPulse : npc.mode === 'active' ? 6 : 4,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.globalAlpha = 1;

    if (isHunter) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = '#7ae8ff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(sx, sy + 4, 18 * hunterPulse, 8 * hunterPulse, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx - 8, sy - 30);
      ctx.lineTo(sx + 8, sy - 22);
      ctx.moveTo(sx - 8, sy - 22);
      ctx.lineTo(sx + 8, sy - 14);
      ctx.stroke();
      ctx.restore();
    }

    drawNpcSprite(sx, sy + 2, npc.role || 'drifter', getNpcFrame(npc, now, isNearby), isHunter ? 1.34 : npc.mode === 'active' ? 1.28 : 1.05);

    if (npc.mode === 'active' && style.factionRing && npc.faction) {
      ctx.fillStyle = FACTION_COLOR[npc.faction] || FACTION_COLOR.Neutral;
      ctx.beginPath();
      ctx.arc(sx, sy + 5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isNearby || isHovered) {
      const pulse = 0.5 + (Math.sin(now / 220) + 1) * 0.2;
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = isHovered ? '#5ef2ff' : '#ffffff';
      ctx.lineWidth = isHovered ? 2 : 1.5;
      ctx.beginPath();
      ctx.ellipse(sx, sy - 2, isHovered ? 16 : 14, isHovered ? 8 : 7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (npc.mode === 'active' || isHunter) {
      ctx.font = '700 8px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(npc.roleLabel || npc.role || 'NPC', sx + 1, sy - 43);
      ctx.fillStyle = style.color;
      ctx.fillText(npc.roleLabel || npc.role || 'NPC', sx, sy - 44);
      if (isHunter) {
        ctx.fillStyle = '#d7fbff';
        ctx.fillText(String(npc.glyph || 'scan').toUpperCase(), sx, sy - 54);
      } else if (isNearby || isHovered) {
        ctx.fillStyle = '#ffffff';
        ctx.fillText(npc.name || 'Citizen', sx, sy - 54);
      }
    }
  }

  function drawRemotePlayer(originX, originY, remote, now, metrics, visible, isHovered, isSelected) {
    const iso = toIso(remote.x, remote.y);
    const elevation = getTileElevation(remote.x, remote.y, metrics);
    const sx = originX + iso.x;
    const sy = originY + iso.y - elevation - 4;
    if (!isWorldPointVisible(sx, sy, visible, 48)) return;

    const markerPulse = 0.6 + (Math.sin(now / 220) + 1) * 0.16;
    if (isHovered || isSelected) {
      ctx.save();
      ctx.globalAlpha = isSelected ? 0.32 : 0.2;
      ctx.fillStyle = isSelected ? '#ffd84d' : '#5ef2ff';
      ctx.beginPath();
      ctx.ellipse(sx, sy - 2, (isSelected ? 18 : 14) * markerPulse, (isSelected ? 10 : 8) * markerPulse, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = isSelected ? '#ffd84d' : '#8dfbff';
      ctx.lineWidth = isSelected ? 2.4 : 1.8;
      ctx.beginPath();
      ctx.ellipse(sx, sy - 2, isSelected ? 19 : 15, isSelected ? 10 : 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawNpcSprite(sx, sy + 2, 'agent', getNpcFrame({ mode: 'active' }, now, isSelected), isSelected ? 1.34 : 1.3);
    ctx.fillStyle = '#d7fbff';
    ctx.font = isSelected ? '700 10px Inter, sans-serif' : '600 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    const label = isSelected ? `🎯 ${remote.name || 'Player'}` : (remote.name || 'Player');
    ctx.fillText(label, sx, sy - 44);
  }

  function isOffscreen(screenX, screenY) {
    return (
      screenX < -CULL_MARGIN
      || screenX > canvas.width + CULL_MARGIN
      || screenY < -CULL_MARGIN
      || screenY > canvas.height + CULL_MARGIN
    );
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

  function getNodeVisualClass(node) {
    if (!node) return 'utility';
    if (node.id === 'core') return 'hub';
    if (node.nodeType === 'district-core') return 'hub';
    if (node.nodeType === 'ai') return 'ai';
    if (node.nodeType === 'mining') return 'mining';
    if (node.nodeType === 'relay') return 'relay';
    if (node.nodeType === 'control') return 'control';
    return 'utility';
  }

  function drawControlNode(originX, originY, node, now, state, isHovered = false) {
    const iso = toIso(node.x, node.y);
    const cx = originX + iso.x;
    const cy = originY + iso.y + HALF_TILE_H;
    const nodeClass = getNodeVisualClass(node);
    const theme = NODE_CLASS_THEME[nodeClass] || NODE_CLASS_THEME.utility;
    const nodeScan = state?.covert?.counterActions?.nodeScans?.find((entry) => entry.node_id === node.id) || null;
    const outbreak = node.outbreak || null;
    const firewall = node.firewallDefense || null;
    const circuit = node.circuitConnect || null;
    const pulse = 0.82 + (Math.sin((now / 340) + ((node.x + node.y) * 0.1)) + 1) * 0.18;
    const towerH = 48 * (theme.size || 1);
    const radius = (isHovered ? 24 : 20) * (theme.size || 1);

    ctx.save();
    ctx.globalAlpha = nodeScan ? 0.3 : outbreak?.infected ? 0.34 : firewall?.underAttack ? 0.32 : circuit?.isolated ? 0.32 : 0.2;
    ctx.fillStyle = nodeScan ? '#7ae8ff' : outbreak?.infected ? '#ff4fa2' : firewall?.underAttack ? '#ff4f9e' : circuit?.isolated ? '#ff7f5a' : theme.color;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1, radius * 1.35 * pulse, radius * 0.55 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = nodeScan ? 0.96 : outbreak?.infected ? 0.95 : firewall?.defended ? 0.95 : circuit?.critical ? 0.92 : 0.75;
    ctx.strokeStyle = nodeScan ? '#7ae8ff' : outbreak?.infected ? '#ff4fa2' : firewall?.defended ? '#6be8ff' : circuit?.critical ? '#ffca56' : theme.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - towerH);
    ctx.lineTo(cx, cy - 6);
    ctx.stroke();

    ctx.globalAlpha = nodeScan ? 1 : outbreak?.infected ? 1 : 0.95;
    ctx.fillStyle = nodeScan ? '#d8f8ff' : outbreak?.infected ? '#ff79be' : firewall?.defended ? '#7af6ff' : circuit?.isolated ? '#ffd4a5' : theme.accent;
    ctx.beginPath();
    ctx.arc(cx, cy - towerH, 9 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.68;
    ctx.strokeStyle = nodeScan ? '#9ef6ff' : outbreak?.infected ? '#ff8ccd' : firewall?.boosted ? '#8ca4ff' : circuit?.selected ? '#72f0ff' : theme.color;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(cx, cy - towerH, 14 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.accent;
    ctx.font = '700 8px Inter, sans-serif';
    ctx.textAlign = 'center';
    const label = `${theme.label} · ${node.id.toUpperCase()}`;
    ctx.fillText(label, cx, cy - towerH - 12);

    if (nodeScan) {
      ctx.fillStyle = '#b9f6ff';
      ctx.fillText('SCANNED', cx, cy - towerH - 22);
    } else if (outbreak?.infected) {
      ctx.fillStyle = '#ff79be';
      ctx.fillText('INFECTED', cx, cy - towerH - 22);
    } else if (circuit?.isolated) {
      ctx.fillStyle = '#ff9f71';
      ctx.fillText('ISOLATED', cx, cy - towerH - 22);
    } else if (outbreak?.isolated) {
      ctx.fillStyle = '#5ef2ff';
      ctx.fillText('ISOLATED', cx, cy - towerH - 22);
    } else if (firewall?.underAttack) {
      ctx.fillStyle = '#ff88c5';
      ctx.fillText('BREACH', cx, cy - towerH - 22);
    } else if (node.status === 'unstable' || node.status === 'contested') {
      ctx.fillStyle = node.status === 'unstable' ? '#ff4fd8' : '#ffd84d';
      ctx.fillText(node.status === 'unstable' ? '⚠ UNSTABLE' : 'CONTESTED', cx, cy - towerH - 22);
    }

    if (node.warState === 'fighting' || node.warState === 'reinforcing' || node.warState === 'retreating') {
      ctx.fillStyle = node.warState === 'fighting' ? '#ff8da5' : node.warState === 'reinforcing' ? '#7dffb2' : '#ffd49f';
      const tag = node.warState === 'fighting' ? 'WAR' : node.warState === 'reinforcing' ? 'REINFORCE' : 'RETREAT';
      ctx.fillText(tag, cx, cy - towerH - 32);
    }

    ctx.restore();
  }

  function drawControlNodeEnhanced(originX, originY, node, now, state, isHovered = false) {
    const iso = toIso(node.x, node.y);
    const cx = originX + iso.x;
    const cy = originY + iso.y + HALF_TILE_H;
    const nodeClass = getNodeVisualClass(node);
    const theme = getNodeTheme(nodeClass);
    const districtTheme = getDistrictTheme(node.districtId);
    const nodeScan = state?.covert?.counterActions?.nodeScans?.find((entry) => entry.node_id === node.id) || null;
    const outbreak = node.outbreak || null;
    const firewall = node.firewallDefense || null;
    const circuit = node.circuitConnect || null;
    const majorNode = isAnchorNode(node) || node.nodeType === 'district-core' || node.nodeType === 'ai' || node.nodeType === 'mining';
    const pulse = 0.82 + (Math.sin((now / 340) + ((node.x + node.y) * 0.1)) + 1) * 0.18;
    const towerH = (theme.tower || 48) * (majorNode ? 1.08 : 1);
    const radius = (isHovered ? 24 : (theme.radius || 20)) * (majorNode ? 1.1 : 1);
    const auraRadius = (theme.aura || 28) * (majorNode ? 1.1 : 1);
    const nodeColor = nodeScan ? '#7ae8ff' : outbreak?.infected ? '#ff4fa2' : firewall?.underAttack ? '#ff4f9e' : circuit?.isolated ? '#ff7f5a' : theme.color;
    const nodeAccent = nodeScan ? '#d8f8ff' : outbreak?.infected ? '#ff79be' : firewall?.defended ? '#7af6ff' : circuit?.isolated ? '#ffd4a5' : theme.accent;

    ctx.save();
    ctx.globalAlpha = nodeScan ? 0.3 : outbreak?.infected ? 0.34 : firewall?.underAttack ? 0.32 : circuit?.isolated ? 0.32 : 0.2;
    applyGlow(ctx, nodeColor, majorNode ? 22 : 16, 1);
    ctx.fillStyle = nodeColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1, radius * 1.35 * pulse, radius * 0.55 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = districtTheme.color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, auraRadius * 1.34 * pulse, auraRadius * 0.52 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = nodeScan ? 0.96 : outbreak?.infected ? 0.95 : firewall?.defended ? 0.95 : circuit?.critical ? 0.92 : 0.78;
    ctx.strokeStyle = nodeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - towerH);
    ctx.lineTo(cx, cy - 6);
    ctx.stroke();

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = nodeAccent;
    ctx.beginPath();
    ctx.arc(cx, cy - towerH, (majorNode ? 11 : 9) * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = nodeAccent;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(cx, cy - towerH, (majorNode ? 17 : 14) * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = nodeAccent;
    ctx.fillStyle = 'rgba(6,14,26,0.88)';
    if (nodeClass === 'mining') {
      ctx.fillRect(cx - 18, cy - 18, 36, 12);
      ctx.strokeRect(cx - 18, cy - 18, 36, 12);
      for (let i = -12; i <= 12; i += 12) {
        ctx.beginPath();
        ctx.arc(cx + i, cy - 12, 4.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.62;
      ctx.fillStyle = '#ffb068';
      for (let i = -10; i <= 10; i += 10) {
        const spark = (Math.sin((now * NODE_SPARK_SPEED) + i) + 1) * 4;
        ctx.fillRect(cx + i - 1, cy - 8 - spark, 2, 4 + spark);
      }
    } else if (nodeClass === 'ai') {
      ctx.fillRect(cx - 13, cy - 30, 10, 28);
      ctx.fillRect(cx + 3, cy - 26, 10, 24);
      ctx.strokeRect(cx - 13, cy - 30, 10, 28);
      ctx.strokeRect(cx + 3, cy - 26, 10, 24);
      ctx.beginPath();
      ctx.arc(cx, cy - 38, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 38);
      ctx.lineTo(cx + 6, cy - 38);
      ctx.moveTo(cx, cy - 44);
      ctx.lineTo(cx, cy - 32);
      ctx.stroke();
    } else if (nodeClass === 'relay') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 30);
      ctx.lineTo(cx - 10, cy - 8);
      ctx.lineTo(cx + 10, cy - 8);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy - 30, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy - 30, 12, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    } else if (nodeClass === 'control') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 28);
      ctx.lineTo(cx + 13, cy - 18);
      ctx.lineTo(cx, cy - 8);
      ctx.lineTo(cx - 13, cy - 18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy - 18, 6, 0, Math.PI * 2);
      ctx.stroke();
    } else if (nodeClass === 'hub') {
      ctx.fillRect(cx - 17, cy - 22, 34, 12);
      ctx.strokeRect(cx - 17, cy - 22, 34, 12);
      ctx.fillRect(cx - 9, cy - 34, 18, 12);
      ctx.strokeRect(cx - 9, cy - 34, 18, 12);
      ctx.beginPath();
      ctx.moveTo(cx - 18, cy - 10);
      ctx.lineTo(cx, cy - 2);
      ctx.lineTo(cx + 18, cy - 10);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.roundRect(cx - 10, cy - 20, 20, 12, 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy - 14, 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.accent;
    ctx.font = majorNode ? '700 9px Inter, sans-serif' : '700 8px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${theme.label} / ${node.id.toUpperCase()}`, cx, cy - towerH - 12);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = districtTheme.accent;
    ctx.font = '700 7px Inter, sans-serif';
    ctx.fillText(districtTheme.glyph, cx, cy - towerH - 24);

    const stateY = cy - towerH - 34;
    if (nodeScan) {
      ctx.fillStyle = '#b9f6ff';
      ctx.fillText('SCANNED', cx, stateY);
    } else if (outbreak?.infected) {
      ctx.fillStyle = '#ff79be';
      ctx.fillText('INFECTED', cx, stateY);
    } else if (circuit?.isolated || outbreak?.isolated) {
      ctx.fillStyle = circuit?.isolated ? '#ff9f71' : '#5ef2ff';
      ctx.fillText('ISOLATED', cx, stateY);
    } else if (firewall?.underAttack) {
      ctx.fillStyle = '#ff88c5';
      ctx.fillText('BREACH', cx, stateY);
    } else if (node.status === 'unstable' || node.status === 'contested') {
      ctx.fillStyle = node.status === 'unstable' ? '#ff4fd8' : '#ffd84d';
      ctx.fillText(node.status === 'unstable' ? 'UNSTABLE' : 'CONTESTED', cx, stateY);
    }

    if (node.warState === 'fighting' || node.warState === 'reinforcing' || node.warState === 'retreating') {
      ctx.fillStyle = node.warState === 'fighting' ? '#ff8da5' : node.warState === 'reinforcing' ? '#7dffb2' : '#ffd49f';
      const tag = node.warState === 'fighting' ? 'WAR' : node.warState === 'reinforcing' ? 'REINFORCE' : 'RETREAT';
      ctx.fillText(tag, cx, cy - towerH - 44);
    }

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

  function drawAnimatedNeonOverlay(now) {
    const flow = (now * 0.02) % 80;
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = 'rgba(94,242,255,0.5)';
    ctx.lineWidth = 2;
    for (let y = -40; y < canvas.height + 40; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y + flow);
      ctx.lineTo(canvas.width, y + flow - 24);
      ctx.stroke();
    }

    const flicker = deterministicNoise2D(Math.floor(now / 140), 3);
    if (flicker > 0.92) {
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = 'rgba(255,79,216,0.8)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.restore();
  }

  function drawRoadLightStrips(originX, originY, now, metrics) {
    const centerIso = toIso(metrics.centerX, metrics.centerY);
    const speed = ((now * 0.0016) % 1);
    const span = 170;
    const x = originX + centerIso.x;
    const y = originY + centerIso.y;

    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = '#5ef2ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - span + (speed * span * 2), y - 12);
    ctx.lineTo(x - span + (speed * span * 2) + 54, y + 16);
    ctx.stroke();

    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#ff4fd8';
    ctx.beginPath();
    ctx.moveTo(x + span - (speed * span * 2), y + 18);
    ctx.lineTo(x + span - (speed * span * 2) - 48, y - 8);
    ctx.stroke();
    ctx.restore();
  }

  function drawKeyTilePulse(originX, originY, metrics, now) {
    const pulse = 0.7 + (Math.sin(now / 500) + 1) * 0.15;
    const keyTiles = [
      { col: Math.round(metrics.centerX), row: Math.round(metrics.centerY), color: '#5ef2ff' },
      { col: Math.round(metrics.centerX - metrics.districtLaneOffset), row: Math.round(metrics.centerY), color: '#ff4fd8' },
      { col: Math.round(metrics.centerX), row: Math.round(metrics.centerY + metrics.districtLaneOffset), color: '#8dff6a' },
    ];

    ctx.save();
    for (const tile of keyTiles) {
      const iso = toIso(tile.col, tile.row);
      const x = originX + iso.x;
      const y = originY + iso.y + HALF_TILE_H;
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = tile.color;
      ctx.beginPath();
      ctx.ellipse(x, y, 18 * pulse, 10 * pulse, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawNetworkDataLinks(originX, originY, controlNodes, now, state) {
    if (!Array.isArray(controlNodes) || controlNodes.length < 2) return;
    const byId = new Map(controlNodes.map((node) => [node.id, node]));
    const byCoord = new Map(controlNodes.map((node) => [`${node.x},${node.y}`, node]));
    const networkHeat = Math.max(0, Math.min(100, Number(state?.covert?.networkHeat?.value) || 0));
    const heatBias = networkHeat / 100;
    const routeDisruptions = Array.isArray(state?.covert?.counterActions?.routeDisruptions)
      ? state.covert.counterActions.routeDisruptions
      : [];
    ctx.save();

    for (const line of NETWORK_LINES) {
      const from = byId.get(line.from.id) || byCoord.get(`${line.from.x},${line.from.y}`);
      const to = byId.get(line.to.id) || byCoord.get(`${line.to.x},${line.to.y}`);
      if (!from || !to) continue;

      const fromIso = toIso(from.x, from.y);
      const toIsoPoint = toIso(to.x, to.y);
      const x1 = originX + fromIso.x;
      const y1 = originY + fromIso.y + HALF_TILE_H;
      const x2 = originX + toIsoPoint.x;
      const y2 = originY + toIsoPoint.y + HALF_TILE_H;
      const flowPulse = 0.5 + (Math.sin((now / 220) + (line.id.length * 0.5)) + 1) * 0.25;
      const corrupted = Boolean(from.outbreak?.infected || to.outbreak?.infected);
      const disrupted = routeDisruptions.find((entry) => (
        entry?.district_id
        && (entry.district_id === from.districtId || entry.district_id === to.districtId)
        && (
          !Array.isArray(entry.affected_node_ids)
          || !entry.affected_node_ids.length
          || entry.affected_node_ids.includes(from.id)
          || entry.affected_node_ids.includes(to.id)
        )
      )) || null;
      const circuitState = state.circuitConnectView?.active
        ? state.circuitConnectView.links?.find((entry) => entry.id === edgeKey(from.id, to.id))?.state
        : '';
      const routerState = state.signalRouterView?.active
        ? state.signalRouterView.links?.find((entry) => entry.id === edgeKey(from.id, to.id))?.state
        : '';
      const circuitColor = circuitState === 'broken'
        ? 'rgba(255,87,99,0.96)'
        : circuitState === 'unstable'
          ? 'rgba(255,188,87,0.95)'
          : circuitState === 'bridge'
            ? 'rgba(181,115,255,0.96)'
            : circuitState === 'reinforced'
              ? 'rgba(102,232,255,0.98)'
              : '';
      const routerColor = routerState === 'overloaded'
        ? 'rgba(255,183,71,0.95)'
        : routerState === 'corrupted'
          ? 'rgba(255,79,216,0.95)'
          : routerState === 'blocked'
            ? 'rgba(255,90,111,0.95)'
            : routerState === 'stabilized'
              ? 'rgba(105,243,255,0.98)'
              : '';

      const fractureFlicker = 0.55 + (Math.sin(now / UNSTABLE_FLICKER_RATE + (line.id.length * 2.4)) + 1) * 0.2;
      ctx.globalAlpha = disrupted ? 0.88 : circuitState === 'broken' ? fractureFlicker : (corrupted ? 0.78 : (0.45 + (heatBias * 0.16)));
      ctx.strokeStyle = disrupted ? 'rgba(255,196,92,0.96)' : circuitColor || routerColor || (corrupted ? 'rgba(255,79,168,0.94)' : 'rgba(94,242,255,0.95)');
      ctx.lineWidth = (((routerState === 'blocked' || circuitState === 'broken') ? 2.8 : 1.4) + flowPulse + (heatBias * 0.6) + (disrupted ? 0.8 : 0));
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (disrupted) {
        ctx.globalAlpha = 0.54;
        ctx.strokeStyle = 'rgba(255,239,200,0.98)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(((x1 + x2) / 2) - 5, ((y1 + y2) / 2) - 5);
        ctx.lineTo(((x1 + x2) / 2) + 5, ((y1 + y2) / 2) + 5);
        ctx.moveTo(((x1 + x2) / 2) + 5, ((y1 + y2) / 2) - 5);
        ctx.lineTo(((x1 + x2) / 2) - 5, ((y1 + y2) / 2) + 5);
        ctx.stroke();
      }

      const packetPhase = ((now * DATA_PACKET_SPEED * (1.8 + (heatBias * 0.9))) + ((from.x + to.y) * 0.021)) % 1;
      const px = x1 + ((x2 - x1) * packetPhase);
      const py = y1 + ((y2 - y1) * packetPhase);
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = disrupted
        ? '#fff0c2'
        : circuitState === 'broken'
        ? '#ffb7be'
        : circuitState === 'unstable'
          ? '#ffe0af'
          : routerState === 'blocked'
            ? '#ffd0d8'
            : (corrupted ? '#ffd2f1' : '#e7fbff');
      ctx.beginPath();
      ctx.arc(px, py, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMapSignalOverlay(originX, originY, state, now) {
    const metrics = getSceneMetrics(state);
    const scanOffset = (now * SURFACE_SCAN_SPEED * (metrics.width + metrics.height)) % (metrics.width + metrics.height);
    ctx.save();
    for (let row = 0; row < state.map.height; row += 4) {
      for (let col = 0; col < state.map.width; col += 4) {
        const terrain = classifyTerrain(col, row, metrics);
        if (terrain === 'water') continue;
        const district = getDistrictAt(state, col, row);
        const districtTheme = getDistrictTheme(district?.id);
        const iso = toIso(col, row);
        const x = originX + iso.x;
        const y = originY + iso.y + HALF_TILE_H;
        const phase = (col + row + scanOffset) % 18;
        if (phase > 2) continue;
        ctx.globalAlpha = 0.05 + ((2 - phase) * 0.03);
        ctx.fillStyle = districtTheme.color;
        ctx.beginPath();
        ctx.ellipse(x, y, 10 + ((2 - phase) * 4), 5 + ((2 - phase) * 2), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function isMajorLink(from, to) {
    return isAnchorNode(from) || isAnchorNode(to) || from.nodeType === 'ai' || to.nodeType === 'ai' || from.nodeType === 'mining' || to.nodeType === 'mining';
  }

  function drawNetworkDataLinksEnhanced(originX, originY, controlNodes, now, state) {
    if (!Array.isArray(controlNodes) || controlNodes.length < 2) return;
    const byId = new Map(controlNodes.map((node) => [node.id, node]));
    const byCoord = new Map(controlNodes.map((node) => [`${node.x},${node.y}`, node]));
    const networkHeat = Math.max(0, Math.min(100, Number(state?.covert?.networkHeat?.value) || 0));
    const heatBias = networkHeat / 100;
    const routeDisruptions = Array.isArray(state?.covert?.counterActions?.routeDisruptions)
      ? state.covert.counterActions.routeDisruptions
      : [];
    ctx.save();

    for (const line of NETWORK_LINES) {
      const from = byId.get(line.from.id) || byCoord.get(`${line.from.x},${line.from.y}`);
      const to = byId.get(line.to.id) || byCoord.get(`${line.to.x},${line.to.y}`);
      if (!from || !to) continue;

      const fromIso = toIso(from.x, from.y);
      const toIsoPoint = toIso(to.x, to.y);
      const x1 = originX + fromIso.x;
      const y1 = originY + fromIso.y + HALF_TILE_H;
      const x2 = originX + toIsoPoint.x;
      const y2 = originY + toIsoPoint.y + HALF_TILE_H;
      const flowPulse = 0.5 + (Math.sin((now / 220) + (line.id.length * 0.5)) + 1) * 0.25;
      const corrupted = Boolean(from.outbreak?.infected || to.outbreak?.infected);
      const disrupted = routeDisruptions.find((entry) => (
        entry?.district_id
        && (entry.district_id === from.districtId || entry.district_id === to.districtId)
        && (
          !Array.isArray(entry.affected_node_ids)
          || !entry.affected_node_ids.length
          || entry.affected_node_ids.includes(from.id)
          || entry.affected_node_ids.includes(to.id)
        )
      )) || null;
      const circuitState = state.circuitConnectView?.active
        ? state.circuitConnectView.links?.find((entry) => entry.id === edgeKey(from.id, to.id))?.state
        : '';
      const routerState = state.signalRouterView?.active
        ? state.signalRouterView.links?.find((entry) => entry.id === edgeKey(from.id, to.id))?.state
        : '';
      const circuitColor = circuitState === 'broken'
        ? 'rgba(255,87,99,0.96)'
        : circuitState === 'unstable'
          ? 'rgba(255,188,87,0.95)'
          : circuitState === 'bridge'
            ? 'rgba(181,115,255,0.96)'
            : circuitState === 'reinforced'
              ? 'rgba(102,232,255,0.98)'
              : '';
      const routerColor = routerState === 'overloaded'
        ? 'rgba(255,183,71,0.95)'
        : routerState === 'corrupted'
          ? 'rgba(255,79,216,0.95)'
          : routerState === 'blocked'
            ? 'rgba(255,90,111,0.95)'
            : routerState === 'stabilized'
              ? 'rgba(105,243,255,0.98)'
              : '';
      const lineTheme = getDistrictTheme(from.districtId);
      const baseColor = disrupted
        ? 'rgba(255,196,92,0.96)'
        : circuitColor || routerColor || (corrupted ? 'rgba(255,79,168,0.94)' : `rgba(94,242,255,${0.78 + (heatBias * 0.12)})`);
      const fractureFlicker = 0.55 + (Math.sin(now / UNSTABLE_FLICKER_RATE + (line.id.length * 2.4)) + 1) * 0.2;

      ctx.globalAlpha = disrupted ? 0.28 : circuitState === 'broken' ? fractureFlicker * 0.4 : (corrupted ? 0.34 : (0.16 + (heatBias * 0.1)));
      applyGlow(ctx, lineTheme.color, disrupted ? 18 : 10, 1);
      ctx.strokeStyle = lineTheme.color;
      ctx.lineWidth = 4.8 + (disrupted ? 1.2 : 0);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.globalAlpha = disrupted ? 0.88 : circuitState === 'broken' ? fractureFlicker : (corrupted ? 0.78 : (0.45 + (heatBias * 0.16)));
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = (((routerState === 'blocked' || circuitState === 'broken') ? 2.8 : 1.7) + flowPulse + (heatBias * 0.6) + (disrupted ? 0.8 : 0));
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.globalAlpha = 0.42;
      ctx.strokeStyle = disrupted ? '#fff0c2' : 'rgba(230,250,255,0.84)';
      ctx.lineWidth = 0.9;
      ctx.setLineDash([6, 12]);
      ctx.lineDashOffset = -((now * 0.03) + (line.id.length * 7));
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);

      if (disrupted) {
        ctx.globalAlpha = 0.54;
        ctx.strokeStyle = 'rgba(255,239,200,0.98)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(((x1 + x2) / 2) - 5, ((y1 + y2) / 2) - 5);
        ctx.lineTo(((x1 + x2) / 2) + 5, ((y1 + y2) / 2) + 5);
        ctx.moveTo(((x1 + x2) / 2) + 5, ((y1 + y2) / 2) - 5);
        ctx.lineTo(((x1 + x2) / 2) - 5, ((y1 + y2) / 2) + 5);
        ctx.stroke();
      }

      const packetPhase = ((now * DATA_PACKET_SPEED * (1.8 + (heatBias * 0.9))) + ((from.x + to.y) * 0.021)) % 1;
      const packetCount = isMajorLink(from, to) ? 3 : 2;
      for (let i = 0; i < packetCount; i += 1) {
        const phase = (packetPhase + (i / packetCount)) % 1;
        const px = x1 + ((x2 - x1) * phase);
        const py = y1 + ((y2 - y1) * phase);
        ctx.globalAlpha = 0.95 - (i * 0.18);
        ctx.fillStyle = disrupted
          ? '#fff0c2'
          : circuitState === 'broken'
            ? '#ffb7be'
            : circuitState === 'unstable'
              ? '#ffe0af'
              : routerState === 'blocked'
                ? '#ffd0d8'
                : (corrupted ? '#ffd2f1' : '#e7fbff');
        applyGlow(ctx, ctx.fillStyle, 8, 1);
        ctx.beginPath();
        ctx.arc(px, py, i === 0 ? 2.8 : 2.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    ctx.restore();
  }

  function drawDistrictControlOverlay(originX, originY, state, now) {
    const districtState = Array.isArray(state?.districtState) ? state.districtState : [];
    if (!districtState.length || !state?.districts?.byId) return;
    ctx.save();
    for (const entry of districtState) {
      const districtMeta = state.districts.byId.get(entry.id);
      const grid = districtMeta?.grid;
      if (!grid) continue;
      const style = DISTRICT_STATE_STYLE[entry.controlState] || DISTRICT_STATE_STYLE.contested;
      const corners = [
        toIso(grid.col, grid.row),
        toIso(grid.col + grid.w, grid.row),
        toIso(grid.col + grid.w, grid.row + grid.h),
        toIso(grid.col, grid.row + grid.h),
      ];
      const pulse = entry.controlState === 'collapsing' ? 0.78 + ((Math.sin(now / 180) + 1) * 0.11) : 1;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      corners.forEach((corner, index) => {
        const px = originX + corner.x;
        const py = originY + corner.y;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = style.fill;
      ctx.fill();
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      const center = toIso(grid.col + (grid.w / 2), grid.row + (grid.h / 2));
      const labelX = originX + center.x;
      const labelY = originY + center.y;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(2,8,20,0.7)';
      ctx.font = DISTRICT_LABEL_GLOW_FONT;
      ctx.textAlign = 'center';
      ctx.fillText(`${districtMeta.name} · ${String(entry.controlState || 'contested').toUpperCase()}`, labelX, labelY);
      ctx.fillStyle = '#e8fdff';
      ctx.font = DISTRICT_LABEL_FONT;
      ctx.fillText(`${Math.round(Number(entry.control || 0))}% · ${entry.owner || 'Contested'}`, labelX, labelY);
    }
    ctx.restore();
  }

  function drawDistrictControlOverlayEnhanced(originX, originY, state, now) {
    const districtState = Array.isArray(state?.districtState) ? state.districtState : [];
    if (!districtState.length || !state?.districts?.byId) return;
    ctx.save();
    for (const entry of districtState) {
      const districtMeta = state.districts.byId.get(entry.id);
      const grid = districtMeta?.grid;
      if (!grid) continue;
      const style = DISTRICT_STATE_STYLE[entry.controlState] || DISTRICT_STATE_STYLE.contested;
      const districtTheme = getDistrictTheme(entry.id);
      const corners = [
        toIso(grid.col, grid.row),
        toIso(grid.col + grid.w, grid.row),
        toIso(grid.col + grid.w, grid.row + grid.h),
        toIso(grid.col, grid.row + grid.h),
      ];
      const pulse = entry.controlState === 'collapsing' ? 0.78 + ((Math.sin(now / 180) + 1) * 0.11) : 1;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      corners.forEach((corner, index) => {
        const px = originX + corner.x;
        const py = originY + corner.y;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = style.fill;
      ctx.fill();
      ctx.strokeStyle = districtTheme.color;
      ctx.lineWidth = 1.8;
      applyGlow(ctx, districtTheme.color, 14, 1);
      ctx.stroke();
      ctx.shadowBlur = 0;

      const cornerSize = 20;
      for (const corner of corners) {
        const px = originX + corner.x;
        const py = originY + corner.y;
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = districtTheme.accent;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + cornerSize, py + 10);
        ctx.moveTo(px, py);
        ctx.lineTo(px - cornerSize, py + 10);
        ctx.stroke();
      }

      const center = toIso(grid.col + (grid.w / 2), grid.row + (grid.h / 2));
      const labelX = originX + center.x;
      const labelY = originY + center.y;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(2,8,20,0.84)';
      ctx.font = DISTRICT_LABEL_GLOW_FONT;
      ctx.textAlign = 'center';
      ctx.fillText(`${districtTheme.label} / ${String(entry.controlState || 'contested').toUpperCase()}`, labelX, labelY - 8);
      ctx.fillStyle = districtTheme.color;
      ctx.font = '700 10px Inter, sans-serif';
      ctx.fillText(districtTheme.sublabel, labelX, labelY + 8);
      ctx.fillStyle = '#e8fdff';
      ctx.font = DISTRICT_LABEL_FONT;
      ctx.fillText(`${Math.round(Number(entry.control || 0))}% / ${entry.owner || 'Contested'}`, labelX, labelY + 22);
    }
    ctx.restore();
  }

  function drawCovertDistrictOverlay(originX, originY, state, now) {
    const districtState = Array.isArray(state?.districtState) ? state.districtState : [];
    const covertDistricts = state?.covert?.districtSignalById || {};
    const localTraceByDistrictId = state?.covert?.counterActions?.localTraceByDistrictId || {};
    if (!districtState.length || !state?.districts?.byId) return;
    ctx.save();
    for (const entry of districtState) {
      const districtMeta = state.districts.byId.get(entry.id);
      const grid = districtMeta?.grid;
      const covert = covertDistricts[entry.id];
      const localTrace = localTraceByDistrictId[entry.id] || null;
      if (!grid || (!covert && !localTrace)) continue;
      const instability = Math.max(0, Number(covert?.instability) || 0);
      if (instability < 5 && !localTrace) continue;
      const center = toIso(grid.col + (grid.w / 2), grid.row + (grid.h / 2));
      const labelX = originX + center.x;
      const labelY = originY + center.y;
      const ringPulse = 0.88 + ((Math.sin(now / Math.max(160, 260 - (instability * 4))) + 1) * 0.08);
      const ringW = Math.max(42, (grid.w * HALF_TILE_W * 0.92) * ringPulse);
      const ringH = Math.max(20, (grid.h * HALF_TILE_H * 0.6) * ringPulse);
      ctx.globalAlpha = localTrace ? 0.34 : instability >= 18 ? 0.28 : instability >= 10 ? 0.2 : 0.14;
      ctx.strokeStyle = localTrace ? '#ff90c4' : instability >= 18 ? '#ff4fd8' : instability >= 10 ? '#ff9b67' : '#ffd84d';
      ctx.lineWidth = localTrace ? 2.5 : instability >= 18 ? 2.3 : 1.6;
      ctx.beginPath();
      ctx.ellipse(labelX, labelY + 6, ringW, ringH, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.92;
      ctx.fillStyle = localTrace ? '#ffc7e2' : instability >= 18 ? '#ff8fe2' : instability >= 10 ? '#ffb18d' : '#ffe18a';
      ctx.font = '700 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${String((localTrace ? 'under trace' : (covert?.pressure_flag || 'calm'))).toUpperCase()} · instability ${Math.round(instability)}`, labelX, labelY + 12);
    }
    ctx.restore();
  }

  function drawCovertNodeOverlay(originX, originY, node, now, state) {
    if (!node || !node.id || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
    const nodeRiskById = state?.covert?.nodeRiskById;
    const nodeScanByNodeId = state?.covert?.counterActions?.nodeScanByNodeId;
    const hunterByNodeId = state?.sharedWorld?.hunterDetectionByNodeId
      || state?.covert?.hunterDetectionByNodeId
      || null;
    const covert = nodeRiskById?.[node.id] || null;
    const nodeScan = nodeScanByNodeId?.[node.id] || null;
    const hunterField = hunterByNodeId?.[node.id]
      || null;
    if (!covert && !nodeScan && !hunterField) return;
    const risk = Math.max(0, Number(covert?.risk) || 0);
    const hunterIntensity = Math.max(0, Number(hunterField?.intensity) || 0);
    if (risk <= 0 && !nodeScan && hunterIntensity <= 0) return;
    const heat = Math.max(0, Math.min(100, Number(state?.covert?.networkHeat?.value) || 0));
    const color = hunterIntensity > 0 ? '#7ae8ff' : nodeScan ? '#7ae8ff' : risk >= 12 ? '#ff4fd8' : risk >= 8 ? '#ff9b67' : '#ffd84d';
    const iso = toIso(node.x, node.y);
    const cx = originX + iso.x;
    const cy = originY + iso.y + HALF_TILE_H;
    const pulse = 0.84 + ((Math.sin(now / Math.max(120, 300 - (Math.max(risk, hunterIntensity) * 10))) + 1) * 0.16);
    const radius = 24 + Math.min(20, Math.max(risk, hunterIntensity * 2));
    ctx.save();
    ctx.globalAlpha = Math.min(0.34, 0.08 + (risk / 70));
    ctx.strokeStyle = color;
    ctx.lineWidth = risk >= 12 ? 2.4 : 1.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, radius * pulse, radius * 0.46 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();

    if (hunterIntensity > 0) {
      ctx.globalAlpha = Math.min(0.28, 0.08 + (hunterIntensity / 36));
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2, (radius + 10) * pulse, (radius * 0.5) * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (risk >= 8 || heat >= 50) {
      ctx.globalAlpha = 0.22 + Math.min(0.16, heat / 300);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy - 36);
      ctx.lineTo(cx + 8, cy - 26);
      ctx.moveTo(cx - 8, cy - 28);
      ctx.lineTo(cx + 8, cy - 18);
      ctx.stroke();
    }

    if (hunterIntensity > 0) {
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = color;
      ctx.font = '700 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SCAN FIELD', cx, cy - 50);
    } else if (nodeScan || risk >= 12) {
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = color;
      ctx.font = '700 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(nodeScan ? 'NODE SCAN' : 'TRACE LOCK', cx, cy - 50);
    } else if (risk >= 8) {
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = color;
      ctx.font = '700 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('UNDER WATCH', cx, cy - 50);
    }
    ctx.restore();
  }

  function drawSignalRouterOverlay(originX, originY, state, now) {
    const router = state?.signalRouterView;
    const controlNodes = state?.controlNodes;
    if (!router?.active || !Array.isArray(controlNodes) || !controlNodes.length) return;
    const byId = new Map(controlNodes.map((node) => [node.id, node]));
    const pulse = 0.68 + (Math.sin(now / 220) + 1) * 0.2;

    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = 'rgba(3,8,19,0.88)';
    ctx.fillRect(-2200, -2200, 5200, 5200);

    for (const edge of router.links || []) {
      const from = byId.get(edge.fromId);
      const to = byId.get(edge.toId);
      if (!from || !to) continue;
      const fromIso = toIso(from.x, from.y);
      const toIsoPoint = toIso(to.x, to.y);
      const x1 = originX + fromIso.x;
      const y1 = originY + fromIso.y + HALF_TILE_H;
      const x2 = originX + toIsoPoint.x;
      const y2 = originY + toIsoPoint.y + HALF_TILE_H;
      const color = edge.state === 'overloaded'
        ? '#ffb347'
        : edge.state === 'corrupted'
          ? '#ff4fd8'
          : edge.state === 'blocked'
            ? '#ff5a6f'
            : edge.state === 'stabilized'
              ? '#69f3ff'
              : '#5ef2ff';
      ctx.globalAlpha = edge.state === 'blocked' ? 0.92 : 0.82;
      ctx.strokeStyle = color;
      ctx.lineWidth = edge.state === 'blocked' ? 3.2 : edge.state === 'stabilized' ? 2.8 : 2.3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (edge.state === 'blocked' || edge.state === 'corrupted') {
        ctx.globalAlpha = 0.74;
        ctx.strokeStyle = '#ffd7e7';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo((x1 + x2) / 2 - 4, (y1 + y2) / 2 - 4);
        ctx.lineTo((x1 + x2) / 2 + 4, (y1 + y2) / 2 + 4);
        ctx.moveTo((x1 + x2) / 2 + 4, (y1 + y2) / 2 - 4);
        ctx.lineTo((x1 + x2) / 2 - 4, (y1 + y2) / 2 + 4);
        ctx.stroke();
      }
    }

    for (const objective of router.objectives || []) {
      if (!objective.path || objective.path.length < 2 || objective.complete) continue;
      ctx.globalAlpha = 0.4 + pulse * 0.35;
      ctx.strokeStyle = '#7af2ff';
      ctx.lineWidth = 2.3;
      ctx.beginPath();
      for (let i = 0; i < objective.path.length; i += 1) {
        const node = byId.get(objective.path[i]);
        if (!node) continue;
        const iso = toIso(node.x, node.y);
        const x = originX + iso.x;
        const y = originY + iso.y + HALF_TILE_H;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawFirewallDefenseOverlay(originX, originY, state, now) {
    const fw = state?.firewallDefense;
    const controlNodes = state?.controlNodes;
    if (!fw?.active || !Array.isArray(controlNodes) || !controlNodes.length) return;
    const byId = new Map(controlNodes.map((node) => [node.id, node]));

    ctx.save();
    for (const edge of fw.linkFlashes || []) {
      const ids = String(edge).split('|');
      if (ids.length !== 2) continue;
      const from = byId.get(ids[0]);
      const to = byId.get(ids[1]);
      if (!from || !to) continue;
      const fromIso = toIso(from.x, from.y);
      const toIsoPoint = toIso(to.x, to.y);
      const x1 = originX + fromIso.x;
      const y1 = originY + fromIso.y + HALF_TILE_H;
      const x2 = originX + toIsoPoint.x;
      const y2 = originY + toIsoPoint.y + HALF_TILE_H;
      ctx.globalAlpha = 0.86;
      ctx.strokeStyle = fw.revealPaths ? 'rgba(255, 95, 175, 0.95)' : 'rgba(255, 76, 140, 0.68)';
      ctx.lineWidth = fw.revealPaths ? 2.9 : 2.2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    for (const defense of fw.defenses || []) {
      const node = byId.get(defense.nodeId);
      if (!node) continue;
      const iso = toIso(node.x, node.y);
      const cx = originX + iso.x;
      const cy = originY + iso.y + HALF_TILE_H;
      const radius = defense.typeId === 'purge' ? 10 : 7;
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = defense.color || '#65efff';
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 4 + Math.sin(now / 180) * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = defense.color || '#65efff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const packet of fw.packets || []) {
      const from = byId.get(packet.fromId);
      const to = byId.get(packet.toId);
      if (!from || !to) continue;
      const fromIso = toIso(from.x, from.y);
      const toIsoPoint = toIso(to.x, to.y);
      const x1 = originX + fromIso.x;
      const y1 = originY + fromIso.y + HALF_TILE_H;
      const x2 = originX + toIsoPoint.x;
      const y2 = originY + toIsoPoint.y + HALF_TILE_H;
      const t = Math.max(0, Math.min(1, packet.edgeT || 0));
      const px = x1 + ((x2 - x1) * t);
      const py = y1 + ((y2 - y1) * t);
      const typeColor = packet.typeId === 'tank' ? '#ff7e6b' : packet.typeId === 'splitter' ? '#ff5fd7' : '#ff4f9e';
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = typeColor;
      ctx.beginPath();
      ctx.arc(px, py, packet.typeId === 'tank' ? 4.4 : 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = '#ffd0ec';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(px, py, packet.typeId === 'tank' ? 6.8 : 5.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function pickTileFromClientPoint(clientX, clientY, state) {
    if (!state?.map) return null;
    const metrics = getSceneMetrics(state);
    const point = clientToWorldPoint(clientX, clientY, state);
    const { originX, originY } = point.frame;
    const isoX = point.x - originX;
    const isoY = point.y - originY;
    const raw = fromIso(isoX, isoY);
    const baseCol = Math.floor(raw.col);
    const baseRow = Math.floor(raw.row);

    let best = null;
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const col = baseCol + dc;
        const row = baseRow + dr;
        if (col < 0 || row < 0 || col >= state.map.width || row >= state.map.height) continue;
        const tileIso = toIso(col, row);
        const tileX = originX + tileIso.x;
        const tileY = originY + tileIso.y;
        const cx = tileX;
        const cy = tileY + HALF_TILE_H;
        const norm = Math.abs(point.x - cx) / HALF_TILE_W + Math.abs(point.y - cy) / HALF_TILE_H;
        if (norm > TILE_PICK_TOLERANCE) continue;
        if (!best || norm < best.norm) {
          best = { col, row, norm };
        }
      }
    }

    const tileCol = best ? best.col : baseCol;
    const tileRow = best ? best.row : baseRow;
    const inBounds = tileCol >= 0
      && tileRow >= 0
      && tileCol < state.map.width
      && tileRow < state.map.height;
    const blocked = inBounds ? isTileBlocked(tileCol, tileRow, metrics) : true;
    return {
      col: tileCol,
      row: tileRow,
      inBounds,
      blocked,
      valid: inBounds && !blocked,
    };
  }

  function pickNpcFromClientPoint(clientX, clientY, state) {
    if (!state?.npc?.entities?.length) return null;
    const metrics = getSceneMetrics(state);
    const point = clientToWorldPoint(clientX, clientY, state);
    const { originX, originY } = point.frame;
    let nearest = null;
    let nearestScore = Infinity;

    for (const npc of state.npc.entities) {
      if (!npc || npc.mode !== 'active') continue;
      const iso = toIso(npc.col, npc.row);
      const elevation = getTileElevation(npc.col, npc.row, metrics);
      const sx = originX + iso.x;
      const sy = originY + iso.y - elevation - 4;
      const dx = point.x - sx;
      const dy = point.y - (sy - 16);
      const withinBody = Math.abs(dx) <= NPC_HITBOX_HALF_WIDTH && Math.abs(dy) <= NPC_HITBOX_HALF_HEIGHT;
      if (!withinBody) continue;
      const score = (dx * dx) + (dy * dy);
      if (score < nearestScore) {
        nearest = npc;
        nearestScore = score;
      }
    }

    return nearest;
  }

  function pickControlNodeFromClientPoint(clientX, clientY, state) {
    if (!Array.isArray(state?.controlNodes) || !state.controlNodes.length) return null;
    const point = clientToWorldPoint(clientX, clientY, state);
    const { originX, originY } = point.frame;

    for (const node of state.controlNodes) {
      const iso = toIso(node.x, node.y);
      const cx = originX + iso.x;
      const cy = originY + iso.y + HALF_TILE_H;
      const dx = point.x - cx;
      const dy = point.y - cy;
      if (dx * dx + dy * dy <= CONTROL_NODE_PICK_RADIUS_SQ) {
        return node;
      }
    }
    return null;
  }

  function pickRemotePlayerFromClientPoint(clientX, clientY, state) {
    if (!Array.isArray(state?.remotePlayers) || !state.remotePlayers.length) return null;
    const metrics = getSceneMetrics(state);
    const point = clientToWorldPoint(clientX, clientY, state);
    const { originX, originY } = point.frame;
    let nearest = null;
    let nearestScore = Infinity;
    for (const remote of state.remotePlayers) {
      if (!remote || typeof remote.x !== 'number' || typeof remote.y !== 'number') continue;
      const iso = toIso(remote.x, remote.y);
      const elevation = getTileElevation(remote.x, remote.y, metrics);
      const sx = originX + iso.x;
      const sy = originY + iso.y - elevation - 4;
      const dx = point.x - sx;
      const dy = point.y - (sy - 16);
      const withinBody = Math.abs(dx) <= NPC_HITBOX_HALF_WIDTH && Math.abs(dy) <= NPC_HITBOX_HALF_HEIGHT;
      if (!withinBody) continue;
      const score = (dx * dx) + (dy * dy);
      if (score < nearestScore) {
        nearest = remote;
        nearestScore = score;
      }
    }
    return nearest;
  }

  function render(state) {
    const now = Date.now();
    const metrics = getSceneMetrics(state);

    rebuildBaseGridLayer();
    ensureWorldLayers(state, metrics);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(layerState.baseGrid.canvas, 0, 0);
    drawAnimatedNeonOverlay(now);

    const samImpact = state.effects?.samImpactUntil > now;
    const firewallHeavyHit = state.firewallDefense?.active && state.firewallDefense?.heavyHit;
    const shakeX = samImpact ? (Math.random() * 8 - 4) : 0;
    const shakeY = samImpact ? (Math.random() * 6 - 3) : 0;
    const firewallShakeX = firewallHeavyHit ? (Math.random() * 6 - 3) : 0;
    const firewallShakeY = firewallHeavyHit ? (Math.random() * 4 - 2) : 0;
    const frame = getCameraFrame(state);
    const { zoom, originX, originY } = frame;

    ctx.save();
    ctx.translate(frame.translateX + shakeX + firewallShakeX, frame.translateY + shakeY + firewallShakeY);
    ctx.scale(zoom, zoom);

    const worldDrawX = originX - layerState.worldOffsetX;
    const worldDrawY = originY - layerState.worldOffsetY;

    ctx.drawImage(layerState.roadBlocks.canvas, worldDrawX, worldDrawY);
    ctx.drawImage(layerState.worldObjects.canvas, worldDrawX, worldDrawY);
    drawMapSignalOverlay(originX, originY, state, now);
    drawDistrictControlOverlayEnhanced(originX, originY, state, now);
    drawCovertDistrictOverlay(originX, originY, state, now);

    drawNetworkDataLinksEnhanced(originX, originY, state.controlNodes, now, state);
    drawSignalRouterOverlay(originX, originY, state, now);
    drawFirewallDefenseOverlay(originX, originY, state, now);

    drawHoveredTile(originX, originY, state.mouse?.hoverTile, now);
    drawSelectedTile(originX, originY, state.mouse?.selectedTile, now);
    drawMoveTarget(originX, originY, state.player?.moveTarget, now);

    const activeOperations = state.signalOperations?.active;
    if (activeOperations?.length) {
      for (const operation of activeOperations) {
        if (!operation || operation.resolved) continue;
        drawSignalOperation(originX, originY, operation, now);
      }
    }

    // Draw Live Control Grid nodes beneath NPCs
    const controlNodes = state.controlNodes;
    if (Array.isArray(controlNodes) && controlNodes.length) {
      for (const node of controlNodes) {
        drawControlNodeEnhanced(originX, originY, node, now, state, state.mouse?.hoverNodeId === node.id);
        drawCovertNodeOverlay(originX, originY, node, now, state);
      }
    }

    const visible = getVisibleWorldRect(frame);
    const hideCrowd = zoom < CROWD_VISIBILITY_ZOOM_THRESHOLD;

    renderLayers.length = 0;
    const npcEntities = state.npc?.entities;
    if (npcEntities?.length) {
      for (const npc of npcEntities) {
        if (!npc || typeof npc.col !== 'number') continue;
        renderLayers.push({ type: 'npc', y: npc.row, entity: npc });
      }
    }
    const remotePlayers = state.remotePlayers;
    if (remotePlayers?.length) {
      for (const remote of remotePlayers) {
        if (typeof remote.x !== 'number' || typeof remote.y !== 'number') continue;
        renderLayers.push({ type: 'remote', y: remote.y, entity: remote });
      }
    }
    renderLayers.push({ type: 'player', y: state.player.y, entity: state.player });
    renderLayers.sort((a, b) => a.y - b.y);

    for (const layer of renderLayers) {
      if (layer.type === 'npc') {
        if (hideCrowd && layer.entity.mode === 'crowd') continue;
        const npcEntity = layer.entity;
        const iso = toIso(npcEntity.col, npcEntity.row);
        const elevation = getTileElevation(npcEntity.col, npcEntity.row, metrics);
        const screenX = frame.translateX + shakeX + ((originX + iso.x) * zoom);
        const screenY = frame.translateY + shakeY + ((originY + iso.y - elevation - 4) * zoom);
        if (isOffscreen(screenX, screenY)) continue;
        drawNpc(
          originX,
          originY,
          layer.entity,
          now,
          state.player?.nearbyNpcId === layer.entity.id,
          state.mouse?.hoverNpcId === layer.entity.id,
          metrics,
          visible,
        );
      } else if (layer.type === 'remote') {
        const remote = layer.entity;
        const iso = toIso(remote.x, remote.y);
        const elevation = getTileElevation(remote.x, remote.y, metrics);
        const screenX = frame.translateX + shakeX + ((originX + iso.x) * zoom);
        const screenY = frame.translateY + shakeY + ((originY + iso.y - elevation - 4) * zoom);
        if (isOffscreen(screenX, screenY)) continue;
        drawRemotePlayer(
          originX,
          originY,
          layer.entity,
          now,
          metrics,
          visible,
          state.mouse?.hoverRemotePlayerId === layer.entity.id,
          state.mouse?.selectedRemotePlayerId === layer.entity.id,
        );
      } else {
        drawPlayer(originX, originY, state, now, metrics);
      }
    }

    if (state.effects?.signalOperationPulseUntil > now) {
      drawOperationSuccess(originX, originY, state.effects.signalOperationPulse, now, state.effects.signalOperationPulseUntil);
    }

    ctx.restore();

    if (state.phase === 'Night') {
      ctx.fillStyle = 'rgba(8,3,22,0.22)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (samImpact) {
      ctx.fillStyle = 'rgba(255,79,216,0.09)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  return {
    render,
    pickTileFromClientPoint,
    pickNpcFromClientPoint,
    pickControlNodeFromClientPoint,
    pickRemotePlayerFromClientPoint,
  };
}
