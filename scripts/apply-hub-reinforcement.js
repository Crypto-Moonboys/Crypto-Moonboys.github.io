#!/usr/bin/env node
'use strict';

/**
 * apply-hub-reinforcement.js
 * Phase 4: Autonomous Editorial Operations — Hub Reinforcement Applicator.
 *
 * Reads:
 *   js/hub-recommendations.json
 *   js/wiki-index.json
 *   js/editorial-changelog.json
 *
 * Writes:
 *   wiki/{slug}.html              — new hub pages for high-scoring recommendations
 *                                   where the hub does not yet exist
 *                                   (NEVER overwrites existing hub pages)
 *   js/editorial-changelog.json  — appends a new run record
 *
 * Rules:
 *  - Only creates hub pages for recommendations with hub_already_exists=false
 *    and hub_score >= MIN_HUB_SCORE_THRESHOLD
 *  - NEVER overwrites existing wiki/*.html files
 *  - All generated pages are ecosystem hub pages with full cluster member lists
 *  - Deterministic: same inputs → same outputs
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
// Thresholds
// ---------------------------------------------------------------------------

const MIN_HUB_SCORE_THRESHOLD = 80;  // minimum hub_score to generate a hub page

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

function buildMembersHtml(members) {
  if (!Array.isArray(members) || members.length === 0) return '';
  const items = members
    .map(m => {
      const slug  = (m.url || '').replace('/wiki/', '').replace('.html', '');
      const title = m.title || slugToTitle(slug);
      return `        <li><a href="${escapeHtml(m.url)}">${escapeHtml(title)}</a> <span class="rank-score">(score: ${escapeHtml(String(m.rank_score || 0))})</span></li>`;
    })
    .join('\n');
  return items;
}

/**
 * Generate an ecosystem hub page HTML for a hub recommendation.
 */
function buildHubHtml(rec) {
  const hubSlug      = rec.suggested_hub_slug;
  const hubTitle     = slugToTitle(hubSlug);
  const anchorTitle  = rec.anchor_title || slugToTitle(rec.anchor_slug);
  const fullTitle    = `${hubTitle} — Crypto Moonboys Wiki`;
  const canonicalUrl = `https://crypto-moonboys.github.io/wiki/${hubSlug}.html`;
  const memberCount  = rec.cluster_size || (rec.members || []).length;
  const membersHtml  = buildMembersHtml(rec.members || []);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(fullTitle)}">
  <meta name="robots" content="index, follow">
  <meta property="og:title" content="${escapeHtml(fullTitle)}">
  <meta property="og:description" content="${escapeHtml(fullTitle)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="https://crypto-moonboys.github.io/img/logo.svg">
  <meta name="twitter:card" content="summary_large_image">
  <title>${escapeHtml(fullTitle)}</title>
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="stylesheet" href="/css/wiki.css">
  <link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${escapeHtml(hubTitle)}",
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
        "url": "https://crypto-moonboys.github.io/img/logo.svg"
      }
    }
  }
  <\/script>
</head>
<body>
<a class="skip-link" href="#wiki-content">Skip to content</a>

<header id="site-header" role="banner">
  <button class="hamburger" id="hamburger" aria-label="Toggle navigation" aria-expanded="false" aria-controls="sidebar">&#9776;</button>
  <a href="/index.html" class="site-logo" aria-label="Crypto Moonboys Wiki home">
    <img src="/img/logo.svg" alt="" aria-hidden="true">
    <span>
      <span class="logo-text">🌙 Moonboys Wiki</span>
      <span class="logo-sub">Crypto Encyclopedia</span>
    </span>
  </a>
  <div id="header-search" role="search">
    <input type="search" id="search-input" placeholder="Search articles…" aria-label="Search" autocomplete="off">
    <button id="search-btn" aria-label="Search">🔍</button>
    <div id="search-results" role="listbox"></div>
  </div>
  <nav class="header-nav" aria-label="Main navigation">
    <a href="/index.html">Home</a>
    <a href="/categories/index.html">Categories</a>
    <a href="/search.html">All Articles</a>
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
        <a href="/search.html"><span class="nav-icon">🔎</span> All Articles</a>
        <a href="/about.html"><span class="nav-icon">ℹ️</span> About</a>
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
        <span aria-current="page">${escapeHtml(hubTitle)}</span>
      </nav>

      <article data-entity-slug="${escapeHtml(hubSlug)}">
        <header class="wiki-header">
          <h1>🌐 ${escapeHtml(hubTitle)}</h1>
        </header>

        <section class="wiki-section">
          <h2 id="overview">Overview</h2>
          <p>This is the ecosystem hub for <a href="${escapeHtml(rec.anchor_url)}">${escapeHtml(anchorTitle)}</a>, anchoring a cluster of ${memberCount} pages connected by graph relationship and content signals.</p>
          <p>Hub score: ${escapeHtml(String(rec.hub_score))}. Cluster ID: ${escapeHtml(rec.cluster_id)}. Anchor tag: <em>${escapeHtml(rec.anchor_tag)}</em>.</p>
          <p>Signals: average rank score ${escapeHtml(String(rec.avg_rank_score))}, combined rank sum ${escapeHtml(String(rec.rank_sum))}, entity density ${escapeHtml(String(Math.round((rec.entity_density || 0) * 100)))}%.</p>
        </section>

        <section class="wiki-section">
          <h2 id="cluster-members">Cluster Members</h2>
          <p>The following ${memberCount} pages are most strongly connected to this ecosystem hub:</p>
          <ul>
