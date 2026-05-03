const GRID_SIZE = 20;
const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const MAP_SAFE_MARGIN_RATIO = 0.08;
const ATTACK_RANGE = 1.3;
const ATTACK_INPUT_COOLDOWN_MS = 350;
const EXTRACT_INTENT_THROTTLE_MS = 1000;
const MISSION_COMPLETE_MSG = 'MISSION COMPLETE - extraction successful';
const MISSION_COMPLETE_TOAST_MS = 1200;
const MISSION_COMPLETE_TOAST_THROTTLE_MS = 1400;

if (window.BlockTopiaMap && typeof window.BlockTopiaMap.destroy === 'function') {
  window.BlockTopiaMap.destroy();
}

let canvas = null;
let ctx = null;
let mounted = false;
let animationFrameId = null;

let viewWidth = 0;
let viewHeight = 0;
let cameraX = 0;
let cameraY = 0;
let cameraScale = 1;

const runtime = {
  localPlayer: { id: 'local', x: 1, y: 1, color: '#6da9ff', name: 'You', sessionId: '', hp: 100, kills: 0, downs: 0, respawnAt: 0 },
  remotePlayer: { id: 'remote', x: GRID_SIZE - 2, y: GRID_SIZE - 2, color: '#f6fbff', name: 'Remote', connected: false, sessionId: '', hp: 100, kills: 0, downs: 0, respawnAt: 0 },
  npcs: [],
  worldMode: 'single-player-vs-npc',
  feed: [],
  feedMeta: { lastMessage: '', lastAt: 0 },
  feedClassMeta: {},
  feedback: [],
  missionCompleteFeedbackAt: 0,
  lastExtractIntentAt: 0,
  flashes: [],
  attackCooldownUntil: 0,
  inputEnabled: true,
  mission: {
    startedAt: 0,
    surviveMs: 60000,
    requiredKills: 5,
    extractionUnlocked: false,
    extractionTile: null,
    completed: false,
    completedAt: 0,
    neutralizedCount: 0,
    extractionSent: false,
  },
  npcHpById: {},
  connectionStatus: { ws: 'offline', joined: false, roomId: '', error: '' },
  positionSink: null,
  attackSink: null,
  extractSink: null,
  tiles: createTiles(),
};

function getTileId(x, y) {
  return y * GRID_SIZE + x;
}

function decideTerrain(x, y) {
  const lineRoad = x % 5 === 0 || y % 5 === 0;
  const diagonalRoad = (x + y) % 7 === 0;
  const hash = ((x + 17) * 928371 + (y + 31) * 192847 + x * y * 11939) % 1000;
  if (lineRoad || diagonalRoad) return 'road';
  if (hash < 125) return 'block';
  return 'grass';
}

function createTiles() {
  const tiles = {};
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const id = getTileId(x, y);
      tiles[id] = { id, x, y, terrain: decideTerrain(x, y) };
    }
  }
  forceRoad(tiles, 1, 1);
  forceRoad(tiles, 2, 1);
  forceRoad(tiles, 1, 2);
  forceRoad(tiles, GRID_SIZE - 2, GRID_SIZE - 2);
  forceRoad(tiles, GRID_SIZE - 3, GRID_SIZE - 2);
  forceRoad(tiles, GRID_SIZE - 2, GRID_SIZE - 3);
  return tiles;
}

