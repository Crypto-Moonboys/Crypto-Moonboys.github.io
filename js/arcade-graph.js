/* ============================================================
   arcade-graph.js — Lightweight OG-style arcade node graph
   Purpose-built for /games/leaderboard.html only.
   Canvas 2D. No external dependencies.
   ============================================================ */

// ── Palette (neon / cyber matching site) ──────────────────────────────────
const C = {
  bg:       '#090c16',
  gold:     '#f7c948',
  cyan:     '#2ec5ff',
  pink:     '#ff4fd1',
  green:    '#3fb950',
  purple:   '#bc8cff',
  muted:    '#8b949e',
  border:   '#30363d',
  text:     '#e6edf3',
};

// ── Node definitions (default / overview state) ───────────────────────────
function makeOverviewNodes(cx, cy, r) {
  const games = [
    { id: 'snake',      label: '🐍 Snake',      color: C.cyan   },
    { id: 'crystal',    label: '🧩 Crystal',    color: C.pink   },
    { id: 'blocktopia', label: '🧱 BlockTopia', color: C.purple },
    { id: 'invaders',   label: '👾 Invaders',   color: C.green  },
    { id: 'pacchain',   label: '🟡 Pac-Chain',  color: C.gold   },
    { id: 'asteroids',  label: '🌑 Asteroids',  color: C.muted  },
    { id: 'breakout',   label: '🧱 Bullrun',    color: '#ff6b35' },
    { id: 'tetris',     label: '🟦 Tetris',     color: '#a78bfa' },
    { id: 'hexgl',      label: '🏁 HexGL',      color: C.cyan   },
  ];
  const out = [
    { id: 'global', label: '🏆 Arcade', color: C.gold, radius: 26, x: cx, y: cy, fixed: true },
  ];
  games.forEach((g, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / games.length;
    out.push({
      id: g.id, label: g.label, color: g.color, radius: 16,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      fixed: false,
    });
  });
  return out;
}

const OVERVIEW_EDGES = [
  { source: 'global', target: 'snake'      },
  { source: 'global', target: 'crystal'    },
  { source: 'global', target: 'blocktopia' },
  { source: 'global', target: 'invaders'   },
  { source: 'global', target: 'pacchain'   },
  { source: 'global', target: 'asteroids'  },
  { source: 'global', target: 'breakout'   },
  { source: 'global', target: 'tetris'     },
  { source: 'global', target: 'hexgl'      },
];

// ── State ─────────────────────────────────────────────────────────────────
let canvas, ctx;
let nodes = [];
let edges = [];
let hoveredNode = null;
let selectedNode = null;
let animationId = null;
let pulseT = 0;
let activeEdges = new Set();   // edge keys in 'source->target' format for animated flow
let playerData = null;         // current player breakdown

// ── Init ──────────────────────────────────────────────────────────────────
export function initGraph(canvasId) {
  canvas = document.getElementById(canvasId);
  if (!canvas) return;
  ctx = canvas.getContext('2d');

  resize();
  window.addEventListener('resize', resize);

  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', () => { hoveredNode = null; });
  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('touchstart', onTouch, { passive: true });

  setOverviewState();
  startLoop();
}

function resize() {
  if (!canvas) return;
  const parent = canvas.parentElement;
  const w = parent ? parent.clientWidth : 480;
  const h = Math.min(Math.max(w * 0.55, 200), 340);
  canvas.width  = w;
  canvas.height = h;
  setOverviewState();
}

// ── Helpers ────────────────────────────────────────────────────────────────
function edgeKey(source, target) { return `${source}->${target}`; }

// ── State builders ────────────────────────────────────────────────────────
function setOverviewState() {
  playerData = null;
  selectedNode = null;
  const cx = canvas.width  / 2;
  const cy = canvas.height / 2;
  const r  = Math.min(cx, cy) * 0.62;
  nodes = makeOverviewNodes(cx, cy, r);
  edges = OVERVIEW_EDGES;
  activeEdges.clear();
}