${membersHtml}
          </ul>
        </section>

        <section class="wiki-section">
          <h2 id="hub-signals">Hub Signals</h2>
          <ul>
${(rec.reasons || []).map(r => `            <li>${escapeHtml(r)}</li>`).join('\n')}
          </ul>
        </section>

      </article>
    </main>

    <footer id="site-footer" role="contentinfo">
      <div class="footer-inner">
        <div class="footer-col">
          <h4>🌙 Moonboys Wiki</h4>
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

const hubRecs      = readJson('js/hub-recommendations.json');
const wikiIndexRaw = readJson('js/wiki-index.json');
const changelog    = readJson('js/editorial-changelog.json');

const wikiPages = Array.isArray(wikiIndexRaw) ? wikiIndexRaw : Object.values(wikiIndexRaw);
const knownUrls = new Set(wikiPages.map(p => (p.url || '').trim()));

// ---------------------------------------------------------------------------
// Process recommendations
// ---------------------------------------------------------------------------

// Sort by hub_score DESC, then suggested_hub_slug ASC for determinism
const sortedRecs = (hubRecs.recommendations || []).slice().sort((a, b) => {
  if (b.hub_score !== a.hub_score) return b.hub_score - a.hub_score;
  return (a.suggested_hub_slug || '').localeCompare(b.suggested_hub_slug || '');
});

const actions = [];

for (const rec of sortedRecs) {
  const hubSlug = rec.suggested_hub_slug;
  if (!hubSlug) {
    actions.push({
      action_type: 'hub_reinforcement_skipped',
      status:      'skipped',
      reason:      'missing_suggested_hub_slug',
      cluster_id:  rec.cluster_id,
    });
    continue;
  }

  const hubUrl  = `/wiki/${hubSlug}.html`;
  const hubPath = path.join(WIKI_DIR, `${hubSlug}.html`);

  // Skip if hub already exists — we never overwrite
  if (rec.hub_already_exists || fs.existsSync(hubPath)) {
    actions.push({
      action_type:   'hub_reinforcement_skipped',
      status:        'skipped',
      target_url:    hubUrl,
      reason:        'hub_already_exists',
      cluster_id:    rec.cluster_id,
      hub_score:     rec.hub_score,
    });
    continue;
  }

  // Skip if URL already in wiki-index (defensive)
  if (knownUrls.has(hubUrl)) {
    actions.push({
      action_type:   'hub_reinforcement_skipped',
      status:        'skipped',
      target_url:    hubUrl,
      reason:        'in_wiki_index',
      cluster_id:    rec.cluster_id,
      hub_score:     rec.hub_score,
    });
    continue;
  }

  // Only create hubs that meet the score threshold
  if (rec.hub_score < MIN_HUB_SCORE_THRESHOLD) {
    actions.push({
      action_type:   'hub_reinforcement_skipped',
      status:        'skipped',
      target_url:    hubUrl,
      reason:        `hub_score_below_threshold:${rec.hub_score}<${MIN_HUB_SCORE_THRESHOLD}`,
      cluster_id:    rec.cluster_id,
      hub_score:     rec.hub_score,
    });
    continue;
  }

  const html = buildHubHtml(rec);
  fs.writeFileSync(hubPath, html, 'utf8');

  actions.push({
    action_type:    'hub_reinforcement_created',
    status:         'applied',
    target_url:     hubUrl,
    target_slug:    hubSlug,
    cluster_id:     rec.cluster_id,
    anchor_slug:    rec.anchor_slug,
    anchor_title:   rec.anchor_title,
    hub_score:      rec.hub_score,
    cluster_size:   rec.cluster_size,
    avg_rank_score: rec.avg_rank_score,
    reasons:        rec.reasons,
  });
}

const createdCount = actions.filter(a => a.action_type === 'hub_reinforcement_created').length;
const skippedCount = actions.filter(a => a.action_type === 'hub_reinforcement_skipped').length;

// ---------------------------------------------------------------------------
// Append run to editorial changelog
// ---------------------------------------------------------------------------

const today  = new Date().toISOString().slice(0, 10);
const runId  = `apply-hub-reinforcement:${today}`;
const nowIso = new Date().toISOString();

const run = {
  run_id:    runId,
  script:    'apply-hub-reinforcement',
  timestamp: nowIso,
  summary: {
    total_recommendations: sortedRecs.length,
    created:               createdCount,
    skipped:               skippedCount,
    existing_hubs:         (hubRecs.summary || {}).existing_hubs || 0,
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

console.log('apply-hub-reinforcement.js complete ✅');
console.log(`  Hub pages created: ${createdCount}`);
console.log(`  Skipped: ${skippedCount}`);
console.log(`  Output: js/editorial-changelog.json (run: ${runId})`);