function forceRoad(tiles, x, y) {
  const tile = tiles[getTileId(x, y)];
  if (tile) tile.terrain = 'road';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function pushFeedback(message, durationMs = 1200, color = 'rgba(255, 234, 151, 0.98)') {
  if (!message) return;
  const now = Date.now();
  runtime.feedback.push({
    message: String(message),
    expiresAt: now + durationMs,
    color,
  });
  if (runtime.feedback.length > 5) runtime.feedback.shift();
}

function pushFlash(type, durationMs = 350) {
  runtime.flashes.push({ type, expiresAt: Date.now() + durationMs });
  if (runtime.flashes.length > 8) runtime.flashes.shift();
}

function ensureMissionStart() {
  if (!runtime.mission.startedAt) runtime.mission.startedAt = Date.now();
}

function pickExtractionTile() {
  const candidates = [
    { x: GRID_SIZE - 2, y: GRID_SIZE - 2 },
    { x: GRID_SIZE - 2, y: 1 },
    { x: 1, y: GRID_SIZE - 2 },
    { x: Math.floor(GRID_SIZE / 2), y: GRID_SIZE - 2 },
  ];
  const pick = candidates.find((t) => isPassable(t.x, t.y));
  if (pick) return pick;
  for (let y = GRID_SIZE - 1; y >= 0; y -= 1) {
    for (let x = GRID_SIZE - 1; x >= 0; x -= 1) {
      if (isPassable(x, y)) return { x, y };
    }
  }
  return { x: GRID_SIZE - 2, y: GRID_SIZE - 2 };
}

function updateMissionProgress() {
  const kills = Math.max(0, Number(runtime.localPlayer.kills) || 0);
  runtime.mission.neutralizedCount = kills;
  const now = Date.now();
  const elapsedAnchor = runtime.mission.completedAt || now;
  const elapsed = runtime.mission.startedAt ? elapsedAnchor - runtime.mission.startedAt : 0;
  const survivalDone = elapsed >= runtime.mission.surviveMs;
  const killDone = kills >= runtime.mission.requiredKills;
  if (!runtime.mission.extractionUnlocked && survivalDone && killDone) {
    runtime.mission.extractionUnlocked = true;
    runtime.mission.extractionTile = pickExtractionTile();
    pushFeedback('Extraction unlocked', 1400, 'rgba(170, 246, 197, 0.98)');
  }
  if (runtime.mission.extractionUnlocked && !runtime.mission.completed && runtime.mission.extractionTile && survivalDone && killDone) {
    const tile = runtime.mission.extractionTile;
    if (runtime.localPlayer.x === tile.x && runtime.localPlayer.y === tile.y) {
      runtime.mission.completed = true;
      runtime.mission.completedAt = now;
      pushFeedback('MISSION COMPLETE', 2200, 'rgba(152, 255, 173, 0.98)');
      trySendExtractIntent();
    }
  }
}

function trySendExtractIntent() {
  if (!runtime.mission.completed || runtime.mission.extractionSent || !runtime.extractSink) return;
  const now = Date.now();
  if (now - runtime.lastExtractIntentAt < EXTRACT_INTENT_THROTTLE_MS) return;
  runtime.lastExtractIntentAt = now;
  const sent = runtime.extractSink();
  if (sent) runtime.mission.extractionSent = true;
}

function isPassable(x, y) {
  if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) return false;
  const tile = runtime.tiles[getTileId(x, y)];
  return Boolean(tile && tile.terrain !== 'block');
}

function computeIsoBounds(scale) {
  const tw = TILE_WIDTH * scale;
  const th = TILE_HEIGHT * scale;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const sx = (x - y) * (tw / 2);
      const sy = (x + y) * (th / 2);
      minX = Math.min(minX, sx - tw / 2);
      maxX = Math.max(maxX, sx + tw / 2);
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy + th);
    }
  }

  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

function tileToScreen(x, y) {
  const tw = TILE_WIDTH * cameraScale;
  const th = TILE_HEIGHT * cameraScale;
  return [(x - y) * (tw / 2) + cameraX, (x + y) * (th / 2) + cameraY];
}

function pickTile(screenX, screenY) {
  const tw = TILE_WIDTH * cameraScale;
  const th = TILE_HEIGHT * cameraScale;
  const localX = screenX - cameraX;
  const localY = screenY - cameraY;
  const gx = (localX / (tw / 2) + localY / (th / 2)) / 2;
  const gy = (localY / (th / 2) - localX / (tw / 2)) / 2;

  const candidates = [
    [Math.floor(gx), Math.floor(gy)],
    [Math.ceil(gx), Math.floor(gy)],
    [Math.floor(gx), Math.ceil(gy)],
    [Math.ceil(gx), Math.ceil(gy)],
  ];

  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const [tx, ty] of candidates) {
    if (tx < 0 || ty < 0 || tx >= GRID_SIZE || ty >= GRID_SIZE) continue;

    const [sx, sy] = tileToScreen(tx, ty);
    const dx = Math.abs(screenX - sx) / (tw / 2);
    const dy = Math.abs(screenY - (sy + th / 2)) / (th / 2);
    const dist = dx + dy;

    if (dist <= 1) return { x: tx, y: ty };
    if (dist < bestDist) {
      bestDist = dist;
      best = { x: tx, y: ty };
    }
  }

  return best;
}

function moveLocal(dx, dy) {
  const nextX = runtime.localPlayer.x + dx;
  const nextY = runtime.localPlayer.y + dy;
  if (runtime.positionSink) {
    runtime.positionSink({ x: nextX, y: nextY, sessionId: runtime.localPlayer.sessionId });
    return;
  }
  if (isPassable(nextX, nextY)) {
    runtime.localPlayer.x = nextX;
    runtime.localPlayer.y = nextY;
  }
}

function onKeyDown(event) {
  if (!runtime.inputEnabled) return;
  const key = event.key;

  if (key === 'ArrowUp' || key === 'w' || key === 'W') {
    event.preventDefault();
    moveLocal(0, -1);
    return;
  }
  if (key === 'ArrowDown' || key === 's' || key === 'S') {
    event.preventDefault();
    moveLocal(0, 1);
    return;
  }
  if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
    event.preventDefault();
    moveLocal(-1, 0);
    return;
  }
  if (key === 'ArrowRight' || key === 'd' || key === 'D') {
    event.preventDefault();
    moveLocal(1, 0);
    return;
  }
  if (key === ' ' || key === 'Spacebar') {
    event.preventDefault();
    tryAttack();
  }
}

