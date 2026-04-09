#!/usr/bin/env node
'use strict';

/**
 * generate-page-drafts.js
 * Phase 16: Controlled page builder from expansion plan.
 * Phase 18: Added provenance tracking fields.
 * Phase 19: Improved generated page quality (titles, descriptions, sections, keywords).
 * Phase 19 (lore expansion): Generates long-form lore pages with prose sections
 *   grounded in existing wiki page article content.
 *
 * Reads high-confidence create_topic_page and create_bridge_page actions
 * from js/expansion-plan.json and builds structured draft plans in
 * js/page-drafts.json. For qualifying drafts (no existing page conflict,
 * >=3 related_pages, >=3 recommended_sections) also writes real draft
 * HTML pages under wiki/ (max 5 new files).
 *
 * Each draft entry now includes provenance fields:
 *   generated_by_phase          - always "phase_16"
 *   phase_generated_html        - true if Phase 16 actually wrote the HTML file
 *   preexisting_before_generation - true only if a non-draft page existed before
 *                                  Phase 16 ran (genuine conflict)
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

// Markers that identify a Phase 16-generated draft HTML page.
const PHASE16_ROBOTS_MARKER = 'content="noindex, follow"';
const PHASE16_DRAFT_CLASS   = 'class="draft-notice"';

// ---------------------------------------------------------------------------
// Phase 19: Quality constants
// ---------------------------------------------------------------------------

/**
 * Proper display names for known cluster labels.
 * Grounded in repo wiki page titles and faction names.
 */
const CLUSTER_DISPLAY_NAMES = {
  'graffpunks':  'GraffPUNKS',
  'nfts':        'NFTs',
  'bitcoin':     'Bitcoin',
  'btc':         'BTC',
  'games':       'Games',
  'token':       'Crypto Tokens',
  'xrp':         'XRP',
  'kids':        'Kids',
  'metaverse':   'Metaverse',
  'battles':     'Battles',
  'graffiti':    'Graffiti',
  'kings':       'Kings',
  'defi':        'DeFi',
  'eth':         'ETH',
  'nft':         'NFT',
};

/**
 * Word-level substitutions for page title display only.
 * Only include unambiguous proper nouns / acronyms that are safe to substitute
 * within compound titles without changing meaning.
 */
const PAGE_TITLE_WORD_FIXES = {
  'graffpunks': 'GraffPUNKS',
  'nfts':       'NFTs',
  'btc':        'BTC',
  'xrp':        'XRP',
  'nbg':        'NBG',
  'gk':         'GK',
  'defi':       'DeFi',
  'eth':        'ETH',
  'nft':        'NFT',
};

/**
 * Noisy/weak keywords to filter from display output.
 * These are raw number fragments or stop words with little informational value.
 */
const NOISY_KEYWORDS = new Set([
  '24', '247', '1m', '2m', '5m', '10m',
  'non', 'radio', 'free', 'drop', 'via',
  'and', 'the', 'of', 'in', 'a', 'an',
]);

/**
 * Returns true if the HTML file at relPath was written by Phase 16's builder
 * (detected by noindex directive + draft-notice element).
 * Returns false if the file does not exist or is a real pre-existing page.
 */
function isPhase16GeneratedDraft(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return false;
  const html = fs.readFileSync(abs, 'utf8');
  return html.includes(PHASE16_ROBOTS_MARKER) && html.includes(PHASE16_DRAFT_CLASS);
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
// Phase 19 (lore expansion): Load full article prose from existing wiki pages
// ---------------------------------------------------------------------------

/**
 * Extracts clean plain-text prose from the <article> section of an HTML file.
 * Decodes basic HTML entities so the result is raw text safe to re-escape.
 * @param {string} absHtmlPath
 * @returns {string}
 */
function extractArticleText(absHtmlPath) {
  if (!fs.existsSync(absHtmlPath)) return '';
  try {
    const html = fs.readFileSync(absHtmlPath, 'utf8');
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const source = articleMatch ? articleMatch[1] : '';
    if (!source) return '';
    // Collect text from <p> tags (skip headings/lists to get clean prose only)
    const paragraphs = [];
    const pPat = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = pPat.exec(source)) !== null) {
      const text = m[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&ldquo;/g, '\u201c')
        .replace(/&rdquo;/g, '\u201d')
        .replace(/&mdash;/g, '\u2014')
        .replace(/&ndash;/g, '\u2013')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length > 30) paragraphs.push(text);
    }
    return paragraphs.join(' ');
  } catch (_) { return ''; }
}

