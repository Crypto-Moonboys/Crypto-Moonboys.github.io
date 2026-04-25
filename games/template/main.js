const GRID_SIZE = 20;
const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const MAP_SAFE_MARGIN_RATIO = 0.08;

if (window.GameTemplate && typeof window.GameTemplate.destroy === "function") {
  window.GameTemplate.destroy();
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
  player: { id: "local", x: 1, y: 1, color: "#6da9ff" },
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

function movePlayer(dx, dy) {
  const nextX = runtime.player.x + dx;
  const nextY = runtime.player.y + dy;

  if (!isPassable(nextX, nextY)) {
    return;
  }

  runtime.player.x = nextX;
  runtime.player.y = nextY;
}

function onKeyDown(event) {
  const key = event.key;

  if (key === "ArrowUp" || key === "w" || key === "W") {
    event.preventDefault();
    movePlayer(0, -1);
    return;
  }

  if (key === "ArrowDown" || key === "s" || key === "S") {
    event.preventDefault();
    movePlayer(0, 1);
    return;
  }

  if (key === "ArrowLeft" || key === "a" || key === "A") {
    event.preventDefault();
    movePlayer(-1, 0);
    return;
  }

  if (key === "ArrowRight" || key === "d" || key === "D") {
    event.preventDefault();
    movePlayer(1, 0);
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

  runtime.player.x = tile.x;
  runtime.player.y = tile.y;
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

function drawMarker(player) {
  const [sx, sy] = tileToScreen(player.x, player.y);
  const th = TILE_HEIGHT * cameraScale;
  const cy = sy + th / 2 - 12 * cameraScale;

  ctx.beginPath();
  ctx.ellipse(sx, sy + th / 2 - 1 * cameraScale, 8 * cameraScale, 4 * cameraScale, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(sx, cy, 9 * cameraScale, 0, Math.PI * 2);
  ctx.fillStyle = player.color;
  ctx.fill();
  ctx.strokeStyle = "rgba(10, 14, 28, 0.95)";
  ctx.lineWidth = 1.8 * cameraScale;
  ctx.stroke();
}

function drawPlayers() {
  drawMarker(runtime.player);
}

function drawHud() {
  const { x, y } = runtime.player;

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "700 13px Segoe UI";
  ctx.fillStyle = "rgba(228, 240, 255, 0.95)";
  ctx.fillText(`(${x}, ${y})`, 12, 10);

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

function update() {
  // Hook: replace with game-specific logic
}

function renderFrame() {
  update();
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
  created.setAttribute("aria-label", "Isometric game map");
  created.style.display = "block";
  created.style.width = "100%";
  created.style.height = "100%";
  container.appendChild(created);
  return created;
}

function init(options = {}) {
  if (mounted) {
    destroy();
  }

  canvas = resolveMountCanvas(options);
  ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("GameTemplate init failed: 2D context unavailable");
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

window.GameTemplate = {
  init,
  update,
  render,
  destroy,
};
