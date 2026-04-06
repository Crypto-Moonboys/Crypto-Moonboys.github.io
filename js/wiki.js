/**
 * Crypto Moonboys Wiki — Main JavaScript
 * Client-side search, sidebar toggle, UI helpers.
 */

function resolveWikiUrl(url) {
  if (!url) return url;
  // Strip any leading slashes, then collapse repeated wiki/ prefixes (e.g. wiki/wiki/) down to one
  let u = url.replace(/^\/+/, '').replace(/^(wiki\/)+/, 'wiki/');
  if (u.startsWith('wiki/')) return '/' + u;
  return url;
}

/* ── SEARCH INDEX ──────────────────────────────────────────────────────────
   Loaded at runtime from js/wiki-index.json (auto-generated).
   Regenerate after adding new wiki pages:
     node scripts/generate-wiki-index.js
   ─────────────────────────────────────────────────────────────────────── */
let WIKI_INDEX = [];

/* ── WIKI INDEX LOADER ──────────────────────────────────────────────────── */
function getWikiIndexUrl() {
  // Derive the JSON URL from the <script src> of this file so it resolves
  // correctly regardless of which directory the page lives in.
  const scripts = document.querySelectorAll('script[src]');
  for (const s of scripts) {
    if (/\/js\/wiki\.js([?#]|$)/.test(s.src)) {
      return s.src.replace(/\/js\/wiki\.js([?#].*)?$/, '/js/wiki-index.json');
    }
  }
  return '/js/wiki-index.json';
}

async function loadWikiIndex() {
  const url = getWikiIndexUrl();
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    WIKI_INDEX = await res.json();
  } catch (err) {
    console.warn(`[wiki] Failed to load ${url} — search will return empty results. Check that js/wiki-index.json exists and is reachable.`, err);
    WIKI_INDEX = [];
  }
}

/* ── CATEGORY INDEX ────────────────────────────────────────────────────────
   All wiki categories are registered here.
   When a new category page is added, also add its name to this list so the
   category count on the home page updates automatically.
   ─────────────────────────────────────────────────────────────────────── */
const CATEGORY_LIST = [
  "Cryptocurrencies",
  "Concepts",
  "Technology",
  "Tools & Platforms",
  "Lore",
  "Crypto Designer Toys",
  "Guerilla Marketing",
  "Graffiti & Street Art",
  "NFTs & Digital Art",
  "Punk Culture",
  "Gaming",
  "Community & People",
  "Media & Publishing",
  "Art & Creativity",
  "Activism & Counter-Culture"
];

/* ── DOM READY ──────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Set up UI immediately (no index needed for these)
    initSidebar();
    initBackToTop();
    initActiveNav();
    initTOC();

    // Wire up search event listeners before the index arrives so the input
    // is responsive right away; results appear once the JSON has loaded.
    initSearch();

    // Fetch the search index, then update all index-dependent UI.
    await loadWikiIndex();
    initStatArticles();
    initStatCategories();

    // If we landed on search.html with a query, re-render now that the index
    // is populated (initSearch may have rendered empty results on first call).
    const searchPage = document.getElementById('search-page-input');
    if (searchPage && searchPage.value) {
      renderSearchPage(searchPage.value);
    }

    // Re-render the header dropdown if the input already has a value.
    const searchInput   = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    if (searchInput && searchResults && searchInput.value) {
      runSearch(searchInput.value, searchResults, searchInput);
    }
  } catch (err) {
    console.error('[wiki] Unhandled error during page initialisation.', err);
  }
});

/* ── SIDEBAR TOGGLE ─────────────────────────────────────────────────────── */
function initSidebar() {
  const hamburger = document.getElementById('hamburger');
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebar-overlay');
  if (!hamburger || !sidebar) return;

  hamburger.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', open);
  });

  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  }

  // Close on ESC
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    }
  });
}

