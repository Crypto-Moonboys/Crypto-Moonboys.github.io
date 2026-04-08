#!/usr/bin/env node
/**
 * generate-entity-graph.js
 *
 * Builds js/entity-graph.json: for each /wiki page, a ranked list of
 * related pages with deterministic scores and human-readable reasons.
 *
 * Inputs:
 *   js/entity-map.json   – entity metadata (canonical_url, category, tags)
 *   js/wiki-index.json   – per-page rank signals and link_score
 *   js/link-map.json     – per-page existing_links arrays
 *   js/link-graph.json   – per-page inbound/outbound link counts (graph centrality)
 *
 * Output shape (js/entity-graph.json):
 * {
 *   "/wiki/page.html": {
 *     "related_pages": [
 *       {
 *         "target_url": "/wiki/other.html",
 *         "score": 123,
 *         "reasons": ["same_category:factions", ...],
 *         "rank_score_boost": 7,
 *         "authority_score_boost": 5,
 *         "graph_centrality_boost": 2
 *       },
 *       ...
 *     ]
 *   },
 *   ...
 * }
 *
 * Scoring dimensions (in priority order):
 *   1. same_faction       – same category value (+40)
 *   2. same_storyline     – shared event/storyline tag (+20 each)
 *   3. same_location      – shared location tag (+15 each)
 *   4. shared_entities    – shared non-generic content tag (+8 each)
 *   5. same_category      – category match (covered by #1 above; retained
 *                           as explicit reason label when applicable)
 *   6. link_overlap       – shared existing-link URLs (+3 each)
 *   7. rank_score_boost   – target page rank_score quality (+0–10)
 *   8. authority_score_boost – target inbound link authority (+0–15)
 *   9. graph_centrality_boost – target graph centrality via inbound count (+0–8)
 *
 * Rules:
 *   - No self-links
 *   - No duplicates
 *   - Authority boosts only applied when base relationship score > 0
 *   - Output is deterministic: sorted by score DESC, then target_url ASC
 *
 * Usage: node scripts/generate-entity-graph.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT            = path.resolve(__dirname, '..');
const ENTITY_MAP_PATH = path.join(ROOT, 'js', 'entity-map.json');
const WIKI_INDEX_PATH = path.join(ROOT, 'js', 'wiki-index.json');
const LINK_MAP_PATH   = path.join(ROOT, 'js', 'link-map.json');
const LINK_GRAPH_PATH = path.join(ROOT, 'js', 'link-graph.json');
const OUTPUT_PATH     = path.join(ROOT, 'js', 'entity-graph.json');

// ---------------------------------------------------------------------------
// Tag classification
// ---------------------------------------------------------------------------

// Tags that carry no signal – exclude from all content scoring
const GENERIC_TAGS = new Set([
  'crypto', 'moonboys', 'wiki', 'the', 'a', 'of', 'and', 'in', 'is',
]);

// Tags that indicate a shared event / storyline
const EVENT_TAGS = new Set([
  'wars', 'war', 'battle', 'battles', 'siege', 'blast', 'fork', 'drop',
  'launch', 'party', 'mission', 'game', 'games', 'event', 'arena',
  'uprising', 'raid', 'heist', 'tournament', 'season',
]);

// Tags that indicate a shared location / world-space
const LOCATION_TAGS = new Set([
  'topia', 'block', 'metaverse', 'zone', 'city', 'district', 'realm',
  'grid', 'nexus', 'hub', 'vault', 'compound',
]);

// Scoring weights
const SCORE_SAME_CATEGORY  = 40;
const SCORE_EVENT_TAG      = 20;
const SCORE_LOCATION_TAG   = 15;
const SCORE_ENTITY_TAG     = 8;
const SCORE_LINK_OVERLAP   = 3;

// Authority boost caps (applied only when base relationship score > 0)
// rank_score_boost: floor(rank_score / 100), capped at 10
//   e.g. rank 749 → +7, rank 200 → +2, rank 100 → +1
const RANK_BOOST_DIVISOR   = 100;
const RANK_BOOST_MAX       = 10;

// authority_score_boost: floor(inbound_count / 10), capped at 15
//   rewards pages that many other pages already link to
const AUTHORITY_BOOST_DIVISOR = 10;
const AUTHORITY_BOOST_MAX     = 15;

// graph_centrality_boost: tiered by link-graph inbound_count
//   50+ → 8,  20–49 → 5,  5–19 → 2,  0–4 → 0
const CENTRALITY_TIERS = [
  { threshold: 50, boost: 8 },
  { threshold: 20, boost: 5 },
  { threshold: 5,  boost: 2 },
  { threshold: 0,  boost: 0 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return a Set of non-generic tags for a page (from entity-map entry).
 */
