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
let WIKI_INDEX_LOAD_STATE = 'idle';
let arcadeSearchEntries = [];
let arcadeSearchRequest;

const SEARCH_DESTINATIONS = [
  { url: '/wiki/crypto-moonboys.html', names: ['Crypto Moonboys', 'Moonboys', 'Moonboy', 'Crypto Moonboys lore'] },
  { url: '/ai-user.html', names: ['AI Creator Studio', 'SPARKY Creator Studio', 'Creator Studio', 'SPARKY'] },
  { url: '/swarmsy.html', names: ['SWARMSY', 'SWARMSY AI'] },
  { url: '/moonboy-builder.html', names: ['Moonboy Builder', 'Moonboy PFP Builder'] },
  { url: '/wiki/the-crypto-moongirls.html', names: ['Crypto Moongirls', 'Moongirls'] },
  { url: '/wiki/charlie-buster.html', names: ['Charlie Buster'] },
  { url: '/wiki/graffiti-kings.html', names: ['Graffiti Kings'] },
  { url: '/wiki/gkniftyheads.html', names: ['GKniftyHEADS'] },
  { url: '/wiki/gkniftyheads-nft-collection.html', names: ['GKniftyHEADS NFT collection', 'GKniftyHEADS collection'] },
  { url: '/wiki/graffpunks.html', names: ['GraffPUNKS'] },
  { url: '/wiki/graffpunks-24-7-radio.html', names: ['GraffPUNKS 24/7 Radio', 'GraffPUNKS Radio'] },
  { url: '/wiki/waxp.html', names: ['WAXP', 'WAX blockchain'] },
  { url: '/wiki/xrp-ledger.html', names: ['XRP Ledger', 'XRP', 'XRPL', 'XRPL DEX'] },
  { url: '/community.html', names: ['Battle Chamber'] },
  {
    url: '/battle-chamber/factions/',
    names: ['Faction Chambers', 'Faction Directory'],
    description: 'Browse the Crypto Moonboys faction chambers and find a faction to join.',
  },
  {
    url: '/games/',
    names: ['Moonboys Arcade', 'Arcade', 'Games'],
    description: 'Browse public Crypto Moonboys games and find Arcade leaderboards.',
  },
];

const SEARCH_DIRECTORY_ENTRIES = SEARCH_DESTINATIONS.filter(({ description }) => description)
  .map(({ url, names, description }) => ({ url, title: names[0], description }));

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
 *   - Article results retain this ordering within the ranked results.
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
 * Exact names and unambiguous one-edit corrections can surface an official
 * destination ahead of the ranked list without changing any authority score.
 */
const FINAL_QUERY_WEIGHT = 2.5;
const FINAL_RANK_WEIGHT = 1;
const SEARCH_TEXT_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'in', 'into', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'to',
  'was', 'were', 'with'
]);

