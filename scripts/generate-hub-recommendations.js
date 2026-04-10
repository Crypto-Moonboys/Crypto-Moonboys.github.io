#!/usr/bin/env node
'use strict';

/**
 * generate-hub-recommendations.js
 * Phase 25: Hub Auto-Promotion Engine.
 *
 * Reads:
 *   js/wiki-index.json
 *   js/entity-graph.json
 *   js/link-graph.json
 *
 * Writes:
 *   js/hub-recommendations.json
 *
 * Identifies clusters suitable for new hub pages by:
 *   1. Grouping pages by shared tags using union-find
 *   2. Scoring clusters by rank_sum, cluster_size, and internal link density
 *   3. Filtering out clusters that already have an -ecosystem hub page
 *   4. Ranking candidates by composite hub_score
 *
 * Rules:
 *  - Deterministic: same inputs always produce same outputs
 *  - No external APIs, no randomness
 *  - Root-relative paths only
 *  - Does not modify any existing files
 */

const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..');
const WIKI_DIR = path.join(ROOT, 'wiki');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const MIN_CLUSTER_SIZE    = 4;    // ignore clusters smaller than this
const MIN_HUB_SCORE       = 50;   // minimum composite score to recommend
const MAX_RECOMMENDATIONS = 20;   // cap output list

// Tags that are too generic to anchor a meaningful hub page
const GENERIC_TAGS = new Set(['crypto', 'moonboys', 'wiki', 'the', 'free', 'radio']);

// ---------------------------------------------------------------------------
// Union-Find
// ---------------------------------------------------------------------------

