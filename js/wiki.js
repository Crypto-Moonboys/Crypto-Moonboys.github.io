/**
 * Crypto Moonboys Wiki — Main JavaScript
 * Client-side search, sidebar toggle, ranking debug, and UI helpers.
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

/* ── GLOBAL TRON REACT ENGINE LOADER ─────────────────────────────────────── */
function ensureTronAssets() {
  const head = document.head || document.getElementsByTagName('head')[0];
  if (!head) return;

  if (!document.querySelector('link[data-tron-react-engine="css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/tron-react-engine.css';
    link.setAttribute('data-tron-react-engine', 'css');
    head.appendChild(link);
  }

  function appendScript(src, marker, done) {
    if (document.querySelector(`script[data-tron-react-engine="${marker}"]`) || (marker === 'engine' && window.TRON) || (marker === 'audio' && window.TRON_AUDIO)) {
      if (typeof done === 'function') done();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.setAttribute('data-tron-react-engine', marker);
    if (typeof done === 'function') {
      s.addEventListener('load', done, { once: true });
      s.addEventListener('error', done, { once: true });
    }
    head.appendChild(s);
  }

  appendScript('/js/tron-audio.js', 'audio', () => {
    appendScript('/js/tron-react-engine.js', 'engine');
  });
}

ensureTronAssets();

/* ── SEARCH INDEX ────────────────────────────────────────────────────────── */
let WIKI_INDEX = [];

/* ── ENTITY MAP ──────────────────────────────────────────────────────────── */
let ENTITY_MAP = null;
let ENTITY_LOOKUP = {};

/* ── ENTITY GRAPH (related pages) ───────────────────────────────────────── */
let ENTITY_GRAPH = null;

/* ── RANKING CONTRACT ────────────────────────────────────────────────────────
 *
 * SOURCE OF TRUTH: item.rank_score from js/wiki-index.json.
 *   - rank_score is computed offline by the generator and baked into the index.
 *   - The frontend MUST NOT recompute authority from word count, keyword bags,
 *     tag counts, title length, or any other heuristic signal.
 *   - The frontend MUST NOT override or ignore rank_score ordering.
 *
 * SEARCH MODE (query present):
 *   finalScore = (queryScore * FINAL_QUERY_WEIGHT) + (rank_score * FINAL_RANK_WEIGHT)
 *
 * BROWSE MODE (no query):
 *   rank_score descending ONLY
 *
 * TIE-BREAKING:
 *   title → URL
 *
 * DO NOT add new ranking logic here.
 */
const FINAL_QUERY_WEIGHT = 2.5;
const FINAL_RANK_WEIGHT = 1;

/* ── CATEGORY INDEX ──────────────────────────────────────────────────────── */
const CATEGORY_LIST = [
  'Cryptocurrencies','Concepts','Technology','Tools & Platforms','Lore',
  'Crypto Designer Toys','Guerilla Marketing','Graffiti & Street Art',
  'NFTs & Digital Art','Punk Culture','Gaming','Community & People',
  'Media & Publishing','Art & Creativity','Activism & Counter-Culture'
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
  console.debug('[wiki.js] loading wiki-index from:', url);
  try {
    const res = await fetch(url);
    console.debug('[wiki.js] wiki-index fetch status:', res.status);
    const data = await res.json();
    WIKI_INDEX = data.filter(x => x.url !== '/wiki/index.html');
    console.debug('[wiki.js] WIKI_INDEX loaded, entries:', WIKI_INDEX.length);
  } catch (err) {
    console.error('[wiki.js] wiki-index load failed:', err);
    WIKI_INDEX = [];
  }
}

async function loadEntityMap() {
  if (ENTITY_MAP) return;
  try {
    const res = await fetch(getDerivedJsonUrl('entity-map.json'));
    const arr = await res.json();
    ENTITY_MAP = {};
    arr.forEach(r => {
      if (r.entity_id) ENTITY_MAP[r.entity_id] = r;
    });
  } catch {
    ENTITY_MAP = {};
  }
}

function buildEntityLookup() {
  ENTITY_LOOKUP = {};
  Object.values(ENTITY_MAP || {}).forEach(e => {
    [e.canonical_title, ...(e.aliases || [])].forEach(v => {
      ENTITY_LOOKUP[normalizeEntityKey(v)] = e;
    });
  });
}

async function loadEntityGraph() {
  if (ENTITY_GRAPH !== null) return;
  try {
    const res = await fetch(getDerivedJsonUrl('entity-graph.json'));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ENTITY_GRAPH = await res.json();
  } catch {
    ENTITY_GRAPH = {};
  }
}

function renderRelatedPages() {
  const pathname = window.location.pathname;
  if (!pathname.startsWith('/wiki/') || !ENTITY_GRAPH) return;

  const pageEntry = ENTITY_GRAPH[pathname];
  if (!pageEntry || !Array.isArray(pageEntry.related_pages) || !pageEntry.related_pages.length) return;

  const indexByUrl = {};
  for (const item of WIKI_INDEX) {
    indexByUrl[item.url] = item;
  }

  const MAX_RELATED = 8;
  const MAX_DESC_LENGTH = 120;
  const related = pageEntry.related_pages
    .filter(r => r.target_url && r.target_url !== pathname)
    .slice(0, MAX_RELATED);

  if (!related.length) return;

  const items = related.map(r => {
    const entry = indexByUrl[r.target_url];
    const rawTitle = entry ? (entry.title || r.target_url) : r.target_url;
    const title = escapeHtml(rawTitle);
    const href  = escapeHtml(r.target_url);
    const rawDesc = entry && entry.desc ? entry.desc : '';
    const snippet = rawDesc
      ? `<p class="related-page-desc">${escapeHtml(rawDesc.length > MAX_DESC_LENGTH ? rawDesc.slice(0, MAX_DESC_LENGTH) + '…' : rawDesc)}</p>`
      : '';
    return `<li class="related-page-item"><a class="related-page-link" href="${href}">${title}</a>${snippet}</li>`;
  }).join('');

  const block = `<section class="related-pages" aria-label="Related pages">
  <h2 class="related-pages-heading">🔗 Related Pages</h2>
  <ul class="related-pages-list">${items}</ul>
</section>`;

  const article = document.querySelector('article');
  if (article) {
    article.insertAdjacentHTML('afterend', block);
  }
}

/* ── HTML ESCAPE ─────────────────────────────────────────────────────────── */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── SEARCH PAGE RENDERER ────────────────────────────────────────────────── */
function renderSearchPage(query) {
  const container = document.getElementById('search-results-page');
  const heading   = document.getElementById('search-heading');
  if (!container) return;

  const q = String(query || '').trim();

  if (!WIKI_INDEX.length) {
    container.innerHTML = '<p class="search-empty">Loading articles…</p>';
    if (heading) heading.textContent = 'All Articles';
    return;
  }

  let items;
  if (q) {
    const scored = WIKI_INDEX
      .map(item => ({ item, ...scoreResult(item, q) }))
      .filter(r => r.queryScore > 0)
      .sort(compareScoredResults);
    items = scored.map(r => r.item);
    if (heading) heading.textContent = `Results for "${q}" (${items.length})`;
  } else {
    items = [...WIKI_INDEX].sort(compareIndexItemsStable);
    if (heading) heading.textContent = `All Articles (${items.length})`;
  }

  if (!items.length) {
    container.innerHTML = `<p class="search-empty">No articles found for "${escapeHtml(q)}".</p>`;
    return;
  }

  container.innerHTML = items.map(item => {
    const href    = resolveWikiUrl(item.url);
    const title   = item.title || href;
    const summary = item.summary ? `<p class="article-card-summary">${escapeHtml(item.summary)}</p>` : '';
    const tags    = (item.tags || []).length
      ? `<div class="article-card-tags">${item.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';
    return `<div class="article-card">
  <a href="${escapeHtml(href)}" class="article-card-title">${escapeHtml(title)}</a>
  ${summary}
  ${tags}
</div>`;
  }).join('\n');
}

/* ── DOM READY ───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await loadWikiIndex();
  await loadEntityMap();
  buildEntityLookup();

  // ── Related pages (wiki pages only) ─────────────────────────────────────
  if (window.location.pathname.startsWith('/wiki/')) {
    await loadEntityGraph();
    renderRelatedPages();
  }

  // ── Search page ─────────────────────────────────────────────────────────
  const _q = new URLSearchParams(window.location.search).get('q') || '';
  renderSearchPage(_q);

  const _searchInput = document.getElementById('search-page-input');
  if (_searchInput) {
    _searchInput.value = _q;
    _searchInput.addEventListener('input', () => {
      const newQ = _searchInput.value.trim();
      renderSearchPage(newQ);
      const url = new URL(window.location.href);
      if (newQ) { url.searchParams.set('q', newQ); } else { url.searchParams.delete('q'); }
      history.replaceState(null, '', url.toString());
    });
  }

  // ── Header search bar ────────────────────────────────────────────────────
  const _headerInput = document.getElementById('search-input');
  const _headerBtn   = document.getElementById('search-btn');
  const _dropdown    = document.getElementById('search-results');

  function _showHeaderDropdown(val) {
    if (!_dropdown) return;
    const v = String(val || '').trim();
    if (!v || !WIKI_INDEX.length) { _dropdown.innerHTML = ''; return; }
    const scored = WIKI_INDEX
      .map(item => ({ item, ...scoreResult(item, v) }))
      .filter(r => r.queryScore > 0)
      .sort(compareScoredResults)
      .slice(0, 5);
    if (!scored.length) { _dropdown.innerHTML = ''; return; }
    _dropdown.innerHTML = scored.map(r => {
      const href  = resolveWikiUrl(r.item.url);
      const title = r.item.title || href;
      return `<a class="search-result-item" href="${escapeHtml(href)}" role="option">${escapeHtml(title)}</a>`;
    }).join('');
  }

  if (_headerInput) {
    _headerInput.addEventListener('input', () => _showHeaderDropdown(_headerInput.value));
    _headerInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { goToSearch(_headerInput.value); }
    });
  }
  if (_headerBtn) {
    _headerBtn.addEventListener('click', () => goToSearch(_headerInput ? _headerInput.value : ''));
  }

  // ── Sidebar / hamburger ──────────────────────────────────────────────────
  const _hamburger = document.getElementById('hamburger');
  const _sidebar   = document.getElementById('sidebar');
  const _overlay   = document.getElementById('sidebar-overlay');

  function _toggleSidebar(open) {
    if (!_sidebar) return;
    const expanded = open !== undefined ? open : !_sidebar.classList.contains('open');
    _sidebar.classList.toggle('open', expanded);
    if (_hamburger) _hamburger.setAttribute('aria-expanded', String(expanded));
    if (_overlay)   _overlay.classList.toggle('active', expanded);
  }

  if (_hamburger) _hamburger.addEventListener('click', () => _toggleSidebar());
  if (_overlay)   _overlay.addEventListener('click',   () => _toggleSidebar(false));

  // ── Back to top ──────────────────────────────────────────────────────────
  const _backToTop = document.getElementById('back-to-top');
  if (_backToTop) {
    window.addEventListener('scroll', () => {
      _backToTop.classList.toggle('visible', window.scrollY > 300);
    }, { passive: true });
    _backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }
});

/* scoreResult — ranking contract enforcement */
function scoreResult(item, query) {
  const q = String(query || '').toLowerCase().trim();

  if (!q) {
    return { queryScore: 0, rankScore: item.rank_score, finalScore: item.rank_score };
  }

  let queryScore = 0;

  if (item.title.toLowerCase().includes(q)) queryScore += 40;
  if ((item.tags || []).join(' ').toLowerCase().includes(q)) queryScore += 30;

  const rankScore = Number(item.rank_score || 0);

  return {
    queryScore,
    rankScore,
    finalScore: (queryScore * FINAL_QUERY_WEIGHT) + (rankScore * FINAL_RANK_WEIGHT)
  };
}

function normalizeEntityKey(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]/g,'');
}

function compareStringsStable(a,b){
  return String(a).localeCompare(String(b),undefined,{sensitivity:'base'});
}

function compareScoredResults(a,b){
  return b.finalScore - a.finalScore || b.rankScore - a.rankScore ||
         compareStringsStable(a.item.title,b.item.title);
}

/* compareIndexItemsStable — browse-mode sort */
function compareIndexItemsStable(a,b){
  return b.rank_score - a.rank_score ||
         compareStringsStable(a.title,b.title);
}