/* ── SEARCH ─────────────────────────────────────────────────────────────── */
function initSearch() {
  // Header search
  const input   = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  if (input && results) {
    input.addEventListener('input',  () => runSearch(input.value, results, input));
    input.addEventListener('focus',  () => { if (input.value) runSearch(input.value, results, input); });
    document.addEventListener('click', e => {
      if (!input.contains(e.target) && !results.contains(e.target)) {
        results.classList.remove('open');
      }
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const q = input.value.trim();
        if (q) window.location.href = `search.html?q=${encodeURIComponent(q)}`;
      }
    });
    // Header search button
    const btn = document.getElementById('search-btn');
    if (btn) btn.addEventListener('click', () => {
      const q = input.value.trim();
      if (q) window.location.href = `search.html?q=${encodeURIComponent(q)}`;
    });
  }

  // Home page search
  const homeInput = document.getElementById('home-search-input');
  const homeBtn   = document.getElementById('home-search-btn');
  if (homeInput) {
    homeInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const q = homeInput.value.trim();
        if (q) window.location.href = `search.html?q=${encodeURIComponent(q)}`;
      }
    });
  }
  if (homeBtn && homeInput) {
    homeBtn.addEventListener('click', () => {
      const q = homeInput.value.trim();
      if (q) window.location.href = `search.html?q=${encodeURIComponent(q)}`;
    });
  }

  // Search page
  const searchPage = document.getElementById('search-page-input');
  if (searchPage) {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q') || '';
    searchPage.value = q;
    if (q) renderSearchPage(q);
    searchPage.addEventListener('input', () => renderSearchPage(searchPage.value));
    searchPage.addEventListener('keydown', e => {
      if (e.key === 'Enter') renderSearchPage(searchPage.value);
    });
  }
}

function scoreResult(item, query) {
  const q = query.toLowerCase().trim();
  if (!q) return 0;

  let score = 0;
  const title = item.title.toLowerCase();
  const desc  = (item.desc  || '').toLowerCase();
  const tags  = (item.tags  || []).join(' ').toLowerCase();
  const cat   = (item.category || '').toLowerCase();

  // ── Canonical title scoring (highest priority) ──────────────────────────
  if (title === q)                    score += 100;
  if (title.startsWith(q))            score +=  60;
  if (title.includes(q))              score +=  40;
  if (tags.includes(q))               score +=  30;
  if (desc.includes(q))               score +=  15;
  if (cat.includes(q))                score +=  10;

  q.split(' ').forEach(word => {
    if (word.length > 2) {
      if (title.includes(word)) score += 8;
      if (tags.includes(word))  score += 5;
      if (desc.includes(word))  score += 3;
    }
  });

  // ── Alias scoring (medium priority) ─────────────────────────────────────
  const aliases = item.aliases || [];
  aliases.forEach(alias => {
    const aTitle = (alias.title || '').toLowerCase();
    if (aTitle === q)              score += 80;
    else if (aTitle.startsWith(q)) score += 45;
    else if (aTitle.includes(q))   score += 25;

    q.split(' ').forEach(word => {
      if (word.length > 2 && aTitle.includes(word)) score += 5;
    });
  });

  return score;
}

