const GRID_SIZE = 20;
const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const MAP_SAFE_MARGIN_RATIO = 0.08;

if (window.BlockTopiaMap && typeof window.BlockTopiaMap.destroy === "function") {
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
  localPlayer: { id: "local", x: 1, y: 1, color: "#6da9ff", name: "You", sessionId: "" },
  remotePlayer: { id: "remote", x: GRID_SIZE - 2, y: GRID_SIZE - 2, color: "#ff7b7b", name: "Remote", connected: false, sessionId: "" },
  connectionStatus: { ws: "offline", joined: false, roomId: "", error: "" },
  positionSink: null,
  tiles: createTiles(),
};

function getTileId(x, y) {
  return y * GRID_SIZE + x;
}

function decideTerrain(x, y) {
  const lineRoad = x % 5 === 0 || y % 5 === 0;
  const diagonalRoad = (x + y) % 7 === 0;
  const hash = ((x + 17) * 928371 + (y + 31) * 192847 + x * y * 11939) % 1000;

  if (lineRoad || diagonalRoad) {
    return "road";
  }

  if (hash < 125) {
    return "block";
  }

  return "grass";
}

function createTiles() {
  const tiles = {};

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const id = getTileId(x, y);
      tiles[id] = {
        id,
        x,
        y,
        terrain: decideTerrain(x, y),
      };
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
  if (!tile) {
    return;
  }
  tile.terrain = "road";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isPassable(x, y) {
  if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) {
    return false;
  }

  const tile = runtime.tiles[getTileId(x, y)];
  return Boolean(tile && tile.terrain !== "block");
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

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function tileToScreen(x, y) {
  const tw = TILE_WIDTH * cameraScale;
  const th = TILE_HEIGHT * cameraScale;
  return [
    (x - y) * (tw / 2) + cameraX,
    (x + y) * (th / 2) + cameraY,
  ];
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
    if (tx < 0 || ty < 0 || tx >= GRID_SIZE || ty >= GRID_SIZE) {
      continue;
    }

    const [sx, sy] = tileToScreen(tx, ty);
    const dx = screenX - sx;
    const dy = screenY - (sy + th / 2);
    const dist = dx * dx + dy * dy;

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

  if (!isPassable(nextX, nextY)) {
    return;
  }

  runtime.localPlayer.x = nextX;
  runtime.localPlayer.y = nextY;

  if (runtime.positionSink) {
    runtime.positionSink({
      x: runtime.localPlayer.x,
      y: runtime.localPlayer.y,
      sessionId: runtime.localPlayer.sessionId,
    });
  }
}

function onKeyDown(event) {
  const key = event.key;

  if (key === "ArrowUp" || key === "w" || key === "W") {
    event.preventDefault();
    moveLocal(0, -1);
    return;
  }

  if (key === "ArrowDown" || key === "s" || key === "S") {
    event.preventDefault();
    moveLocal(0, 1);
    return;
  }

  if (key === "ArrowLeft" || key === "a" || key === "A") {
    event.preventDefault();
    moveLocal(-1, 0);
    return;
  }

  if (key === "ArrowRight" || key === "d" || key === "D") {
    event.preventDefault();
    moveLocal(1, 0);
  }
}

function onPointerDown(event) {
  if (!canvas) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const px = (event.clientX - rect.left) * (canvas.width / rect.width);
  const py = (event.clientY - rect.top) * (canvas.height / rect.height);
  const tile = pickTile(px, py);

  if (!tile || !isPassable(tile.x, tile.y)) {
    return;
  }

  runtime.localPlayer.x = tile.x;
  runtime.localPlayer.y = tile.y;

  if (runtime.positionSink) {
    runtime.positionSink({
      x: runtime.localPlayer.x,
      y: runtime.localPlayer.y,
      sessionId: runtime.localPlayer.sessionId,
    });
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, viewHeight);
  gradient.addColorStop(0, "#050b1a");
  gradient.addColorStop(0.5, "#0a1429");
  gradient.addColorStop(1, "#03070f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, viewWidth, viewHeight);
}

function getTerrainColor(tile) {
  if (tile.terrain === "block") {
    const shade = 42 + ((tile.x + tile.y) % 3) * 6;
    return `rgb(${shade}, ${shade + 3}, ${shade + 10})`;
  }

  if (tile.terrain === "road") {
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

  if (tile.terrain === "road") {
    const glow = 0.2 + 0.2 * (Math.sin(performance.now() * 0.002 + tile.x + tile.y) * 0.5 + 0.5);
    ctx.strokeStyle = `rgba(150, 205, 255, ${glow})`;
    ctx.lineWidth = 2.3 * cameraScale;
  } else if (tile.terrain === "grass") {
    ctx.strokeStyle = "rgba(40, 60, 36, 0.9)";
    ctx.lineWidth = 1.5 * cameraScale;
  } else {
    ctx.strokeStyle = "rgba(76, 82, 98, 0.95)";
    ctx.lineWidth = 1.8 * cameraScale;
  }

  ctx.stroke();
}

function drawTiles() {
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const tile = runtime.tiles[getTileId(x, y)];
      drawDiamond(tile);
    }
  }
}

function drawMarker(player, label, connected) {
  const [sx, sy] = tileToScreen(player.x, player.y);
  const th = TILE_HEIGHT * cameraScale;
  const cy = sy + th / 2 - 12 * cameraScale;
  const shadowAlpha = connected ? 0.32 : 0.16;

  ctx.beginPath();
  ctx.ellipse(sx, sy + th / 2 - 1 * cameraScale, 8 * cameraScale, 4 * cameraScale, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(sx, cy, 9 * cameraScale, 0, Math.PI * 2);
  ctx.fillStyle = connected ? player.color : "#7b7f90";
  ctx.fill();
  ctx.strokeStyle = "rgba(10, 14, 28, 0.95)";
  ctx.lineWidth = 1.8 * cameraScale;
  ctx.stroke();

  ctx.fillStyle = "#f3f8ff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.max(9, Math.floor(11 * cameraScale))}px Segoe UI`;
  ctx.fillText(label, sx, cy + 0.5);
}

function drawPlayers() {
  drawMarker(runtime.localPlayer, "L", true);
  drawMarker(runtime.remotePlayer, "R", runtime.remotePlayer.connected);
}

function drawHud() {
  const status = runtime.connectionStatus;
  const remoteState = runtime.remotePlayer.connected ? "ONLINE" : "OFFLINE";

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "700 13px Segoe UI";
  ctx.fillStyle = "rgba(228, 240, 255, 0.95)";
  ctx.fillText(`P1 (${runtime.localPlayer.x},${runtime.localPlayer.y})`, 12, 10);

  ctx.fillStyle = runtime.remotePlayer.connected ? "rgba(255, 210, 210, 0.95)" : "rgba(196, 201, 214, 0.9)";
  ctx.fillText(`P2 ${remoteState} (${runtime.remotePlayer.x},${runtime.remotePlayer.y})`, 12, 28);

  ctx.fillStyle = "rgba(214, 226, 245, 0.85)";
  ctx.font = "600 12px Segoe UI";
  ctx.fillText(`NET ${String(status.ws || "offline").toUpperCase()}${status.roomId ? ` | ROOM ${status.roomId}` : ""}${status.error ? ` | ${status.error}` : ""}`, 12, 48);

  const hint = "Arrow/WASD move | Click tile to move";
  const boxW = 270;
  const boxH = 20;
  const boxX = viewWidth - boxW - 10;
  const boxY = 10;
  ctx.fillStyle = "rgba(5, 10, 22, 0.64)";
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = "rgba(166, 196, 255, 0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 11px Segoe UI";
  ctx.fillStyle = "rgba(232, 241, 255, 0.9)";
  ctx.fillText(hint, boxX + boxW / 2, boxY + boxH / 2 + 0.5);
}

function render() {
  if (!mounted || !ctx || !canvas) {
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawTiles();
  drawPlayers();
  drawHud();
}

function renderFrame() {
  render();
  if (mounted) {
    animationFrameId = requestAnimationFrame(renderFrame);
  }
}

function resize() {
  if (!canvas || !ctx) {
    return;
  }

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
  if (options.canvas instanceof HTMLCanvasElement) {
    return options.canvas;
  }

  const canvasId = options.canvasId ?? "game";
  const containerId = options.containerId ?? "game-shell";
  const existing = document.getElementById(canvasId);
  if (existing instanceof HTMLCanvasElement) {
    return existing;
  }

  const container = document.getElementById(containerId) ?? document.body;
  const created = document.createElement("canvas");
  created.id = canvasId;
  created.setAttribute("aria-label", "Block Topia isometric map base");
  created.style.display = "block";
  created.style.width = "100%";
  created.style.height = "100%";
  container.appendChild(created);
  return created;
}

function mount(options = {}) {
  if (mounted) {
    destroy();
  }

  canvas = resolveMountCanvas(options);
  ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("BlockTopiaMap mount failed: 2D context unavailable");
  }

  mounted = true;
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("pointerdown", onPointerDown);

  resize();
  animationFrameId = requestAnimationFrame(renderFrame);
  return canvas;
}

function destroy() {
  if (animationFrameId != null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  window.removeEventListener("resize", resize);
  window.removeEventListener("keydown", onKeyDown);
  if (canvas) {
    canvas.removeEventListener("pointerdown", onPointerDown);
  }

  mounted = false;
  ctx = null;
  canvas = null;
}

function setConnectionStatus(status = {}) {
  runtime.connectionStatus = {
    ...runtime.connectionStatus,
    ...status,
  };

  if (typeof status.joined === "boolean") {
    runtime.remotePlayer.connected = status.joined;
  }
}

function setLocalPlayer(payload = {}) {
  const nextX = Number.isFinite(payload.x) ? clamp(Math.floor(payload.x), 0, GRID_SIZE - 1) : runtime.localPlayer.x;
  const nextY = Number.isFinite(payload.y) ? clamp(Math.floor(payload.y), 0, GRID_SIZE - 1) : runtime.localPlayer.y;

  if (isPassable(nextX, nextY)) {
    runtime.localPlayer.x = nextX;
    runtime.localPlayer.y = nextY;
  }

  if (typeof payload.name === "string") {
    runtime.localPlayer.name = payload.name;
  }

  if (typeof payload.sessionId === "string") {
    runtime.localPlayer.sessionId = payload.sessionId;
  }
}

function setRemotePlayer(payload = {}) {
  const nextX = Number.isFinite(payload.x) ? clamp(Math.floor(payload.x), 0, GRID_SIZE - 1) : runtime.remotePlayer.x;
  const nextY = Number.isFinite(payload.y) ? clamp(Math.floor(payload.y), 0, GRID_SIZE - 1) : runtime.remotePlayer.y;

  if (isPassable(nextX, nextY)) {
    runtime.remotePlayer.x = nextX;
    runtime.remotePlayer.y = nextY;
  }

  if (typeof payload.name === "string") {
    runtime.remotePlayer.name = payload.name;
  }

  if (typeof payload.sessionId === "string") {
    runtime.remotePlayer.sessionId = payload.sessionId;
  }

  if (typeof payload.connected === "boolean") {
    runtime.remotePlayer.connected = payload.connected;
  }
}

function updatePlayers(players = []) {
  if (!Array.isArray(players)) {
    return;
  }

  const localSession = runtime.localPlayer.sessionId;
  const localMatch = localSession ? players.find((p) => p && p.sessionId === localSession) : null;
  if (localMatch) {
    setLocalPlayer({ x: Number(localMatch.x), y: Number(localMatch.y), sessionId: String(localMatch.sessionId || "") });
  }

  const remote = players.find((p) => {
    if (!p) {
      return false;
    }
    if (localSession && p.sessionId === localSession) {
      return false;
    }
    return Number.isFinite(p.x) && Number.isFinite(p.y);
  });

  if (remote) {
    setRemotePlayer({
      x: Number(remote.x),
      y: Number(remote.y),
      sessionId: String(remote.sessionId || ""),
      connected: true,
      name: typeof remote.name === "string" ? remote.name : runtime.remotePlayer.name,
    });
  } else {
    runtime.remotePlayer.connected = false;
  }
}

window.BlockTopiaMap = {
  mount,
  destroy,
  setConnectionStatus,
  setLocalPlayer,
  setRemotePlayer,
  updatePlayers,
  applyMultiplayerState: updatePlayers,
  setPositionBroadcastSink(fn) {
    runtime.positionSink = typeof fn === "function" ? fn : null;
  },
  getSnapshot() {
    return {
      localPlayer: { ...runtime.localPlayer },
      remotePlayer: { ...runtime.remotePlayer },
      connectionStatus: { ...runtime.connectionStatus },
    };
  },
};
