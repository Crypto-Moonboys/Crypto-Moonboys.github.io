/* ============================================================
   graph-visualization.js — Interactive entity relationship graph
   Two deterministic modes:
   - Hero graph: curated cinematic constellation
   - Full graph: real data-driven interactive explorer
   ============================================================ */

(function () {
  'use strict';

  // ── Configuration ────────────────────────────────────────────────────────
  const GRAPH_DATA_URL = window.innerWidth < 768
    ? '/js/entity-graph-lite.json'
    : '/js/graph-data.json';

  const MODE_HERO = 'hero';
  const MODE_FULL = 'full';

  const CATEGORY_COLORS = {
    characters: '#58a6ff',
    factions: '#f7c948',
    tokens: '#3fb950',
    concepts: '#bc8cff',
    lore: '#ff7b72',
    cryptocurrencies: '#3fb950',
    community: '#58a6ff',
    unknown: '#8b949e',
  };

  const HERO_NODES = [
    { id: 'moonboys', title: 'The Moonboys', category: 'characters', rank_score: 100, authority_score: 100, url: '/wiki/hodl-warriors.html' },
    { id: 'bitcoin', title: 'Bitcoin', category: 'cryptocurrencies', rank_score: 90, authority_score: 90, url: '/search.html?q=Bitcoin' },
    { id: 'ethereum', title: 'Ethereum', category: 'cryptocurrencies', rank_score: 88, authority_score: 89, url: '/search.html?q=Ethereum' },
    { id: 'nfts', title: 'NFTs', category: 'tokens', rank_score: 82, authority_score: 84, url: '/search.html?q=NFTs' },
    { id: 'defi', title: 'DeFi', category: 'concepts', rank_score: 83, authority_score: 86, url: '/search.html?q=DeFi' },
    { id: 'dao', title: 'DAO', category: 'concepts', rank_score: 79, authority_score: 82, url: '/search.html?q=DAO' },
    { id: 'community', title: 'Community', category: 'community', rank_score: 84, authority_score: 88, url: '/community.html' },
    { id: 'lore', title: 'Lore', category: 'lore', rank_score: 78, authority_score: 80, url: '/wiki/hodl-wars.html' },
    { id: 'tokenomics', title: 'Tokenomics', category: 'tokens', rank_score: 76, authority_score: 81, url: '/search.html?q=Tokenomics' },
    { id: 'web3', title: 'Web3', category: 'concepts', rank_score: 85, authority_score: 87, url: '/search.html?q=Web3' },
    { id: 'hodl-wars', title: 'HODL Wars', category: 'lore', rank_score: 80, authority_score: 82, url: '/wiki/hodl-wars.html' },
    { id: 'diamond-hands', title: 'Diamond Hands', category: 'characters', rank_score: 74, authority_score: 79, url: '/wiki/diamond-hands.html' },
  ];

  const HERO_EDGES = [
    ['moonboys', 'bitcoin', 1],
    ['moonboys', 'ethereum', 1],
    ['moonboys', 'nfts', 1],
    ['moonboys', 'defi', 1],
    ['moonboys', 'dao', 0.8],
    ['moonboys', 'community', 1],
    ['moonboys', 'lore', 0.9],
    ['moonboys', 'tokenomics', 0.9],
    ['moonboys', 'web3', 1],
    ['moonboys', 'hodl-wars', 0.9],
    ['moonboys', 'diamond-hands', 0.85],
    ['bitcoin', 'tokenomics', 0.7],
    ['ethereum', 'defi', 0.8],
    ['ethereum', 'nfts', 0.8],
    ['defi', 'dao', 0.72],
    ['community', 'dao', 0.65],
    ['lore', 'hodl-wars', 0.8],
    ['community', 'diamond-hands', 0.72],
    ['web3', 'nfts', 0.7],
    ['web3', 'tokenomics', 0.7],
  ];

  const NODE_MIN_RADIUS = 4;
  const NODE_MAX_RADIUS = 18;
  const EDGE_ALPHA_BASE = 0.2;
  const EDGE_ALPHA_HOVER = 0.68;
  const MIN_ZOOM = 0.15;
  const MAX_ZOOM = 2.2;
  const MIN_CANVAS_HEIGHT = 280;
  const MIN_VIEWPORT_PADDING = 28;
  const MAX_VIEWPORT_PADDING = 110;
  const VIEWPORT_PADDING_RATIO = 0.12;

  // Force simulation parameters (full graph mode only)
  const ITERATIONS = 400;
  const REPULSION = 5000;
  const ATTRACTION = 0.012;
  const DAMPING = 0.88;
  const CENTER_GRAVITY = 0.06;
  const MAX_DISPLACEMENT = 8;

  // ── State ────────────────────────────────────────────────────────────────
  let graphData = null;
  let nodePositions = [];
  let edgeList = [];
  let hoveredNode = null;
  let selectedNode = null;
  let isDragging = false;
  let dragNode = null;
  let panX = 0;
  let panY = 0;
  let zoom = 1;
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let filterCategory = 'all';
  let canvas;
  let ctx;
  let infoPanel;
  let searchBox;
  let filterSelect;
  let resetBtn;
  let modeHeroBtn;
  let modeFullBtn;
  let animFrame = null;
  let layoutDone = false;
  let graphReady = false;
  let hasUserAdjustedView = false;
  let fullGraphLoaded = false;
  let filterOptionsBuilt = false;
  let currentMode = MODE_HERO;
  let renderGeneration = 0;

  // ── Entry point ──────────────────────────────────────────────────────────
  function init() {
    canvas = document.getElementById('graph-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    infoPanel = document.getElementById('graph-info');
    searchBox = document.getElementById('graph-search');
    filterSelect = document.getElementById('graph-filter-select');
    resetBtn = document.getElementById('graph-reset-btn');
    modeHeroBtn = document.getElementById('graph-mode-hero');
    modeFullBtn = document.getElementById('graph-mode-full');

    if (canvas.parentElement) {
      canvas.parentElement.classList.remove('is-ready');
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Canvas interaction
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', () => {
      hoveredNode = null;
      isDragging = false;
      isPanning = false;
      draw();
    });
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Touch support
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);

    // UI controls
    if (resetBtn) resetBtn.addEventListener('click', resetView);
    if (filterSelect) filterSelect.addEventListener('change', onFilterChange);
    if (searchBox) searchBox.addEventListener('input', onSearch);
    if (modeHeroBtn) modeHeroBtn.addEventListener('click', () => setMode(MODE_HERO, { pushHistory: true, syncUrl: true }));
    if (modeFullBtn) modeFullBtn.addEventListener('click', () => setMode(MODE_FULL, { pushHistory: true, syncUrl: true }));

    window.addEventListener('popstate', () => {
      setMode(getModeFromURL(), { pushHistory: false, syncUrl: false });
    });

    const initialMode = getModeFromURL();
    setMode(initialMode, { pushHistory: false, syncUrl: true, replaceHistory: true });
  }

  // ── Mode management ──────────────────────────────────────────────────────
  function getModeFromURL() {
    const mode = new URLSearchParams(window.location.search).get('mode');
    return mode === MODE_FULL ? MODE_FULL : MODE_HERO;
  }

  function updateModeToggleUI(mode) {
    if (!modeHeroBtn || !modeFullBtn) return;
    const heroActive = mode === MODE_HERO;
    modeHeroBtn.classList.toggle('is-active', heroActive);
    modeFullBtn.classList.toggle('is-active', !heroActive);
    modeHeroBtn.setAttribute('aria-selected', heroActive ? 'true' : 'false');
    modeFullBtn.setAttribute('aria-selected', heroActive ? 'false' : 'true');
  }

  function writeModeToURL(mode, { pushHistory = false, replaceHistory = false } = {}) {
    const url = new URL(window.location.href);
    url.searchParams.set('mode', mode);
    const next = `${url.pathname}${url.search}${url.hash}`;
    const state = { graphMode: mode };
    if (replaceHistory || !pushHistory) {
      window.history.replaceState(state, '', next);
    } else {
      window.history.pushState(state, '', next);
    }
  }

  function setMode(mode, { pushHistory = false, syncUrl = true, replaceHistory = false } = {}) {
    const nextMode = mode === MODE_FULL ? MODE_FULL : MODE_HERO;
    renderGeneration += 1;
    const generation = renderGeneration;

    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }

    currentMode = nextMode;
    graphReady = false;
    layoutDone = false;
    hoveredNode = null;
    selectedNode = null;
    isDragging = false;
    dragNode = null;
    isPanning = false;
    hasUserAdjustedView = false;

    document.body.classList.toggle('graph-mode-hero', nextMode === MODE_HERO);
    document.body.classList.toggle('graph-mode-full', nextMode === MODE_FULL);
    updateModeToggleUI(nextMode);

    if (syncUrl) {
      writeModeToURL(nextMode, { pushHistory, replaceHistory });
    }

    if (nextMode === MODE_HERO) {
      activateHeroMode();
      return;
    }

    activateFullMode(generation);
  }

  // ── Hero mode ────────────────────────────────────────────────────────────
  function activateHeroMode() {
    if (searchBox) searchBox.value = '';
    if (filterSelect) filterSelect.value = 'all';

    setStatus('Hero constellation view');
    buildHeroGraph();
    layoutDone = true;
    fitGraphToViewport(0.08);
    revealGraph();
    draw();
    const anchor = nodePositions.find(p => p.node.id === 'moonboys');
    if (anchor) showInfo(anchor.node);
    setStatus('');
  }

  function buildHeroGraph() {
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;

    const inner = Math.min(W, H) * 0.24;
    const outer = Math.min(W, H) * 0.4;

    const layout = {
      moonboys: [0, 0],
      bitcoin: [0, -inner],
      ethereum: [inner * 0.86, -inner * 0.36],
      nfts: [inner * 0.92, inner * 0.42],
      defi: [0.2 * inner, inner * 1.04],
      dao: [-0.75 * inner, inner * 0.72],
      community: [-inner * 0.97, 0],
      lore: [-inner * 0.75, -inner * 0.66],
      tokenomics: [outer * 0.7, -outer * 0.58],
      web3: [outer * 0.97, 0],
      'hodl-wars': [outer * 0.62, outer * 0.72],
      'diamond-hands': [-outer * 0.82, outer * 0.56],
    };

    nodePositions = HERO_NODES.map((node) => {
      const pos = layout[node.id] || [0, 0];
      const rank = node.rank_score || 75;
      const baseRadius = 9 + (rank / 100) * 8;
      return {
        x: cx + pos[0],
        y: cy + pos[1],
        vx: 0,
        vy: 0,
        node,
        radius: node.id === 'moonboys' ? baseRadius + 5 : baseRadius,
        color: nodeColor(node),
        visible: true,
      };
    });

    const indexById = new Map(nodePositions.map((p, i) => [p.node.id, i]));
    edgeList = HERO_EDGES
      .map(([source, target, weight]) => ({
        si: indexById.get(source),
        ti: indexById.get(target),
        weight,
      }))
      .filter(e => e.si !== undefined && e.ti !== undefined);
  }

  // ── Full mode loading ────────────────────────────────────────────────────
  function activateFullMode(generation) {
    setStatus('Loading graph data…');

    if (fullGraphLoaded && graphData) {
      buildGraph(graphData.nodes, graphData.edges);
      if (filterSelect) filterSelect.value = 'all';
      if (searchBox) searchBox.value = '';
      filterCategory = 'all';
      runLayout(generation);
      return;
    }

    fetch(GRAPH_DATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (generation !== renderGeneration || currentMode !== MODE_FULL) return;
        graphData = data;
        fullGraphLoaded = true;
        if (!filterOptionsBuilt) {
          buildFilterOptions(data.nodes);
          filterOptionsBuilt = true;
        }
        buildGraph(data.nodes, data.edges);
        if (filterSelect) filterSelect.value = 'all';
        if (searchBox) searchBox.value = '';
        filterCategory = 'all';
        runLayout(generation);
      })
      .catch((err) => {
        if (generation !== renderGeneration || currentMode !== MODE_FULL) return;
        setStatus(`Failed to load graph data: ${err.message}`);
      });
  }

  function setStatus(message) {
    const el = document.getElementById('graph-status');
    if (el) el.textContent = message;
  }

  // ── Graph construction ───────────────────────────────────────────────────
  function buildGraph(nodes, edges) {
    const indexById = new Map();
    const W = canvas.width;
    const H = canvas.height;

    nodePositions = nodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1);
      const r = Math.min(W, H) * 0.38;
      const cx = W / 2;
      const cy = H / 2;
      indexById.set(node.id, i);
      return {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        vx: 0,
        vy: 0,
        node,
        radius: nodeRadius(node),
        color: nodeColor(node),
        visible: true,
      };
    });

    edgeList = [];
    for (const edge of edges) {
      const si = indexById.get(edge.source);
      const ti = indexById.get(edge.target);
      if (si === undefined || ti === undefined) continue;
      edgeList.push({ si, ti, weight: edge.weight || 0.5, score: edge.score });
    }
  }

  function nodeRadius(node) {
    const max = graphData
      ? Math.max(...graphData.nodes.map((n) => n.rank_score || 0)) || 1
      : 1000;
    const ratio = (node.rank_score || 0) / max;
    return NODE_MIN_RADIUS + ratio * (NODE_MAX_RADIUS - NODE_MIN_RADIUS);
  }

  function nodeColor(node) {
    const cat = (node.category || 'unknown').toLowerCase();
    return CATEGORY_COLORS[cat] || CATEGORY_COLORS.unknown;
  }

  // ── Force layout (full mode) ─────────────────────────────────────────────
  function runLayout(generation) {
    layoutDone = false;
    if (animFrame) cancelAnimationFrame(animFrame);
    let step = 0;
    const iterationsPerFrame = 24;
    setStatus('Computing layout… 0%');

    function tick() {
      if (generation !== renderGeneration || currentMode !== MODE_FULL) {
        return;
      }

      const end = Math.min(step + iterationsPerFrame, ITERATIONS);
      for (; step < end; step += 1) {
        const cool = 1 - step / ITERATIONS;
        simulateStep(cool);
      }

      const progress = Math.round((step / ITERATIONS) * 100);
      setStatus(`Computing layout… ${progress}%`);

      if (step < ITERATIONS) {
        animFrame = requestAnimationFrame(tick);
        return;
      }

      layoutDone = true;
      const container = canvas.parentElement;
      const cw = container.clientWidth;
      const ch = Math.max(container.clientHeight, MIN_CANVAS_HEIGHT);
      canvas.width = cw;
      canvas.height = ch;
      fitGraphToViewport(0.12);
      revealGraph();
      draw();
      setStatus('');
    }

    animFrame = requestAnimationFrame(tick);
  }

  function simulateStep(cool) {
    const n = nodePositions.length;
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;

    for (let i = 0; i < n; i += 1) {
      nodePositions[i].fx = 0;
      nodePositions[i].fy = 0;
    }

    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const pi = nodePositions[i];
        const pj = nodePositions[j];
        const dx = pi.x - pj.x;
        const dy = pi.y - pj.y;
        const dist2 = dx * dx + dy * dy + 1;
        const force = REPULSION / dist2;
        const fx = force * dx;
        const fy = force * dy;
        pi.fx += fx;
        pi.fy += fy;
        pj.fx -= fx;
        pj.fy -= fy;
      }
    }

    for (const edge of edgeList) {
      const pi = nodePositions[edge.si];
      const pj = nodePositions[edge.ti];
      const dx = pi.x - pj.x;
      const dy = pi.y - pj.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 1;
      const force = ATTRACTION * dist * ((edge.weight || 0.5) + 0.2);
      pi.fx -= force * dx;
      pi.fy -= force * dy;
      pj.fx += force * dx;
      pj.fy += force * dy;
    }

    for (let i = 0; i < n; i += 1) {
      const p = nodePositions[i];
      p.fx += CENTER_GRAVITY * (cx - p.x);
      p.fy += CENTER_GRAVITY * (cy - p.y);
    }

    const maxD = MAX_DISPLACEMENT * (cool * 0.7 + 0.3);
    for (let i = 0; i < n; i += 1) {
      const p = nodePositions[i];
      if (p === dragNode) continue;
      p.vx = (p.vx + p.fx) * DAMPING;
      p.vy = (p.vy + p.fy) * DAMPING;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > maxD) {
        p.vx = (p.vx / speed) * maxD;
        p.vy = (p.vy / speed) * maxD;
      }
      p.x += p.vx;
      p.y += p.vy;
    }
  }

  // ── Rendering ────────────────────────────────────────────────────────────
  function draw() {
    if (!ctx || !canvas) return;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    const focusNode = selectedNode || hoveredNode;
    const neighbourSet = focusNode ? getNeighbours(focusNode) : null;

    drawEdges(focusNode, neighbourSet);
    drawNodes(focusNode, neighbourSet);

    ctx.restore();
  }

  function drawEdges(focusNode) {
    const isHero = currentMode === MODE_HERO;
    for (const edge of edgeList) {
      const pi = nodePositions[edge.si];
      const pj = nodePositions[edge.ti];
      if (!pi || !pj || !pi.visible || !pj.visible) continue;

      let alpha = isHero ? 0.46 : EDGE_ALPHA_BASE;
      if (focusNode) {
        const isFocusEdge = pi.node === focusNode || pj.node === focusNode;
        alpha = isFocusEdge ? EDGE_ALPHA_HOVER : (isHero ? 0.12 : 0.035);
      }

      if (!isHero && zoom < 0.42) {
        alpha *= 0.75;
      }

      ctx.beginPath();
      ctx.moveTo(pi.x, pi.y);
      ctx.lineTo(pj.x, pj.y);
      ctx.strokeStyle = isHero ? `rgba(157,197,255,${alpha})` : `rgba(88,166,255,${alpha})`;
      ctx.lineWidth = ((edge.weight || 0.5) * (isHero ? 2 : 1.5) + (isHero ? 0.5 : 0.3)) / zoom;
      if (isHero) {
        ctx.shadowColor = 'rgba(88,166,255,0.42)';
        ctx.shadowBlur = 16 / zoom;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  function drawNodes(focusNode, neighbourSet) {
    const isHero = currentMode === MODE_HERO;

    for (const p of nodePositions) {
      if (!p.visible) continue;

      const isFocus = p.node === focusNode;
      const isNeighbour = neighbourSet && neighbourSet.has(p.node);
      const isDim = focusNode && !isFocus && !isNeighbour;

      const alpha = isDim ? (isHero ? 0.22 : 0.2) : 1;
      const radiusMultiplier = isHero ? 1.15 : 1;
      const r = (p.radius / zoom) * (isFocus ? 1.5 : radiusMultiplier);

      ctx.globalAlpha = alpha;

      if (isHero) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 1.95, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(137,198,255,0.12)';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = p.color;
      ctx.fill();

      if (isHero || isFocus) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = (isHero ? 1.35 : 2) / zoom;
        ctx.stroke();
      }

      const shouldDrawLabel = isHero
        ? true
        : zoom > 0.75 && (isFocus || isNeighbour || zoom > 1.25);

      if (shouldDrawLabel) {
        const labelAlpha = isDim ? (isHero ? 0.28 : 0.15) : (isHero ? 0.95 : 0.85);
        const fontSize = isHero
          ? Math.max(11, Math.round(13 / Math.max(zoom, 0.8)))
          : Math.max(9, Math.round(10 / zoom));
        ctx.globalAlpha = labelAlpha;
        ctx.fillStyle = '#e6edf3';
        ctx.textAlign = 'center';
        ctx.font = `${fontSize}px sans-serif`;
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = isHero ? 7 : 3;
        ctx.fillText(shortTitle(p.node.title), p.x, p.y + r + 14 / Math.max(zoom, 0.6));
        ctx.shadowBlur = 0;
      }
    }

    ctx.globalAlpha = 1;
  }

  function shortTitle(title) {
    const t = String(title || '').replace(/\s*[—–-]\s*Crypto Moonboys Wiki.*$/i, '').trim();
    return t.length > 24 ? `${t.slice(0, 22)}…` : t;
  }

  function getNeighbours(node) {
    const set = new Set();
    for (const edge of edgeList) {
      const pi = nodePositions[edge.si];
      const pj = nodePositions[edge.ti];
      if (!pi || !pj) continue;
      if (pi.node === node) set.add(pj.node);
      if (pj.node === node) set.add(pi.node);
    }
    return set;
  }

  // ── Interaction ──────────────────────────────────────────────────────────
  function canvasToWorld(cx, cy) {
    return {
      x: (cx - panX) / zoom,
      y: (cy - panY) / zoom,
    };
  }

  function hitTest(wx, wy) {
    let best = null;
    let bestDist = Infinity;
    for (const p of nodePositions) {
      if (!p.visible) continue;
      const dx = p.x - wx;
      const dy = p.y - wy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const hitR = Math.max(p.radius / zoom, currentMode === MODE_HERO ? 10 : 6);
      if (d < hitR && d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return best;
  }

  function onMouseMove(e) {
    if (!graphReady) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    if (isPanning) {
      hasUserAdjustedView = true;
      panX += cx - panStartX;
      panY += cy - panStartY;
      panStartX = cx;
      panStartY = cy;
      draw();
      return;
    }

    if (isDragging && dragNode) {
      const w = canvasToWorld(cx, cy);
      dragNode.x = w.x;
      dragNode.y = w.y;
      dragNode.vx = 0;
      dragNode.vy = 0;
      draw();
      return;
    }

    const w = canvasToWorld(cx, cy);
    const hit = hitTest(w.x, w.y);
    hoveredNode = hit ? hit.node : null;
    canvas.style.cursor = hit ? 'pointer' : 'grab';
    draw();
    if (hit) showInfo(hit.node);
  }

  function onMouseDown(e) {
    if (!graphReady) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const w = canvasToWorld(cx, cy);
    const hit = hitTest(w.x, w.y);

    if (hit) {
      isDragging = true;
      dragNode = hit;
      selectedNode = hit.node;
      showInfo(hit.node);
      draw();
    } else {
      isPanning = true;
      panStartX = cx;
      panStartY = cy;
      canvas.style.cursor = 'grabbing';
    }
  }

  function onMouseUp() {
    if (!graphReady) return;
    isDragging = false;
    dragNode = null;
    isPanning = false;
    canvas.style.cursor = 'grab';
  }

  function onWheel(e) {
    if (!graphReady) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    panX = cx - factor * (cx - panX);
    panY = cy - factor * (cy - panY);
    zoom *= factor;
    zoom = Math.max(MIN_ZOOM, Math.min(zoom, MAX_ZOOM));
    hasUserAdjustedView = true;
    draw();
  }

  let lastTouchDist = 0;
  function onTouchStart(e) {
    if (!graphReady) return;
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const cx = t.clientX - rect.left;
      const cy = t.clientY - rect.top;
      const w = canvasToWorld(cx, cy);
      const hit = hitTest(w.x, w.y);
      if (hit) {
        isDragging = true;
        dragNode = hit;
        selectedNode = hit.node;
        showInfo(hit.node);
      } else {
        isPanning = true;
        panStartX = cx;
        panStartY = cy;
      }
    } else if (e.touches.length === 2) {
      isDragging = false;
      isPanning = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist = Math.sqrt(dx * dx + dy * dy);
    }
  }

  function onTouchMove(e) {
    if (!graphReady) return;
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const cx = t.clientX - rect.left;
      const cy = t.clientY - rect.top;
      if (isPanning) {
        hasUserAdjustedView = true;
        panX += cx - panStartX;
        panY += cy - panStartY;
        panStartX = cx;
        panStartY = cy;
        draw();
      } else if (isDragging && dragNode) {
        const w = canvasToWorld(cx, cy);
        dragNode.x = w.x;
        dragNode.y = w.y;
        dragNode.vx = 0;
        dragNode.vy = 0;
        draw();
      }
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastTouchDist > 0) {
        const factor = dist / lastTouchDist;
        zoom *= factor;
        zoom = Math.max(MIN_ZOOM, Math.min(zoom, MAX_ZOOM));
        hasUserAdjustedView = true;
        draw();
      }
      lastTouchDist = dist;
    }
  }

  function onTouchEnd() {
    if (!graphReady) return;
    isDragging = false;
    dragNode = null;
    isPanning = false;
  }

  // ── Info panel ───────────────────────────────────────────────────────────
  function showInfo(node) {
    if (!infoPanel || !node) return;
    const neighbours = getNeighbours(node);
    const title = shortTitle(node.title || node.id || 'Entity');
    const cat = node.category || 'unknown';
    const colour = CATEGORY_COLORS[String(cat).toLowerCase()] || CATEGORY_COLORS.unknown;

    infoPanel.innerHTML = `
      <div class="ginfo-title">
        <span class="ginfo-dot" style="background:${colour}"></span>
        <a href="${node.url || '#'}">${title}</a>
      </div>
      <div class="ginfo-meta">
        <span class="ginfo-cat">${cat}</span>
        <span class="ginfo-rank">Rank: ${node.rank_score ?? '—'}</span>
        <span class="ginfo-auth">Authority: ${node.authority_score ?? '—'}</span>
      </div>
      <div class="ginfo-connections">${neighbours.size} connection${neighbours.size !== 1 ? 's' : ''}</div>
      <a class="ginfo-link btn-small" href="${node.url || '#'}">Open article →</a>
    `;
  }

  // ── Controls ─────────────────────────────────────────────────────────────
  function resetView() {
    if (!nodePositions.length) return;
    hasUserAdjustedView = false;
    fitGraphToViewport(currentMode === MODE_HERO ? 0.08 : 0.12);
    draw();
  }

  function onFilterChange(e) {
    if (currentMode !== MODE_FULL) return;
    filterCategory = e.target.value || 'all';
    for (const p of nodePositions) {
      p.visible = (filterCategory === 'all') || ((p.node.category || 'unknown').toLowerCase() === filterCategory);
    }
    fitGraphToViewport(0.12);
    draw();
  }

  function onSearch(e) {
    if (currentMode !== MODE_FULL) return;
    const q = e.target.value.trim().toLowerCase();
    if (!q) {
      for (const p of nodePositions) p.visible = true;
      hoveredNode = null;
      fitGraphToViewport(0.12);
      draw();
      return;
    }

    for (const p of nodePositions) {
      p.visible = shortTitle(p.node.title).toLowerCase().includes(q);
    }

    const match = nodePositions.find((p) => p.visible);
    if (match) {
      hoveredNode = match.node;
      showInfo(match.node);
    }

    fitGraphToViewport(0.12);
    draw();
  }

  function buildFilterOptions(nodes) {
    if (!filterSelect) return;
    const cats = [...new Set(nodes.map((n) => (n.category || 'unknown').toLowerCase()))].sort();
    cats.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
      filterSelect.appendChild(opt);
    });
  }

  // ── Canvas resize ────────────────────────────────────────────────────────
  function resizeCanvas() {
    if (!canvas) return;
    const container = canvas.parentElement;
    const prevW = canvas.width || 0;
    const prevH = canvas.height || 0;
    const w = container.clientWidth;
    const h = Math.max(container.clientHeight, MIN_CANVAS_HEIGHT);
    canvas.width = w;
    canvas.height = h;

    if (!nodePositions.length) return;

    if (!hasUserAdjustedView || !layoutDone) {
      fitGraphToViewport(currentMode === MODE_HERO ? 0.08 : 0.12);
    } else if (prevW && prevH) {
      panX += (w - prevW) / 2;
      panY += (h - prevH) / 2;
    }

    draw();
  }

  function fitGraphToViewport(paddingRatio = VIEWPORT_PADDING_RATIO) {
    const visible = nodePositions.filter((p) => p.visible);
    if (!visible.length || !canvas) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const p of visible) {
      const r = p.radius;
      minX = Math.min(minX, p.x - r);
      minY = Math.min(minY, p.y - r);
      maxX = Math.max(maxX, p.x + r);
      maxY = Math.max(maxY, p.y + r);
    }

    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const viewportMin = Math.min(canvas.width, canvas.height);
    const scaledPad = viewportMin * paddingRatio;
    const boundedPad = Math.min(scaledPad, MAX_VIEWPORT_PADDING);
    const pad = Math.max(MIN_VIEWPORT_PADDING, boundedPad);
    const fitW = Math.max(canvas.width - pad * 2, 1);
    const fitH = Math.max(canvas.height - pad * 2, 1);
    const nextZoom = Math.max(MIN_ZOOM, Math.min(Math.min(fitW / spanX, fitH / spanY), MAX_ZOOM));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    zoom = nextZoom;
    panX = canvas.width / 2 - centerX * zoom;
    panY = canvas.height / 2 - centerY * zoom;
  }

  function revealGraph() {
    graphReady = true;
    if (canvas && canvas.parentElement) {
      canvas.parentElement.classList.add('is-ready');
    }
  }

  // ── Bootstrap ────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
