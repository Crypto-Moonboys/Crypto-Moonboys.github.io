/**
 * Crypto Moonboys Wiki — Main JavaScript
 * Client-side search, sidebar toggle, ranking debug, and UI helpers.
 *
 * RANKING RULE (enforced by CI):
 *   This file must NOT compute article importance, popularity, or freshness scores.
 *   All ranking is pre-computed by scripts/generate-wiki-index.js and stored in
 *   js/wiki-index.json as `rank_score`, `rank_bucket`, and `rank_version`.
 *   Sorting uses `rank_score` (pre-computed) as the primary key.
 *   `scoreResult` may compute query-relevance scores for search matching only.
 */

function resolveWikiUrl(url) {
  if (!url) return url;

  const raw = String(url).trim();

  if (raw === '/articles.html' || raw === 'articles.html') {
    return '/search.html';
  }

  if (raw.startsWith('/')) {
    return raw.replace(/^\/(wiki\/)+/, '/wiki/');
  }

  const normalized = raw.replace(/^\/+/, '').replace(/^(wiki\/)+/, 'wiki/');
  if (normalized.startsWith('wiki/')) return '/' + normalized;

  return '/' + normalized;
}

function goToSearch(q) {
  const query = String(q || '').trim();
  window.location.href = query
    ? `/search.html?q=${encodeURIComponent(query)}`
    : '/search.html';
}

/* ── SEARCH INDEX ────────────────────────────────────────────────────────── */
let WIKI_INDEX = [];

/* ── ENTITY MAP ──────────────────────────────────────────────────────────── */
let ENTITY_MAP = null;
let ENTITY_LOOKUP = {};

const FINAL_QUERY_WEIGHT = 2.5;
const FINAL_RANK_WEIGHT = 1;

/* ── CATEGORY INDEX ──────────────────────────────────────────────────────── */
const CATEGORY_LIST = [
  'Cryptocurrencies',
  'Concepts',
  'Technology',
  'Tools & Platforms',
  'Lore',
  'Crypto Designer Toys',
  'Guerilla Marketing',
  'Graffiti & Street Art',
  'NFTs & Digital Art',
  'Punk Culture',
  'Gaming',
  'Community & People',
  'Media & Publishing',
  'Art & Creativity',
  'Activism & Counter-Culture'
];

/* ── LOADERS ─────────────────────────────────────────────────────────────── */
function getDerivedJsonUrl(fileName) {
  const scripts = document.querySelectorAll('script[src]');
  for (const script of scripts) {
    if (/\/js\/wiki\.js([?#]|$)/.test(script.src)) {
      return script.src.replace(/\/js\/wiki\.js([?#].*)?$/, `/js/${fileName}`);
    }
  }
  return `/js/${fileName}`;
}

async function loadWikiIndex() {
  const url = getDerivedJsonUrl('wiki-index.json');

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    WIKI_INDEX = Array.isArray(data)
      ? data.filter(item => item && item.url !== '/wiki/index.html')
      : [];
  } catch (err) {
    console.warn(`[wiki] Failed to load ${url}`, err);
    WIKI_INDEX = [];
  }
}

async function loadEntityMap() {
  if (ENTITY_MAP !== null) return ENTITY_MAP;

  const url = getDerivedJsonUrl('entity-map.json');

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const arr = await res.json();
    ENTITY_MAP = {};

    if (Array.isArray(arr)) {
      arr.forEach(record => {
        if (record && record.entity_id && record.canonical_url !== '/wiki/index.html') {
          ENTITY_MAP[record.entity_id] = record;
        }
      });
    }
  } catch (err) {
    console.warn(`[wiki] Failed to load ${url}`, err);
    ENTITY_MAP = {};
  }

  return ENTITY_MAP;
}

function buildEntityLookup() {
  ENTITY_LOOKUP = {};
  if (!ENTITY_MAP) return;

  Object.values(ENTITY_MAP).forEach(entity => {
    const keys = [entity.canonical_title, ...(entity.aliases || [])];

    keys.forEach(value => {
      const key = normalizeEntityKey(value);
      if (key) ENTITY_LOOKUP[key] = entity;
    });
  });
}

/* ── DOM READY ───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    initSidebar();
    initBackToTop();
    initActiveNav();
    initTOC();
    initSearch();

    await loadWikiIndex();
    await loadEntityMap();
    buildEntityLookup();

    initStatArticles();
    initStatCategories();

    const searchPage = document.getElementById('search-page-input');
    if (searchPage) {
      renderSearchPage(searchPage.value || '');
    }

    const headerSearch = document.getElementById('search-input');
    const headerResults = document.getElementById('search-results');
    if (headerSearch && headerResults && headerSearch.value) {
      runSearch(headerSearch.value, headerResults);
    }
  } catch (err) {
    console.error('[wiki] Unhandled init error', err);
  }
});

/* ── SIDEBAR ─────────────────────────────────────────────────────────────── */
function initSidebar() {
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  if (!hamburger || !sidebar) return;

  hamburger.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    }
  });
}