export function setPlayerState(entry) {
  if (!entry) { setOverviewState(); return; }
  playerData = entry;
  selectedNode = null;

  const cx = canvas.width  / 2;
  const cy = canvas.height / 2;
  const r  = Math.min(cx, cy) * 0.6;

  const bd = entry.breakdown || {};
  const games = [
    { id: 'snake',      label: '🐍 Snake',      color: C.cyan,   score: bd.snake      ?? null },
    { id: 'crystal',    label: '🧩 Crystal',    color: C.pink,   score: bd.crystal    ?? null },
    { id: 'blocktopia', label: '🧱 BlockTopia', color: C.purple, score: bd.blocktopia ?? null },
    { id: 'invaders',   label: '👾 Invaders',   color: C.green,  score: bd.invaders   ?? null },
    { id: 'pacchain',   label: '🟡 Pac-Chain',  color: C.gold,   score: bd.pacchain   ?? null },
    { id: 'asteroids',  label: '🌑 Asteroids',  color: C.muted,  score: bd.asteroids  ?? null },
    { id: 'breakout',   label: '🧱 Bullrun',   color: '#ff6b35',  score: bd.breakout   ?? null },
    { id: 'tetris',     label: '🟦 Tetris',     color: '#a78bfa',  score: bd.tetris     ?? null },
    { id: 'hexgl',      label: '🏁 HexGL',      color: C.cyan,     score: bd.hexgl      ?? null },
    { id: 'bonus',      label: '⭐ Bonus',       color: C.green,  score: bd.variety_bonus ?? null },
  ];

  const maxScore = Math.max(1, ...games.map(g => g.score ?? 0));

  // Player node at centre-left
  const playerNode = {
    id:     'player',
    label:  entry.player || 'Player',
    color:  C.gold,
    radius: 22,
    x:      cx - r * 0.2,
    y:      cy,
    fixed:  true,
  };

  // Global total node at right
  const totalNode = {
    id:     'global',
    label:  `🏆 ${Number(entry.score ?? 0).toLocaleString()}`,
    color:  C.gold,
    radius: 20,
    x:      cx + r * 0.65,
    y:      cy,
    fixed:  true,
  };

  // Game nodes arranged around player
  const gameNodes = games.map((g, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / games.length;
    const nr = g.score != null ? 12 + (g.score / maxScore) * 12 : 10;
    return {
      id:     g.id,
      label:  g.score != null ? `${g.label}\n${Number(g.score).toLocaleString()}` : g.label,
      color:  g.color,
      radius: nr,
      x:      cx - r * 0.2 + r * 0.55 * Math.cos(angle),
      y:      cy           + r * 0.55 * Math.sin(angle),
      fixed:  false,
      score:  g.score,
    };
  });

  nodes = [playerNode, totalNode, ...gameNodes];
  edges = [
    ...games.map(g => ({ source: 'player', target: g.id })),
    ...games.map(g => ({ source: g.id,     target: 'global' })),
  ];
  activeEdges = new Set(games.map(g => edgeKey(g.id, 'global')));
}

// ── Render loop ───────────────────────────────────────────────────────────
function startLoop() {
  if (animationId) cancelAnimationFrame(animationId);
  function frame() {
    pulseT += 0.025;
    draw();
    animationId = requestAnimationFrame(frame);
  }
  animationId = requestAnimationFrame(frame);
}

function draw() {
  if (!ctx || !canvas) return;
  const w = canvas.width;
  const h = canvas.height;

  // Background
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);

  // Subtle grid
  ctx.strokeStyle = 'rgba(46,197,255,0.04)';
  ctx.lineWidth = 1;
  const step = 32;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Edges
  for (const edge of edges) {
    const a = nodeMap.get(edge.source);
    const b = nodeMap.get(edge.target);
    if (!a || !b) continue;
    const key = edgeKey(edge.source, edge.target);
    const isActive = activeEdges.has(key);
    drawEdge(a, b, isActive);
  }

  // Nodes
  for (const n of nodes) {
    const hovered  = hoveredNode  === n;
    const selected = selectedNode === n;
    drawNode(n, hovered, selected);
  }
}

