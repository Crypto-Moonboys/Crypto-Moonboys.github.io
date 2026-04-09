#!/usr/bin/env node
/**
 * scripts/generate-authority-drift.js
 *
 * Compares wiki-index.json authority scores against entity-graph.json centrality
 * metrics to detect inconsistencies (authority drift).
 *
 * Inputs:
 *   js/wiki-index.json   – per-page rank signals including authority_score
 *   js/entity-graph.json – related_pages graph used to compute in-degree centrality
 *
 * Output: js/authority-drift.json
 * {
 *   "generated_at": "...",
 *   "summary": { "total_pages", "high_drift_count", "avg_drift" },
 *   "entries": [
 *     {
 *       "url", "title", "authority_score", "graph_centrality",
 *       "centrality_rank", "authority_rank", "drift", "drift_direction",
 *       "alert_level"   // "high" | "medium" | "ok"
 *     },
 *     ...
 *   ]
 * }
 *
 * Usage: node scripts/generate-authority-drift.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT              = path.resolve(__dirname, '..');
const WIKI_INDEX_PATH   = path.join(ROOT, 'js', 'wiki-index.json');
const ENTITY_GRAPH_PATH = path.join(ROOT, 'js', 'entity-graph.json');
const OUTPUT_PATH       = path.join(ROOT, 'js', 'authority-drift.json');

const HIGH_DRIFT_THRESHOLD   = 0.35;
const MEDIUM_DRIFT_THRESHOLD = 0.15;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalize(arr, key) {
  const vals = arr.map(x => x[key]);
  const min  = Math.min(...vals);
  const max  = Math.max(...vals);
  const range = max - min;
  if (range === 0) return arr.map(x => ({ ...x, [`${key}_norm`]: 0 }));
  return arr.map(x => ({ ...x, [`${key}_norm`]: (x[key] - min) / range }));
}

function rankArray(arr, key) {
  const sorted = [...arr].sort((a, b) => b[key] - a[key]);
  const rankMap = new Map();
  sorted.forEach((item, i) => rankMap.set(item.url, i + 1));
  return rankMap;
}

function main() {
  const wikiIndex   = readJson(WIKI_INDEX_PATH);
  const entityGraph = readJson(ENTITY_GRAPH_PATH);

  // Compute in-degree centrality: count how many pages reference each page
  // in their related_pages list.
  const inDegree = new Map();

  for (const [sourceUrl, data] of Object.entries(entityGraph)) {
    const relatedPages = Array.isArray(data.related_pages) ? data.related_pages : [];
    for (const rp of relatedPages) {
      const target = rp.target_url;
      inDegree.set(target, (inDegree.get(target) || 0) + 1);
    }
  }

  // Build entries: one per canonical wiki-index entry
  const entries = wikiIndex.map(entry => {
    const url            = entry.url;
    const authorityScore = (entry.rank_signals && typeof entry.rank_signals.authority_score === 'number')
      ? entry.rank_signals.authority_score : 0;
    const graphCentrality = inDegree.get(url) || 0;

    return {
      url,
      title:            entry.title || '',
      authority_score:  authorityScore,
      graph_centrality: graphCentrality,
    };
  });

  // Normalize both signals to [0,1] for drift calculation
  const withAuthNorm       = normalize(entries, 'authority_score');
  const withCentralityNorm = normalize(withAuthNorm, 'graph_centrality');

  // Compute drift (absolute difference of normalized values)
  const withDrift = withCentralityNorm.map(e => ({
    ...e,
    drift: Math.abs(e.authority_score_norm - e.graph_centrality_norm),
  }));

  // Compute rank positions
  const authorityRankMap   = rankArray(withDrift, 'authority_score');
  const centralityRankMap  = rankArray(withDrift, 'graph_centrality');

  // Assign alert levels and rank delta
  const finalEntries = withDrift.map(e => {
    const alertLevel =
      e.drift >= HIGH_DRIFT_THRESHOLD   ? 'high'   :
      e.drift >= MEDIUM_DRIFT_THRESHOLD ? 'medium' : 'ok';

    const authorityRank  = authorityRankMap.get(e.url)  || 0;
    const centralityRank = centralityRankMap.get(e.url) || 0;
    const rankDelta      = authorityRank - centralityRank; // positive = more central than authoritative

    return {
      url:              e.url,
      title:            e.title,
      authority_score:  e.authority_score,
      graph_centrality: e.graph_centrality,
      authority_rank:   authorityRank,
      centrality_rank:  centralityRank,
      rank_delta:       rankDelta,
      drift:            Math.round(e.drift * 1000) / 1000,
      drift_direction:
        e.authority_score_norm > e.graph_centrality_norm ? 'authority_exceeds_centrality' :
        e.graph_centrality_norm > e.authority_score_norm ? 'centrality_exceeds_authority' : 'balanced',
      alert_level:      alertLevel,
    };
  });

  // Sort by drift descending, then url ascending for determinism
  finalEntries.sort((a, b) => b.drift - a.drift || a.url.localeCompare(b.url));

  const highDriftCount = finalEntries.filter(e => e.alert_level === 'high').length;
  const avgDrift = finalEntries.length > 0
    ? Math.round((finalEntries.reduce((s, e) => s + e.drift, 0) / finalEntries.length) * 1000) / 1000
    : 0;

  const output = {
    generated_at: new Date().toISOString(),
    summary: {
      total_pages:      finalEntries.length,
      high_drift_count: highDriftCount,
      medium_drift_count: finalEntries.filter(e => e.alert_level === 'medium').length,
      ok_count:         finalEntries.filter(e => e.alert_level === 'ok').length,
      avg_drift:        avgDrift,
    },
    entries: finalEntries,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(
    `js/authority-drift.json written — ${finalEntries.length} pages, ${highDriftCount} high-drift alerts`
  );
}

main();
