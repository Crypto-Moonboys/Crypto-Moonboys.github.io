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
const SEARCH_TEXT_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'in', 'into', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'to',
  'was', 'were', 'with'
]);

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

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isGenericSummaryTag(tag) {
  const key = normalizeText(tag).toLowerCase();
  return ['crypto', 'moonboys', 'wiki', 'crypto moonboys', 'cryptomoonboys'].includes(key);
}

const COMPRESSED_SUMMARY_MIN_LENGTH = 18;
const COMPRESSED_SUMMARY_MIN_WIKI_KEYWORDS = 2;

function looksCompressedSlugText(text) {
  const v = normalizeText(text).toLowerCase();
  if (!v) return true;
  const looksUrlOrPathLike =
    /^(https?:\/\/|\/)/.test(v)
    || v.includes('://')
    || /\.html?$/.test(v);
  if (looksUrlOrPathLike) return true;

  const hasWhitespace = /\s/.test(v);
  const plainSlugLike = /^[a-z0-9_-]+$/.test(v);
  if (hasWhitespace || !plainSlugLike) return false;

  const compact = v.replace(/[^a-z0-9]/g, '');
  const wikiKeywordHits = ['crypto', 'moonboys', 'wiki'].filter(k => compact.includes(k)).length;

  // Heuristic: very long, no-space slug text that repeats wiki-brand keywords
  // is usually index/keyword-bag noise rather than a readable summary.
  return compact.length >= COMPRESSED_SUMMARY_MIN_LENGTH
    && wikiKeywordHits >= COMPRESSED_SUMMARY_MIN_WIKI_KEYWORDS;
}

function humanizePathSlug(url) {
  const raw = String(url || '').replace(/[?#].*$/, '').trim();
  if (!raw) return '';
  const leaf = raw.split('/').filter(Boolean).pop() || '';
  const noExt = leaf.replace(/\.html?$/i, '');
  if (!noExt) return '';
  return noExt
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatCategoryLabel(category) {
  return normalizeText(category)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, m => m.toUpperCase());
}

function formatRankSignal(value) {
  const rank = Number(value);
  if (!Number.isFinite(rank)) return '';
  return Number.isInteger(rank)
    ? rank.toLocaleString()
    : rank.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function getArticleSummary(item) {
  const candidates = [
    item && item.summary,
    item && item.desc,
    item && item.description,
    item && item.excerpt,
    item && item.meta_description,
    item && item.og_description
  ];

  for (const raw of candidates) {
    const text = normalizeText(raw);
    if (!text) continue;
    if (!looksCompressedSlugText(text)) return text;
  }

  const title = normalizeText(item && item.title)
    || formatCategoryLabel(item && item.category)
    || humanizePathSlug(item && item.url)
    || 'this topic';

  const tags = Array.isArray(item && item.tags)
    ? item.tags.map(t => normalizeText(t)).filter(Boolean).filter(t => !isGenericSummaryTag(t)).slice(0, 3)
    : [];

  if (tags.length) {
    return `Explore this Crypto Moonboys Wiki article covering ${title}, with links to ${tags.join(', ')}.`;
  }

  return `Explore this Crypto Moonboys Wiki article covering ${title}.`;
}

function selectSearchMatches(query, options) {
  const q = String(query || '').trim();
  const opts = options || {};
  const allowPartialFallback = opts.allowPartialFallback !== false;
  const limit = Number.isFinite(opts.limit) ? Math.max(0, opts.limit) : Infinity;

  if (!q || !WIKI_INDEX.length || limit === 0) {
    return { scored: [], usedPartialFallback: false };
  }

  const allScored = WIKI_INDEX.map(item => ({ item, ...scoreResult(item, q) }));
  let scored = allScored.filter(r => r.matchedTokenCount > 0 && r.matchedTokenCount >= r.totalTokenCount);
  let usedPartialFallback = false;

  if (!scored.length && allowPartialFallback) {
    usedPartialFallback = true;
    scored = allScored.filter(r => r.queryScore > 0);
  }

  scored.sort(compareScoredResults);
  if (Number.isFinite(limit)) scored = scored.slice(0, limit);

  return { scored, usedPartialFallback };
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
    const { scored } = selectSearchMatches(q, { allowPartialFallback: true });
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
    const summaryText = getArticleSummary(item);
    const summary = `<p class="article-card-summary">${escapeHtml(summaryText)}</p>`;
    const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
    const topTags = tags.slice(0, 3);
    const metaBits = [];
    if (item.category) metaBits.push(`Category: ${formatCategoryLabel(item.category)}`);
    const rankSignal = formatRankSignal(item.rank_score);
    if (rankSignal) metaBits.push(`Rank signal: ${rankSignal}`);
    if (topTags.length) {
      metaBits.push(`Tags: ${topTags.join(', ')}`);
    }
    const meta = metaBits.length
      ? `<div class="article-card-meta">${metaBits.map(bit => `<span class="article-card-meta-item">${escapeHtml(bit)}</span>`).join('')}</div>`
      : '';
    const tagPills = topTags.length
      ? `<div class="article-card-tags">${topTags.map(t => `<span class="article-card-tag">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';
    const path = `<p class="article-card-path">${escapeHtml(href)}</p>`;
    return `<div class="article-card">
  <a href="${escapeHtml(href)}" class="article-card-title">${escapeHtml(title)}</a>
  ${summary}
  ${meta}
  ${tagPills}
  ${path}
</div>`;
  }).join('\n');
}

/* ── DOM READY ───────────────────────────────────────────────────────────── */
async function _wikiInit() {
  // ── Sidebar / hamburger ────────────────────────────────────────────────────
  // Bind BEFORE any await so the hamburger is interactive immediately, even on
  // pages without site-shell.js and even under slow network conditions.
  // Uses per-element markers so wiki.js never double-binds elements that
  // site-shell.js has already bound.
  (function _bindWikiNav() {
    const ham = document.getElementById('hamburger');
    const sidebar = document.getElementById('sidebar');
    const ov = document.getElementById('sidebar-overlay');

    function _applySidebarState(expanded) {
      if (!sidebar) return;
      document.body.classList.toggle('sidebar-open', expanded);
      const h = document.getElementById('hamburger');
      if (h) h.setAttribute('aria-expanded', String(expanded));
    }

    function _toggleSidebar(open) {
      const expanded = open !== undefined ? open : !document.body.classList.contains('sidebar-open');
      _applySidebarState(expanded);
    }

    // Only bind click listeners if this element has not already been bound
    // (site-shell.js uses the same dataset.sidebarBound marker).
    if (ham && !ham.dataset.sidebarBound) {
      ham.dataset.sidebarBound = 'true';
      ham.addEventListener('click', () => _toggleSidebar());
    }
    if (ov && !ov.dataset.sidebarBound) {
      ov.dataset.sidebarBound = 'true';
      ov.addEventListener('click', () => _toggleSidebar(false));
    }

    // Escape: register once globally; always acts on current DOM.
    if (!window.__MOONBOYS_SIDEBAR_ESCAPE_BOUND) {
      window.__MOONBOYS_SIDEBAR_ESCAPE_BOUND = true;
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') _toggleSidebar(false);
      });
    }

    // Close sidebar on nav link click regardless of which script bound hamburger.
    if (sidebar && !sidebar.dataset.navClickBound) {
      sidebar.dataset.navClickBound = 'true';
      sidebar.addEventListener('click', (event) => {
        const link = event.target && event.target.closest ? event.target.closest('a') : null;
        if (link) _toggleSidebar(false);
      });
    }
  }());

  // ── Back to top ──────────────────────────────────────────────────────────
  const _backToTop = document.getElementById('back-to-top');
  if (_backToTop) {
    window.addEventListener('scroll', () => {
      _backToTop.classList.toggle('visible', window.scrollY > 300);
    }, { passive: true });
    _backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  // ── Async data loading (kicked off after nav is already bound) ────────────
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
    const { scored } = selectSearchMatches(v, { allowPartialFallback: true, limit: 5 });
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
}

