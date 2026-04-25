const GRID_SIZE = 20;
const TILE_W = 64;
const TILE_H = 32;
const MARGIN = 0.08;
const KEY_DELTAS = { ArrowUp:[0,-1],w:[0,-1],W:[0,-1], ArrowDown:[0,1],s:[0,1],S:[0,1], ArrowLeft:[-1,0],a:[-1,0],A:[-1,0], ArrowRight:[1,0],d:[1,0],D:[1,0] };

if (window.GameTemplate && typeof window.GameTemplate.destroy === "function") {
  window.GameTemplate.destroy();
}

let canvas = null;
let ctx = null;
let mounted = false;
let rafId = null;
let viewW = 0;
let viewH = 0;
let camX = 0;
let camY = 0;
let camScale = 1;

const runtime = {
  player: { x: 1, y: 1, color: "#6da9ff" },
  tiles: buildTiles(),
};

// --- Tile map ---

function buildTiles() {
  const t = {};
  for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
    const road = x % 5 === 0 || y % 5 === 0 || (x + y) % 7 === 0;
    const hash = ((x + 17) * 928371 + (y + 31) * 192847 + x * y * 11939) % 1000;
    t[y * GRID_SIZE + x] = { x, y, terrain: road ? "road" : hash < 125 ? "block" : "grass" };
  }
  [[1, 1], [2, 1], [1, 2]].forEach(([x, y]) => { t[y * GRID_SIZE + x].terrain = "road"; });
  return t;
}

function isPassable(x, y) {
  const t = runtime.tiles[y * GRID_SIZE + x];
  return x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE && Boolean(t && t.terrain !== "block");
}

// --- Camera ---

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function isoBounds(scale) {
  const tw = TILE_W * scale, th = TILE_H * scale;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
    const sx = (x - y) * (tw / 2), sy = (x + y) * (th / 2);
    x0 = Math.min(x0, sx - tw / 2); x1 = Math.max(x1, sx + tw / 2);
    y0 = Math.min(y0, sy);          y1 = Math.max(y1, sy + th);
  }
  return { minX: x0, minY: y0, width: x1 - x0, height: y1 - y0 };
}

function tileToScreen(x, y) {
  return [(x - y) * (TILE_W * camScale / 2) + camX, (x + y) * (TILE_H * camScale / 2) + camY];
}