/* ── SEARCH ──────────────────────────────────────────────────────────────── */
function initSearch() {
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  if (input && results) {
    input.addEventListener('input', () => runSearch(input.value, results));
    input.addEventListener('focus', () => {
      if (input.value) runSearch(input.value, results);
    });

    document.addEventListener('click', event => {
      if (!input.contains(event.target) && !results.contains(event.target)) {
        results.classList.remove('open');
      }
    });

    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') goToSearch(input.value);
    });

    const button = document.getElementById('search-btn');
    if (button) {
      button.addEventListener('click', () => goToSearch(input.value));
    }
  }

  const homeInput = document.getElementById('home-search-input');
  const homeBtn = document.getElementById('home-search-btn');

  if (homeInput) {
    homeInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') goToSearch(homeInput.value);
    });
  }

  if (homeInput && homeBtn) {
    homeBtn.addEventListener('click', () => goToSearch(homeInput.value));
  }

  const searchPageInput = document.getElementById('search-page-input');
  if (searchPageInput) {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q') || '';
    searchPageInput.value = q;

    searchPageInput.addEventListener('input', () => renderSearchPage(searchPageInput.value));
    searchPageInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') renderSearchPage(searchPageInput.value);
    });
  }
}

function scoreResult(item, query) {
  const q = String(query || '').toLowerCase().trim();

  if (!q) {
    return {
      queryScore: 0,
      rankScore: Number(item.rank_score || 0),
      finalScore: Number(item.rank_score || 0)
    };
  }

  let queryScore = 0;

  const title = String(item.title || '').toLowerCase();
  const desc = String(item.desc || '').toLowerCase();
  const tags = Array.isArray(item.tags) ? item.tags.join(' ').toLowerCase() : '';
  const category = String(item.category || '').toLowerCase();

  if (title === q) queryScore += 100;
  if (title.startsWith(q)) queryScore += 60;
  if (title.includes(q)) queryScore += 40;
  if (tags.includes(q)) queryScore += 30;
  if (desc.includes(q)) queryScore += 15;
  if (category.includes(q)) queryScore += 10;

  q.split(' ').forEach(word => {
    if (word.length > 2) {
      if (title.includes(word)) queryScore += 8;
      if (tags.includes(word)) queryScore += 5;
      if (desc.includes(word)) queryScore += 3;
    }
  });

  const aliases = Array.isArray(item.aliases) ? item.aliases : [];
  aliases.forEach(alias => {
    const aliasTitle = typeof alias === 'string'
      ? alias.toLowerCase()
      : String(alias && alias.title || '').toLowerCase();

    if (!aliasTitle) return;

    if (aliasTitle === q) queryScore += 80;
    else if (aliasTitle.startsWith(q)) queryScore += 45;
    else if (aliasTitle.includes(q)) queryScore += 25;

    q.split(' ').forEach(word => {
      if (word.length > 2 && aliasTitle.includes(word)) queryScore += 5;
    });
  });

  const normalizedQuery = normalizeEntityKey(query);
  const matchedEntity = ENTITY_LOOKUP[normalizedQuery];

  if (matchedEntity) {
    if (item.url === matchedEntity.canonical_url) {
      queryScore += 120;

      const entityAliases = matchedEntity.aliases || [];
      if (entityAliases.some(alias => normalizeEntityKey(alias) === normalizedQuery)) {
        queryScore += 70;
      }
    } else {
      queryScore -= 20;
    }
  }

  const rankScore = Number(item.rank_score || 0);
  const finalScore =
    (queryScore * FINAL_QUERY_WEIGHT) +
    (rankScore * FINAL_RANK_WEIGHT);

  return { queryScore, rankScore, finalScore };
}

function normalizeEntityKey(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function compareStringsStable(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, {
    sensitivity: 'base'
  });
}

function compareScoredResults(a, b) {
  if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
  if (b.queryScore !== a.queryScore) return b.queryScore - a.queryScore;
  if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;

  const titleCmp = compareStringsStable(a.item.title, b.item.title);
  if (titleCmp !== 0) return titleCmp;

  return compareStringsStable(resolveWikiUrl(a.item.url), resolveWikiUrl(b.item.url));
}