function tokenizeSearchQuery(query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  return q
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/* ── CATEGORY INDEX ──────────────────────────────────────────────────────── */
const CATEGORY_LIST = [
  'Cryptocurrencies','Concepts','Technology','Tools & Platforms','Lore',
  'Crypto Designer Toys','Guerilla Marketing','Graffiti & Street Art',
  'NFTs & Digital Art','Punk Culture','Gaming','Community & People',
  'Media & Publishing','Art & Creativity','Activism & Counter-Culture'
];

/* ── LOADERS ─────────────────────────────────────────────────────────────── */
const WIKI_INDEX_MAX_ATTEMPTS = 3;
const WIKI_INDEX_RETRY_DELAY_MS = 150;

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
  WIKI_INDEX_LOAD_STATE = 'loading';
  try {
    for (let attempt = 1; attempt <= WIKI_INDEX_MAX_ATTEMPTS; attempt++) {
      const res = await fetch(url);
      console.debug('[wiki.js] wiki-index fetch status:', res.status);

      if (res.status === 503 && attempt < WIKI_INDEX_MAX_ATTEMPTS) {
        const delay = WIKI_INDEX_RETRY_DELAY_MS * attempt;
        console.warn(`[wiki.js] wiki-index temporarily unavailable; retrying in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      WIKI_INDEX = data.filter(x => x.url !== '/wiki/index.html');
      WIKI_INDEX_LOAD_STATE = 'loaded';
      console.debug('[wiki.js] WIKI_INDEX loaded, entries:', WIKI_INDEX.length);
      return;
    }
  } catch (err) {
    console.error('[wiki.js] wiki-index load failed:', err);
    WIKI_INDEX = [];
    WIKI_INDEX_LOAD_STATE = 'failed';
  }
}

async function loadArcadeSearchEntries() {
  try {
    const response = await fetch('/games/');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const catalog = new DOMParser().parseFromString(await response.text(), 'text/html');
    const games = new Map();
    for (const link of catalog.querySelectorAll('a.article-list-item[href]')) {
      const url = link.getAttribute('href');
      if (!/^\/games\/[a-z0-9-]+\/$/.test(url)) continue;
      const title = link.querySelector('.ali-title')?.textContent.split(' — ')[0].trim();
      if (!title) continue;
      const description = link.querySelector('.ali-desc')?.textContent.trim() || '';
      games.set(url, { url, title, description, category: 'Arcade' });
    }
    arcadeSearchEntries = [...games.values()];
  } catch (error) {
    console.warn('[wiki.js] Arcade search entries unavailable:', error);
  }
}

function getWikiIndexLoadState() {
  return WIKI_INDEX_LOAD_STATE;
}

async function retryWikiIndexLoad(query) {
  await loadWikiIndex();
  renderSearchPage(query == null ? new URLSearchParams(window.location.search).get('q') || '' : query);
  return WIKI_INDEX_LOAD_STATE;
}

window.MOONBOYS_WIKI_SEARCH = {
  ...(window.MOONBOYS_WIKI_SEARCH || {}),
  getIndexLoadState: getWikiIndexLoadState,
  retryIndexLoad: retryWikiIndexLoad,
};

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

  const existingRelationshipMap = document.querySelector('[data-related-wiki-paths="true"]');
  if (existingRelationshipMap) {
    renderRelatedPagesIntoRelationshipMap(existingRelationshipMap, related, indexByUrl, MAX_DESC_LENGTH);
    return;
  }

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
function renderRelatedPagesIntoRelationshipMap(section, related, indexByUrl, maxDescLength) {
  if (!section || section.querySelector('[data-related-group="Graph Related Pages"]')) return;

  const existingLinks = new Set(
    Array.from(section.querySelectorAll('a[href]'))
      .map(a => normalizePath(a.getAttribute('href')))
      .filter(Boolean),
  );

  const cards = related
    .filter(r => r.target_url && !existingLinks.has(normalizePath(r.target_url)))
    .map(r => {
      const entry = indexByUrl[r.target_url];
      const rawTitle = entry ? (entry.title || r.target_url) : r.target_url;
      const rawDesc = entry && entry.desc ? entry.desc : '';
      const desc = rawDesc
        ? `<span class="wiki-rabbit-card-desc">${escapeHtml(rawDesc.length > maxDescLength ? rawDesc.slice(0, maxDescLength) + '…' : rawDesc)}</span>`
        : '';
      return `<a class="wiki-rabbit-card" href="${escapeHtml(r.target_url)}" role="listitem">
        <span class="wiki-rabbit-card-title">${escapeHtml(rawTitle)}</span>
        ${desc}
      </a>`;
    })
    .join('');

  if (!cards) return;

  section.insertAdjacentHTML('beforeend', `<details class="wiki-rabbit-group wiki-rabbit-group--runtime-related" data-related-group="Graph Related Pages" open>
    <summary>Connected Wiki Nodes</summary>
    <div class="wiki-rabbit-grid" role="list">
      ${cards}
    </div>
  </details>`);
}

function normalizePath(value) {
  if (!value) return '';
  try {
    return new URL(value, window.location.origin).pathname.replace(/\/$/, '') || '/';
  } catch {
    return String(value).split(/[?#]/)[0].replace(/\/$/, '') || '/';
  }
}

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

function isOneSearchEdit(left, right) {
  if (left.length > right.length) [left, right] = [right, left];
  if (right.length - left.length > 1 || left === right) return false;
  let i = 0;
  while (i < left.length && left[i] === right[i]) i++;
  if (left.length !== right.length) return left.slice(i) === right.slice(i + 1);
  return left.slice(i + 1) === right.slice(i + 1)
    || (left[i] === right[i + 1] && left[i + 1] === right[i]
      && left.slice(i + 2) === right.slice(i + 2));
}

function selectSearchMatches(query, options) {
  const q = String(query || '').trim();
  const opts = options || {};
  const allowPartialFallback = opts.allowPartialFallback !== false;
  const limit = Number.isFinite(opts.limit) ? Math.max(0, opts.limit) : Infinity;
  const meaningfulQueryTokens = tokenizeSearchQuery(q)
    .filter(token => token.length >= 3 && !SEARCH_TEXT_STOP_WORDS.has(token));
  const meaningfulQueryTokenCount = meaningfulQueryTokens.length;

  if (!q || limit === 0) {
    return { scored: [], usedPartialFallback: false };
  }

  const entriesByUrl = new Map(
    [...SEARCH_DIRECTORY_ENTRIES, ...arcadeSearchEntries, ...WIKI_INDEX].map(item => [item.url, item])
  );
  const destinations = [
    ...SEARCH_DESTINATIONS,
    ...arcadeSearchEntries.map(({ url, title }) => ({ url, names: [title] })),
  ].filter(({ url }) => entriesByUrl.has(url));
  const key = normalizeEntityKey(q);
  const preferred = destinations.find(({ names }) => names.some(name => normalizeEntityKey(name) === key));

  const meaningfulQuery = meaningfulQueryTokens.join(' ');
  const allScored = Array.from(entriesByUrl.values(), item => {
    const baseScore = scoreResult(item, q);
    const meaningfulMatchedTokenCount = meaningfulQuery
      ? scoreResult(item, meaningfulQuery).matchedTokenCount
      : 0;
    return { item, ...baseScore, meaningfulMatchedTokenCount };
  });
  let scored = allScored.filter(r => r.matchedTokenCount > 0 && r.matchedTokenCount >= r.totalTokenCount);
  let usedPartialFallback = false;

  if (!preferred && !scored.length && allowPartialFallback && key.length >= 5) {
    const corrections = destinations.flatMap(({ url, names }) => {
      const name = names.find(candidate => isOneSearchEdit(key, normalizeEntityKey(candidate)));
      return name ? [{ url, name }] : [];
    });
    if (corrections.length === 1) {
      const { name } = corrections[0];
      return { ...selectSearchMatches(name, opts), correctedQuery: name };
    }
  }

  if (!scored.length && allowPartialFallback) {
    usedPartialFallback = true;
    scored = allScored.filter(r => r.queryScore > 0);
    if (meaningfulQueryTokenCount >= 3) {
      scored = scored.filter(r => r.meaningfulMatchedTokenCount >= 2);
    }
  }

  // In fallback mode, a long query may contain ordinary words that cannot
  // match every metadata field. Prefer coverage of its meaningful subjects
  // before substring points from short words such as "a", "an" and "in".
  scored.sort((a, b) => (usedPartialFallback && meaningfulQueryTokenCount >= 3
    ? b.meaningfulMatchedTokenCount - a.meaningfulMatchedTokenCount : 0)
    || compareScoredResults(a, b));
  if (preferred) {
    const destination = allScored.find(({ item }) => item.url === preferred.url);
    scored = [destination, ...scored.filter(({ item }) => item.url !== preferred.url)];
  }
  if (Number.isFinite(limit)) scored = scored.slice(0, limit);

  return { scored, usedPartialFallback };
}

/* ── SEARCH PAGE RENDERER ────────────────────────────────────────────────── */
const SEARCH_PAGE_SIZE = 24;
const searchPage = { query: '', filter: 'all', limit: SEARCH_PAGE_SIZE };
const searchPeople = new Set([
  'bone-idol-ink', 'charlie-buster', 'darren-cullen', 'delicious-again-pete',
  'ian-harrison', 'jillian-godsil', 'jonny-laurence-nelson-tag-records', 'sneakar',
  'street-artist-buster-aka-charlie-buster', 'trevor-fung',
].map(slug => `/wiki/${slug}.html`));
const legacyNftCollections = new Set([
  '/wiki/atomichub-graffpunks-collection.html',
  '/wiki/hodlmoonboys-nft-collection.html',
  '/wiki/noballgamess-nft-collection.html',
]);

function searchResultType(item) {
  const url = resolveWikiUrl(item.url);
  if (url.startsWith('/games/')) return 'games';
  if (item.category === 'community-people' || searchPeople.has(url)) return 'people';
  if (['nfts', 'nfts-digital-art', 'wax-nfts'].includes(item.category)
    || item.brand?.concept_type === 'collection' || legacyNftCollections.has(url)) return 'nfts';
  if (url.startsWith('/wiki/') && ['lore', 'core', 'characters', 'factions'].includes(item.category)) return 'lore';
  return null;
}

function renderSearchPage(query) {
  const container = document.getElementById('search-results-page');
  const heading   = document.getElementById('search-heading');
  if (!container) return;

  const q = String(query || '').trim();
  if (q !== searchPage.query) {
    searchPage.query = q;
    searchPage.limit = SEARCH_PAGE_SIZE;
  }
  if (!q) searchPage.filter = 'all';
  document.querySelectorAll('[data-search-browse]').forEach(section => {
    section.hidden = Boolean(q);
  });

  const filters = document.getElementById('search-filters');
  const shortcuts = document.getElementById('search-block-topia-shortcuts');
  const loadMore = document.getElementById('search-load-more');
  const showFilters = Boolean(q) && WIKI_INDEX_LOAD_STATE === 'loaded';
  if (filters) filters.hidden = !showFilters;
  if (shortcuts) shortcuts.hidden = !showFilters
    || searchPage.filter !== 'all' || normalizeEntityKey(q) !== 'blocktopia';
  if (loadMore && WIKI_INDEX_LOAD_STATE !== 'loaded') loadMore.hidden = true;

  if (WIKI_INDEX_LOAD_STATE === 'failed') {
    container.innerHTML = '<p class="search-empty">Search index failed to load. Refresh the page or try again later.</p>';
    if (heading) heading.textContent = 'All Articles';
    return;
  }

  if (WIKI_INDEX_LOAD_STATE !== 'loaded') {
    container.innerHTML = '<p class="search-empty">Loading articles…</p>';
    if (heading) heading.textContent = 'All Articles';
    return;
  }

  let items;
  if (q) {
    const { scored, correctedQuery } = selectSearchMatches(q, { allowPartialFallback: true });
    items = scored.map(r => r.item);
    if (filters) {
      const groups = { all: items, games: [], lore: [], people: [], nfts: [] };
      for (const item of items) {
        groups[searchResultType(item)]?.push(item);
      }
      for (const button of filters.querySelectorAll('[data-search-filter]')) {
        const filter = button.dataset.searchFilter;
        const count = groups[filter].length;
        const active = filter === searchPage.filter;
        button.querySelector('.search-filter-count').textContent = String(count);
        button.setAttribute('aria-pressed', String(active));
        button.disabled = !active && count === 0;
      }
      items = groups[searchPage.filter];
    }
    if (heading) heading.textContent = `Results for "${correctedQuery || q}" (${items.length})`;
  } else {
    items = [...WIKI_INDEX].sort(compareIndexItemsStable);
    if (heading) heading.textContent = `All Articles (${items.length})`;
  }

  if (loadMore) loadMore.hidden = items.length <= searchPage.limit;
  if (!items.length) {
    container.innerHTML = searchPage.filter === 'all'
      ? `<p class="search-empty">No results found for "${escapeHtml(q)}".</p>`
      : '<p class="search-empty">No results in this filter.</p>';
    return;
  }

  container.innerHTML = items.slice(0, searchPage.limit).map(item => {
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
  // Standalone arcade pages use wiki.js without the shared site shell.
  if (!window.MOONBOYS_WIKI_SHELL && !document.querySelector('script[data-moonboys-site-icons]')) {
    const icons = document.createElement('script');
    icons.src = '/js/site-icons.js?v=2';
    icons.dataset.moonboysSiteIcons = '1';
    document.head.appendChild(icons);
  }
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

  // Bind search before loading data so deep links and typing switch the layout immediately.
  const refreshSearch = bindSearchControls();
  await loadWikiIndex();
  refreshSearch();
  await loadEntityMap();
  buildEntityLookup();

  // ── Related pages (wiki pages only) ─────────────────────────────────────
  if (window.location.pathname.startsWith('/wiki/')) {
    await loadEntityGraph();
    renderRelatedPages();
  }
}

function bindSearchControls() {
  const searchInput = document.getElementById('search-page-input');
  const headerInput = document.getElementById('search-input');
  const headerButton = document.getElementById('search-btn');
  const dropdown = document.getElementById('search-results');

  function showHeaderResults() {
    if (!dropdown) return;
    const { scored } = selectSearchMatches(headerInput.value, { allowPartialFallback: true, limit: 5 });
    dropdown.innerHTML = scored.map(({ item }) => {
      const href = resolveWikiUrl(item.url);
      return `<a class="search-result-item" href="${escapeHtml(href)}" role="option">${escapeHtml(item.title || href)}</a>`;
    }).join('');
  }

  function refreshResults() {
    if (searchInput) renderSearchPage(searchInput.value);
    if (headerInput) showHeaderResults();
  }

  function requestGames(query) {
    if (query.trim() && !arcadeSearchRequest) {
      arcadeSearchRequest = loadArcadeSearchEntries().then(refreshResults);
    }
  }

  if (searchInput) {
    searchInput.value = new URLSearchParams(window.location.search).get('q') || '';
    renderSearchPage(searchInput.value);
    requestGames(searchInput.value);
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim();
      renderSearchPage(query);
      requestGames(query);
      const url = new URL(window.location.href);
      if (query) url.searchParams.set('q', query);
      else url.searchParams.delete('q');
      history.replaceState(null, '', url.toString());
    });

    const filters = document.getElementById('search-filters');
    for (const button of filters?.querySelectorAll('[data-search-filter]') || []) {
      button.addEventListener('click', () => {
        const filter = button.dataset.searchFilter;
        if (filter === searchPage.filter) return;
        searchPage.filter = filter;
        searchPage.limit = SEARCH_PAGE_SIZE;
        renderSearchPage(searchInput.value);
      });
    }

    document.getElementById('search-load-more')?.addEventListener('click', () => {
      const firstNewResult = searchPage.limit;
      searchPage.limit += SEARCH_PAGE_SIZE;
      renderSearchPage(searchInput.value);
      document.querySelectorAll('#search-results-page .article-card-title')[firstNewResult]?.focus();
    });
  }

  if (headerInput) {
    headerInput.addEventListener('input', () => {
      showHeaderResults();
      requestGames(headerInput.value);
    });
    headerInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') goToSearch(headerInput.value);
    });
  }
  if (headerButton) {
    headerButton.addEventListener('click', () => goToSearch(headerInput ? headerInput.value : ''));
  }

  return refreshResults;
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
  const tokens = tokenizeSearchQuery(q);
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
  const keywordWords = new Set(tokenizeSearchQuery((si.keyword_bag || []).join(' ')));
  const descriptionWords = new Set(tokenizeSearchQuery(descLower));
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
    if (canUseTextCorpusMatch && descriptionWords.has(token)) {
      queryScore += 15;
      tokenMatched = true;
    }
    // Keyword bag (body-text proxy): only match non-stopwords >= 3 chars to avoid flood
    if (canUseTextCorpusMatch && keywordWords.has(token)) {
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