/** @type {Map<string, string>} url -> full article prose text */
const pageFullTextByUrl = new Map();
for (const entry of wikiIndex) {
  if (!entry.url || !entry.url.startsWith('/wiki/')) continue;
  const absPath = path.join(ROOT, entry.url.slice(1));
  const text = extractArticleText(absPath);
  if (text) pageFullTextByUrl.set(entry.url, text);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Truncate a string at a word boundary at or before maxLen characters.
 * Appends "…" if truncated.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncateAtWordBoundary(str, maxLen) {
  if (str.length <= maxLen) return str;
  const cut = str.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

/**
 * Convert a slug like "games-graffpunks" to a display title "Games Graffpunks".
 * @param {string} slug
 * @returns {string}
 */
function slugToTitle(slug) {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Get the proper display name for a cluster label.
 * Falls back to capitalising the label if no mapping exists.
 * @param {string} cluster
 * @returns {string}
 */
function clusterDisplayName(cluster) {
  return CLUSTER_DISPLAY_NAMES[cluster] ||
    (cluster.charAt(0).toUpperCase() + cluster.slice(1));
}

/**
 * Strip the " — Crypto Moonboys Wiki" suffix from a wiki-index title
 * and clean up underscores so it reads as a human-friendly label.
 * Applies basic title casing. Does NOT substitute cluster display names
 * (those are only used for bridge page titles, not individual page labels).
 * @param {string} rawTitle
 * @returns {string}
 */
function cleanPageTitle(rawTitle) {
  const stripped = rawTitle
    .replace(/\s*[—–-]+\s*Crypto Moonboys Wiki\s*$/i, '')
    .replace(/_/g, ' ')
    .trim();

  // If already mixed-case (e.g. "Bitcoin (BTC)", "NFTs (Non-Fungible Tokens)"), return as-is.
  if (/[A-Z]/.test(stripped) && stripped.length > 3) return stripped;

  // Apply basic title casing with known acronym/proper-noun fixes
  return stripped
    .split(' ')
    .map(w => {
      const lower = w.toLowerCase();
      if (PAGE_TITLE_WORD_FIXES[lower]) return PAGE_TITLE_WORD_FIXES[lower];
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

/**
 * Clean a section heading by replacing raw cluster labels with proper display names.
 * e.g. "graffpunks context" → "GraffPUNKS Context"
 * e.g. "Bridge overview: graffpunks and token" → "Bridge Overview: GraffPUNKS and Crypto Tokens"
 * @param {string} heading
 * @param {string[]} clusters
 * @returns {string}
 */
function cleanSectionHeading(heading, clusters) {
  let h = heading;
  // Replace known cluster labels with display names
  for (const c of clusters) {
    const display = clusterDisplayName(c);
    if (display !== c) {
      h = h.replace(new RegExp(`\\b${c}\\b`, 'gi'), display);
    }
  }
  // Capitalise first letter of first word if lowercase
  return h.charAt(0).toUpperCase() + h.slice(1);
}

/**
 * Filter a keyword list to remove noisy/weak entries.
 * @param {string[]} keywords
 * @returns {string[]}
 */
function filterKeywords(keywords) {
  return keywords.filter(k => !NOISY_KEYWORDS.has(k.toLowerCase()));
}

/**
 * Build a clean display title for a bridge page ("A & B — Crypto Moonboys Wiki")
 * or a topic page ("Topic — Crypto Moonboys Wiki").
 *
 * For topic pages, prefer the wiki-index canonical title when available
 * (e.g. "NFTs (Non-Fungible Tokens)" instead of "Nfts").
 */
function buildTitle(action) {
  if (action.action_type === 'create_bridge_page') {
    const clusters = action.supporting_clusters || [];
    if (clusters.length >= 2) {
      const a = clusterDisplayName(clusters[0]);
      const b = clusterDisplayName(clusters[1]);
      return `${a} & ${b} — Crypto Moonboys Wiki`;
    }
  }
  const topic = action.target_topic || action.target_url_slug;
  const slug  = action.target_url_slug || topic.toLowerCase().replace(/\s+/g, '-');
  const mainUrl = `/wiki/${slug}.html`;
  const pageInfo = pageInfoByUrl.get(mainUrl);
  if (pageInfo && pageInfo.title) {
    const cleaned = cleanPageTitle(pageInfo.title);
    if (cleaned) return `${cleaned} — Crypto Moonboys Wiki`;
  }
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
    .filter(d => d && d.trim().length > 20);

  if (action.action_type === 'create_bridge_page') {
    const clusters = action.supporting_clusters || [];
    const a = clusterDisplayName(clusters[0] || '');
    const b = clusterDisplayName(clusters[1] || '');
    const base = `Connecting ${a} and ${b} in the Crypto Moonboys universe.`;
    if (descs.length > 0) {
      // Use a clean sentence from the strongest related page description.
      const snippet = truncateAtWordBoundary(descs[0], 110);
      return `${base} ${snippet}`;
    }
    return base;
  }

  // Topic page: prefer the wiki-index title of the target page itself
  const topic = action.target_topic || action.target_url_slug;
  const slug   = action.target_url_slug || topic.toLowerCase().replace(/\s+/g, '-');
  const mainInfo = pageInfoByUrl.get(`/wiki/${slug}.html`);
  if (mainInfo && mainInfo.desc && mainInfo.desc.trim().length > 20) {
    return truncateAtWordBoundary(mainInfo.desc, 150);
  }
  const cleanedTopic = mainInfo ? cleanPageTitle(mainInfo.title) : slugToTitle(topic);
  const base = `${cleanedTopic} — a topic hub for the Crypto Moonboys Wiki.`;
  if (descs.length > 0) {
    const snippet = truncateAtWordBoundary(descs[0], 110);
    return `${base} ${snippet}`;
  }
  return base;
}

/**
 * Build a rich multi-paragraph lead using full article text from related pages.
 * Returns HTML (safe to embed directly).
 */
function buildLeadParagraph(action) {
  const relPages = action.related_pages || [];
  const clusters = action.supporting_clusters || [];
  const keywords = filterKeywords(action.recommended_keywords || []);

  if (action.action_type === 'create_bridge_page') {
    const ca = clusterDisplayName(clusters[0] || 'cluster A');
    const cb = clusterDisplayName(clusters[1] || 'cluster B');

    // Primary page for each cluster
    const aPages = relPages.filter(url => url.includes((clusters[0] || '').toLowerCase()));
    const bPages = relPages.filter(url => url.includes((clusters[1] || '').toLowerCase()));

    const aUrl  = aPages[0] || relPages[0] || '';
    const bUrl  = bPages[0] || relPages[1] || aUrl;

    const aText = (aUrl && (pageFullTextByUrl.get(aUrl) || (pageInfoByUrl.get(aUrl) || {}).desc)) || '';
    const bText = (bUrl && bUrl !== aUrl && (pageFullTextByUrl.get(bUrl) || (pageInfoByUrl.get(bUrl) || {}).desc)) || '';

    const paras = [];

    if (aText) {
      paras.push(`<p>${escapeHtml(truncateAtWordBoundary(aText, 380))}</p>`);
    } else {
      paras.push(`<p><strong>${escapeHtml(ca)}</strong> is one of the defining factions of the Crypto Moonboys universe, shaping culture, economy, and conflict across Block Topia.</p>`);
    }

    if (bText) {
      paras.push(`<p>${escapeHtml(truncateAtWordBoundary(bText, 340))}</p>`);
    }

    // Bridge paragraph linking both clusters
    const keyStr = keywords.slice(0, 4).join(', ');
    let bridge = `<p>The intersection of <strong>${escapeHtml(ca)}</strong> and <strong>${escapeHtml(cb)}</strong> within the Crypto Moonboys universe is one of the most charged dynamics in Block Topia`;
    if (keyStr) bridge += `, where themes of ${escapeHtml(keyStr)} converge`;
    bridge += `. Together they represent a layered system of rebellion, identity, and economic power in the digital frontier.</p>`;
    paras.push(bridge);

    return paras.join('\n');
  }

  // Topic page
  const topic = action.target_topic || action.target_url_slug;
  const slug   = action.target_url_slug || topic.toLowerCase().replace(/\s+/g, '-');
  const mainUrl = `/wiki/${slug}.html`;
  const mainText = pageFullTextByUrl.get(mainUrl) || (pageInfoByUrl.get(mainUrl) || {}).desc || '';

  const paras = [];
  if (mainText) {
    paras.push(`<p>${escapeHtml(truncateAtWordBoundary(mainText, 550))}</p>`);
  } else {
    const mainInfo = pageInfoByUrl.get(mainUrl);
    const cleanedTopic = mainInfo ? cleanPageTitle(mainInfo.title) : slugToTitle(topic);
    paras.push(`<p><strong>${escapeHtml(cleanedTopic)}</strong> is a key topic in the Crypto Moonboys Wiki.</p>`);
  }

  for (const url of relPages.slice(1, 3)) {
    const text = pageFullTextByUrl.get(url) || (pageInfoByUrl.get(url) || {}).desc || '';
    if (text.length > 50) {
      paras.push(`<p>${escapeHtml(truncateAtWordBoundary(text, 400))}</p>`);
      break;
    }
  }

  return paras.join('\n');
}

/**
 * For each recommended section, list source_pages that are plausibly relevant.
 * For bridge pages: partition related pages by cluster membership so that each
 * context section gets pages primarily from its own cluster, giving each section
 * a differentiated source list.
 */
function buildSectionBlocks(action) {
  const relPages = action.related_pages || [];
  const sections = action.recommended_sections || [];
  const clusters = action.supporting_clusters || [];

  // For bridge pages with two clear clusters, partition related pages by cluster
  let clusterAPages = relPages.slice(0, 5);
  let clusterBPages = relPages.slice(0, 5);
  let bridgePages   = relPages.slice(0, 5);

  if (action.action_type === 'create_bridge_page' && clusters.length >= 2) {
    const ca = clusters[0].toLowerCase();
    const cb = clusters[1].toLowerCase();

    const aPages = relPages.filter(url => url.includes(ca));
    const bPages = relPages.filter(url => url.includes(cb));
    const other  = relPages.filter(url => !url.includes(ca) && !url.includes(cb));

    clusterAPages = aPages.length > 0 ? [...aPages, ...other].slice(0, 5) : relPages.slice(0, 5);
    clusterBPages = bPages.length > 0 ? [...bPages, ...other].slice(0, 5) : relPages.slice(0, 5);
    // Bridge overview uses the top page from each cluster then fills in
    const bridgeSet = new Set([
      ...(aPages.length > 0 ? [aPages[0]] : []),
      ...(bPages.length > 0 ? [bPages[0]] : []),
      ...relPages,
    ]);
    bridgePages = [...bridgeSet].slice(0, 5);
  }

  return sections.map(heading => {
    const h = heading.toLowerCase();
    let srcPages = relPages.slice(0, 5);

    if (action.action_type === 'create_bridge_page' && clusters.length >= 2) {
      const ca = clusters[0].toLowerCase();
      const cb = clusters[1].toLowerCase();
      if (h.includes('overview') || h.includes('bridge overview')) {
        srcPages = bridgePages;
      } else if (h.includes(`${ca} context`) || (h.includes('context') && h.includes(ca))) {
        srcPages = clusterAPages;
      } else if (h.includes(`${cb} context`) || (h.includes('context') && h.includes(cb))) {
        srcPages = clusterBPages;
      } else if (h.includes('cross-cluster') || h.includes('key cross') || h.includes('entities')) {
        // Entity connections: use a blend of A and B pages
        const aPage = clusterAPages[0];
        const bPage = clusterBPages[0];
        const blended = new Set([
          ...(aPage ? [aPage] : []),
          ...(bPage ? [bPage] : []),
          ...relPages,
        ]);
        srcPages = [...blended].slice(0, 5);
      } else {
        srcPages = relPages.slice(0, 5);
      }
    }

    return {
      heading: loreSectionHeading(heading, clusters),
      purpose: sectionPurpose(action, heading),  // use raw heading for purpose matching
      source_pages: srcPages
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
 * Upgrade generic expansion-plan section headings to lore-appropriate labels.
 * Uses cluster display names for "X context" headings.
 * @param {string} heading - raw heading from expansion plan
 * @param {string[]} clusters - supporting cluster labels
 * @returns {string}
 */
function loreSectionHeading(heading, clusters) {
  const h = heading.toLowerCase().trim();
  const ca = clusters[0] ? clusterDisplayName(clusters[0]) : '';
  const cb = clusters[1] ? clusterDisplayName(clusters[1]) : '';

  // "Bridge overview: X and Y" → "Overview"
  if (h.startsWith('bridge overview')) {
    return 'Overview';
  }
  // "X context" → "X in the Crypto Moonboys Universe"
  if (clusters[0] && h === `${clusters[0]} context`) {
    return `${ca} in the Crypto Moonboys Universe`;
  }
  if (clusters[1] && h === `${clusters[1]} context`) {
    return `${cb} in the Crypto Moonboys Universe`;
  }
  // "Key cross-cluster entities" → "Key Forces and Connections"
  if (h.includes('cross-cluster') || h.includes('key cross')) {
    return 'Key Forces and Connections';
  }
  // "Related topics" → "Explore Further"
  if (h === 'related topics' || h === 'related') {
    return 'Explore Further';
  }
  // Topic page standard sections
  if (h.includes('topic overview') || h.includes('overview')) return 'Overview';
  if (h.includes('key pages')) return 'Key Pages';
  if (h.includes('related entities')) return 'Related Entities';
  if (h.includes('cross-topic')) return 'Cross-Topic Connections';

  // Fallback: apply existing cleanSectionHeading logic
  return cleanSectionHeading(heading, clusters);
}

/**
 * Collect internal link targets from related_pages + entity graph.
 * Prefers diverse targets — deduplicates near-identical slug variants
 * (e.g. graffpunks-247-radio vs graffpunks-24-7-radio).
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

  // Deduplicate near-identical slugs: keep the shorter canonical form
  const seen = new Set();
  const deduped = [];
  for (const url of targets) {
    const slug = url.replace('/wiki/', '').replace('.html', '');
    // Normalise: strip trailing numbers / common variant suffixes for dedup key
    const normKey = slug.replace(/-\d+(-\d+)*$/, '').replace(/-radio$/, '').replace(/-programme$|-program$/, '-prog');
    if (!seen.has(normKey)) {
      seen.add(normKey);
      deduped.push(url);
    }
  }

  return deduped.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Phase 19 (lore expansion): Generate rich lore prose for a section block
// ---------------------------------------------------------------------------

/**
 * Build lore prose HTML for a section block.
 * Uses full article text from related wiki pages.
 * @param {object} block - {heading, purpose, source_pages}
 * @param {object} d - draft entry (for clusters context)
 * @returns {string} HTML string (safe to embed directly)
 */
function buildSectionProse(block, d) {
  const heading = block.heading.toLowerCase();
  const sourceUrls = block.source_pages || [];
  const clusters = d.supporting_clusters || [];

  // Build rich page objects for each source URL
  const pages = sourceUrls.map(url => {
    const info = pageInfoByUrl.get(url) || {};
    const fullText = pageFullTextByUrl.get(url) || info.desc || '';
    return {
      url,
      title: info.title ? cleanPageTitle(info.title) : url.replace('/wiki/', '').replace('.html', ''),
      text:  fullText,
    };
  }).filter(p => p.text && p.text.length > 20);

  if (pages.length === 0) {
    return '<p>See related pages in the Crypto Moonboys Wiki for more information on this topic.</p>';
  }

  const paras = [];

  const isOverview  = heading.includes('overview');
  const isContext   = heading.includes('context') || heading.includes('in the');
  const isEntities  = heading.includes('cross-cluster') || heading.includes('key cross') || heading.includes('entities') || heading.includes('forces') || heading.includes('connections');
  const isRelated   = heading.includes('related') || heading.includes('explore') || heading.includes('further') || heading.includes('adjacent');

  if (isOverview) {
    // pages[0] and [1] are typically the same as the lead paragraph content.
    // Use pages starting from index 2 for fresh context not already shown in the lead.
    const novelPages = pages.length > 2 ? pages.slice(2) : pages;
    for (const p of novelPages.slice(0, 2)) {
      if (p.text.length > 40) {
        paras.push(`<p>${escapeHtml(truncateAtWordBoundary(p.text, 480))}</p>`);
      }
    }
  } else if (isContext) {
    // Cluster context: 2 paragraphs from this cluster's pages
    const primary = pages[0];
    paras.push(`<p>${escapeHtml(truncateAtWordBoundary(primary.text, 520))}</p>`);
    if (pages.length > 1 && pages[1].text.length > 50) {
      paras.push(`<p>${escapeHtml(truncateAtWordBoundary(pages[1].text, 380))}</p>`);
    }
  } else if (isEntities) {
    // Entities / Key forces: each page gets a named paragraph with its description
    for (const p of pages.slice(0, 5)) {
      if (p.text.length > 30) {
        const snippet = truncateAtWordBoundary(p.text, 220);
        paras.push(
          `<p><a href="${p.url}"><strong>${escapeHtml(p.title)}</strong></a> \u2014 ${escapeHtml(snippet)}</p>`
        );
      }
    }
  } else if (isRelated) {
    // Related / explore: linked list with brief descriptions
    const items = pages.map(p => {
      const snippet = truncateAtWordBoundary(p.text, 130);
      return `<li><a href="${p.url}"><strong>${escapeHtml(p.title)}</strong></a>${snippet ? ` \u2014 ${escapeHtml(snippet)}` : ''}</li>`;
    }).join('\n');
    paras.push(`<ul class="lore-related-list">\n${items}\n</ul>`);
  } else {
    // Default: first two pages as prose paragraphs
    for (const p of pages.slice(0, 2)) {
      if (p.text.length > 30) {
        paras.push(`<p>${escapeHtml(truncateAtWordBoundary(p.text, 480))}</p>`);
      }
    }
  }

  return paras.join('\n');
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

  // Provenance: distinguish Phase 16-generated pages from genuinely pre-existing pages.
  const pageExists               = fileExists(relPath);
  const phase_generated_html     = isPhase16GeneratedDraft(relPath);
  // preexisting_before_generation = a real (non-draft) page was already there
  const preexisting_before_generation = pageExists && !phase_generated_html;
  // Only flag as a conflict when a non-draft page already existed
  const pageConflict = preexisting_before_generation;

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
    supporting_clusters:    action.supporting_clusters || [],
    recommended_keywords:   action.recommended_keywords || [],
    recommended_sections:   recommendedSections,
    // Provenance tracking (Phase 18)
    generated_by_phase:             'phase_16',
    phase_generated_html:           phase_generated_html,
    preexisting_before_generation:  preexisting_before_generation,
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
  // Use provenance field when available; fall back to existing_page_conflict for older entries.
  !(d.preexisting_before_generation === true || (!('preexisting_before_generation' in d) && d.existing_page_conflict === true)) &&
  d.related_pages.length >= 3 &&
  d.recommended_sections.length >= 3
);

const toGenerate = qualifying.slice(0, MAX_HTML_PAGES);
console.log(`${qualifying.length} draft(s) qualify for HTML generation; generating ${toGenerate.length}`);

for (const d of toGenerate) {
  const htmlPath = path.join(ROOT, 'wiki', `${d.target_url_slug}.html`);
  const relPath  = `wiki/${d.target_url_slug}.html`;
  if (fs.existsSync(htmlPath) && !isPhase16GeneratedDraft(relPath)) {
    // Only skip if this is a genuine pre-existing (non-draft) page — never overwrite those.
    console.warn(`  SKIP (pre-existing non-draft page): wiki/${d.target_url_slug}.html`);
    continue;
  }

  const existsBefore = fs.existsSync(htmlPath);
  const html = buildDraftHtml(d);
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`  ${existsBefore ? 'Updated' : 'Created'}: wiki/${d.target_url_slug}.html`);
}

// ---------------------------------------------------------------------------
// HTML template builder
// ---------------------------------------------------------------------------

function buildDraftHtml(d) {
  const title = d.draft.title;
  const metaDesc = d.draft.meta_description;
  const slug = d.target_url_slug;
  const canonicalUrl = `https://crypto-moonboys.github.io/wiki/${slug}.html`;

  // Rich lore-style section HTML (prose, not source lists)
  const sectionHtml = d.draft.section_blocks.map(block => {
    const prose = buildSectionProse(block, d);
    return `      <h2>${escapeHtml(block.heading)}</h2>
${prose}`;
  }).join('\n\n');

  // Contextual internal links with descriptions
  const internalLinksHtml = d.draft.internal_link_targets.length > 0
    ? `<ul class="lore-related-list">\n${d.draft.internal_link_targets.map(url => {
        const info  = pageInfoByUrl.get(url);
        const label = info ? cleanPageTitle(info.title) : url;
        const text  = pageFullTextByUrl.get(url) || (info && info.desc) || '';
        const snippet = text ? ` \u2014 ${escapeHtml(truncateAtWordBoundary(text, 120))}` : '';
        return `      <li><a href="${url}"><strong>${escapeHtml(label)}</strong></a>${snippet}</li>`;
      }).join('\n')}\n    </ul>`
    : '<p>No internal link targets resolved.</p>';

  // Use supporting_clusters for display; fall back to raw (unfiltered) recommended_keywords
  // so the sidebar always shows meaningful cluster labels rather than filtered-out terms.
  const rawClusters = d.supporting_clusters || [];
  const clustersDisplay = rawClusters.length > 0
    ? rawClusters.map(c => clusterDisplayName(c)).join(', ')
    : (d.recommended_keywords || []).slice(0, 4).join(', ') || '—';

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

${d.draft.lead_paragraph}

${sectionHtml}

      <h2>See Also</h2>
      ${internalLinksHtml}

      </article>

    </main>

    <aside id="right-sidebar" aria-label="Related information">
      <div class="sidebar-section">
        <div class="sidebar-heading">Draft Info</div>
        <div class="sidebar-body">
          <p><strong>Priority score:</strong> ${d.source_action_priority}</p>
          <p><strong>Type:</strong> ${escapeHtml(d.action_type)}</p>
          <p><strong>Clusters:</strong> ${escapeHtml(clustersDisplay)}</p>
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
