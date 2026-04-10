#!/usr/bin/env node
'use strict';

/**
 * generate-expansion-executor.js
 * Phase 25: Automated Expansion Executor.
 *
 * Reads:
 *   js/growth-priority.json
 *   js/wiki-index.json
 *
 * Writes:
 *   wiki/{slug}.html  — stub pages ONLY for missing targets
 *   js/expansion-executor.json  — execution manifest
 *
 * Rules:
 *  - Deterministic: same inputs always produce same outputs (sorted, no randomness)
 *  - NEVER overwrites or modifies existing wiki/*.html files
 *  - Only generates stubs for generate_bridge_page actions with no existing target
 *  - All stub pages are marked with data-wiki-stub="true"
 *  - Uses root-relative paths only
 */

const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..');
const WIKI_DIR = path.join(ROOT, 'wiki');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

function fileExists(absPath) {
  return fs.existsSync(absPath);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a display word to a proper display form using known crypto terms.
 */
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

/**
 * Build a human-readable title from a slug.
 * e.g. "games-nfts" → "Games NFTs"
 */
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

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build the source pages list HTML fragment.
 */
function buildRelatedLinksHtml(sourcePages) {
  if (!Array.isArray(sourcePages) || sourcePages.length === 0) return '';
  const items = sourcePages
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

/**
 * Generate a stub HTML page for the given bridge page entry.
 * Uses root-relative paths throughout.
 */
function buildStubHtml(slug, entry) {
  const title        = slugToTitle(slug);
  const fullTitle    = `${title} — Crypto Moonboys Wiki`;
  const canonicalUrl = `https://crypto-moonboys.github.io/wiki/${slug}.html`;
  const relatedHtml  = buildRelatedLinksHtml(entry.recommended_source_pages);
  const clusterCtx   = entry.cluster_context
    ? `<p>Cluster context: <em>${escapeHtml(entry.cluster_context)}</em></p>`
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

        <div class="stub-notice" role="note"><strong>⚠️ Stub article</strong> — This page was auto-generated from the expansion executor. A full article has not yet been written for this topic.</div>

        <section class="wiki-section">
          <h2 id="overview">Overview</h2>
          <p>This is a bridge page connecting related topics in the Crypto Moonboys universe.</p>
          ${clusterCtx}
          <p>Priority score: ${escapeHtml(String(entry.priority_score))}.</p>
        </section>

${relatedHtml}

        <div class="stub-notice" role="note"><strong>⚠️ Stub article</strong> — This page was auto-generated from the expansion executor. A full article has not yet been written for this topic.</div>

      </article>
    </main>

    <footer id="site-footer" role="contentinfo">
      <div class="footer-inner">
        <div class="footer-col">
          <h4>🌙 The Crypto Moonboys GK Wiki</h4>
          <p>Fan-driven encyclopedia for the crypto community.</p>
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
// Load inputs
// ---------------------------------------------------------------------------

const growthPriority = readJson('js/growth-priority.json');
const wikiIndexRaw   = readJson('js/wiki-index.json');

const wikiPages = Array.isArray(wikiIndexRaw) ? wikiIndexRaw : Object.values(wikiIndexRaw);

// Build set of known URLs from wiki-index for fast lookup
const knownUrls = new Set(wikiPages.map(p => (p.url || '').trim().replace(/\/$/, '')));

// ---------------------------------------------------------------------------
// Process growth-priority.json
// ---------------------------------------------------------------------------

const generated = [];
const skipped   = [];

// Sort priorities by priority_score DESC then slug ASC for deterministic ordering
const sortedPriorities = (growthPriority.priorities || []).slice().sort((a, b) => {
  if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
  const slugA = a.target_slug || '';
  const slugB = b.target_slug || '';
  return slugA.localeCompare(slugB);
});

for (const entry of sortedPriorities) {
  // Only generate stubs for bridge pages (new pages, not expansions of existing ones)
  if (entry.action_type !== 'generate_bridge_page') {
    skipped.push({ slug: entry.target_slug, reason: `action_type:${entry.action_type}` });
    continue;
  }

  const slug = entry.target_slug;
  if (!slug) {
    skipped.push({ slug: null, reason: 'missing_target_slug' });
    continue;
  }

  const targetUrl  = `/wiki/${slug}.html`;
  const targetPath = path.join(WIKI_DIR, `${slug}.html`);

  // NEVER overwrite existing files
  if (fileExists(targetPath)) {
    skipped.push({ slug, reason: 'already_exists' });
    continue;
  }

  // Also skip if URL already appears in wiki-index (defensive check)
  if (knownUrls.has(targetUrl)) {
    skipped.push({ slug, reason: 'in_wiki_index' });
    continue;
  }

  const html = buildStubHtml(slug, entry);
  fs.writeFileSync(targetPath, html, 'utf8');

  generated.push({
    slug,
    target_url:     targetUrl,
    priority_score: entry.priority_score,
    cluster_context: entry.cluster_context || null,
  });
}

// ---------------------------------------------------------------------------
// Write manifest
// ---------------------------------------------------------------------------

const manifest = {
  generated_at:     new Date().toISOString(),
  phase:            'phase_25',
  summary: {
    generated:      generated.length,
    skipped:        skipped.length,
    skipped_exists: skipped.filter(s => s.reason === 'already_exists').length,
    skipped_other:  skipped.filter(s => s.reason !== 'already_exists').length,
  },
  generated_stubs:  generated,
  skipped_entries:  skipped,
};

const outPath = path.join(ROOT, 'js', 'expansion-executor.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`generate-expansion-executor.js complete ✅`);
console.log(`  Generated stubs: ${generated.length}`);
console.log(`  Skipped: ${skipped.length}`);
console.log(`  Manifest: js/expansion-executor.json`);