function resize() {
  if (!canvas || !ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const r = (canvas.parentElement ?? canvas).getBoundingClientRect();
  viewW = Math.max(320, Math.floor(r.width || innerWidth));
  viewH = Math.max(240, Math.floor(r.height || innerHeight));
  canvas.width = Math.floor(viewW * dpr); canvas.height = Math.floor(viewH * dpr);
  canvas.style.width = `${viewW}px`; canvas.style.height = `${viewH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const b = isoBounds(1);
  camScale = clamp(Math.min((viewW - viewW * MARGIN * 2) / b.width, (viewH - viewH * MARGIN * 2) / b.height), 0.35, 1.25);
  const s = isoBounds(camScale);
  camX = Math.floor((viewW - s.width) / 2 - s.minX);
  camY = Math.floor((viewH - s.height) / 2 - s.minY);
}

// --- Input ---

function movePlayer(dx, dy) {
  const nx = runtime.player.x + dx, ny = runtime.player.y + dy;
  if (isPassable(nx, ny)) { runtime.player.x = nx; runtime.player.y = ny; }
}

function onKeyDown(e) {
  const d = KEY_DELTAS[e.key];
  if (d) { e.preventDefault(); movePlayer(d[0], d[1]); }
}

function onPointerDown(e) {
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  const px = (e.clientX - r.left) * (canvas.width / r.width);
  const py = (e.clientY - r.top) * (canvas.height / r.height);
  const tw = TILE_W * camScale, th = TILE_H * camScale;
  const lx = px - camX, ly = py - camY;
  const gx = (lx / (tw / 2) + ly / (th / 2)) / 2;
  const gy = (ly / (th / 2) - lx / (tw / 2)) / 2;
  let best = null, bestD = Infinity;
  for (const [tx, ty] of [[Math.floor(gx),Math.floor(gy)],[Math.ceil(gx),Math.floor(gy)],[Math.floor(gx),Math.ceil(gy)],[Math.ceil(gx),Math.ceil(gy)]]) {
    if (tx < 0 || ty < 0 || tx >= GRID_SIZE || ty >= GRID_SIZE) continue;
    const [sx, sy] = tileToScreen(tx, ty);
    const d = (px - sx) ** 2 + (py - (sy + th / 2)) ** 2;
    if (d < bestD) { bestD = d; best = { x: tx, y: ty }; }
  }
  if (best && isPassable(best.x, best.y)) { runtime.player.x = best.x; runtime.player.y = best.y; }
}

// --- Render ---

function render() {
  if (!mounted || !ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, viewH);
  bg.addColorStop(0, "#050b1a"); bg.addColorStop(0.5, "#0a1429"); bg.addColorStop(1, "#03070f");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, viewW, viewH);

  // Tiles
  const tw = TILE_W * camScale, th = TILE_H * camScale;
  for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
    const tile = runtime.tiles[y * GRID_SIZE + x];
    const [sx, sy] = tileToScreen(x, y);
    ctx.beginPath();
    ctx.moveTo(sx, sy); ctx.lineTo(sx + tw / 2, sy + th / 2);
    ctx.lineTo(sx, sy + th); ctx.lineTo(sx - tw / 2, sy + th / 2);
    ctx.closePath();
    if (tile.terrain === "road") {
      const s = 70 + ((x * 3 + y * 5) % 4) * 5;
      ctx.fillStyle = `rgb(${s},${s + 8},${s + 22})`; ctx.fill();
      ctx.strokeStyle = `rgba(150,205,255,${0.2 + 0.2 * (Math.sin(performance.now() * 0.002 + x + y) * 0.5 + 0.5)})`;
      ctx.lineWidth = 2.3 * camScale;
    } else if (tile.terrain === "block") {
      const s = 42 + ((x + y) % 3) * 6;
      ctx.fillStyle = `rgb(${s},${s + 3},${s + 10})`; ctx.fill();
      ctx.strokeStyle = "rgba(76,82,98,.95)"; ctx.lineWidth = 1.8 * camScale;
    } else {
      const s = 58 + ((x * 7 + y * 11) % 5) * 4;
      ctx.fillStyle = `rgb(${s - 8},${s + 16},${s - 4})`; ctx.fill();
      ctx.strokeStyle = "rgba(40,60,36,.9)"; ctx.lineWidth = 1.5 * camScale;
    }
    ctx.stroke();
  }

  // Player marker
  const { x: px, y: py, color } = runtime.player;
  const [sx, sy] = tileToScreen(px, py);
  const cy = sy + th / 2 - 12 * camScale;
  ctx.beginPath();
  ctx.ellipse(sx, sy + th / 2 - camScale, 8 * camScale, 4 * camScale, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.32)"; ctx.fill();
  ctx.beginPath();
  ctx.arc(sx, cy, 9 * camScale, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = "rgba(10,14,28,.95)"; ctx.lineWidth = 1.8 * camScale; ctx.stroke();

  // HUD: position only
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.font = "700 13px Segoe UI"; ctx.fillStyle = "rgba(228,240,255,.95)";
  ctx.fillText(`(${px}, ${py})`, 12, 10);
}

// --- Lifecycle ---

/** Override with game-specific per-frame logic. Called before render() each frame. */
function update() {}

function loop() {
  update(); render();
  if (mounted) rafId = requestAnimationFrame(loop);
}

/**
 * Mount the game onto a canvas.
 * @param {object} [options]
 * @param {HTMLCanvasElement} [options.canvas] - Existing canvas element.
 * @param {string} [options.canvasId="game"] - ID of canvas to find or create.
 * @param {string} [options.containerId="game-shell"] - Container ID for auto-created canvas.
 * @returns {HTMLCanvasElement}
 */
function init(options = {}) {
  if (mounted) destroy();
  const id = options.canvasId ?? "game";
  let el = options.canvas instanceof HTMLCanvasElement ? options.canvas : document.getElementById(id);
  if (!(el instanceof HTMLCanvasElement)) {
    el = document.createElement("canvas");
    el.id = id;
    el.setAttribute("aria-label", "Isometric game map");
    el.style.cssText = "display:block;width:100%;height:100%";
    (document.getElementById(options.containerId ?? "game-shell") ?? document.body).appendChild(el);
  }
  canvas = el;
  ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("GameTemplate init failed: 2D context unavailable");
  mounted = true;
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("pointerdown", onPointerDown);
  resize(); rafId = requestAnimationFrame(loop);
  return canvas;
}

/** Cancel the animation loop and remove all event listeners. */
function destroy() {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  window.removeEventListener("resize", resize);
  window.removeEventListener("keydown", onKeyDown);
  if (canvas) canvas.removeEventListener("pointerdown", onPointerDown);
  mounted = false; ctx = null; canvas = null;
}

window.GameTemplate = { init, update, render, destroy };