// Handle the case where this script is deferred (e.g. by Cloudflare Rocket Loader)
// and DOMContentLoaded has already fired by the time the script executes.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _wikiInit);
} else {
  _wikiInit();
}

/* scoreResult — ranking contract enforcement */
function scoreResult(item, query) {
  const q = String(query || '').toLowerCase().trim();

  if (!q) {
    return {
      queryScore: 0,
      rankScore: item.rank_score,
      matchedTokenCount: 0,
      totalTokenCount: 0,
      finalScore: item.rank_score
    };
  }

  // Tokenize: normalize case, strip punctuation, split on whitespace
  const tokens = q.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const normQ  = tokens.join(' ');

  // Build normalized searchable text for each field
  const titleLower    = (item.title || '').toLowerCase();
  const tagsStr       = (item.tags || []).join(' ').toLowerCase();
  const categoryLower = (item.category || '').toLowerCase();
  const slugLower     = (item.url || '').toLowerCase()
    .replace(/^\/wiki\//, '').replace(/\.html$/i, '').replace(/[-_]/g, ' ');
  const descLower     = [
    item.desc || '', item.description || '', item.excerpt || '',
    item.summary || '', item.meta_description || ''
  ].join(' ').toLowerCase();
  const si            = item.search_index || {};
  const siTokenStr    = (si.tokens || []).join(' ').toLowerCase();
  const kwBagStr      = (si.keyword_bag || []).join(' ').toLowerCase();
  const normTitleStr  = (si.normalized_title || '').toLowerCase();

  let queryScore = 0;
  let matchedTokenCount = 0;

  // Exact full-phrase bonus for multi-word queries
  if (tokens.length > 1) {
    const normTitle = titleLower.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
    if (normTitle.includes(normQ) || normTitleStr.includes(normQ)) queryScore += 30;
  }

  // Per-token scoring: each token is matched independently across all fields
  for (const token of tokens) {
    let tokenMatched = false;
    const canUseTextCorpusMatch = token.length >= 3 && !SEARCH_TEXT_STOP_WORDS.has(token);

    if (titleLower.includes(token) || normTitleStr.includes(token)) {
      queryScore += 40;
      tokenMatched = true;
    }
    if (tagsStr.includes(token) || siTokenStr.includes(token)) {
      queryScore += 30;
      tokenMatched = true;
    }
    if (slugLower.includes(token)) {
      queryScore += 20;
      tokenMatched = true;
    }
    if (categoryLower.includes(token)) {
      queryScore += 15;
      tokenMatched = true;
    }
    if (canUseTextCorpusMatch && descLower.includes(token)) {
      queryScore += 15;
      tokenMatched = true;
    }
    // Keyword bag (body-text proxy): only match non-stopwords >= 3 chars to avoid flood
    if (canUseTextCorpusMatch && kwBagStr.includes(token)) {
      queryScore += 10;
      tokenMatched = true;
    }

    if (tokenMatched) matchedTokenCount++;
  }

  const rankScore = Number(item.rank_score || 0);

  return {
    queryScore,
    rankScore,
    matchedTokenCount,
    totalTokenCount: tokens.length,
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