function tryAttack() {
  ensureMissionStart();
  if (runtime.mission.completed) {
    trySendExtractIntent();
    const now = Date.now();
    if (now - runtime.missionCompleteFeedbackAt >= MISSION_COMPLETE_TOAST_THROTTLE_MS) {
      runtime.missionCompleteFeedbackAt = now;
      pushFeedback(MISSION_COMPLETE_MSG, MISSION_COMPLETE_TOAST_MS, 'rgba(170, 246, 197, 0.98)');
    }
    return;
  }
  if (runtime.localPlayer.hp <= 0) {
    const now = Date.now();
    const seconds = runtime.localPlayer.respawnAt > now ? Math.ceil((runtime.localPlayer.respawnAt - now) / 1000) : 0;
    pushFeedback(`DOWNED — respawning in ${seconds}s`, 1100, 'rgba(255, 153, 153, 0.98)');
    return;
  }

  const now = Date.now();
  if (now < runtime.attackCooldownUntil) {
    pushFeedback('Attack cooling down', 900);
    return;
  }

  const nearestNpcDist = runtime.npcs
    .filter((npc) => npc && npc.hp > 0)
    .reduce((best, npc) => Math.min(best, distance(runtime.localPlayer.x, runtime.localPlayer.y, npc.x, npc.y)), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(nearestNpcDist) || nearestNpcDist > ATTACK_RANGE) {
    pushFeedback('No NPC in range', 1000);
    return;
  }

  const attackResult = runtime.attackSink ? runtime.attackSink() : { ok: false, reason: 'disconnected' };
  if (attackResult === false) {
    const notConnected = !runtime.connectionStatus.joined || runtime.connectionStatus.ws !== 'connected';
    pushFeedback(notConnected ? 'Not connected' : 'Attack cooling down', 900);
    return;
  }
  if (attackResult && typeof attackResult === 'object' && attackResult.ok === false) {
    if (attackResult.reason === 'disconnected') {
      pushFeedback('Not connected', 900);
      return;
    }
    if (attackResult.reason === 'cooldown') {
      pushFeedback('Attack cooling down', 900);
      return;
    }
  }
  if (!attackResult || (typeof attackResult === 'object' && attackResult.ok !== true)) {
    pushFeedback('Not connected', 900);
    return;
  }
  runtime.attackCooldownUntil = now + ATTACK_INPUT_COOLDOWN_MS;
}

function onPointerDown(event) {
  if (!runtime.inputEnabled) return;
  ensureMissionStart();
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  const tile = pickTile(px, py);
  if (!tile) return;

  if (runtime.positionSink) {
    runtime.positionSink({ x: tile.x, y: tile.y, sessionId: runtime.localPlayer.sessionId });
    return;
  }
  if (isPassable(tile.x, tile.y)) {
    runtime.localPlayer.x = tile.x;
    runtime.localPlayer.y = tile.y;
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, viewHeight);
  gradient.addColorStop(0, '#050b1a');
  gradient.addColorStop(0.5, '#0a1429');
  gradient.addColorStop(1, '#03070f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, viewWidth, viewHeight);
}

function getTerrainColor(tile) {
  if (tile.terrain === 'block') {
    const shade = 42 + ((tile.x + tile.y) % 3) * 6;
    return `rgb(${shade}, ${shade + 3}, ${shade + 10})`;
  }
  if (tile.terrain === 'road') {
    const shade = 70 + ((tile.x * 3 + tile.y * 5) % 4) * 5;
    return `rgb(${shade}, ${shade + 8}, ${shade + 22})`;
  }
  const shade = 58 + ((tile.x * 7 + tile.y * 11) % 5) * 4;
  return `rgb(${shade - 8}, ${shade + 16}, ${shade - 4})`;
}

function drawDiamond(tile) {
  const [sx, sy] = tileToScreen(tile.x, tile.y);
  const tw = TILE_WIDTH * cameraScale;
  const th = TILE_HEIGHT * cameraScale;

  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + tw / 2, sy + th / 2);
  ctx.lineTo(sx, sy + th);
  ctx.lineTo(sx - tw / 2, sy + th / 2);
  ctx.closePath();
  ctx.fillStyle = getTerrainColor(tile);
  ctx.fill();

  if (tile.terrain === 'road') {
    const glow = 0.2 + 0.2 * (Math.sin(performance.now() * 0.002 + tile.x + tile.y) * 0.5 + 0.5);
    ctx.strokeStyle = `rgba(150, 205, 255, ${glow})`;
    ctx.lineWidth = 2.3 * cameraScale;
  } else if (tile.terrain === 'grass') {
    ctx.strokeStyle = 'rgba(40, 60, 36, 0.9)';
    ctx.lineWidth = 1.5 * cameraScale;
  } else {
    ctx.strokeStyle = 'rgba(76, 82, 98, 0.95)';
    ctx.lineWidth = 1.8 * cameraScale;
  }

  ctx.stroke();
}

