/* ============================================================
   graph-visualization.js — Interactive entity relationship graph
   Uses Canvas 2D API with a deterministic force-directed layout.
   No external dependencies.
   ============================================================ */

(function () {
  'use strict';

  // ── Configuration ────────────────────────────────────────────────────────
  // Load a lighter dataset on narrow/mobile viewports to improve performance.
  const GRAPH_DATA_URL = window.innerWidth < 768
    ? '/js/entity-graph-lite.json'
    : '/js/graph-data.json';

  const CATEGORY_COLORS = {
    characters:    '#58a6ff',
    factions:      '#f7c948',
    tokens:        '#3fb950',
    concepts:      '#bc8cff',
    lore:          '#ff7b72',
    cryptocurrencies: '#3fb950',
    unknown:       '#8b949e',
  };

  const NODE_MIN_RADIUS = 4;
  const NODE_MAX_RADIUS = 18;
  const EDGE_ALPHA_BASE = 0.25;
  const EDGE_ALPHA_HOVER = 0.7;

  // Force simulation parameters
  const ITERATIONS      = 400;
  const REPULSION       = 5000;
  const ATTRACTION      = 0.012;
  const DAMPING         = 0.88;
  const CENTER_GRAVITY  = 0.06;
  const MAX_DISPLACEMENT = 8;

  // ── State ────────────────────────────────────────────────────────────────
  let graphData = null;
  let nodePositions = [];   // [{x, y, vx, vy, node}]
  let edgeList = [];        // pre-processed edges referencing nodePositions indices
  let hoveredNode = null;
  let selectedNode = null;
  let isDragging = false;
  let dragNode = null;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let panX = 0;
  let panY = 0;
  let zoom = 1;
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let filterCategory = 'all';
  let canvas, ctx, infoPanel, searchBox;
  let animFrame = null;
  let layoutDone = false;
  let graphReady = false;
  let hasUserAdjustedView = false;

  // ── Entry point ──────────────────────────────────────────────────────────
  function init() {
    canvas    = document.getElementById('graph-canvas');
    ctx       = canvas.getContext('2d');
    infoPanel = document.getElementById('graph-info');
    searchBox = document.getElementById('graph-search');
    if (canvas && canvas.parentElement) {
      canvas.parentElement.classList.remove('is-ready');
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Canvas interaction
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup',   onMouseUp);
    canvas.addEventListener('mouseleave', () => { hoveredNode = null; isDragging = false; isPanning = false; });
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Touch support
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   onTouchEnd);

    // UI controls
    document.getElementById('graph-reset-btn').addEventListener('click', resetView);
    document.getElementById('graph-filter-select').addEventListener('change', onFilterChange);
    if (searchBox) searchBox.addEventListener('input', onSearch);

    loadData();
  }

  // ── Data loading ─────────────────────────────────────────────────────────
  function loadData() {
    setStatus('Loading graph data…');
    fetch(GRAPH_DATA_URL)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        graphData = data;
        buildFilterOptions(data.nodes);
        buildGraph(data.nodes, data.edges);
        setStatus('Computing layout…');
        runLayout();
        setStatus('');
      })
      .catch(err => {
        setStatus('Failed to load graph data: ' + err.message);
      });
  }

  function setStatus(msg) {
    const el = document.getElementById('graph-status');
    if (el) el.textContent = msg;
  }

  // ── Graph construction ───────────────────────────────────────────────────
  function buildGraph(nodes, edges) {
    // Build index by node id
    const indexById = new Map();
    const W = canvas.width;
    const H = canvas.height;

    nodePositions = nodes.map((node, i) => {
      // Deterministic initial positions arranged in a circle
      const angle = (2 * Math.PI * i) / nodes.length;
      const r = Math.min(W, H) * 0.38;
      const cx = W / 2;
      const cy = H / 2;
      indexById.set(node.id, i);
      return {
        x:  cx + r * Math.cos(angle),
        y:  cy + r * Math.sin(angle),
        vx: 0,
        vy: 0,
        node,
        radius: nodeRadius(node),
        color:  nodeColor(node),
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
      ? Math.max(...graphData.nodes.map(n => n.rank_score || 0)) || 1
      : 1000;
    const ratio = (node.rank_score || 0) / max;
    return NODE_MIN_RADIUS + ratio * (NODE_MAX_RADIUS - NODE_MIN_RADIUS);
  }

  function nodeColor(node) {
    const cat = (node.category || 'unknown').toLowerCase();
    return CATEGORY_COLORS[cat] || CATEGORY_COLORS.unknown;
  }

  // ── Force layout ─────────────────────────────────────────────────────────
  function runLayout() {
    layoutDone = false;
    if (animFrame) cancelAnimationFrame(animFrame);
    for (let step = 0; step < ITERATIONS; step++) {
      const cool = 1 - step / ITERATIONS;
      simulateStep(cool);
    }
    layoutDone = true;
    fitGraphToViewport();
    revealGraph();
    draw();
  }

  function simulateStep(cool) {
    const n = nodePositions.length;
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;

    // Reset forces
    for (let i = 0; i < n; i++) {
      nodePositions[i].fx = 0;
      nodePositions[i].fy = 0;
    }

    // Repulsion (Barnes-Hut approximation via O(n²) for simplicity)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const pi = nodePositions[i];
        const pj = nodePositions[j];
        const dx = pi.x - pj.x;
        const dy = pi.y - pj.y;
        const dist2 = dx * dx + dy * dy + 1;
        const force = REPULSION / dist2;
        const fx = force * dx;
        const fy = force * dy;
        pi.fx += fx; pi.fy += fy;
        pj.fx -= fx; pj.fy -= fy;
      }
    }

    // Attraction along edges
    for (const edge of edgeList) {
      const pi = nodePositions[edge.si];
      const pj = nodePositions[edge.ti];
      const dx = pi.x - pj.x;
      const dy = pi.y - pj.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 1;
      const force = ATTRACTION * dist * (edge.weight + 0.2);
      pi.fx -= force * dx;
      pi.fy -= force * dy;
      pj.fx += force * dx;
      pj.fy += force * dy;
    }

    // Centre gravity
    for (let i = 0; i < n; i++) {
      const p = nodePositions[i];
      p.fx += CENTER_GRAVITY * (cx - p.x);
      p.fy += CENTER_GRAVITY * (cy - p.y);
    }

    // Integrate
    const maxD = MAX_DISPLACEMENT * (cool * 0.7 + 0.3);
    for (let i = 0; i < n; i++) {
      const p = nodePositions[i];
      if (p === dragNode) continue;
      p.vx = (p.vx + p.fx) * DAMPING;
      p.vy = (p.vy + p.fy) * DAMPING;
      // Clamp displacement
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
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // Determine neighbour nodes of selected/hovered
    const focusNode = selectedNode || hoveredNode;
    const neighbourSet = focusNode ? getNeighbours(focusNode) : null;

    // Draw edges
    drawEdges(focusNode, neighbourSet);

    // Draw nodes
    drawNodes(focusNode, neighbourSet);

    ctx.restore();
  }

  function drawEdges(focusNode, neighbourSet) {
    for (const edge of edgeList) {
      const pi = nodePositions[edge.si];
      const pj = nodePositions[edge.ti];
      if (!pi.visible || !pj.visible) continue;

      let alpha = EDGE_ALPHA_BASE;
      if (focusNode) {
        const isFocusEdge = pi.node === focusNode || pj.node === focusNode;
        alpha = isFocusEdge ? EDGE_ALPHA_HOVER : 0.04;
      }

      ctx.beginPath();
      ctx.moveTo(pi.x, pi.y);
      ctx.lineTo(pj.x, pj.y);
      ctx.strokeStyle = `rgba(88,166,255,${alpha})`;
      ctx.lineWidth = (edge.weight * 1.5 + 0.3) / zoom;
      ctx.stroke();
    }
  }

  function drawNodes(focusNode, neighbourSet) {
    for (const p of nodePositions) {
      if (!p.visible) continue;

      const isFocus   = p.node === focusNode;
      const isNeighbour = neighbourSet && neighbourSet.has(p.node);
      const isDim     = focusNode && !isFocus && !isNeighbour;

      const alpha = isDim ? 0.2 : 1;
      const r     = p.radius / zoom * (isFocus ? 1.6 : 1);

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = p.color;
      ctx.fill();

      if (isFocus) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
      }

      // Label
      if (zoom > 0.6 && (isFocus || isNeighbour || zoom > 1.2)) {
        ctx.globalAlpha = isDim ? 0.15 : 0.85;
        ctx.fillStyle = '#e6edf3';
        ctx.font = `${Math.round(10 / zoom)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(shortTitle(p.node.title), p.x, p.y + r + 10 / zoom);
      }
    }
    ctx.globalAlpha = 1;
  }

  function shortTitle(title) {
    // Strip "— Crypto Moonboys Wiki" suffix
    const t = title.replace(/\s*[—–-]\s*Crypto Moonboys Wiki.*$/i, '').trim();
    return t.length > 22 ? t.slice(0, 20) + '…' : t;
  }

  function getNeighbours(node) {
    const set = new Set();
    for (const edge of edgeList) {
      const pi = nodePositions[edge.si];
      const pj = nodePositions[edge.ti];
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
      const d  = Math.sqrt(dx * dx + dy * dy);
      const hitR = Math.max(p.radius / zoom, 6);
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

    lastMouseX = cx;
    lastMouseY = cy;
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
    const w  = canvasToWorld(cx, cy);
    const hit = hitTest(w.x, w.y);

    if (hit) {
      isDragging = true;
      dragNode   = hit;
      selectedNode = hit.node;
      showInfo(hit.node);
      draw();
    } else {
      isPanning  = true;
      panStartX  = cx;
      panStartY  = cy;
      canvas.style.cursor = 'grabbing';
    }
  }

  function onMouseUp() {
    if (!graphReady) return;
    isDragging = false;
    dragNode   = null;
    isPanning  = false;
    canvas.style.cursor = 'grab';
  }

  function onWheel(e) {
    if (!graphReady) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    // Zoom around cursor
    panX = cx - factor * (cx - panX);
    panY = cy - factor * (cy - panY);
    zoom *= factor;
    zoom = Math.max(0.15, Math.min(zoom, 8));
    hasUserAdjustedView = true;
    draw();
  }

  // Touch helpers
  let lastTouchDist = 0;
  function onTouchStart(e) {
    if (!graphReady) return;
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const cx = t.clientX - rect.left;
      const cy = t.clientY - rect.top;
      const w  = canvasToWorld(cx, cy);
      const hit = hitTest(w.x, w.y);
      if (hit) {
        isDragging = true;
        dragNode   = hit;
        selectedNode = hit.node;
        showInfo(hit.node);
      } else {
        isPanning = true;
        panStartX = cx;
        panStartY = cy;
      }
    } else if (e.touches.length === 2) {
      isDragging = false;
      isPanning  = false;
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
        zoom = Math.max(0.15, Math.min(zoom, 8));
        hasUserAdjustedView = true;
        draw();
      }
      lastTouchDist = dist;
    }
  }

  function onTouchEnd() {
    if (!graphReady) return;
    isDragging = false;
    dragNode   = null;
    isPanning  = false;
  }

  // ── Info panel ───────────────────────────────────────────────────────────
  function showInfo(node) {
    if (!infoPanel) return;
    const neighbours = getNeighbours(node);
    const title = shortTitle(node.title);
    const cat   = node.category || 'unknown';
    const colour = CATEGORY_COLORS[cat.toLowerCase()] || CATEGORY_COLORS.unknown;

    infoPanel.innerHTML = `
      <div class="ginfo-title">
        <span class="ginfo-dot" style="background:${colour}"></span>
        <a href="${node.url}">${title}</a>
      </div>
      <div class="ginfo-meta">
        <span class="ginfo-cat">${cat}</span>
        <span class="ginfo-rank">Rank: ${node.rank_score}</span>
        <span class="ginfo-auth">Authority: ${node.authority_score}</span>
      </div>
      <div class="ginfo-connections">${neighbours.size} connection${neighbours.size !== 1 ? 's' : ''}</div>
      <a class="ginfo-link btn-small" href="${node.url}">Open article →</a>
    `;
  }

  // ── Controls ─────────────────────────────────────────────────────────────
  function resetView() {
    hasUserAdjustedView = false;
    fitGraphToViewport();
    draw();
  }

  function onFilterChange(e) {
    filterCategory = e.target.value || 'all';
    for (const p of nodePositions) {
      p.visible = (filterCategory === 'all') ||
                  (p.node.category || 'unknown').toLowerCase() === filterCategory;
    }
    fitGraphToViewport();
    draw();
  }

  function onSearch(e) {
    const q = e.target.value.trim().toLowerCase();
    if (!q) {
      for (const p of nodePositions) p.visible = true;
      hoveredNode = null;
      fitGraphToViewport();
      draw();
      return;
    }
    for (const p of nodePositions) {
      p.visible = shortTitle(p.node.title).toLowerCase().includes(q);
    }
    const match = nodePositions.find(p => p.visible);
    if (match) {
      hoveredNode = match.node;
      showInfo(match.node);
    }
    fitGraphToViewport();
    draw();
  }

  function buildFilterOptions(nodes) {
    const sel = document.getElementById('graph-filter-select');
    if (!sel) return;
    const cats = [...new Set(nodes.map(n => (n.category || 'unknown').toLowerCase()))].sort();
    cats.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
      sel.appendChild(opt);
    });
  }

  // ── Canvas resize ─────────────────────────────────────────────────────────
  function resizeCanvas() {
    if (!canvas) return;
    const container = canvas.parentElement;
    const prevW = canvas.width || 0;
    const prevH = canvas.height || 0;
    const w = container.clientWidth;
    const h = Math.max(container.clientHeight, 280);
    canvas.width  = w;
    canvas.height = h;
    if (!graphData || !nodePositions.length) return;
    if (!hasUserAdjustedView || !layoutDone) {
      fitGraphToViewport();
    } else if (prevW && prevH) {
      panX += (w - prevW) / 2;
      panY += (h - prevH) / 2;
    }
    draw();
  }

  function fitGraphToViewport() {
    const visible = nodePositions.filter(p => p.visible);
    if (!visible.length || !canvas) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of visible) {
      const r = p.radius;
      minX = Math.min(minX, p.x - r);
      minY = Math.min(minY, p.y - r);
      maxX = Math.max(maxX, p.x + r);
      maxY = Math.max(maxY, p.y + r);
    }
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const pad = Math.max(28, Math.min(Math.min(canvas.width, canvas.height) * 0.12, 110));
    const fitW = Math.max(canvas.width - pad * 2, 1);
    const fitH = Math.max(canvas.height - pad * 2, 1);
    const nextZoom = Math.max(0.15, Math.min(Math.min(fitW / spanX, fitH / spanY), 2.2));
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

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
