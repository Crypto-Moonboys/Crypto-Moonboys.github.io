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
 *
 * Output shape (js/entity-graph.json):
 * {
 *   "/wiki/page.html": {
 *     "related_pages": [
 *       { "target_url": "/wiki/other.html", "score": 123, "reasons": ["same_category:factions", ...] },
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
 *
 * Rules:
 *   - No self-links
 *   - No duplicates
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
 * Returns null if score === 0 (no relationship).
 */
function computeRelationship(srcEntry, tgtEntry, srcLinks, tgtLinks) {
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

  if (score === 0) return null;
  return { score, reasons };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const entityMap  = JSON.parse(fs.readFileSync(ENTITY_MAP_PATH, 'utf8'));
  const wikiIndex  = JSON.parse(fs.readFileSync(WIKI_INDEX_PATH, 'utf8'));
  const linkMap    = JSON.parse(fs.readFileSync(LINK_MAP_PATH,   'utf8'));

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
      const rel = computeRelationship(srcEntity, tgtEntity, srcLinks, tgtLinks);
      if (!rel) continue;

      relatedPages.push({
        target_url: tgtUrl,
        score:      rel.score,
        reasons:    rel.reasons,
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