function makeUF(keys) {
  const parent = Object.fromEntries(keys.map(k => [k, k]));
  function find(x) {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  }
  function union(a, b) { parent[find(a)] = find(b); }
  return { find, union };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanTitle(raw) {
  return String(raw || '')
    .replace(/\s+[—–-]\s+Crypto Moonboys Wiki$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

function slugFromUrl(url) {
  return (url || '').replace('/wiki/', '').replace('.html', '');
}

function hubSlugExists(anchorSlug) {
  return fs.existsSync(path.join(WIKI_DIR, `${anchorSlug}-ecosystem.html`));
}

// ---------------------------------------------------------------------------
// Load inputs
// ---------------------------------------------------------------------------

const wikiIndexRaw = readJson('js/wiki-index.json');
const entityGraph  = readJson('js/entity-graph.json');
const linkGraph    = readJson('js/link-graph.json');

const wikiPages = Array.isArray(wikiIndexRaw) ? wikiIndexRaw : Object.values(wikiIndexRaw);

// URL → page entry lookup
const pageLookup = Object.fromEntries(
  wikiPages.map(p => [(p.url || '').trim().replace(/\/$/, ''), p])
);

// Set of existing hub page anchor slugs
const existingHubSlugs = new Set(
  fs.readdirSync(WIKI_DIR)
    .filter(f => f.endsWith('-ecosystem.html'))
    .map(f => f.replace(/-ecosystem\.html$/, ''))
);

// ---------------------------------------------------------------------------
// Step 1: Build tag → pages index
// ---------------------------------------------------------------------------

const tagPages = {};  // tag → Set of urls

for (const page of wikiPages) {
  for (const tag of (page.tags || [])) {
    const t = tag.toLowerCase().trim();
    if (GENERIC_TAGS.has(t)) continue;
    if (!tagPages[t]) tagPages[t] = new Set();
    tagPages[t].add(page.url);
  }
}

// ---------------------------------------------------------------------------
// Step 2: Build page → tags index (non-generic)
// ---------------------------------------------------------------------------

const pageTags = {};  // url → string[]

for (const page of wikiPages) {
  pageTags[page.url] = (page.tags || [])
    .map(t => t.toLowerCase().trim())
    .filter(t => !GENERIC_TAGS.has(t));
}

// ---------------------------------------------------------------------------
// Step 3: Compute pairwise tag co-occurrence for union-find
// Pages that share a tag are unioned into the same cluster.
// We anchor clusters on the most prominent tag.
// ---------------------------------------------------------------------------

const pageUrls = wikiPages.map(p => p.url);
const uf       = makeUF(pageUrls);

// Union pages sharing at least one non-generic tag
for (const urls of Object.values(tagPages)) {
  const arr = Array.from(urls);
  for (let i = 1; i < arr.length; i++) {
    uf.union(arr[0], arr[i]);
  }
}

// Group pages by cluster root
const clusterMap = {};  // rootUrl → url[]

for (const url of pageUrls) {
  const root = uf.find(url);
  if (!clusterMap[root]) clusterMap[root] = [];
  clusterMap[root].push(url);
}

// ---------------------------------------------------------------------------
// Step 4: Score clusters
// ---------------------------------------------------------------------------

/**
 * Compute internal link density: fraction of member pages that link to
 * other members (using link-graph existing_outbound).
 */
function computeLinkDensity(memberUrls) {
  const memberSet = new Set(memberUrls);
  let internalLinks = 0;

  for (const url of memberUrls) {
    const lg = linkGraph[url];
    if (!lg) continue;
    for (const out of (lg.existing_outbound || [])) {
      if (memberSet.has(out)) internalLinks++;
    }
  }

  const maxPossible = memberUrls.length * (memberUrls.length - 1);
  return maxPossible > 0 ? internalLinks / maxPossible : 0;
}

/**
 * Compute entity-graph mutual connectivity within the cluster.
 */
function computeEntityDensity(memberUrls) {
  const memberSet = new Set(memberUrls);
  let mutualEdges = 0;

  for (const url of memberUrls) {
    const eg = entityGraph[url];
    if (!eg) continue;
    for (const rp of (eg.related_pages || [])) {
      if (memberSet.has(rp.target_url)) mutualEdges++;
    }
  }

  const maxPossible = memberUrls.length * (memberUrls.length - 1);
  return maxPossible > 0 ? mutualEdges / maxPossible : 0;
}

/**
 * Find the most representative tag for a cluster (tag shared by most members).
 */
function findAnchorTag(memberUrls) {
  const tagCount = {};
  for (const url of memberUrls) {
    for (const tag of (pageTags[url] || [])) {
      tagCount[tag] = (tagCount[tag] || 0) + 1;
    }
  }
  // Sort by count DESC, then tag ASC for determinism
  const sorted = Object.entries(tagCount).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  return sorted.length > 0 ? sorted[0][0] : null;
}

/**
 * Find the highest-ranked page in the cluster.
 */
function findAnchorPage(memberUrls) {
  let best = null;
  let bestScore = -1;
  for (const url of memberUrls) {
    const p = pageLookup[url];
    if (p && typeof p.rank_score === 'number' && p.rank_score > bestScore) {
      bestScore = p.rank_score;
      best = p;
    }
  }
  return best;
}

const recommendations = [];

for (const [root, memberUrls] of Object.entries(clusterMap)) {
  if (memberUrls.length < MIN_CLUSTER_SIZE) continue;

  const anchorTag  = findAnchorTag(memberUrls);
  if (!anchorTag) continue;

  const anchorPage = findAnchorPage(memberUrls);
  if (!anchorPage) continue;

  const anchorSlug = slugFromUrl(anchorPage.url);

  // Skip if an ecosystem hub already exists for this anchor
  if (existingHubSlugs.has(anchorSlug)) continue;
  if (existingHubSlugs.has(anchorTag)) continue;

  // Compute signals
  const rankSum      = memberUrls.reduce((sum, url) => {
    const p = pageLookup[url];
    return sum + (p && typeof p.rank_score === 'number' ? p.rank_score : 0);
  }, 0);

  const linkDensity   = computeLinkDensity(memberUrls);
  const entityDensity = computeEntityDensity(memberUrls);

  // Composite hub score: rank_sum contribution + size bonus + density bonus
  const hubScore = Math.round(
    (rankSum / memberUrls.length) * 0.4 +
    memberUrls.length * 3 +
    linkDensity * 100 +
    entityDensity * 50
  );

  if (hubScore < MIN_HUB_SCORE) continue;

  // Collect member summaries (sorted by rank_score DESC, then title ASC)
  const members = memberUrls
    .map(url => {
      const p = pageLookup[url];
      return {
        url,
        title:      p ? cleanTitle(p.title) : slugFromUrl(url),
        rank_score: p && typeof p.rank_score === 'number' ? p.rank_score : 0,
        category:   p ? (p.category || 'unknown') : 'unknown',
      };
    })
    .sort((a, b) => {
      if (b.rank_score !== a.rank_score) return b.rank_score - a.rank_score;
      return a.title.localeCompare(b.title);
    });

  // Suggested hub slug and URL
  const suggestedHubSlug = `${anchorSlug}-ecosystem`;
  const suggestedHubUrl  = `/wiki/${suggestedHubSlug}.html`;
  const hubAlreadyExists = fs.existsSync(path.join(WIKI_DIR, `${suggestedHubSlug}.html`));

  recommendations.push({
    cluster_id:          root.replace('/wiki/', '').replace('.html', ''),
    anchor_tag:          anchorTag,
    anchor_slug:         anchorSlug,
    anchor_title:        cleanTitle(anchorPage.title),
    anchor_url:          anchorPage.url,
    suggested_hub_slug:  suggestedHubSlug,
    suggested_hub_url:   suggestedHubUrl,
    hub_already_exists:  hubAlreadyExists,
    hub_score:           hubScore,
    cluster_size:        memberUrls.length,
    rank_sum:            rankSum,
    avg_rank_score:      Math.round(rankSum / memberUrls.length),
    link_density:        Math.round(linkDensity * 1000) / 1000,
    entity_density:      Math.round(entityDensity * 1000) / 1000,
    members:             members.slice(0, 15),
    reasons: [
      `cluster_size:${memberUrls.length}`,
      `avg_rank:${Math.round(rankSum / memberUrls.length)}`,
      `link_density:${Math.round(linkDensity * 100)}%`,
      `entity_density:${Math.round(entityDensity * 100)}%`,
    ],
  });
}

// Sort recommendations: hub_score DESC, then anchor_slug ASC
recommendations.sort((a, b) => {
  if (b.hub_score !== a.hub_score) return b.hub_score - a.hub_score;
  return a.anchor_slug.localeCompare(b.anchor_slug);
});

const topRecommendations = recommendations.slice(0, MAX_RECOMMENDATIONS);

// ---------------------------------------------------------------------------
// Build output
// ---------------------------------------------------------------------------

const output = {
  generated_at:   new Date().toISOString(),
  phase:          'phase_25',
  schema_version: '1.0',

  summary: {
    total_candidates:    recommendations.length,
    top_recommendations: topRecommendations.length,
    existing_hubs:       existingHubSlugs.size,
    min_cluster_size:    MIN_CLUSTER_SIZE,
    min_hub_score:       MIN_HUB_SCORE,
  },

  existing_hub_slugs: Array.from(existingHubSlugs).sort(),

  recommendations: topRecommendations,
};

const outPath = path.join(ROOT, 'js', 'hub-recommendations.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');

console.log('generate-hub-recommendations.js complete ✅');
console.log(`  Candidates: ${recommendations.length}`);
console.log(`  Top recommendations: ${topRecommendations.length}`);
console.log(`  Existing hubs: ${existingHubSlugs.size}`);
console.log('  Output: js/hub-recommendations.json');