function normalizeEntityKey(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function dedupeResults(scoredResults) {
  const seen = new Set();
  const deduped = [];

  scoredResults.forEach(result => {
    const item = result.item;
    const baseKeys = [
      normalizeEntityKey(item.title),
      normalizeEntityKey(resolveWikiUrl(item.url).replace(/^\/wiki\//, '').replace(/\.html$/, ''))
    ];

    const aliasKeys = (item.aliases || []).map(alias => normalizeEntityKey(alias.title || ''));
    const keys = [...baseKeys, ...aliasKeys].filter(Boolean);

    const alreadySeen = keys.some(key => seen.has(key));
    if (alreadySeen) return;

    keys.forEach(key => seen.add(key));
    deduped.push(result);
  });

  return deduped;
}

function runSearch(query, resultsEl, inputEl) {
  const q = query.trim();
  if (!q) {
    resultsEl.classList.remove('open');
    return;
  }

  let scored = WIKI_INDEX
    .map(item => ({ item, score: scoreResult(item, q) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);

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
          <div class="sr-desc">${escHtml((item.desc || '').slice(0, 90))}…</div>
          <div class="sr-cat">${item.category}</div>
        </div>`;
      div.addEventListener('click', () => { window.location.href = resolveWikiUrl(item.url); });
      resultsEl.appendChild(div);
    });
  }
  resultsEl.classList.add('open');
}

function renderSearchPage(query) {
  const container = document.getElementById('search-results-page');
  const heading   = document.getElementById('search-heading');
  if (!container) return;

  const q = query.trim();
  if (heading) heading.textContent = q ? `Results for "${q}"` : 'All Articles';

  let items = q
    ? WIKI_INDEX
        .map(item => ({ item, score: scoreResult(item, q) }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
    : WIKI_INDEX.map(item => ({ item, score: 0 }));

  items = dedupeResults(items);

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
        <div class="ali-meta">${item.category}</div>
      </div>
    </a>`).join('');
}

function highlight(text, query) {
  if (!query) return escHtml(text);
  const safeQ = escRegex(query);
  return escHtml(text).replace(new RegExp(`(${safeQ})`, 'gi'), '<mark style="background:rgba(247,201,72,.3);color:inherit;border-radius:2px">$1</mark>');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ── BACK TO TOP ────────────────────────────────────────────────────────── */
function initBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/* ── ACTIVE NAV ─────────────────────────────────────────────────────────── */
function initActiveNav() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  document.querySelectorAll('.sidebar-nav a, .header-nav a').forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    // Resolve relative href against current page
    const abs = new URL(href, window.location.href).pathname.replace(/\/+$/, '') || '/';
    if (abs === path) link.classList.add('active');
  });
}

/* ── AUTO TABLE OF CONTENTS ─────────────────────────────────────────────── */
function initTOC() {
  const toc     = document.getElementById('toc');
  const content = document.querySelector('.wiki-content');
  if (!toc || !content) return;

  const headings = Array.from(content.querySelectorAll('h2, h3'));
  if (headings.length < 3) {
    toc.style.display = 'none';
    return;
  }

  let ol = document.createElement('ol');
  let subOl = null;
  let lastH2Li = null;
  let counter = 0;

  headings.forEach(h => {
    // Ensure each heading has an ID for anchor links
    if (!h.id) {
      h.id = 'section-' + (++counter) + '-' + h.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }
    const li = document.createElement('li');
    const a  = document.createElement('a');
    a.href        = '#' + h.id;
    a.textContent = h.textContent;
    li.appendChild(a);

    if (h.tagName === 'H2') {
      subOl    = null;
      lastH2Li = li;
      ol.appendChild(li);
    } else {
      // H3 — nest under last H2
      if (!subOl) {
        subOl = document.createElement('ol');
        if (lastH2Li) lastH2Li.appendChild(subOl);
        else ol.appendChild(subOl);
      }
      subOl.appendChild(li);
    }
  });

  toc.querySelector('.toc-title') || (() => {
    const t = document.createElement('div');
    t.className = 'toc-title';
    t.textContent = '📋 Contents';
    toc.prepend(t);
  })();
  toc.appendChild(ol);
}

/* ── AUTO-SYNC ARTICLE COUNT STAT ────────────────────────────────────────── */
function initStatArticles() {
  const el = document.getElementById('stat-articles');
  if (el) el.textContent = WIKI_INDEX.length;
}

/* ── AUTO-SYNC CATEGORY COUNT STAT ──────────────────────────────────────── */
function initStatCategories() {
  const el = document.getElementById('stat-categories');
  if (el) el.textContent = CATEGORY_LIST.length;
}
