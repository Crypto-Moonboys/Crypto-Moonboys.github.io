/**
 * SAM Dashboard — js/sam-dashboard.js
 * Loads entity-map.json, wiki-index.json, site-stats.json, sam-memory.json
 * and renders the 4 panels + network graph.
 */

(function () {
  'use strict';

  /* ── Data fetch helpers ──────────────────────────────── */

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }

  async function safeLoad(url, fallback) {
    try {
      return await fetchJSON(url);
    } catch (_) {
      return fallback;
    }
  }

  /* ── Utility ─────────────────────────────────────────── */

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function relTime(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (_) { return iso; }
  }

  /* ── Panel 1 — Entity Intelligence ──────────────────── */

  function renderEntityPanel(entityMap) {
    const el = document.getElementById('panel-entities');
    if (!el) return;

    if (!entityMap || !entityMap.length) {
      el.innerHTML = '<p class="sam-fallback">Entity data unavailable.</p>';
      return;
    }

    // Score = aliases.length + alias_candidates.length + tags.length
    const scored = entityMap.map(e => ({
      ...e,
      score: (e.aliases || []).length + (e.alias_candidates || []).length + (e.tags || []).length
    }));
    scored.sort((a, b) => b.score - a.score);

    const top10 = scored.slice(0, 10);
    // "newest" = last in list (generator appends new entries at end)
    const newest = [...entityMap].slice(-5).reverse();

    el.innerHTML = `
      <div class="sam-stat-row">
        <div class="sam-stat-box">
          <div class="sam-stat-num">${entityMap.length}</div>
          <div class="sam-stat-lbl">Total Entities</div>
        </div>
        <div class="sam-stat-box">
          <div class="sam-stat-num">${[...new Set(entityMap.map(e => e.category).filter(Boolean))].length}</div>
          <div class="sam-stat-lbl">Categories</div>
        </div>
      </div>
      <div class="sam-section-label">🏆 Top 10 by Connections</div>
      <ol class="sam-rank-list">
        ${top10.map(e => `
          <li>
            <a href="${esc(e.canonical_url)}" class="sam-entity-link">${esc(e.canonical_title)}</a>
            <span class="sam-tag">${esc(e.category || '—')}</span>
            <span class="sam-score">${e.score}</span>
          </li>`).join('')}
      </ol>
      <div class="sam-section-label">🆕 Recent Entities</div>
      <ul class="sam-recent-list">
        ${newest.map(e => `
          <li><a href="${esc(e.canonical_url)}">${esc(e.canonical_title)}</a>
          <span class="sam-tag">${esc(e.category || '—')}</span></li>`).join('')}
      </ul>
    `;
  }

  /* ── Panel 2 — System Stats ──────────────────────────── */

  function renderStatsPanel(siteStats, entityMap, memory) {
    const el = document.getElementById('panel-stats');
    if (!el) return;

    const totalPages = (siteStats && siteStats.total_articles) || (siteStats && siteStats.article_count) || '—';
    const totalEntities = (entityMap && entityMap.length) || (siteStats && siteStats.total_entities) || '—';
    const lastUpdated = (memory && memory.updated_at) || (siteStats && siteStats.last_updated);

    el.innerHTML = `
      <div class="sam-stat-row sam-stat-row--3">
        <div class="sam-stat-box sam-stat-box--accent">
          <div class="sam-stat-num">${esc(String(totalPages))}</div>
          <div class="sam-stat-lbl">Wiki Pages</div>
        </div>
        <div class="sam-stat-box sam-stat-box--green">
          <div class="sam-stat-num">${esc(String(totalEntities))}</div>
          <div class="sam-stat-lbl">Entities</div>
        </div>
        <div class="sam-stat-box sam-stat-box--blue">
          <div class="sam-stat-num">${(siteStats && siteStats.category_count) || '—'}</div>
          <div class="sam-stat-lbl">Categories</div>
        </div>
      </div>
      <div class="sam-section-label">🕐 Last System Update</div>
      <div class="sam-update-time">
        <span class="sam-time-abs">${fmtDate(lastUpdated)}</span>
        <span class="sam-time-rel">${relTime(lastUpdated)}</span>
      </div>
      <div class="sam-section-label">📊 Category Breakdown</div>
      <div class="sam-cat-bars" id="cat-bars"></div>
    `;

    if (entityMap && entityMap.length) {
      const catCount = {};
      entityMap.forEach(e => { catCount[e.category || 'Unknown'] = (catCount[e.category || 'Unknown'] || 0) + 1; });
      const cats = Object.entries(catCount).sort((a, b) => b[1] - a[1]);
      const max = cats[0][1];
      const barsEl = el.querySelector('#cat-bars');
      if (barsEl) {
        barsEl.innerHTML = cats.map(([cat, cnt]) => `
          <div class="sam-bar-row">
            <span class="sam-bar-lbl">${esc(cat)}</span>
            <div class="sam-bar-wrap">
              <div class="sam-bar-fill" style="width:${Math.round(cnt / max * 100)}%"></div>
            </div>
            <span class="sam-bar-cnt">${cnt}</span>
          </div>`).join('');
      }
    }
  }

  /* ── Panel 3 — Focus / Status ────────────────────────── */

  function renderFocusPanel(entityMap, wikiIndex) {
    const el = document.getElementById('panel-focus');
    if (!el) return;

    if (!entityMap || !entityMap.length) {
      el.innerHTML = '<p class="sam-fallback">Focus data unavailable.</p>';
      return;
    }

    // Largest entities by tag count
    const byTags = [...entityMap].sort((a, b) => (b.tags || []).length - (a.tags || []).length);
    const top5tags = byTags.slice(0, 5);

    // Category with most entries
    const catCount = {};
    entityMap.forEach(e => { catCount[e.category || 'Unknown'] = (catCount[e.category || 'Unknown'] || 0) + 1; });
    const topCat = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 4);

    // Entities with most source_urls (most cross-referenced)
    const bySources = [...entityMap].sort((a, b) => (b.source_urls || []).length - (a.source_urls || []).length);
    const top5src = bySources.slice(0, 5);

    el.innerHTML = `
      <div class="sam-section-label">🏷️ Most Tagged Entities</div>
      <ul class="sam-focus-list">
        ${top5tags.map(e => `
          <li>
            <a href="${esc(e.canonical_url)}">${esc(e.canonical_title)}</a>
            <span class="sam-pills">${(e.tags || []).slice(0, 4).map(t => `<span class="sam-pill">${esc(t)}</span>`).join('')}</span>
          </li>`).join('')}
      </ul>
      <div class="sam-section-label">📂 Dominant Categories</div>
      <div class="sam-top-cats">
        ${topCat.map(([cat, cnt], i) => `
          <div class="sam-top-cat sam-top-cat--${i}">
            <div class="sam-top-cat-name">${esc(cat)}</div>
            <div class="sam-top-cat-cnt">${cnt}</div>
          </div>`).join('')}
      </div>
      <div class="sam-section-label">🔗 Most Cross-Referenced</div>
      <ul class="sam-focus-list">
        ${top5src.map(e => `
          <li>
            <a href="${esc(e.canonical_url)}">${esc(e.canonical_title)}</a>
            <span class="sam-score">${(e.source_urls || []).length} refs</span>
          </li>`).join('')}
      </ul>
    `;
  }

  /* ── Panel 4 — Activity Feed ─────────────────────────── */

  function renderActivityPanel(entityMap, wikiIndex) {
    const el = document.getElementById('panel-activity');
    if (!el) return;

    // Use last 15 items from entityMap as "recent" (generator appends newest at end)
    const recent = entityMap ? [...entityMap].slice(-15).reverse() : [];
    // Mix in wiki-index entries for variety
    const wikiRecent = wikiIndex ? [...wikiIndex].slice(-8).reverse() : [];

    if (!recent.length && !wikiRecent.length) {
      el.innerHTML = '<p class="sam-fallback">No activity data available.</p>';
      return;
    }

    const feedItems = recent.map(e => ({
      type: 'entity',
      title: e.canonical_title,
      url: e.canonical_url,
      cat: e.category || '—',
      emoji: categoryEmoji(e.category)
    }));

    el.innerHTML = `
      <div class="sam-feed">
        ${feedItems.map(item => `
          <div class="sam-feed-item">
            <span class="sam-feed-icon">${item.emoji}</span>
            <div class="sam-feed-body">
              <a href="${esc(item.url)}" class="sam-feed-title">${esc(item.title)}</a>
              <span class="sam-feed-meta">${esc(item.cat)}</span>
            </div>
            <span class="sam-feed-badge">ENTITY</span>
          </div>`).join('')}
      </div>
    `;
  }

  function categoryEmoji(cat) {
    const map = {
      'Lore': '📜',
      'Concepts': '💡',
      'Community & People': '👥',
      'Cryptocurrencies': '₿',
      'Gaming': '🎮',
      'Technology': '⚙️',
      'Tools & Platforms': '🛠️'
    };
    return map[cat] || '🔷';
  }

  /* ── Network Graph ───────────────────────────────────── */

  // Fallback canvas dimensions when offsetWidth/offsetHeight are not yet available
  const GRAPH_DEFAULT_W = 700;
  const GRAPH_DEFAULT_H = 400;

  let graphBuilding = false;

  function buildGraph(entityMap) {
    if (graphBuilding) return;
    const canvas = document.getElementById('sam-graph');
    if (!canvas || !entityMap || !entityMap.length) return;

    graphBuilding = true;

    // Limit nodes for performance — top 60 by tag score
    const scored = entityMap
      .map(e => ({ ...e, score: (e.tags || []).length + (e.aliases || []).length }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 60);

    const nodes = scored.map((e, i) => ({
      id: i,
      title: e.canonical_title,
      url: e.canonical_url,
      cat: e.category || 'Unknown',
      tags: new Set(e.tags || []),
      x: 0, y: 0, vx: 0, vy: 0,
      r: 6 + Math.min((e.tags || []).length, 6)
    }));

    // Build edges: shared category + tags
    const edges = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let shared = 0;
        if (a.cat === b.cat) shared++;
        a.tags.forEach(t => { if (b.tags.has(t)) shared++; });
        if (shared >= 2) edges.push({ a: i, b: j, w: shared });
      }
    }

    // Category → color
    const catColors = {};
    const palette = ['#58a6ff', '#f7c948', '#3fb950', '#ff7b72', '#d2a8ff', '#ffa657', '#79c0ff'];
    const cats = [...new Set(nodes.map(n => n.cat))];
    cats.forEach((c, i) => { catColors[c] = palette[i % palette.length]; });

    const W = canvas.offsetWidth || GRAPH_DEFAULT_W;
    const H = canvas.offsetHeight || GRAPH_DEFAULT_H;
    canvas.width = W;
    canvas.height = H;

    // Place nodes in circular layout by category
    const catGroups = {};
    nodes.forEach(n => { (catGroups[n.cat] = catGroups[n.cat] || []).push(n); });
    const groupKeys = Object.keys(catGroups);
    const groupAngle = (2 * Math.PI) / groupKeys.length;
    groupKeys.forEach((cat, gi) => {
      const groupR = Math.min(W, H) * 0.3;
      const cx = W / 2 + groupR * Math.cos(gi * groupAngle - Math.PI / 2);
      const cy = H / 2 + groupR * Math.sin(gi * groupAngle - Math.PI / 2);
      const items = catGroups[cat];
      items.forEach((n, ii) => {
        const a2 = (2 * Math.PI / items.length) * ii;
        const r2 = Math.min(W, H) * 0.09;
        n.x = cx + r2 * Math.cos(a2);
        n.y = cy + r2 * Math.sin(a2);
      });
    });

    const ctx = canvas.getContext('2d');
    let hovered = null;

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // Grid dots bg
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      for (let x = 20; x < W; x += 30) {
        for (let y = 20; y < H; y += 30) {
          ctx.fillRect(x, y, 1, 1);
        }
      }

      // Edges
      edges.forEach(e => {
        const a = nodes[e.a], b = nodes[e.b];
        const alpha = Math.min(0.08 + e.w * 0.05, 0.3);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(88,166,255,${alpha})`;
        ctx.lineWidth = Math.min(e.w * 0.4, 1.5);
        ctx.stroke();
      });

      // Nodes
      nodes.forEach(n => {
        const col = catColors[n.cat] || '#58a6ff';
        const isHov = hovered === n;

        if (isHov) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 6, 0, Math.PI * 2);
          ctx.fillStyle = col + '33';
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = isHov ? col : col + 'aa';
        ctx.fill();
        ctx.strokeStyle = isHov ? '#fff' : col;
        ctx.lineWidth = isHov ? 2 : 1;
        ctx.stroke();

        if (isHov || n.r > 9) {
          ctx.fillStyle = isHov ? '#fff' : 'rgba(230,237,243,0.75)';
          ctx.font = isHov ? '700 11px system-ui' : '10px system-ui';
          ctx.fillText(
            n.title.length > 18 ? n.title.slice(0, 16) + '…' : n.title,
            n.x + n.r + 3,
            n.y + 4
          );
        }
      });

      // Legend
      cats.forEach((cat, i) => {
        const x = 12, y = 16 + i * 18;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = catColors[cat];
        ctx.fill();
        ctx.fillStyle = 'rgba(230,237,243,0.7)';
        ctx.font = '10px system-ui';
        ctx.fillText(cat, x + 10, y + 4);
      });
    }

    draw();

    // Hover & click
    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const prev = hovered;
      hovered = nodes.find(n => Math.hypot(n.x - mx, n.y - my) <= n.r + 4) || null;
      if (hovered !== prev) {
        draw();
        canvas.style.cursor = hovered ? 'pointer' : 'default';
      }
      if (hovered) {
        const tip = document.getElementById('graph-tooltip');
        if (tip) {
          tip.style.display = 'block';
          tip.style.left = (e.clientX - rect.left + 12) + 'px';
          tip.style.top = (e.clientY - rect.top - 28) + 'px';
          tip.textContent = hovered.title + ' · ' + hovered.cat;
        }
      } else {
        const tip = document.getElementById('graph-tooltip');
        if (tip) tip.style.display = 'none';
      }
    });

    canvas.addEventListener('mouseleave', () => {
      hovered = null;
      draw();
      const tip = document.getElementById('graph-tooltip');
      if (tip) tip.style.display = 'none';
    });

    canvas.addEventListener('click', e => {
      if (hovered) window.location.href = hovered.url;
    });

    // Resize support — debounced, only rebuilds if dimensions actually changed
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const nW = canvas.offsetWidth;
        const nH = canvas.offsetHeight;
        if (nW !== W || nH !== H) {
          graphBuilding = false;
          buildGraph(entityMap);
        }
      }, 200);
    });

    graphBuilding = false;
  }

  /* ── Main boot ───────────────────────────────────────── */

  async function init() {
    document.getElementById('sam-loading')?.classList.remove('hidden');

    const [entityMap, wikiIndex, siteStats, memory] = await Promise.all([
      safeLoad('/js/entity-map.json', []),
      safeLoad('/js/wiki-index.json', []),
      safeLoad('/js/site-stats.json', null),
      safeLoad('/sam-memory.json', null)
    ]);

    document.getElementById('sam-loading')?.classList.add('hidden');
    document.getElementById('sam-dashboard')?.classList.remove('hidden');

    renderEntityPanel(entityMap);
    renderStatsPanel(siteStats, entityMap, memory);
    renderFocusPanel(entityMap, wikiIndex);
    renderActivityPanel(entityMap, wikiIndex);
    buildGraph(entityMap);

    // Update header timestamp
    const tsEl = document.getElementById('sam-ts');
    if (tsEl) {
      const ts = (memory && memory.updated_at) || (siteStats && siteStats.last_updated);
      tsEl.textContent = ts ? `Last sync: ${fmtDate(ts)}` : '';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