function drawTiles() {
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      drawDiamond(runtime.tiles[getTileId(x, y)]);
    }
  }
}

function drawMarker(player, label, connected) {
  const [sx, sy] = tileToScreen(player.x, player.y);
  const th = TILE_HEIGHT * cameraScale;
  const cy = sy + th / 2 - 12 * cameraScale;

  ctx.beginPath();
  ctx.ellipse(sx, sy + th / 2 - 1 * cameraScale, 8 * cameraScale, 4 * cameraScale, 0, 0, Math.PI * 2);
  ctx.fillStyle = connected ? 'rgba(0, 0, 0, 0.32)' : 'rgba(0, 0, 0, 0.16)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(sx, cy, 9 * cameraScale, 0, Math.PI * 2);
  ctx.fillStyle = connected ? player.color : '#7b7f90';
  ctx.fill();
  ctx.strokeStyle = 'rgba(10, 14, 28, 0.95)';
  ctx.lineWidth = 1.8 * cameraScale;
  ctx.stroke();

  ctx.fillStyle = '#f3f8ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.max(9, Math.floor(11 * cameraScale))}px Segoe UI`;
  ctx.fillText(label, sx, cy + 0.5);
}

function drawNpc(npc) {
  if (!npc || npc.hp <= 0) return;
  const [sx, sy] = tileToScreen(npc.x, npc.y);
  const th = TILE_HEIGHT * cameraScale;
  const cy = sy + th / 2 - 8 * cameraScale;
  const maxHp = Math.max(1, Number(npc.maxHp || npc.hpMax || 40));
  const aliveRatio = clamp((npc.hp || 0) / maxHp, 0, 1);

  ctx.beginPath();
  ctx.arc(sx, cy, 6.5 * cameraScale, 0, Math.PI * 2);
  ctx.fillStyle = npc.kind === 'raider' ? 'rgba(255,95,95,0.92)' : 'rgba(255,169,90,0.92)';
  ctx.fill();

  ctx.fillStyle = 'rgba(7, 10, 16, 0.95)';
  ctx.fillRect(sx - 8 * cameraScale, cy - 12 * cameraScale, 16 * cameraScale, 2.5 * cameraScale);
  ctx.fillStyle = aliveRatio > 0.35 ? 'rgba(88, 236, 135, 0.95)' : 'rgba(255, 119, 119, 0.95)';
  ctx.fillRect(sx - 8 * cameraScale, cy - 12 * cameraScale, 16 * cameraScale * aliveRatio, 2.5 * cameraScale);
}