function drawEdge(a, b, animated) {
  const pulse = animated
    ? 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(pulseT * 2))
    : 0.22;

  ctx.save();
  ctx.strokeStyle = animated ? C.cyan : C.muted;
  ctx.globalAlpha = pulse;
  ctx.lineWidth = animated ? 2 : 1;

  if (animated) {
    // Dashed moving flow
    const dashOffset = -(pulseT * 8) % 20;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = dashOffset;
  } else {
    ctx.setLineDash([]);
  }

  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

function drawNode(n, hovered, selected) {
  const glow = hovered || selected;

  ctx.save();

  // Glow halo
  if (glow) {
    const gr = ctx.createRadialGradient(n.x, n.y, n.radius * 0.5, n.x, n.y, n.radius * 2.5);
    gr.addColorStop(0, n.color + '55');
    gr.addColorStop(1, 'transparent');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.radius * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pulse ring on active/centre nodes
  if (n.id === 'global' || n.id === 'player') {
    const ringR = n.radius + 4 + 3 * Math.sin(pulseT);
    ctx.strokeStyle = n.color;
    ctx.globalAlpha = 0.3 + 0.2 * Math.sin(pulseT);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(n.x, n.y, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Node circle
  ctx.beginPath();
  ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
  ctx.fillStyle = C.bg;
  ctx.fill();
  ctx.strokeStyle = n.color;
  ctx.lineWidth = glow ? 2.5 : 1.5;
  ctx.stroke();

  // Inner fill
  ctx.beginPath();
  ctx.arc(n.x, n.y, n.radius * 0.7, 0, Math.PI * 2);
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = n.color;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Label
  const lines = n.label.split('\n');
  ctx.fillStyle = n.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (lines.length === 1) {
    ctx.font = `bold ${Math.max(10, n.radius * 0.6)}px system-ui, sans-serif`;
    ctx.fillText(n.label, n.x, n.y + n.radius + 12);
  } else {
    ctx.font = `bold ${Math.max(9, n.radius * 0.55)}px system-ui, sans-serif`;
    ctx.fillText(lines[0], n.x, n.y + n.radius + 11);
    ctx.fillStyle = C.muted;
    ctx.font = `${Math.max(8, n.radius * 0.45)}px system-ui, sans-serif`;
    ctx.fillText(lines[1], n.x, n.y + n.radius + 22);
  }

  ctx.restore();
}

// ── Interaction ───────────────────────────────────────────────────────────
function getNodeAt(px, py) {
  for (const n of [...nodes].reverse()) {
    const dx = px - n.x;
    const dy = py - n.y;
    if (Math.sqrt(dx * dx + dy * dy) <= n.radius + 6) return n;
  }
  return null;
}

function canvasXY(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width  / rect.width),
    y: (e.clientY - rect.top)  * (canvas.height / rect.height),
  };
}

function onMouseMove(e) {
  const { x, y } = canvasXY(e);
  hoveredNode = getNodeAt(x, y);
  canvas.style.cursor = hoveredNode ? 'pointer' : 'default';
}

function onCanvasClick(e) {
  const { x, y } = canvasXY(e);
  const hit = getNodeAt(x, y);
  selectedNode = hit || null;
}

function onTouch(e) {
  if (!e.touches.length) return;
  const { x, y } = canvasXY(e.touches[0]);
  const hit = getNodeAt(x, y);
  selectedNode = hit || null;
}

// ── Reset to overview ─────────────────────────────────────────────────────
export function resetGraph() {
  setOverviewState();
}