function compareIndexItemsStable(a, b) {
  const aRank = Number(a.rank_score || 0);
  const bRank = Number(b.rank_score || 0);

  if (bRank !== aRank) return bRank - aRank;

  const titleCmp = compareStringsStable(a.title, b.title);
  if (titleCmp !== 0) return titleCmp;

  return compareStringsStable(resolveWikiUrl(a.url), resolveWikiUrl(b.url));
}

function dedupeResults(scoredResults) {
  const seen = new Set();
  const deduped = [];

  scoredResults.forEach(result => {
    const item = result.item;

    const baseKeys = [
      normalizeEntityKey(item.title),
      normalizeEntityKey(
        resolveWikiUrl(item.url)
          .replace(/^\/wiki\//, '')
          .replace(/\.html$/, '')
      )
    ];

    const aliasKeys = (item.aliases || []).map(alias => {
      if (typeof alias === 'string') return normalizeEntityKey(alias);
      return normalizeEntityKey(alias && alias.title || '');
    });

    const keys = [...baseKeys, ...aliasKeys].filter(Boolean);
    const alreadySeen = keys.some(key => seen.has(key));

    if (alreadySeen) return;

    keys.forEach(key => seen.add(key));
    deduped.push(result);
  });

  return deduped;
}

function isRankDebugEnabled() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === 'ranking') return true;
    if (params.get('rankdebug') === '1') return true;
    if (window.WIKI_RANK_DEBUG === true) return true;
    if (window.localStorage && window.localStorage.getItem('wiki-rank-debug') === '1') return true;
  } catch (err) {
    console.warn('[wiki] Could not read ranking debug state.', err);
  }

  return false;
}

function renderRankingDebug(query, scoredItems) {
  const panel = document.getElementById('ranking-debug');
  const tableBody = document.getElementById('ranking-debug-table');
  const queryEl = document.getElementById('ranking-debug-query');

  if (!panel || !tableBody) return;

  if (!isRankDebugEnabled()) {
    panel.hidden = true;
    tableBody.innerHTML = '';
    if (queryEl) queryEl.textContent = '';
    return;
  }

  panel.hidden = false;
  if (queryEl) queryEl.textContent = query ? `Query: ${query}` : 'All articles';

  tableBody.innerHTML = scoredItems.slice(0, 50).map(({ item, queryScore, rankScore, finalScore }) => `
    <tr>
      <td><a href="${resolveWikiUrl(item.url)}">${escHtml(item.title)}</a></td>
      <td>${queryScore}</td>
      <td>${rankScore}</td>
      <td>${Math.round(finalScore * 100) / 100}</td>
      <td><code>${escHtml(JSON.stringify(item.rank_signals || {}))}</code></td>
    </tr>
  `).join('');

  try {
    window.__WIKI_LAST_SEARCH_DEBUG = scoredItems.map(({ item, queryScore, rankScore, finalScore }) => ({
      title: item.title,
      url: resolveWikiUrl(item.url),
      query_score: queryScore,
      rank_score: rankScore,
      final_score: finalScore,
      rank_signals: item.rank_signals || {}
    }));
    console.table(window.__WIKI_LAST_SEARCH_DEBUG);
  } catch (err) {
    console.warn('[wiki] Failed to publish ranking debug output.', err);
  }
}

function runSearch(query, resultsEl) {
  const q = String(query || '').trim();

  if (!q) {
    resultsEl.classList.remove('open');
    resultsEl.innerHTML = '';
    return;
  }

  let scored = WIKI_INDEX
    .map(item => {
      const scores = scoreResult(item, q);
      return {
        item,
        queryScore: scores.queryScore,
        rankScore: scores.rankScore,
        finalScore: scores.finalScore
      };
    })
    .filter(result => result.finalScore > 0)
    .sort(compareScoredResults);

  scored = dedupeResults(scored).slice(0, 6);

  resultsEl.innerHTML = '';

  if (scored.length === 0) {
    resultsEl.innerHTML = `<div class="sr-no-results">No results for "<strong>${escHtml(q)}</strong>"</div>`;
  } else {
    scored.forEach(({ item }) => {
      const div = document.createElement('div');
      div.className = 'sr-item';
      div.innerHTML = `
        <div style="font-size:1.4rem;flex-shrink:0;width:28px;text-align:center">${item.emoji || '📄'}</div>
        <div>
          <div class="sr-title">${highlight(item.title, q)}</div>
          <div class="sr-desc">${escHtml(String(item.desc || '').slice(0, 90))}…</div>
          <div class="sr-cat">${escHtml(item.category || '')}</div>
        </div>
      `;
      div.addEventListener('click', () => {
        window.location.href = resolveWikiUrl(item.url);
      });
      resultsEl.appendChild(div);
    });
  }

  resultsEl.classList.add('open');
}

