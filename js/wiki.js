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
  try {
    const res = await fetch(getDerivedJsonUrl('wiki-index.json'));
    const data = await res.json();
    WIKI_INDEX = data.filter(x => x.url !== '/wiki/index.html');
  } catch {
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

/* ── DOM READY ───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await loadWikiIndex();
  await loadEntityMap();
  buildEntityLookup();
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
