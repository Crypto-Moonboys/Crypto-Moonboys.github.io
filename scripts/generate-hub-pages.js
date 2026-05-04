#!/usr/bin/env node
'use strict';

/**
 * Phase 23 (fix) — generate-hub-pages.js
 *
 * Produces cluster hub pages from real graph signals ONLY.
 * Cluster detection uses mutual-adjacency union-find on entity-graph.json.
 * No keyword matching, no tag scanning, no manual cluster lists.
 *
 * Algorithm:
 *   1. Build directed adjacency from entity-graph.json (score >= SCORE_THRESHOLD)
 *   2. Build mutual edges: a↔b iff score(a→b) >= threshold AND score(b→a) >= threshold
 *   3. Union-find connected components
 *   4. Filter: size >= MIN_CLUSTER_SIZE
 *   5. Score: rank_sum = Σ rank_score(members)
 *   6. Keep top MAX_HUBS by rank_sum
 *   7. For each hub: anchor = highest rank_score member
 *      hub_slug = anchor_slug + "-ecosystem"
 *   8. Content synthesised from real wiki-index descriptions + graph data
 */

const fs   = require('fs');
const path = require('path');

const ROOT              = path.resolve(__dirname, '..');
const WIKI_DIR          = path.join(ROOT, 'wiki');
const WIKI_INDEX_PATH   = path.join(ROOT, 'js', 'wiki-index.json');
const ENTITY_GRAPH_PATH = path.join(ROOT, 'js', 'entity-graph.json');
const LINK_GRAPH_PATH   = path.join(ROOT, 'js', 'link-graph.json');

// ── tunables ────────────────────────────────────────────────────────────────

const SCORE_THRESHOLD   = 55;   // minimum entity-graph score for a mutual edge
const MIN_CLUSTER_SIZE  = 4;    // discard clusters smaller than this
const MAX_HUBS          = 5;    // generate at most this many hub pages
const MAX_HUB_MEMBERS   = 15;   // max cluster members shown on each hub page