function renderSearchPage(query) {
  const container = document.getElementById('search-results-page');
  const heading = document.getElementById('search-heading');

  if (!container) return;

  const q = String(query || '').trim();
  if (heading) {
    heading.textContent = q ? `Results for "${q}"` : 'All Articles';
  }

  let items = q
    ? WIKI_INDEX
        .map(item => {
          const scores = scoreResult(item, q);
          return {
            item,
            queryScore: scores.queryScore,
            rankScore: scores.rankScore,
            finalScore: scores.finalScore
          };
        })
        .filter(result => result.finalScore > 0)
        .sort(compareScoredResults)
    : WIKI_INDEX
        .slice()
        .sort(compareIndexItemsStable)
        .map(item => ({
          item,
          queryScore: 0,
          rankScore: Number(item.rank_score || 0),
          finalScore: Number(item.rank_score || 0)
        }));

  items = dedupeResults(items);
  renderRankingDebug(q, items);

  if (items.length === 0) {
    container.innerHTML = `<p style="color:var(--color-text-muted)">No articles found for "<strong>${escHtml(q)}</strong>". Try different keywords.</p>`;
    return;
  }

  container.innerHTML = items.map(({ item }) => `
    <a href="${resolveWikiUrl(item.url)}" class="article-list-item">
      <div class="ali-icon">${item.emoji || '📄'}</div>
      <div>
        <div class="ali-title">${highlight(item.title, q)}</div>
        <div class="ali-desc">${escHtml(item.desc || '')}</div>
        <div class="ali-meta">${escHtml(item.category || '')}</div>
      </div>
    </a>
  `).join('');
}

/* ── HELPERS ─────────────────────────────────────────────────────────────── */
function highlight(text, query) {
  if (!query) return escHtml(text);
  const safeQ = escRegex(query);
  return escHtml(text).replace(
    new RegExp(`(${safeQ})`, 'gi'),
    '<mark style="background:rgba(247,201,72,.3);color:inherit;border-radius:2px">$1</mark>'
  );
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ── BACK TO TOP ─────────────────────────────────────────────────────────── */
function initBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;

  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ── ACTIVE NAV ──────────────────────────────────────────────────────────── */
function initActiveNav() {
  const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';

  document.querySelectorAll('.sidebar-nav a, .header-nav a').forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;

    const abs = new URL(href, window.location.href).pathname.replace(/\/+$/, '') || '/';
    if (abs === currentPath) {
      link.classList.add('active');
    }
  });
}

/* ── TOC ─────────────────────────────────────────────────────────────────── */
function initTOC() {
  const toc = document.getElementById('toc');
  const content = document.querySelector('.wiki-content');

  if (!toc || !content) return;

  const headings = Array.from(content.querySelectorAll('h2, h3'));
  if (headings.length < 3) {
    toc.style.display = 'none';
    return;
  }

  const ol = document.createElement('ol');
  let subOl = null;
  let lastH2Li = null;
  let counter = 0;

  headings.forEach(heading => {
    if (!heading.id) {
      heading.id = 'section-' + (++counter) + '-' + heading.textContent
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }

    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + heading.id;
    a.textContent = heading.textContent;
    li.appendChild(a);

    if (heading.tagName === 'H2') {
      subOl = null;
      lastH2Li = li;
      ol.appendChild(li);
    } else {
      if (!subOl) {
        subOl = document.createElement('ol');
        if (lastH2Li) lastH2Li.appendChild(subOl);
        else ol.appendChild(subOl);
      }
      subOl.appendChild(li);
    }
  });

  if (!toc.querySelector('.toc-title')) {
    const title = document.createElement('div');
    title.className = 'toc-title';
    title.textContent = '📋 Contents';
    toc.prepend(title);
  }

  toc.appendChild(ol);
}

/* ── STATS ───────────────────────────────────────────────────────────────── */
function initStatArticles() {
  const nodes = document.querySelectorAll('.stat-total-articles, [data-stat="article-count"]');
  if (!nodes.length) return;

  nodes.forEach(node => {
    node.textContent = WIKI_INDEX.length.toLocaleString('en-GB');
  });
}

function initStatCategories() {
  const nodes = document.querySelectorAll('.stat-total-categories, [data-stat="category-count"]');
  if (!nodes.length) return;

  nodes.forEach(node => {
    node.textContent = CATEGORY_LIST.length.toLocaleString('en-GB');
  });
}