function contentTags(entityEntry) {
  const result = new Set();
  for (const t of (entityEntry.tags || [])) {
    if (!GENERIC_TAGS.has(t)) result.add(t);
  }
  return result;
}

/**
 * Compute score + reasons for a (source, target) pair.
 * tgtBoosts contains pre-computed authority boost fields for the target URL.
 * Returns null if base relationship score === 0 (no organic relationship).
 */
function computeRelationship(srcEntry, tgtEntry, srcLinks, tgtLinks, tgtBoosts) {
  let score = 0;
  const reasons = [];

  // 1 / 5 – same category (covers "same faction" and "same category")
  if (srcEntry.category && srcEntry.category === tgtEntry.category) {
    score += SCORE_SAME_CATEGORY;
    reasons.push(`same_category:${srcEntry.category}`);
  }

  const srcTags = contentTags(srcEntry);
  const tgtTags = contentTags(tgtEntry);

  // 2 – same storyline / event
  for (const t of srcTags) {
    if (EVENT_TAGS.has(t) && tgtTags.has(t)) {
      score += SCORE_EVENT_TAG;
      reasons.push(`same_event_tag:${t}`);
    }
  }

  // 3 – same location
  for (const t of srcTags) {
    if (LOCATION_TAGS.has(t) && tgtTags.has(t)) {
      score += SCORE_LOCATION_TAG;
      reasons.push(`same_location_tag:${t}`);
    }
  }

  // 4 – shared entity / character tags (non-generic, non-event, non-location)
  for (const t of srcTags) {
    if (!EVENT_TAGS.has(t) && !LOCATION_TAGS.has(t) && tgtTags.has(t)) {
      score += SCORE_ENTITY_TAG;
      reasons.push(`shared_tag:${t}`);
    }
  }

  // 6 – existing link overlap
  let overlapCount = 0;
  for (const u of srcLinks) {
    if (tgtLinks.has(u)) overlapCount++;
  }
  if (overlapCount > 0) {
    score += overlapCount * SCORE_LINK_OVERLAP;
    reasons.push(`link_overlap:${overlapCount}`);
  }

  // Only include authority boosts when there is an organic relationship
  if (score === 0) return null;

  // 7–9 – authority boosts for the target page
  const { rank_score_boost, authority_score_boost, graph_centrality_boost } = tgtBoosts;

  if (rank_score_boost > 0) {
    score += rank_score_boost;
    reasons.push(`rank_score_boost:${rank_score_boost}`);
  }
  if (authority_score_boost > 0) {
    score += authority_score_boost;
    reasons.push(`authority_score_boost:${authority_score_boost}`);
  }
  if (graph_centrality_boost > 0) {
    score += graph_centrality_boost;
    reasons.push(`graph_centrality_boost:${graph_centrality_boost}`);
  }

  return { score, reasons, rank_score_boost, authority_score_boost, graph_centrality_boost };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const entityMap  = JSON.parse(fs.readFileSync(ENTITY_MAP_PATH, 'utf8'));
  const wikiIndex  = JSON.parse(fs.readFileSync(WIKI_INDEX_PATH, 'utf8'));
  const linkMap    = JSON.parse(fs.readFileSync(LINK_MAP_PATH,   'utf8'));
  const linkGraph  = JSON.parse(fs.readFileSync(LINK_GRAPH_PATH, 'utf8'));

  // Build url → entity-map entry lookup
  const entityByUrl = {};
  for (const e of entityMap) {
    if (e.canonical_url) entityByUrl[e.canonical_url] = e;
  }

  // Build url → wiki-index entry lookup
  const wikiByUrl = {};
  for (const w of wikiIndex) {
    if (w.url) wikiByUrl[w.url] = w;
  }

  // Build url → Set<existing_link_url> from link-map
  const existingLinksMap = {};
  for (const [pageUrl, data] of Object.entries(linkMap)) {
    existingLinksMap[pageUrl] = new Set(data.existing_links || []);
  }

  // Pre-compute authority boost fields for every URL (target-side only).
  // These are deterministic functions of publicly available signals.
  const authorityBoosts = {};
  const allEntityUrls = new Set([
    ...Object.keys(entityByUrl),
    ...Object.keys(wikiByUrl),
  ]);
  for (const url of allEntityUrls) {
    const wiki = wikiByUrl[url];
    const graph = linkGraph[url];

    // rank_score_boost: floor(rank_score / 100), capped at RANK_BOOST_MAX
    const rankScore = (wiki && wiki.rank_score) ? wiki.rank_score : 0;
    const rank_score_boost = Math.min(Math.floor(rankScore / RANK_BOOST_DIVISOR), RANK_BOOST_MAX);

    // authority_score_boost: floor(inbound_count / 10), capped at AUTHORITY_BOOST_MAX
    const inboundCount = (wiki && wiki.link_score && wiki.link_score.inbound_count)
      ? wiki.link_score.inbound_count : 0;
    const authority_score_boost = Math.min(
      Math.floor(inboundCount / AUTHORITY_BOOST_DIVISOR),
      AUTHORITY_BOOST_MAX
    );

    // graph_centrality_boost: tiered by link-graph inbound_count
    const graphInbound = (graph && graph.inbound_count) ? graph.inbound_count : 0;
    let graph_centrality_boost = 0;
    for (const tier of CENTRALITY_TIERS) {
      if (graphInbound >= tier.threshold) {
        graph_centrality_boost = tier.boost;
        break;
      }
    }

    authorityBoosts[url] = { rank_score_boost, authority_score_boost, graph_centrality_boost };
  }

  // Collect all page URLs to process (union of entity-map and wiki-index URLs)
  const allUrls = new Set([
    ...Object.keys(entityByUrl),
    ...Object.keys(wikiByUrl),
  ]);

  const sortedUrls = [...allUrls].sort();

  const graph = {};

  for (const srcUrl of sortedUrls) {
    const srcEntity = entityByUrl[srcUrl];
    if (!srcEntity) continue; // need entity data to score

    const srcLinks = existingLinksMap[srcUrl] || new Set();
    const relatedPages = [];

    for (const tgtUrl of sortedUrls) {
      if (tgtUrl === srcUrl) continue; // no self-links

      const tgtEntity = entityByUrl[tgtUrl];
      if (!tgtEntity) continue;

      const tgtLinks = existingLinksMap[tgtUrl] || new Set();
      const tgtBoosts = authorityBoosts[tgtUrl] || {
        rank_score_boost: 0, authority_score_boost: 0, graph_centrality_boost: 0,
      };
      const rel = computeRelationship(srcEntity, tgtEntity, srcLinks, tgtLinks, tgtBoosts);
      if (!rel) continue;

      relatedPages.push({
        target_url:            tgtUrl,
        score:                 rel.score,
        reasons:               rel.reasons,
        rank_score_boost:      rel.rank_score_boost,
        authority_score_boost: rel.authority_score_boost,
        graph_centrality_boost: rel.graph_centrality_boost,
      });
    }

    // Sort: highest score first, then target_url alphabetically for determinism
    relatedPages.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.target_url.localeCompare(b.target_url);
    });

    graph[srcUrl] = { related_pages: relatedPages };
  }

  // Sort output keys alphabetically for determinism
  const sortedGraph = {};
  for (const k of Object.keys(graph).sort()) {
    sortedGraph[k] = graph[k];
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sortedGraph, null, 2) + '\n', 'utf8');

  const totalPages    = Object.keys(sortedGraph).length;
  const totalRelated  = Object.values(sortedGraph).reduce((s, v) => s + v.related_pages.length, 0);
  console.log(`Entity graph written to js/entity-graph.json`);
  console.log(`Pages: ${totalPages}`);
  console.log(`Total relationships: ${totalRelated}`);
}

main();
