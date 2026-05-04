#!/usr/bin/env node
'use strict';

/**
 * generate-content-expansion.js
 * Phase 4: Autonomous Editorial Operations — Content Expansion Generator.
 *
 * Reads:
 *   js/expansion-plan.json
 *   js/wiki-index.json
 *   js/editorial-changelog.json
 *
 * Writes:
 *   wiki/{slug}.html       — new stub pages for create_bridge_page and
 *                            create_topic_page actions (NEVER overwrites)
 *   js/editorial-changelog.json  — appends a new run record
 *
 * Rules:
 *  - Only generates pages for create_bridge_page and create_topic_page actions
 *  - NEVER overwrites existing wiki/*.html files
 *  - All generated pages marked with data-wiki-stub="true" and noindex
 *  - Deterministic: same inputs → same outputs (sorted, no randomness)
 *  - Idempotent: re-running on the same day updates the run record in-place
 */

const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..');
const WIKI_DIR = path.join(ROOT, 'wiki');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

function writeJson(relPath, data) {
  fs.writeFileSync(path.join(ROOT, relPath), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Eligible action types for page generation
// ---------------------------------------------------------------------------

const GENERATABLE_TYPES = new Set(['create_bridge_page', 'create_topic_page']);
const MIN_CONFIDENCE    = new Set(['high', 'medium']);

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const DISPLAY_WORD_MAP = {
  graffpunks: 'GraffPUNKS',
  nfts:       'NFTs',
  nft:        'NFT',
  bitcoin:    'Bitcoin',
  btc:        'BTC',
  eth:        'ETH',
  xrp:        'XRP',
  gk:         'GK',
  defi:       'DeFi',
  nbg:        'NBG',
  nbgx:       'NBGX',
};

function slugToTitle(slug) {
  return slug
    .split('-')
    .map(word => {
      const lower = word.toLowerCase();
      if (DISPLAY_WORD_MAP[lower]) return DISPLAY_WORD_MAP[lower];
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function buildRelatedLinksHtml(relatedPages) {
  if (!Array.isArray(relatedPages) || relatedPages.length === 0) return '';
  const items = relatedPages
    .map(url => {
      const slug  = path.basename(url, '.html');
      const label = slugToTitle(slug);
      return `        <li><a href="${escapeHtml(url)}">${escapeHtml(label)}</a></li>`;
    })
    .join('\n');
  return `      <section class="wiki-section">
        <h2 id="related">Related Pages</h2>
        <ul>
${items}
        </ul>
      </section>`;
}

function buildStubHtml(action, provenance) {
  const slug         = action.target_url_slug;
  const title        = slugToTitle(slug);
  const fullTitle    = `${title} — Crypto Moonboys Wiki`;
  const canonicalUrl = `https://crypto-moonboys.github.io/wiki/${slug}.html`;
  const relatedHtml  = buildRelatedLinksHtml(action.related_pages);

  // Machine-readable SAM provenance metadata for this generated page
  const provenanceObj = {
    sam_export_id:           provenance.sam_export_id || null,
    approved_source_pack_id: provenance.approved_source_pack_id || null,
    source_fact_ids:         provenance.source_fact_ids || [],
    source_citations:        (Array.isArray(provenance.source_citations) && provenance.source_citations.length > 0)
      ? provenance.source_citations : null,
    source_archive_refs:     (Array.isArray(provenance.source_archive_refs) && provenance.source_archive_refs.length > 0)
      ? provenance.source_archive_refs : null,
    generator_script:        'scripts/generate-content-expansion.js',
    generated_at:            new Date().toISOString(),
  };
  // Omit null-valued fields from the block
  Object.keys(provenanceObj).forEach(k => provenanceObj[k] === null && delete provenanceObj[k]);
  const provenanceJson = JSON.stringify(provenanceObj, null, 2);

  const sectionsHtml = (action.recommended_sections || [])
    .map((sec, i) => {
      const headingId = `section-${i}`;
      return `        <h2 id="${escapeHtml(headingId)}">${escapeHtml(sec)}</h2>
        <p>Content for this section has not yet been written.</p>`;
    })
    .join('\n');

  const keywordsHtml = (action.recommended_keywords || []).length > 0
    ? `<p class="wiki-keywords"><em>Keywords:</em> ${escapeHtml((action.recommended_keywords || []).join(', '))}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(fullTitle)}">
  <meta name="robots" content="noindex, follow">
  <meta property="og:title" content="${escapeHtml(fullTitle)}">
  <meta property="og:description" content="${escapeHtml(fullTitle)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="https://crypto-moonboys.github.io/img/CRYPTO-MOONBOYS-BITCOIN-LOGO.png">
  <meta name="twitter:card" content="summary_large_image">
  <title>${escapeHtml(fullTitle)}</title>
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="stylesheet" href="/css/wiki.css">
  <link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${escapeHtml(title)}",
    "description": "${escapeHtml(fullTitle)}",
    "url": "${escapeHtml(canonicalUrl)}",
    "author": {
      "@type": "Organization",
      "name": "Crypto Moonboys"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Crypto Moonboys",
      "logo": {
        "@type": "ImageObject",
        "url": "https://crypto-moonboys.github.io/img/CRYPTO-MOONBOYS-BITCOIN-LOGO.png"
      }
    }
  }
  <\/script>
  <script type="application/json" id="sam-provenance">
${provenanceJson}
  </script>
</head>
<body data-wiki-stub="true">
<a class="skip-link" href="#wiki-content">Skip to content</a>

<header id="site-header" role="banner">
  <button class="hamburger" id="hamburger" aria-label="Toggle navigation" aria-expanded="false" aria-controls="sidebar">&#9776;</button>
  <a href="/index.html" class="site-logo" aria-label="The Crypto Moonboys GK Wiki home">
    <img src="/img/CRYPTO-MOONBOYS-BITCOIN-LOGO.png" alt="" aria-hidden="true">
    <span>
      <span class="logo-text">🌙 The Crypto Moonboys GK Wiki</span>
      <span class="logo-sub">Blockchain Cryptoism Encyclopedia ⚡️⚡️⚡️</span>
    </span>
  </a>
  <div id="header-search" role="search">
    <input type="search" id="search-input" placeholder="Search the wiki…" aria-label="Search" autocomplete="off">
    <button id="search-btn" aria-label="Search">🔍</button>
    <div id="search-results" role="listbox"></div>
  </div>
  <nav class="header-nav" aria-label="Main navigation">
    <a href="/index.html">Home</a>
    <a href="/categories/index.html">Categories</a>
    <a href="/search.html">All Articles</a>
    <a href="/timeline.html">📅 Timeline</a>
    <a href="/graph.html">🌐 Graph</a>
    <a href="/dashboard.html">📊 Dashboard</a>
    <a href="/sam.html">🧠 SAM</a>
  </nav>
</header>

<div id="sidebar-overlay" aria-hidden="true"></div>

<div id="layout">
    <nav id="sidebar" aria-label="Wiki navigation">
    <div class="sidebar-section">
      <div class="sidebar-heading">Navigation</div>
      <div class="sidebar-nav">
        <a href="/index.html"><span class="nav-icon">🏠</span> Main Page</a>
        <a href="/categories/index.html"><span class="nav-icon">📂</span> All Categories</a>
        <a href="/search.html"><span class="nav-icon">🔍</span> All Articles</a>
        <a href="/timeline.html"><span class="nav-icon">📅</span> Timeline</a>
        <a href="/graph.html"><span class="nav-icon">🌐</span> Entity Graph</a>
        <a href="/dashboard.html"><span class="nav-icon">📊</span> Dashboard</a>
      </div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-heading">⚔️ HODL WARS LORE$ ⚡️⚡️⚡️</div>
      <div class="sidebar-nav">
        <a href="/wiki/hodl-wars.html"><span class="nav-icon">⚔️</span> HODL WAR$</a>
        <a href="/wiki/hodl-warriors.html"><span class="nav-icon">💎</span> HODL WARRIORS</a>
        <a href="/wiki/diamond-hands.html"><span class="nav-icon">💎</span> Diamond Hands</a>
        <a href="/wiki/paper-hands.html"><span class="nav-icon">🧻</span> Paper Hands</a>
        <a href="/wiki/whale-lords.html"><span class="nav-icon">🐳</span> The Whale Lords</a>
        <a href="/wiki/moon-mission.html"><span class="nav-icon">🚀</span> Moon Mission</a>
        <a href="/wiki/the-great-dip.html"><span class="nav-icon">📉</span> The Great Dip</a>
        <a href="/wiki/bear-market-siege.html"><span class="nav-icon">🐻</span> Bear Market Siege</a>
        <a href="/wiki/rug-pull-wars.html"><span class="nav-icon">🪤</span> Rug Pull Wars</a>
        <a href="/wiki/satoshi-scroll.html"><span class="nav-icon">📜</span> The Satoshi Scroll</a>
        <a href="/wiki/fomo-plague.html"><span class="nav-icon">😱</span> The FOMO Plague</a>
        <a href="/wiki/ngmi-chronicles.html"><span class="nav-icon">💀</span> NGMI Chronicles</a>
        <a href="/wiki/wagmi-prophecy.html"><span class="nav-icon">🌙</span> The WAGMI Prophecy</a>
      </div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-heading">GK Wiki Info</div>
      <div class="sidebar-nav">
        <a href="/about.html"><span class="nav-icon">ℹ️</span> About</a>
        <a href="/about.html#citation"><span class="nav-icon">📋</span> Citation Policy</a>
        <a href="/about.html#sources"><span class="nav-icon">��</span> Source Types</a>
      </div>
    </div>
  </nav>

  <div id="main-wrapper">
    <main id="wiki-content" role="main">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="/index.html">Home</a>
        <span class="sep" aria-hidden="true">›</span>
        <a href="/search.html">All Articles</a>
        <span class="sep" aria-hidden="true">›</span>
        <span aria-current="page">${escapeHtml(title)}</span>
      </nav>

      <article data-wiki-stub="true" data-entity-slug="${escapeHtml(slug)}">
        <header class="wiki-header">
          <h1>${escapeHtml(title)}</h1>
        </header>

        <div class="stub-notice" role="note"><strong>⚠️ Stub article</strong> — This page was auto-generated by the content expansion engine (${escapeHtml(action.action_type)}). A full article has not yet been written.</div>

        <section class="wiki-section">
          <h2 id="overview">Overview</h2>
          <p>${escapeHtml(title)} is a topic in the Crypto Moonboys universe awaiting full coverage.</p>
          ${keywordsHtml}
          <p>Expansion type: ${escapeHtml(action.action_type)}. Priority score: ${escapeHtml(String(action.priority_score))}.</p>
        </section>

${sectionsHtml ? `        <section class="wiki-section">\n${sectionsHtml}\n        </section>` : ''}

${relatedHtml}

        <div class="stub-notice" role="note"><strong>⚠️ Stub article</strong> — This page was auto-generated by the content expansion engine. A full article has not yet been written.</div>

      </article>
    </main>

    <footer id="site-footer" role="contentinfo">
      <div class="footer-inner">
        <div class="footer-col">
          <h4>🌙 The Crypto Moonboys GK Wiki</h4>
          <p>Crypto Moonboys is a living Web3 wiki. The wiki is alive.</p>
          <p>The pages explain the world. The arcade lets you enter it.</p>
        </div>
        <div class="footer-col">
          <h4>Explore</h4>
          <ul>
            <li><a href="/index.html">Main Page</a></li>
            <li><a href="/categories/index.html">Categories</a></li>
            <li><a href="/search.html">All Articles</a></li>
            <li><a href="/about.html">About</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <p>© 2026 Crypto Moonboys Wiki · Not financial advice.</p>
      </div>
    </footer>
  </div>
</div>

<button id="back-to-top" aria-label="Back to top">↑</button>
<script src="/js/wiki.js"></script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// SAM provenance guard
// ---------------------------------------------------------------------------
// Content expansion creates new wiki pages — it is a lore creation operation.
// This script must only run when a SAM-approved export manifest is present
// (js/sam-export-manifest.json) with a valid sam_export_id or approved_source_pack_id.
// While SAM is paused, exit cleanly with no pages created.

const SAM_MANIFEST = path.join(ROOT, 'js/sam-export-manifest.json');
if (!fs.existsSync(SAM_MANIFEST)) {
  console.log('[SAM guard] js/sam-export-manifest.json not found.');
  console.log('[SAM guard] SAM is paused or no approved export is present.');
  console.log('[SAM guard] Content expansion requires SAM provenance. No pages created. Exiting cleanly.');
  process.exit(0);
}
let samManifest;
try {
  samManifest = JSON.parse(fs.readFileSync(SAM_MANIFEST, 'utf8'));
} catch (e) {
  console.error('::error file=js/sam-export-manifest.json::Invalid JSON in js/sam-export-manifest.json: ' + e.message);
  process.exit(1);
}
if (!samManifest.sam_export_id && !samManifest.approved_source_pack_id) {
  console.log('[SAM guard] sam_export_id / approved_source_pack_id missing in js/sam-export-manifest.json.');
  console.log('[SAM guard] No content expansion applied. Exiting cleanly.');
  process.exit(0);
}
console.log('[SAM guard] Provenance OK — export id:', samManifest.sam_export_id || samManifest.approved_source_pack_id);

// ---------------------------------------------------------------------------
// Load inputs
// ---------------------------------------------------------------------------

const expansionPlan = readJson('js/expansion-plan.json');
const wikiIndexRaw  = readJson('js/wiki-index.json');
const changelog     = readJson('js/editorial-changelog.json');

const wikiPages = Array.isArray(wikiIndexRaw) ? wikiIndexRaw : Object.values(wikiIndexRaw);
const knownUrls = new Set(wikiPages.map(p => (p.url || '').trim()));

// ---------------------------------------------------------------------------
// Process actions
// ---------------------------------------------------------------------------

// Sort by priority_score DESC, then target_topic ASC for determinism
const sortedActions = (expansionPlan.actions || [])
  .filter(a => GENERATABLE_TYPES.has(a.action_type) && MIN_CONFIDENCE.has(a.confidence))
  .slice()
  .sort((a, b) => {
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
    return (a.target_topic || '').localeCompare(b.target_topic || '');
  });

const actions = [];

for (const action of sortedActions) {
  const slug       = action.target_url_slug;
  if (!slug) {
    actions.push({
      action_type: 'content_expansion_skipped',
      status:      'skipped',
      reason:      'missing_target_url_slug',
      source_action_type: action.action_type,
    });
    continue;
  }

  const targetUrl  = `/wiki/${slug}.html`;
  const targetPath = path.join(WIKI_DIR, `${slug}.html`);

  // NEVER overwrite existing files
  if (fs.existsSync(targetPath)) {
    actions.push({
      action_type:        'content_expansion_skipped',
      status:             'skipped',
      target_url:         targetUrl,
      reason:             'already_exists',
      source_action_type: action.action_type,
      priority_score:     action.priority_score,
    });
    continue;
  }

  // Also skip if URL already in wiki-index (defensive)
  if (knownUrls.has(targetUrl)) {
    actions.push({
      action_type:        'content_expansion_skipped',
      status:             'skipped',
      target_url:         targetUrl,
      reason:             'in_wiki_index',
      source_action_type: action.action_type,
      priority_score:     action.priority_score,
    });
    continue;
  }

  const html = buildStubHtml(action, samManifest);
  fs.writeFileSync(targetPath, html, 'utf8');

  actions.push({
    action_type:        'content_expansion_created',
    status:             'applied',
    target_url:         targetUrl,
    target_slug:        slug,
    source_action_type: action.action_type,
    priority_score:     action.priority_score,
    confidence:         action.confidence,
    target_topic:       action.target_topic,
    related_pages:      (action.related_pages || []).slice(0, 5),
  });
}

const createdCount = actions.filter(a => a.action_type === 'content_expansion_created').length;
const skippedCount = actions.filter(a => a.action_type === 'content_expansion_skipped').length;

// ---------------------------------------------------------------------------
// Append run to editorial changelog
// ---------------------------------------------------------------------------

const today  = new Date().toISOString().slice(0, 10);
const runId  = `generate-content-expansion:${today}`;
const nowIso = new Date().toISOString();

const run = {
  run_id:    runId,
  script:    'generate-content-expansion',
  timestamp: nowIso,
  summary: {
    total_eligible: sortedActions.length,
    created:        createdCount,
    skipped:        skippedCount,
  },
  actions,
};

const existingIdx = changelog.runs.findIndex(r => r.run_id === runId);
if (existingIdx >= 0) {
  changelog.runs[existingIdx] = run;
} else {
  changelog.runs.push(run);
}

writeJson('js/editorial-changelog.json', changelog);

// ---------------------------------------------------------------------------
// Console output
// ---------------------------------------------------------------------------

console.log('generate-content-expansion.js complete ✅');
console.log(`  Pages created: ${createdCount}`);
console.log(`  Skipped: ${skippedCount}`);
console.log(`  Output: js/editorial-changelog.json (run: ${runId})`);
