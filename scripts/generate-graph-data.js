#!/usr/bin/env node
/**
 * scripts/generate-graph-data.js
 *
 * Derives js/graph-data.json from entity-graph.json and wiki-index.json.
 * Produces a deterministic nodes + edges structure suitable for graph
 * visualisation without any external API dependencies.
 *
 * Inputs:
 *   js/entity-graph.json – related_pages relationship scores
 *   js/wiki-index.json   – page titles, categories, rank scores
 *
 * Output: js/graph-data.json
 * {
 *   "generated_at": "...",
 *   "nodes": [
 *     { "id", "title", "url", "category", "rank_score", "authority_score" }
 *   ],
 *   "edges": [
 *     { "source", "target", "score", "weight" }
 *   ]
 * }
 *
 * Edge selection: keep at most TOP_EDGES_PER_NODE highest-scoring
 * related_pages per source to limit total edge count to a manageable
 * number for real-time canvas rendering (~1 000–2 000 edges).
 *
 * Usage: node scripts/generate-graph-data.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT              = path.resolve(__dirname, '..');
const WIKI_INDEX_PATH   = path.join(ROOT, 'js', 'wiki-index.json');
const ENTITY_GRAPH_PATH = path.join(ROOT, 'js', 'entity-graph.json');
const OUTPUT_PATH       = path.join(ROOT, 'js', 'graph-data.json');

// Keep at most this many outbound edges per source page
const TOP_EDGES_PER_NODE = 5;
// Minimum relationship score to include an edge
const MIN_EDGE_SCORE = 40;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
  const wikiIndex   = readJson(WIKI_INDEX_PATH);
  const entityGraph = readJson(ENTITY_GRAPH_PATH);

  // Build a lookup: url -> index entry
  const indexByUrl = new Map();
  for (const entry of wikiIndex) {
    indexByUrl.set(entry.url, entry);
  }

  // --- Nodes ---
  // One node per canonical wiki-index entry (deterministic: sorted by url)
  const nodes = wikiIndex
    .map(entry => ({
      id:              entry.url,
      title:           entry.title || '',
      url:             entry.url,
      category:        (entry.rank_signals && entry.rank_signals.category) || 'unknown',
      rank_score:      entry.rank_score || 0,
      authority_score: (entry.rank_signals && entry.rank_signals.authority_score) || 0,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // Set of known node ids for fast lookup
  const nodeIds = new Set(nodes.map(n => n.id));

  // --- Edges ---
  // For each source page in entity-graph, take the top-N related_pages
  // that exceed the minimum score and exist as nodes.
  const edgeSet = new Set(); // "source||target" for dedup
  const edges   = [];

  // Process in deterministic order (sorted by source url)
  const sortedSourceUrls = Object.keys(entityGraph).sort();

  for (const sourceUrl of sortedSourceUrls) {
    if (!nodeIds.has(sourceUrl)) continue;

    const relatedPages = entityGraph[sourceUrl].related_pages || [];
    const topPages = relatedPages
      .filter(rp => rp.final_score >= MIN_EDGE_SCORE && nodeIds.has(rp.target_url))
      .sort((a, b) => b.final_score - a.final_score || a.target_url.localeCompare(b.target_url))
      .slice(0, TOP_EDGES_PER_NODE);

    for (const rp of topPages) {
      const key = `${sourceUrl}||${rp.target_url}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);

      // Normalise score to a 0–1 weight for visual thickness
      const weight = Math.min(rp.final_score / 100, 1);

      edges.push({
        source: sourceUrl,
        target: rp.target_url,
        score:  rp.final_score,
        weight: Math.round(weight * 1000) / 1000,
      });
    }
  }

  // Sort edges deterministically: source asc, then score desc
  edges.sort((a, b) =>
    a.source.localeCompare(b.source) || b.score - a.score
  );

  const output = {
    generated_at: new Date().toISOString(),
    nodes,
    edges,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(
    `js/graph-data.json written — ${nodes.length} nodes, ${edges.length} edges`
  );
}

main();