// ── helpers ─────────────────────────────────────────────────────────────────

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function slugFromUrl(url) {
  return url.replace(/^\/wiki\//, '').replace(/\.html$/, '');
}

function urlToTitle(url) {
  return slugFromUrl(url).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function cleanDisplayTitle(title) {
  return String(title || '')
    .replace(/\s+[—–-]\s+Crypto Moonboys Wiki$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── graph-based cluster detection ───────────────────────────────────────────

/**
 * Build clusters using mutual-adjacency union-find.
 * Returns an array of { members: string[], anchor: string } objects,
 * sorted descending by cluster rank_sum, capped at MAX_HUBS.
 */
function buildGraphClusters(entityGraph, rankByUrl, linkGraph) {
  // Step 1: directed adjacency sets (score >= SCORE_THRESHOLD)
  const adjacency = new Map();
  for (const [srcUrl, data] of Object.entries(entityGraph)) {
    const neighbors = new Set();
    for (const rp of data.related_pages || []) {
      if ((rp.score || 0) >= SCORE_THRESHOLD) {
        neighbors.add(rp.target_url);
      }
    }
    adjacency.set(srcUrl, neighbors);
  }

  // Step 2: union-find over MUTUAL edges
  const parent = new Map();
  const rank   = new Map();

  const find = (x) => {
    if (!parent.has(x)) { parent.set(x, x); rank.set(x, 0); }
    if (parent.get(x) === x) return x;
    const root = find(parent.get(x));
    parent.set(x, root);
    return root;
  };

  const union = (a, b) => {
    const pa = find(a), pb = find(b);
    if (pa === pb) return;
    if ((rank.get(pa) || 0) < (rank.get(pb) || 0)) { parent.set(pa, pb); }
    else if ((rank.get(pa) || 0) > (rank.get(pb) || 0)) { parent.set(pb, pa); }
    else { parent.set(pb, pa); rank.set(pa, (rank.get(pa) || 0) + 1); }
  };

  const allUrls = new Set(adjacency.keys());
  for (const [src, neighbors] of adjacency) {
    for (const nbr of neighbors) {
      // Mutual edge: nbr must also strongly relate back to src
      if (adjacency.has(nbr) && adjacency.get(nbr).has(src)) {
        union(src, nbr);
      }
    }
  }

  // Step 3: collect connected components
  const groups = new Map();
  for (const url of allUrls) {
    const root = find(url);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(url);
  }

  // Step 4: filter and score each qualifying cluster
  const scored = [];
  for (const members of groups.values()) {
    // Exclude hub pages themselves from cluster membership consideration
    const coreMembers = members.filter(u => !u.includes('-ecosystem.html'));
    if (coreMembers.length < MIN_CLUSTER_SIZE) continue;

    const rankSum  = coreMembers.reduce((s, u) => s + (rankByUrl[u] || 0), 0);
    const avgRank  = rankSum / coreMembers.length;

    // Link density: inbound links from cluster members to cluster members
    let internalLinks = 0;
    if (linkGraph) {
      const memberSet = new Set(coreMembers);
      for (const m of coreMembers) {
        const data = linkGraph[m] || {};
        const out  = data.existing_outbound || [];
        internalLinks += out.filter(t => memberSet.has(t)).length;
      }
    }

    // Anchor = member with highest rank_score
    const anchor = coreMembers.reduce(
      (best, u) => (rankByUrl[u] || 0) > (rankByUrl[best] || 0) ? u : best,
      coreMembers[0]
    );

    scored.push({ members: coreMembers, anchor, rankSum, avgRank, internalLinks });
  }

  // Step 5: sort by rank_sum, keep top MAX_HUBS
  scored.sort((a, b) => b.rankSum - a.rankSum);
  return scored.slice(0, MAX_HUBS);
}

// ── hub metadata derivation ──────────────────────────────────────────────────

const CATEGORY_EMOJI = {
  characters:              '🎭',
  factions:                '⚔️',
  tokens:                  '🪙',
  concepts:                '💡',
  core:                    '📖',
  misc:                    '🌐',
  cryptocurrencies:        '₿',
  'nfts-digital-art':      '🖼️',
  gaming:                  '🎮',
  lore:                    '📜',
};

// Map wiki-index internal category names to valid /categories/*.html page slugs.
// Only the slugs listed here have real category pages on the site.
const CATEGORY_PAGE_SLUG = {
  factions:                 'lore',
  characters:               'lore',
  tokens:                   'cryptocurrencies',
  concepts:                 'concepts',
  core:                     'lore',
  misc:                     'lore',
  cryptocurrencies:         'cryptocurrencies',
  'nfts-digital-art':       'nfts-digital-art',
  gaming:                   'gaming',
  lore:                     'lore',
  technology:               'technology',
};

/**
 * Derive all hub page metadata from the cluster + real data.
 * No keywords, no manual labels — everything comes from the anchor entry.
 */
function deriveHubMeta(cluster, rankByUrl, byUrl, entityGraph) {
  const { members, anchor, rankSum, avgRank, internalLinks } = cluster;

  const anchorEntry = byUrl[anchor] || {};
  const anchorSlug  = slugFromUrl(anchor);
  // Prefer the real wiki-index title; only fall back to slug-derived when absent
  const anchorTitle = anchorEntry.title
    ? cleanDisplayTitle(anchorEntry.title)
    : urlToTitle(anchor);

  const hubSlug  = `${anchorSlug}-ecosystem`;
  // Guard: ensure label is never empty (prevents "The  contains…" in lead copy)
  const hubLabel = `${anchorTitle || urlToTitle(anchor)} Ecosystem`;

  // Emoji from anchor's category (data-derived, not keyword)
  // Optional: remap factions that are game/system/platform to a more precise category
  let category = anchorEntry.category || 'misc';
  if (category === 'factions') {
    const descLower = (anchorEntry.desc || '').toLowerCase();
    if (/\b(game|system|platform)\b/.test(descLower)) {
      category = 'core';
    }
  }
  const categorySlug = CATEGORY_PAGE_SLUG[category] || 'lore';
  const emoji        = CATEGORY_EMOJI[category] || '🌐';

  // Description from anchor's real desc
  const anchorDesc = anchorEntry.desc || '';
  const description = anchorDesc.length > 50
    ? `${anchorDesc.slice(0, 160).trimEnd()}… Cluster hub for ${members.length} related pages.`
    : `Ecosystem hub for ${hubLabel} — ${members.length} pages interconnected by graph relationships.`;

  // Top members sorted by rank_score
  const topMembers = [...members]
    .sort((a, b) => (rankByUrl[b] || 0) - (rankByUrl[a] || 0))
    .slice(0, MAX_HUB_MEMBERS);

  // Top graph connections from anchor (for "Connections" section)
  const anchorGraph = entityGraph[anchor] || {};
  const topConnections = (anchorGraph.related_pages || [])
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 6)
    .filter(r => byUrl[r.target_url]);   // only link to known pages

  // Category distribution for the overview section
  const catCounts = {};
  for (const m of members) {
    const cat = (byUrl[m] || {}).category || 'misc';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  }
  const catSummary = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${n} ${c}`)
    .join(', ');

  return {
    slug: hubSlug,
    label: hubLabel,
    emoji,
    category,
    anchorSlug,
    anchorTitle,
    anchorEntry,
    anchorDesc,
    description,
    topMembers,
    topConnections,
    allMembers: members,
    memberCount: members.length,
    rankSum,
    avgRank,
    internalLinks,
    catSummary,
    categorySlug,
  };
}

// ── content generation from real data ────────────────────────────────────────

/**
 * Build structured page sections from real repo data.
 * No invented prose — everything is derived from descriptions and graph data.
 */
function buildContent(meta, byUrl) {
  const {
    anchorTitle, anchorDesc, anchorEntry, topMembers, topConnections,
    memberCount, catSummary, rankSum, avgRank, internalLinks,
    anchorSlug, label: hubLabel,
  } = meta;

  // ── Lead paragraphs ──
  const anchorLink = `<a href="/wiki/${escapeHtml(anchorSlug)}.html">${escapeHtml(anchorTitle)}</a>`;

  // Trim desc to a clean sentence boundary; avoid mid-word truncation
  let descSnippet = '';
  if (anchorDesc.length > 60) {
    const shortened = anchorDesc.slice(0, 200);
    // Prefer to end at the LAST sentence boundary (period + space or period at end)
    const lastDotSpace = shortened.lastIndexOf('. ');
    const lastFullStop = lastDotSpace >= 0
      ? lastDotSpace
      : (shortened.endsWith('.') ? shortened.length - 1 : -1);
    if (lastFullStop > 40) {
      descSnippet = shortened.slice(0, lastFullStop + 1);   // include the period
    } else if (anchorDesc.length <= 200) {
      // Short desc that fits entirely — use as-is; no word-boundary cut needed.
      // Note: if the source meta description is itself truncated mid-word (data quality
      // issue in the wiki page), the incomplete word will appear here.
      descSnippet = shortened.replace(/[,;:\s]+$/, '');
    } else {
      // Long desc without a sentence boundary — trim to last complete word, add ellipsis
      const lastSpace = shortened.lastIndexOf(' ');
      const base = lastSpace > 30 ? shortened.slice(0, lastSpace) : shortened;
      descSnippet = base.replace(/[,;:\s]+$/, '') + '…';
    }
  }

  // Ensure descSnippet closes with sentence-ending punctuation before joining with "This ecosystem hub"
  const snippetForJoin = descSnippet.endsWith('.')
    ? descSnippet
    : descSnippet.replace(/…$/, '').replace(/[,;:\s]+$/, '') + '.';

  const lead1 = snippetForJoin.length > 1
    ? `${anchorLink} — ${snippetForJoin} This ecosystem hub maps the ${memberCount} pages most strongly connected to ${escapeHtml(anchorTitle)} by graph relationship and content signals.`
    : `This ecosystem hub maps the ${memberCount} pages most strongly connected to ${anchorLink} by graph relationship and content signals.`;

  // Second lead: cluster stats in plain language
  const avgRankRounded = Math.round(avgRank);
  const lead2 = `The ${escapeHtml(hubLabel)} contains ${memberCount} pages with an average rank score of ${avgRankRounded}, ${internalLinks} internal cross-links, and a combined authority score of ${rankSum}. Cluster members span: ${escapeHtml(catSummary)}.`;

  const leadParagraphs = [lead1, lead2];

  // ── Section: Ecosystem Overview ──
  const topThree = topMembers.slice(0, 3).map(u => {
    const e = byUrl[u] || {};
    const t = cleanDisplayTitle(e.title || urlToTitle(u));
    const slug = slugFromUrl(u);
    return `<a href="/wiki/${escapeHtml(slug)}.html">${t}</a>`;
  });
  const overviewBody = [
    `This cluster emerged from the entity graph by mutual-adjacency clustering at a graph score threshold of ${SCORE_THRESHOLD}. ` +
    `Its ${memberCount} members share the strongest relationship signals in the wiki, measured by co-citation strength, link overlap, rank score, and content depth.`,
    `The three highest-ranked members are ${topThree.join(', ')}, which collectively anchor the cluster\'s authority. ` +
    `With ${internalLinks} internal cross-links between cluster pages and an average rank score of ${avgRankRounded}, ` +
    `this ecosystem represents one of the most densely connected topic groups in the wiki.`,
  ];

  // ── Section: Key Entities ──
  const keyEntityItems = topMembers.slice(0, 8).map(u => {
    const e    = byUrl[u] || {};
    const t    = cleanDisplayTitle(e.title || urlToTitle(u));
    const slug = slugFromUrl(u);
    // Skip fragmentary descriptions (< 40 chars); truncate long ones at word boundary
    const rawDesc   = e.desc || '';
    let desc = '';
    if (rawDesc.length >= 40) {
      const cut = rawDesc.slice(0, 120);
      const lastSpace = cut.lastIndexOf(' ');
      desc = rawDesc.length > 120
        ? (lastSpace > 60 ? cut.slice(0, lastSpace) : cut).replace(/[,;:\s]+$/, '') + '…'
        : rawDesc;
    }
    const rankScore = e.rank_score || 0;
    return desc
      ? `<a href="/wiki/${escapeHtml(slug)}.html">${t}</a> (rank: ${rankScore}) — ${desc}`
      : `<a href="/wiki/${escapeHtml(slug)}.html">${t}</a> (rank: ${rankScore})`;
  });
  const keyEntitiesBody = [
    `The following pages are the strongest members of this cluster, ordered by rank score:`,
    `<ul class="hub-entity-list">${keyEntityItems.map(i => `<li>${i}</li>`).join('')}</ul>`,
  ];

  // ── Section: Graph Connections ──
  let connBody;
  if (topConnections.length > 0) {
    const connItems = topConnections.map(r => {
      const e    = byUrl[r.target_url] || {};
      const t    = cleanDisplayTitle(e.title || urlToTitle(r.target_url));
      const slug = slugFromUrl(r.target_url);
      return `<a href="/wiki/${escapeHtml(slug)}.html">${t}</a> (graph score: ${r.score || 0})`;
    });
    connBody = [
      `The following pages have the strongest direct graph connections to ${escapeHtml(anchorTitle)}, ` +
      `based on entity-graph relationship scores:`,
      `<ul class="hub-entity-list">${connItems.map(i => `<li>${i}</li>`).join('')}</ul>`,
    ];
  } else {
    connBody = [`Graph connection data is derived from entity-graph.json relationship scores.`];
  }

  return {
    leadParagraphs,
    sections: [
      { id: 'overview',     title: 'Ecosystem Overview',  body: overviewBody },
      { id: 'key-entities', title: 'Key Entities',        body: keyEntitiesBody },
      { id: 'connections',  title: 'Graph Connections',   body: connBody },
    ],
  };
}

// ── HTML generation ──────────────────────────────────────────────────────────

function memberListHtml(meta, byUrl) {
  const { topMembers, allMembers, memberCount } = meta;
  const items = topMembers.map(u => {
    const entry = byUrl[u] || {};
    // Titles from wiki-index are already HTML-encoded by the generator.
    // cleanDisplayTitle only strips the suffix and underscores — preserving encoding.
    const rawTitle    = entry.title || '';
    const displayTitle = rawTitle ? cleanDisplayTitle(rawTitle) : escapeHtml(urlToTitle(u));
    // desc is already HTML-safe; skip if too short (source fragment), truncate at word boundary
    const rawDesc = entry.desc || '';
    let shortDesc = '';
    if (rawDesc.length >= 40) {
      if (rawDesc.length > 110) {
        const cut = rawDesc.slice(0, 110);
        const lastSpace = cut.lastIndexOf(' ');
        shortDesc = (lastSpace > 60 ? cut.slice(0, lastSpace) : cut).replace(/[,;:\s]+$/, '') + '…';
      } else {
        shortDesc = rawDesc;
      }
    }
    return (
      `        <li class="hub-member-item">\n` +
      `          <a href="${escapeHtml(u)}" class="hub-member-link">${displayTitle}</a>` +
      (shortDesc ? `<span class="hub-member-desc"> — ${shortDesc}</span>` : '') +
      `\n        </li>`
    );
  });
  const note = memberCount > MAX_HUB_MEMBERS
    ? `\n      <p class="hub-member-note">Showing ${MAX_HUB_MEMBERS} of ${memberCount} cluster members (ordered by rank score).</p>`
    : '';
  return `      <ul class="hub-member-list">\n${items.join('\n')}\n      </ul>${note}`;
}

function generateHubPageHtml(meta, byUrl, allHubMetas) {
  const { slug, label, emoji, category, categorySlug, description, leadParagraphs, sections } = meta;
  const { membersHtml } = meta._html;

  const pageUrl    = `https://crypto-moonboys.github.io/wiki/${slug}.html`;
  const fullTitle  = `${label} — Crypto Moonboys Wiki`;
  const entitySlug = slug.replace(/-/g, '_');
  const catLabel   = category.charAt(0).toUpperCase() + category.slice(1);

  const leadHtml = leadParagraphs
    .map(p => `          <p class="lead-paragraph">${p}</p>`)
    .join('\n');

  const sectionHtmlParts = sections.map(sec => {
    const bodyHtml = sec.body
      .map(p => {
        // Use <div> wrapper when content contains block-level elements (e.g. <ul>)
        // to avoid generating invalid <p><ul>…</ul></p> markup.
        const tag = /<[uod]l[ >]/i.test(p) ? 'div' : 'p';
        return `          <${tag} class="lore-paragraph">${p}</${tag}>`;
      })
      .join('\n');
    return (
      `        <section class="wiki-section">\n` +
      `          <h2 id="${escapeHtml(sec.id)}">${escapeHtml(sec.title)}</h2>\n` +
      bodyHtml +
      `\n        </section>`
    );
  });

  const tocLinks = [
    ...sections.map(s => `<a href="#${s.id}" class="toc-link">${escapeHtml(s.title)}</a>`),
    '<a href="#cluster-members" class="toc-link">Cluster Members</a>',
  ].map(l => `          <li>${l}</li>`).join('\n');

  // Sidebar hub links — derived from actually-generated hubs
  const sidebarHubLinks = allHubMetas.map(m => {
    const active = m.slug === slug ? ' aria-current="page"' : '';
    return `        <a href="/wiki/${escapeHtml(m.slug)}.html"${active}><span class="nav-icon">${m.emoji}</span> ${escapeHtml(m.anchorTitle)}</a>`;
  }).join('\n');

  // Footer hub links
  const footerHubLinks = allHubMetas.map(m =>
    `<li><a href="/wiki/${escapeHtml(m.slug)}.html">${escapeHtml(m.anchorTitle)}</a></li>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow">
  <meta property="og:title" content="${escapeHtml(fullTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta property="og:image" content="https://crypto-moonboys.github.io/img/CRYPTO-MOONBOYS-BITCOIN-LOGO.png">
  <title>${escapeHtml(fullTitle)}</title>
  <link rel="stylesheet" href="/css/wiki.css">
  <link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
  <style>
    .wiki-section { margin: 1.6em 0; }
    .lore-paragraph { line-height: 1.75; margin: 0 0 1em 0; }
    .lead-paragraph { font-size: 1.06em; line-height: 1.8; margin: 0 0 1em 0; }
    .hub-badge {
      display: inline-block;
      padding: 0.15em 0.6em;
      border-radius: 4px;
      background: rgba(91,140,255,0.15);
      color: #5b8cff;
      font-size: 0.85em;
      font-weight: 600;
      margin-bottom: 0.6em;
    }
    .hub-member-list { list-style: none; padding: 0; margin: 0; }
    .hub-member-item { padding: 0.5em 0; border-bottom: 1px solid rgba(255,255,255,0.07); }
    .hub-member-link { font-weight: 600; color: #5b8cff; }
    .hub-member-desc { color: #aaa; font-size: 0.93em; }
    .hub-member-note { color: #888; font-size: 0.9em; margin-top: 0.5em; }
    .hub-entity-list { margin: 0.4em 0 0.4em 1.4em; }
    .hub-entity-list li { margin-bottom: 0.35em; line-height: 1.65; }
  </style>
</head>
<body>

<a class="skip-link" href="#content">Skip to content</a>

<header id="site-header" role="banner">
  <button class="hamburger" id="hamburger" aria-label="Toggle navigation" aria-expanded="false" aria-controls="sidebar">☰</button>
  <a href="/index.html" class="site-logo" aria-label="The Crypto Moonboys GK Wiki home">
    <img src="/img/CRYPTO-MOONBOYS-BITCOIN-LOGO.png" alt="" aria-hidden="true">
    <span>
      <span class="logo-text">🌙 The Crypto Moonboys GK Wiki</span>
      <span class="logo-sub">Living Web3 Wiki</span>
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
    <a href="/articles.html">All Articles</a>
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
    <main id="content" role="main">

      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="/index.html">Home</a>
        <span class="sep" aria-hidden="true">›</span>
        <a href="/categories/${escapeHtml(categorySlug)}.html">${escapeHtml(catLabel)}</a>
        <span class="sep" aria-hidden="true">›</span>
        <span aria-current="page">${escapeHtml(label)}</span>
      </nav>

      <h1 class="page-title">${emoji} ${escapeHtml(label)}</h1>
      <div class="page-title-line" aria-hidden="true"></div>

      <div class="article-meta">
        <span class="article-badge">${emoji} Cluster Hub</span>
        <span class="meta-item">📅 Last updated: April 2026</span>
        <span class="meta-item">📂 <a href="/categories/${escapeHtml(categorySlug)}.html">${escapeHtml(catLabel)}</a></span>
        <span class="meta-item hub-badge">🌐 Graph-Derived</span>
      </div>

      <nav id="toc" aria-label="Table of contents">
        <div class="toc-title">📋 Contents</div>
        <ol class="toc-list">
${tocLinks}
        </ol>
      </nav>

      <article class="wiki-content" data-entity-slug="${escapeHtml(entitySlug)}">

${leadHtml}

${sectionHtmlParts.join('\n\n')}

        <section class="wiki-section">
          <h2 id="cluster-members">Cluster Members</h2>
          <p class="lore-paragraph">All pages in this cluster, ordered by rank score. Membership is determined by mutual graph adjacency (entity-graph score ≥ ${SCORE_THRESHOLD}):</p>
${membersHtml}
        </section>

        <div id="bible-content"></div>

      </article>

      <div class="category-tags" aria-label="Article categories">
        <span class="cat-label">Categories:</span>
        <a href="/categories/${escapeHtml(categorySlug)}.html">${escapeHtml(catLabel)}</a>
      </div>

    </main>

    <footer id="site-footer" role="contentinfo">
      <div class="footer-inner">
        <div class="footer-col"><h4>🌙 The Crypto Moonboys GK Wiki</h4><p>Crypto Moonboys is a living Web3 wiki.</p></div>
        <div class="footer-col"><h4>Explore</h4><ul><li><a href="/index.html">Main Page</a></li><li><a href="/categories/index.html">Categories</a></li><li><a href="/articles.html">All Articles</a></li><li><a href="/about.html">About</a></li></ul></div>
        <div class="footer-col"><h4>🌐 Hubs</h4><ul>${footerHubLinks}</ul></div>
      </div>
      <div class="footer-bottom">
        <p>© 2026 Crypto Moonboys Wiki · Not financial advice.</p>
        <p><span class="no-login-note">🔒 No sign-up · No login · Bot-maintained</span></p>
      </div>
    </footer>
  </div>
</div>

<button id="back-to-top" aria-label="Back to top">&#8593;</button>
<script src="/js/wiki.js"></script>
<script src="/js/bible-loader.js"></script>
</body>
</html>
`;
}

// ── main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('Phase 23 fix — graph-derived cluster hub page generator');
  console.log(`  Score threshold: ${SCORE_THRESHOLD}, min cluster size: ${MIN_CLUSTER_SIZE}, max hubs: ${MAX_HUBS}`);

  if (!fs.existsSync(ENTITY_GRAPH_PATH)) {
    console.error(`  ERROR: entity-graph.json not found at ${ENTITY_GRAPH_PATH}`);
    process.exit(1);
  }

  const entityGraph = readJson(ENTITY_GRAPH_PATH);
  const wikiIndex   = readJson(WIKI_INDEX_PATH);
  const linkGraph   = fs.existsSync(LINK_GRAPH_PATH) ? readJson(LINK_GRAPH_PATH) : null;

  console.log(`  Loaded entity-graph: ${Object.keys(entityGraph).length} pages`);
  console.log(`  Loaded wiki-index: ${wikiIndex.length} entries`);

  // Build lookup maps
  const byUrl       = {};
  const rankByUrl   = {};
  for (const e of wikiIndex) {
    byUrl[e.url]     = e;
    rankByUrl[e.url] = e.rank_score || 0;
  }

  // ── Step 1: graph-based cluster detection ──────────────────────────────────
  const clusters = buildGraphClusters(entityGraph, rankByUrl, linkGraph);
  console.log(`\n  Clusters found: ${clusters.length}`);
  for (const c of clusters) {
    console.log(`    ${c.members.length} members, anchor: ${c.anchor} (rank=${rankByUrl[c.anchor] || 0})`);
  }

  if (clusters.length === 0) {
    console.log('  No qualifying clusters found. Exiting without generating hub pages.');
    return;
  }

  // ── Step 2: derive hub metadata from graph data ────────────────────────────
  const hubMetas = clusters.map(c => {
    const meta = deriveHubMeta(c, rankByUrl, byUrl, entityGraph);
    const content = buildContent(meta, byUrl);
    meta.leadParagraphs = content.leadParagraphs;
    meta.sections       = content.sections;
    meta._html          = { membersHtml: memberListHtml(meta, byUrl) };
    return meta;
  });

  // ── Step 3: remove old hub pages that are no longer graph-supported ─────────
  const validHubSlugs = new Set(hubMetas.map(m => m.slug));
  const wikiFiles = fs.readdirSync(WIKI_DIR);
  let removedCount = 0;
  for (const f of wikiFiles) {
    if (!f.endsWith('-ecosystem.html')) continue;
    const slug = f.replace('.html', '');
    if (!validHubSlugs.has(slug)) {
      const filePath = path.join(WIKI_DIR, f);
      fs.unlinkSync(filePath);
      console.log(`  🗑  Removed stale hub: wiki/${f}`);
      removedCount++;
    }
  }
  if (removedCount === 0) console.log('  No stale hub pages to remove.');

  // ── Step 4: generate hub pages ─────────────────────────────────────────────
  const generated = [];
  for (const meta of hubMetas) {
    const outPath = path.join(WIKI_DIR, `${meta.slug}.html`);
    const html    = generateHubPageHtml(meta, byUrl, hubMetas);
    fs.writeFileSync(outPath, html, 'utf8');
    console.log(`  ✅ Written: wiki/${meta.slug}.html (${meta.memberCount} cluster members)`);
    generated.push(meta.slug);
  }

  console.log(`\nGenerated ${generated.length} graph-derived hub page(s): ${generated.join(', ')}`);
  console.log('\nNext steps:');
  console.log('  node scripts/generate-wiki-index.js');
  console.log('  node scripts/generate-sitemap.js');
  console.log('  node scripts/generate-site-stats.js');
  console.log('  node scripts/generate-entity-map.js');
  console.log('  node scripts/validate-generated-assets.js');
  console.log('  node scripts/smoke-test.js');
}

main();
