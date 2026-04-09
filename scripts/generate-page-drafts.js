#!/usr/bin/env node
'use strict';

/**
 * generate-page-drafts.js
 * Phase 16: Controlled page builder from expansion plan.
 *
 * Reads high-confidence create_topic_page and create_bridge_page actions
 * from js/expansion-plan.json and builds structured draft plans in
 * js/page-drafts.json. For qualifying drafts (no existing page conflict,
 * >=3 related_pages, >=3 recommended_sections) also writes real draft
 * HTML pages under wiki/ (max 5 new files).
 *
 * Does NOT modify ranking, search, wiki.js, or any existing wiki pages.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readJson(relPath) {
  const abs = path.join(ROOT, relPath);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

// ---------------------------------------------------------------------------
// Load inputs
// ---------------------------------------------------------------------------

const expansionPlan = readJson('js/expansion-plan.json');
const wikiIndex     = readJson('js/wiki-index.json');
const entityMap     = readJson('js/entity-map.json');
const entityGraph   = readJson('js/entity-graph.json');
const linkMap       = readJson('js/link-map.json');
const linkGraph     = readJson('js/link-graph.json');
const injectionPlan = readJson('js/injection-plan.json');

// ---------------------------------------------------------------------------
// Build lookup maps from wiki-index for quick access
// ---------------------------------------------------------------------------

/** @type {Map<string, {title: string, desc: string}>} url -> {title, desc} */
const pageInfoByUrl = new Map();
for (const entry of wikiIndex) {
  pageInfoByUrl.set(entry.url, {
    title: entry.title || '',
    desc:  entry.desc  || ''
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a slug like "games-graffpunks" to a display title "Games & Graffpunks"
 */
function slugToTitle(slug) {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Build a clean display title for a bridge page ("A & B — Crypto Moonboys Wiki")
 * or a topic page ("Topic — Crypto Moonboys Wiki").
 */
function buildTitle(action) {
  if (action.action_type === 'create_bridge_page') {
    const clusters = action.supporting_clusters || [];
    if (clusters.length >= 2) {
      const a = clusters[0].charAt(0).toUpperCase() + clusters[0].slice(1);
      const b = clusters[1].charAt(0).toUpperCase() + clusters[1].slice(1);
      return `${a} & ${b} — Crypto Moonboys Wiki`;
    }
  }
  const topic = action.target_topic || action.target_url_slug;
  return `${slugToTitle(topic)} — Crypto Moonboys Wiki`;
}

/**
 * Build a meta description grounded in existing page signals.
 * Uses descriptions from the first related pages found in wiki-index.
 */
function buildMetaDescription(action) {
  const relPages = action.related_pages || [];
  const descs = relPages
    .map(url => pageInfoByUrl.get(url))
    .filter(Boolean)
    .map(p => p.desc)
    .filter(d => d && d.trim().length > 10);

  if (action.action_type === 'create_bridge_page') {
    const clusters = action.supporting_clusters || [];
    const clusterStr = clusters.join(' and ');
    const base = `Exploring the intersection of ${clusterStr} within the Crypto Moonboys universe.`;
    return descs.length > 0
      ? `${base} Related: ${descs[0].slice(0, 100).trim()}`
      : base;
  }

  const topic = action.target_topic || action.target_url_slug;
  const base = `${slugToTitle(topic)} topic hub for the Crypto Moonboys Wiki.`;
  return descs.length > 0
    ? `${base} ${descs[0].slice(0, 100).trim()}`
    : base;
}

/**
 * Build a conservative lead paragraph from existing signals only.
 */
function buildLeadParagraph(action) {
  const relPages = action.related_pages || [];
  const keywords = action.recommended_keywords || [];
  const clusters = action.supporting_clusters || [];

  if (action.action_type === 'create_bridge_page') {
    const a = clusters[0] || 'cluster A';
    const b = clusters[1] || 'cluster B';
    const keyStr = keywords.slice(0, 5).join(', ');
    const pageDescs = relPages
      .map(url => pageInfoByUrl.get(url))
      .filter(Boolean)
      .map(p => p.desc)
      .filter(d => d && d.length > 15)
      .slice(0, 2);

    let lead = `This page bridges the <strong>${a}</strong> and <strong>${b}</strong> topic clusters within the Crypto Moonboys universe.`;
    if (pageDescs.length > 0) {
      lead += ` Key pages in this cluster include those described as: &ldquo;${pageDescs[0].slice(0, 120).trim()}&rdquo;`;
    }
    if (keyStr) {
      lead += ` Core keywords: ${keyStr}.`;
    }
    return lead;
  }

  // topic page
  const topic = action.target_topic || action.target_url_slug;
  const pageDescs = relPages
    .map(url => pageInfoByUrl.get(url))
    .filter(Boolean)
    .map(p => p.desc)
    .filter(d => d && d.length > 15)
    .slice(0, 2);

  let lead = `This page is a topic hub for <strong>${slugToTitle(topic)}</strong> within the Crypto Moonboys Wiki.`;
  if (pageDescs.length > 0) {
    lead += ` Related content includes: &ldquo;${pageDescs[0].slice(0, 120).trim()}&rdquo;`;
  }
  return lead;
}

/**
 * For each recommended section, list source_pages from related_pages that are
 * plausibly relevant (all related_pages are used as general sources; each section
 * draws from the full related list since the expansion plan doesn't give per-section
 * page assignments).
 */
function buildSectionBlocks(action) {
  const relPages = action.related_pages || [];
  const sections = action.recommended_sections || [];

  return sections.map(heading => {
    // Assign source pages round-robin style across sections to avoid duplication
    // We use all related_pages as supporting sources for each section — they are the
    // real signal basis for this section existing.
    return {
      heading,
      purpose: sectionPurpose(action, heading),
      source_pages: relPages.slice(0, 5)
    };
  });
}

function sectionPurpose(action, heading) {
  const h = heading.toLowerCase();
  if (h.includes('overview') || h.includes('bridge overview')) {
    return 'Introduce the topic or bridge concept grounded in existing wiki content';
  }
  if (h.includes('context')) {
    return 'Describe the cluster context using signals from related wiki pages';
  }
  if (h.includes('cross-cluster') || h.includes('key cross')) {
    return 'List key entity connections linking the two clusters';
  }
  if (h.includes('related topics') || h.includes('related')) {
    return 'Surface related topic pages for navigation and discovery';
  }
  if (h.includes('key pages')) {
    return 'Index the most important pages within this topic area';
  }
  if (h.includes('related entities')) {
    return 'Surface entity-graph co-citations and adjacent entities';
  }
  if (h.includes('cross-topic')) {
    return 'Connect this topic to other clusters via link-graph edges';
  }
  return 'Support content grounded in existing related pages';
}

/**
 * Collect internal link targets from related_pages + entity graph.
 */
function buildInternalLinkTargets(action) {
  const relPages = action.related_pages || [];
  const targets = new Set(relPages);

  // Add entity-graph neighbours if available
  for (const url of relPages) {
    const graphEntry = entityGraph[url];
    if (graphEntry && Array.isArray(graphEntry.related_pages)) {
      for (const rp of graphEntry.related_pages.slice(0, 5)) {
        if (rp.target_url) targets.add(rp.target_url);
        else if (typeof rp === 'string') targets.add(rp);
      }
    }
  }

  return [...targets].slice(0, 10);
}

// ---------------------------------------------------------------------------
// Build draft objects
// ---------------------------------------------------------------------------

const ALLOWED_ACTION_TYPES = new Set(['create_topic_page', 'create_bridge_page']);

// Filter: high-confidence only, allowed action types only, sorted deterministically
const highConfidenceActions = (expansionPlan.actions || [])
  .filter(a => a.confidence === 'high' && ALLOWED_ACTION_TYPES.has(a.action_type))
  .sort((a, b) => {
    // Deterministic ordering: by action_type desc, then priority_score desc, then slug asc
    if (a.action_type !== b.action_type) return a.action_type < b.action_type ? -1 : 1;
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
    return (a.target_url_slug || '').localeCompare(b.target_url_slug || '');
  });

const drafts = highConfidenceActions.map(action => {
  const slug  = action.target_url_slug || action.target_topic.toLowerCase().replace(/\s+/g, '-');
  const targetPath = `/wiki/${slug}.html`;
  const relPath    = `wiki/${slug}.html`;
  const pageConflict = fileExists(relPath);

  const relatedPages = action.related_pages || [];
  const recommendedSections = action.recommended_sections || [];

  const draft = {
    title:          buildTitle(action),
    meta_description: buildMetaDescription(action),
    lead_paragraph: buildLeadParagraph(action),
    section_blocks: buildSectionBlocks(action),
    internal_link_targets: buildInternalLinkTargets(action)
  };

  const entry = {
    action_type:            action.action_type,
    target_topic:           action.target_topic,
    target_url_slug:        slug,
    target_path:            targetPath,
    confidence:             action.confidence,
    source_action_priority: action.priority_score,
    reasons:                action.reasons || [],
    related_pages:          relatedPages,
    recommended_keywords:   action.recommended_keywords || [],
    recommended_sections:   recommendedSections,
    draft
  };

  if (pageConflict) {
    entry.existing_page_conflict = true;
  }

  return entry;
});

// ---------------------------------------------------------------------------
// Summary counts
// ---------------------------------------------------------------------------

const summary = {
  total_drafts:       drafts.length,
  topic_page_drafts:  drafts.filter(d => d.action_type === 'create_topic_page').length,
  bridge_page_drafts: drafts.filter(d => d.action_type === 'create_bridge_page').length
};

const pageDrafts = {
  generated_at: new Date().toISOString(),
  summary,
  drafts
};

// ---------------------------------------------------------------------------
// Write js/page-drafts.json
// ---------------------------------------------------------------------------

const pageDraftsPath = path.join(ROOT, 'js', 'page-drafts.json');
fs.writeFileSync(pageDraftsPath, JSON.stringify(pageDrafts, null, 2) + '\n', 'utf8');
console.log(`js/page-drafts.json written (${drafts.length} drafts)`);

// ---------------------------------------------------------------------------
// Generate draft HTML pages for qualifying actions (max 5)
// ---------------------------------------------------------------------------

const MAX_HTML_PAGES = 5;

const qualifying = drafts.filter(d =>
  d.confidence === 'high' &&
  !d.existing_page_conflict &&
  d.related_pages.length >= 3 &&
  d.recommended_sections.length >= 3
);

const toGenerate = qualifying.slice(0, MAX_HTML_PAGES);
console.log(`${qualifying.length} draft(s) qualify for HTML generation; generating ${toGenerate.length}`);

for (const d of toGenerate) {
  const htmlPath = path.join(ROOT, 'wiki', `${d.target_url_slug}.html`);
  if (fs.existsSync(htmlPath)) {
    console.warn(`  SKIP (already exists): wiki/${d.target_url_slug}.html`);
    continue;
  }

  const html = buildDraftHtml(d);
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`  Created: wiki/${d.target_url_slug}.html`);
}

// ---------------------------------------------------------------------------
// HTML template builder
// ---------------------------------------------------------------------------

function buildDraftHtml(d) {
  const title = d.draft.title;
  const metaDesc = d.draft.meta_description;
  const slug = d.target_url_slug;
  const canonicalUrl = `https://crypto-moonboys.github.io/wiki/${slug}.html`;

  const sectionHtml = d.draft.section_blocks.map(block => {
    const sourcesHtml = block.source_pages.length > 0
      ? `<ul class="draft-source-list">\n${block.source_pages.map(p => {
          const info = pageInfoByUrl.get(p);
          const label = info ? info.title : p;
          return `        <li><a href="${p}">${escapeHtml(label)}</a></li>`;
        }).join('\n')}\n      </ul>`
      : '';

    return `
      <h2>${escapeHtml(block.heading)}</h2>
      <p class="draft-section-purpose"><em>${escapeHtml(block.purpose)}</em></p>
      ${sourcesHtml}`;
  }).join('\n');

  const internalLinksHtml = d.draft.internal_link_targets.length > 0
    ? `<ul>\n${d.draft.internal_link_targets.map(url => {
        const info = pageInfoByUrl.get(url);
        const label = info ? info.title : url;
        return `      <li><a href="${url}">${escapeHtml(label)}</a></li>`;
      }).join('\n')}\n    </ul>`
    : '<p>No internal link targets resolved.</p>';

  const keywordsHtml = d.recommended_keywords.length > 0
    ? d.recommended_keywords.map(k => `<code>${escapeHtml(k)}</code>`).join(' ')
    : '—';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(metaDesc)}">
  <meta name="robots" content="noindex, follow">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(metaDesc)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="https://crypto-moonboys.github.io/img/logo.svg">
  <title>${escapeHtml(title)}</title>
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="stylesheet" href="/css/wiki.css">
  <link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
</head>
<body>

<a class="skip-link" href="#content">Skip to content</a>

<header id="site-header" role="banner">
  <button class="hamburger" id="hamburger" aria-label="Toggle navigation" aria-expanded="false" aria-controls="sidebar">☰</button>
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
        <a href="/search.html"><span class="nav-icon">🔍</span> All Articles</a>
      </div>
    </div>
  </nav>

  <div id="main-wrapper">
    <main id="content" role="main">

      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="/index.html">Home</a>
        <span class="sep" aria-hidden="true">›</span>
        <span aria-current="page">${escapeHtml(title.replace(' — Crypto Moonboys Wiki', ''))}</span>
      </nav>

      <div class="draft-notice" role="note" style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:0.75rem 1rem;margin-bottom:1.5rem;font-size:0.95rem;">
        ⚠️ <strong>Draft page.</strong> This draft page was generated from the expansion plan and should be reviewed before publication.
      </div>

      <h1 class="page-title">${escapeHtml(title.replace(' — Crypto Moonboys Wiki', ''))}</h1>
      <div class="page-title-line" aria-hidden="true"></div>

      <div class="article-meta">
        <span class="article-badge">📝 Draft</span>
        <span class="meta-item">Action: ${escapeHtml(d.action_type)}</span>
        <span class="meta-item">Confidence: ${escapeHtml(d.confidence)}</span>
      </div>

      <nav id="toc" aria-label="Table of contents">
        <div class="toc-title">📋 Contents</div>
      </nav>

      <article class="wiki-content" data-entity-slug="${escapeHtml(slug)}">

  <p>${d.draft.lead_paragraph}</p>
${sectionHtml}

      <h2>Internal Links</h2>
      ${internalLinksHtml}

      <h2>Recommended Keywords</h2>
      <p>${keywordsHtml}</p>

      </article>

    </main>

    <aside id="right-sidebar" aria-label="Related information">
      <div class="sidebar-section">
        <div class="sidebar-heading">Draft Info</div>
        <div class="sidebar-body">
          <p><strong>Priority score:</strong> ${d.source_action_priority}</p>
          <p><strong>Type:</strong> ${escapeHtml(d.action_type)}</p>
          <p><strong>Clusters:</strong> ${escapeHtml((d.recommended_keywords || []).slice(0, 4).join(', '))}</p>
        </div>
      </div>
    </aside>
  </div>

</div>

<footer id="site-footer" role="contentinfo">
  <div class="footer-inner">
    <p>&copy; Crypto Moonboys Wiki</p>
  </div>
</footer>

<script src="/js/wiki.js"></script>
</body>
</html>
`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

console.log('generate-page-drafts.js complete ✅');