function drawExtractionMarker() {
  const mission = runtime.mission;
  if (!mission.extractionUnlocked || !mission.extractionTile || mission.completed) return;
  const [sx, sy] = tileToScreen(mission.extractionTile.x, mission.extractionTile.y);
  const th = TILE_HEIGHT * cameraScale;
  const cy = sy + th / 2 - 14 * cameraScale;
  ctx.beginPath();
  ctx.arc(sx, cy, 12 * cameraScale, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(152, 255, 173, 0.95)';
  ctx.lineWidth = 2.2 * cameraScale;
  ctx.stroke();
  ctx.fillStyle = 'rgba(152, 255, 173, 0.22)';
  ctx.fill();
}

function drawPlayers() {
  drawMarker(runtime.localPlayer, 'L', true);
  drawMarker(runtime.remotePlayer, 'R', runtime.remotePlayer.connected);
}

function drawNpcs() {
  for (const npc of runtime.npcs) drawNpc(npc);
  drawExtractionMarker();
}

function drawHud() {
  const status = runtime.connectionStatus;
  const remoteState = runtime.remotePlayer.connected ? 'ONLINE' : 'OFFLINE';
  const now = Date.now();
  const localRespawnSec = runtime.localPlayer.respawnAt > now ? Math.ceil((runtime.localPlayer.respawnAt - now) / 1000) : 0;
  const remoteRespawnSec = runtime.remotePlayer.respawnAt > now ? Math.ceil((runtime.remotePlayer.respawnAt - now) / 1000) : 0;
  const localHpLabel = runtime.localPlayer.hp <= 0 ? `DOWNED — respawning in ${Math.max(0, localRespawnSec)}s` : `HP ${runtime.localPlayer.hp}`;
  const remoteHpLabel = runtime.remotePlayer.hp <= 0 ? `DOWNED — respawning in ${Math.max(0, remoteRespawnSec)}s` : `HP ${runtime.remotePlayer.hp}`;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '700 13px Segoe UI';
  ctx.fillStyle = 'rgba(228, 240, 255, 0.95)';
  ctx.fillText(`P1 ${localHpLabel} | K ${runtime.localPlayer.kills} D ${runtime.localPlayer.downs} (${runtime.localPlayer.x},${runtime.localPlayer.y})`, 12, 10);

  ctx.fillStyle = runtime.remotePlayer.connected ? 'rgba(255, 210, 210, 0.95)' : 'rgba(196, 201, 214, 0.9)';
  ctx.fillText(`P2 ${remoteState} ${remoteHpLabel} | K ${runtime.remotePlayer.kills} D ${runtime.remotePlayer.downs} (${runtime.remotePlayer.x},${runtime.remotePlayer.y})`, 12, 28);

  ctx.fillStyle = 'rgba(180, 224, 255, 0.95)';
  ctx.fillText(`MODE ${runtime.worldMode.toUpperCase()} | NPC ${runtime.npcs.filter((n) => n.hp > 0).length}`, 12, 46);

  ctx.fillStyle = 'rgba(214, 226, 245, 0.85)';
  ctx.font = '600 12px Segoe UI';
  ctx.fillText(`NET ${String(status.ws || 'offline').toUpperCase()}${status.roomId ? ` | ROOM ${status.roomId}` : ''}${status.error ? ` | ${status.error}` : ''}`, 12, 64);
  const surviveTotalSec = Math.ceil(runtime.mission.surviveMs / 1000);
  const elapsedAnchor = runtime.mission.completedAt || now;
  const elapsed = runtime.mission.startedAt ? elapsedAnchor - runtime.mission.startedAt : 0;
  const surviveLeftSec = Math.max(0, Math.ceil((runtime.mission.surviveMs - elapsed) / 1000));
  const surviveDone = elapsed >= runtime.mission.surviveMs;
  const neutralized = runtime.mission.neutralizedCount;
  const killDone = neutralized >= runtime.mission.requiredKills;
  const mission2Label = surviveDone ? 'Mission 2' : 'Mission 2 (tracking - unlocks after Mission 1)';
  const extractionText = runtime.mission.extractionUnlocked
    ? runtime.mission.completed
      ? 'Extraction reached'
      : `Reach extraction tile (${runtime.mission.extractionTile?.x},${runtime.mission.extractionTile?.y})`
    : surviveDone
      ? 'Extraction locked (neutralize target to unlock)'
      : 'Extraction locked until survival is complete and the target is neutralized';

  ctx.font = '700 12px Segoe UI';
  ctx.fillStyle = surviveDone ? 'rgba(152, 255, 173, 0.96)' : 'rgba(255, 234, 151, 0.96)';
  ctx.fillText(`Mission 1: Survive ${surviveTotalSec}s (${surviveLeftSec}s left)`, 12, 84);
  ctx.fillStyle = killDone ? 'rgba(152, 255, 173, 0.96)' : 'rgba(255, 234, 151, 0.96)';
  ctx.fillText(`${mission2Label}: Neutralize ${runtime.mission.requiredKills} NPCs (${Math.min(neutralized, runtime.mission.requiredKills)}/${runtime.mission.requiredKills})`, 12, 102);
  ctx.fillStyle = runtime.mission.completed ? 'rgba(152, 255, 173, 0.96)' : 'rgba(198, 223, 255, 0.96)';
  ctx.fillText(`Mission 3: ${extractionText}`, 12, 120);
  if (runtime.mission.completed) {
    const survivedSec = Math.max(0, Math.ceil(elapsed / 1000));
    ctx.fillStyle = 'rgba(170, 246, 197, 0.98)';
    ctx.fillText(MISSION_COMPLETE_MSG, 12, 138);
    ctx.fillStyle = 'rgba(214, 226, 245, 0.9)';
    ctx.fillText(`Run summary: Kills ${runtime.localPlayer.kills} | Downs ${runtime.localPlayer.downs} | Time ${survivedSec}s`, 12, 156);
  }

  const feed = runtime.feed[runtime.feed.length - 1];
  if (feed) {
    const fy = viewHeight - 30;
    ctx.fillStyle = 'rgba(5, 10, 22, 0.75)';
    ctx.fillRect(10, fy - 2, viewWidth - 20, 22);
    ctx.fillStyle = 'rgba(218, 231, 255, 0.95)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(feed, 16, fy + 9);
  }
}

function drawFeedback() {
  const now = Date.now();
  runtime.feedback = runtime.feedback.filter((entry) => entry && entry.expiresAt > now);
  if (!runtime.feedback.length) return;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const centerX = Math.floor(viewWidth / 2);
  let y = Math.floor(viewHeight * 0.18);
  for (const entry of runtime.feedback) {
    const w = Math.max(220, Math.min(460, entry.message.length * 8));
    ctx.fillStyle = 'rgba(6, 13, 26, 0.82)';
    ctx.fillRect(centerX - w / 2, y - 14, w, 26);
    ctx.strokeStyle = 'rgba(146, 196, 255, 0.38)';
    ctx.strokeRect(centerX - w / 2 + 0.5, y - 13.5, w - 1, 25);
    ctx.fillStyle = entry.color || 'rgba(255, 234, 151, 0.98)';
    ctx.font = '700 14px Segoe UI';
    ctx.fillText(entry.message, centerX, y);
    y += 30;
  }
}

function drawMissionCompleteBanner() {
  if (!runtime.mission.completed) return;
  const now = Date.now();
  if (runtime.mission.completedAt && now - runtime.mission.completedAt > 6000) return;
  const w = Math.min(560, Math.max(300, Math.floor(viewWidth * 0.72)));
  const h = 70;
  const x = Math.floor((viewWidth - w) / 2);
  const y = Math.floor(viewHeight * 0.1);
  ctx.fillStyle = 'rgba(7, 22, 20, 0.84)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(152, 255, 173, 0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 24px Segoe UI';
  ctx.fillStyle = 'rgba(170, 246, 197, 0.98)';
  ctx.fillText('MISSION COMPLETE', x + Math.floor(w / 2), y + 28);
  ctx.font = '700 13px Segoe UI';
  ctx.fillStyle = 'rgba(218, 231, 255, 0.95)';
  ctx.fillText('Extraction successful', x + Math.floor(w / 2), y + 50);
}

function drawDamageFlash() {
  const now = Date.now();
  runtime.flashes = runtime.flashes.filter((entry) => entry && entry.expiresAt > now);
  if (!runtime.flashes.length) return;
  const latest = runtime.flashes[runtime.flashes.length - 1];
  if (!latest) return;
  const alpha = latest.type === 'npc_hit' ? 0.08 : 0.14;
  ctx.fillStyle = latest.type === 'npc_hit' ? `rgba(255, 120, 120, ${alpha})` : `rgba(255, 60, 60, ${alpha})`;
  ctx.fillRect(0, 0, viewWidth, viewHeight);
}

function render() {
  if (!mounted || !ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawTiles();
  drawNpcs();
  drawPlayers();
  drawHud();
  drawFeedback();
  drawMissionCompleteBanner();
  drawDamageFlash();
}

function renderFrame() {
  render();
  if (mounted) animationFrameId = requestAnimationFrame(renderFrame);
}

function resize() {
  if (!canvas || !ctx) return;

  const ratio = window.devicePixelRatio || 1;
  const host = canvas.parentElement;
  const hostRect = host ? host.getBoundingClientRect() : canvas.getBoundingClientRect();

  viewWidth = Math.max(320, Math.floor(hostRect.width || window.innerWidth));
  viewHeight = Math.max(240, Math.floor(hostRect.height || window.innerHeight));

  canvas.width = Math.floor(viewWidth * ratio);
  canvas.height = Math.floor(viewHeight * ratio);
  canvas.style.width = `${viewWidth}px`;
  canvas.style.height = `${viewHeight}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const baseBounds = computeIsoBounds(1);
  const safeMarginX = viewWidth * MAP_SAFE_MARGIN_RATIO;
  const safeMarginY = viewHeight * MAP_SAFE_MARGIN_RATIO;
  const fitWidth = Math.max(64, viewWidth - safeMarginX * 2);
  const fitHeight = Math.max(64, viewHeight - safeMarginY * 2);
  cameraScale = clamp(Math.min(fitWidth / baseBounds.width, fitHeight / baseBounds.height), 0.35, 1.25);

  const scaledBounds = computeIsoBounds(cameraScale);
  cameraX = Math.floor((viewWidth - scaledBounds.width) / 2 - scaledBounds.minX);
  cameraY = Math.floor((viewHeight - scaledBounds.height) / 2 - scaledBounds.minY);
}

function resolveMountCanvas(options = {}) {
  if (options.canvas instanceof HTMLCanvasElement) return options.canvas;
  const canvasId = options.canvasId ?? 'game';
  const containerId = options.containerId ?? 'game-shell';
  const existing = document.getElementById(canvasId);
  if (existing instanceof HTMLCanvasElement) return existing;

  const container = document.getElementById(containerId) ?? document.body;
  const created = document.createElement('canvas');
  created.id = canvasId;
  created.setAttribute('aria-label', 'Block Topia isometric map base');
  created.style.display = 'block';
  created.style.width = '100%';
  created.style.height = '100%';
  container.appendChild(created);
  return created;
}

function mount(options = {}) {
  if (mounted) destroy();

  canvas = resolveMountCanvas(options);
  ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('BlockTopiaMap mount failed: 2D context unavailable');

  mounted = true;
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('pointerdown', onPointerDown);

  resize();
  animationFrameId = requestAnimationFrame(renderFrame);
  return canvas;
}

function destroy() {
  if (animationFrameId != null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  window.removeEventListener('resize', resize);
  window.removeEventListener('keydown', onKeyDown);
  if (canvas) canvas.removeEventListener('pointerdown', onPointerDown);

  mounted = false;
  ctx = null;
  canvas = null;
}

function setConnectionStatus(status = {}) {
  runtime.connectionStatus = { ...runtime.connectionStatus, ...status };
  if (typeof status.joined === 'boolean') runtime.remotePlayer.connected = status.joined;
}

function setLocalPlayer(payload = {}) {
  const prevHp = runtime.localPlayer.hp;
  const nextX = Number.isFinite(payload.x) ? clamp(Math.floor(payload.x), 0, GRID_SIZE - 1) : runtime.localPlayer.x;
  const nextY = Number.isFinite(payload.y) ? clamp(Math.floor(payload.y), 0, GRID_SIZE - 1) : runtime.localPlayer.y;
  runtime.localPlayer.x = nextX;
  runtime.localPlayer.y = nextY;
  if (typeof payload.name === 'string') runtime.localPlayer.name = payload.name;
  if (typeof payload.sessionId === 'string') runtime.localPlayer.sessionId = payload.sessionId;
  if (Number.isFinite(payload.hp)) runtime.localPlayer.hp = Math.max(0, Math.floor(payload.hp));
  if (Number.isFinite(payload.kills)) runtime.localPlayer.kills = Math.max(0, Math.floor(payload.kills));
  if (Number.isFinite(payload.downs)) runtime.localPlayer.downs = Math.max(0, Math.floor(payload.downs));
  if (Number.isFinite(payload.respawnAt)) runtime.localPlayer.respawnAt = Math.max(0, Math.floor(payload.respawnAt));
  if (!runtime.mission.completed && runtime.localPlayer.hp < prevHp) {
    pushFeedback(`HIT -${prevHp - runtime.localPlayer.hp}`, 850, 'rgba(255, 146, 146, 0.98)');
    pushFlash('player_hit', 260);
  }
  if (!runtime.mission.completed && prevHp > 0 && runtime.localPlayer.hp <= 0) {
    const now = Date.now();
    const seconds = runtime.localPlayer.respawnAt > now ? Math.ceil((runtime.localPlayer.respawnAt - now) / 1000) : 0;
    pushFeedback(`DOWNED — respawning in ${seconds}s`, 1600, 'rgba(255, 153, 153, 0.98)');
  }
  updateMissionProgress();
}

function setRemotePlayer(payload = {}) {
  const nextX = Number.isFinite(payload.x) ? clamp(Math.floor(payload.x), 0, GRID_SIZE - 1) : runtime.remotePlayer.x;
  const nextY = Number.isFinite(payload.y) ? clamp(Math.floor(payload.y), 0, GRID_SIZE - 1) : runtime.remotePlayer.y;
  runtime.remotePlayer.x = nextX;
  runtime.remotePlayer.y = nextY;
  if (typeof payload.name === 'string') runtime.remotePlayer.name = payload.name;
  if (typeof payload.sessionId === 'string') runtime.remotePlayer.sessionId = payload.sessionId;
  if (typeof payload.connected === 'boolean') runtime.remotePlayer.connected = payload.connected;
  if (Number.isFinite(payload.hp)) runtime.remotePlayer.hp = Math.max(0, Math.floor(payload.hp));
  if (Number.isFinite(payload.kills)) runtime.remotePlayer.kills = Math.max(0, Math.floor(payload.kills));
  if (Number.isFinite(payload.downs)) runtime.remotePlayer.downs = Math.max(0, Math.floor(payload.downs));
  if (Number.isFinite(payload.respawnAt)) runtime.remotePlayer.respawnAt = Math.max(0, Math.floor(payload.respawnAt));
}

function updatePlayers(players = []) {
  if (!Array.isArray(players)) return;

  const localSession = runtime.localPlayer.sessionId;
  const localMatch = localSession ? players.find((p) => p && p.sessionId === localSession) : null;
  if (localMatch) {
    setLocalPlayer(localMatch);
  }

  const remote = players.find((p) => p && (!localSession || p.sessionId !== localSession));
  if (remote) {
    setRemotePlayer({ ...remote, connected: true });
  } else {
    runtime.remotePlayer.connected = false;
  }
}

function setNpcs(npcs = []) {
  if (!Array.isArray(npcs)) return;
  const next = npcs.map((npc) => ({
    id: String(npc?.id || ''),
    x: clamp(Math.floor(Number(npc?.x) || 0), 0, GRID_SIZE - 1),
    y: clamp(Math.floor(Number(npc?.y) || 0), 0, GRID_SIZE - 1),
    hp: Math.max(0, Math.floor(Number(npc?.hp) || 0)),
    maxHp: Math.max(1, Number(npc?.maxHp ?? npc?.hpMax) || 40),
    kind: String(npc?.kind || 'drone'),
    targetSessionId: String(npc?.targetSessionId || ''),
  }));
  const nextHpById = {};
  for (const npc of next) {
    nextHpById[npc.id] = npc.hp;
    const prevHp = runtime.npcHpById[npc.id];
    if (!runtime.mission.completed && Number.isFinite(prevHp) && npc.hp < prevHp) {
      pushFlash('npc_hit', 180);
    }
    if (!runtime.mission.completed && Number.isFinite(prevHp) && prevHp > 0 && npc.hp <= 0) {
      pushFeedback('+1 neutralized', 900, 'rgba(170, 246, 197, 0.98)');
    }
  }
  runtime.npcHpById = nextHpById;
  runtime.npcs = next;
  updateMissionProgress();
}

function setWorldMode(mode) {
  if (typeof mode !== 'string' || !mode) return;
  runtime.worldMode = mode;
}

function pushFeed(message) {
  if (!message) return;
  const text = String(message);
  if (shouldSuppressFeedMessage(text)) return;
  const now = Date.now();
  if (runtime.feedMeta.lastMessage === text && now - runtime.feedMeta.lastAt < 2200) return;
  const classificationKey = classifyFeedMessage(text);
  if (classificationKey) {
    const lastClassAt = runtime.feedClassMeta[classificationKey] || 0;
    const classWindowMs = classificationKey.startsWith('neutralized:') ? 2600 : 3600;
    if (now - lastClassAt < classWindowMs) return;
    runtime.feedClassMeta[classificationKey] = now;
  }
  runtime.feedMeta.lastMessage = text;
  runtime.feedMeta.lastAt = now;
  runtime.feed.push(text);
  if (runtime.feed.length > 6) runtime.feed.shift();
}

function shouldSuppressFeedMessage(message) {
  if (!runtime.mission.completed) return false;
  const normalized = String(message || '').toLowerCase();
  if (normalized.includes('neutralized npc_')) return true;
  if (normalized.includes('was downed by npc_')) return true;
  if (normalized.includes('hit')) return true;
  return false;
}

function classifyFeedMessage(text) {
  const normalized = String(text || '').toLowerCase();
  const neutralizedMatch = normalized.match(/neutralized\s+(npc_[a-z0-9_-]+)/);
  if (neutralizedMatch) return `neutralized:${neutralizedMatch[1]}`;
  const downedMatch = normalized.match(/^system:\s*([a-z0-9_]+)\s+was downed by\s+(npc_[a-z0-9_-]+)/);
  if (downedMatch) return `downed:${downedMatch[1]}:${downedMatch[2]}`;
  return '';
}

window.BlockTopiaMap = {
  mount,
  destroy,
  setConnectionStatus,
  setLocalPlayer,
  setRemotePlayer,
  updatePlayers,
  applyMultiplayerState: updatePlayers,
  setNpcs,
  setWorldMode,
  pushFeed,
  pushFeedback,
  setInputEnabled(enabled) {
    runtime.inputEnabled = Boolean(enabled);
    if (runtime.inputEnabled) ensureMissionStart();
  },
  triggerAttack() {
    tryAttack();
  },
  clearFeedback() {
    runtime.feedback = [];
  },
  setPositionBroadcastSink(fn) {
    runtime.positionSink = typeof fn === 'function' ? fn : null;
  },
  setAttackSink(fn) {
    runtime.attackSink = typeof fn === 'function' ? fn : null;
  },
  setExtractSink(fn) {
    runtime.extractSink = typeof fn === 'function' ? fn : null;
  },
  shouldSuppressFeedMessage(message) {
    return shouldSuppressFeedMessage(message);
  },
  getSnapshot() {
    return {
      localPlayer: { ...runtime.localPlayer },
      remotePlayer: { ...runtime.remotePlayer },
      connectionStatus: { ...runtime.connectionStatus },
      worldMode: runtime.worldMode,
      npcs: runtime.npcs.map((n) => ({ ...n })),
      mission: { ...runtime.mission, extractionTile: runtime.mission.extractionTile ? { ...runtime.mission.extractionTile } : null },
      feed: runtime.feed.slice(),
      feedback: runtime.feedback.map((entry) => ({ ...entry })),
      inputEnabled: runtime.inputEnabled,
    };
  },
};
