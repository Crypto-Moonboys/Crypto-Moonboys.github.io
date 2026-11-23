#!/usr/bin/env node
/**
 * scripts/generate-authority-drift.js
 *
 * Compares editorial authority against real inbound wiki links. Both signals
 * are converted to tie-aware percentile ranks before comparing them.
 *
 * Inputs:
 *   js/wiki-index.json   – per-page rank signals including authority_score
 *   js/link-graph.json   – actual inbound links between wiki pages
 *
 * Output: js/authority-drift.json
 * {
 *   "generated_at": "...",
 *   "summary": { "total_pages", "high_drift_count", "avg_drift" },
 *   "entries": [
 *     {
 *       "url", "title", "authority_score", "inbound_links",
 *       "inbound_rank", "authority_rank", "drift", "drift_direction",
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
const LINK_GRAPH_PATH  = path.join(ROOT, 'js', 'link-graph.json');
const OUTPUT_PATH       = path.join(ROOT, 'js', 'authority-drift.json');

// A high alert requires at least a 60-percentile gap; ordinary variation
// between editorial quality and link popularity is not a site emergency.
const HIGH_DRIFT_THRESHOLD   = 0.60;
const MEDIUM_DRIFT_THRESHOLD = 0.35;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function percentileRanks(arr, key) {
  const sorted = arr.map(x => x[key]).sort((a, b) => a - b);
  const ranks = new Map();
  for (let i = 0; i < sorted.length;) {
    let end = i + 1;
    while (end < sorted.length && sorted[end] === sorted[i]) end++;
    ranks.set(sorted[i], (i + (end - i) / 2) / sorted.length);
    i = end;
  }
  return arr.map(x => ({ ...x, [`${key}_norm`]: ranks.get(x[key]) }));
}

function rankArray(arr, key) {
  const sorted = [...arr].sort((a, b) => b[key] - a[key]);
  const rankMap = new Map();
  sorted.forEach((item, i) => rankMap.set(item.url, i + 1));
  return rankMap;
}

function main() {
  const wikiIndex   = readJson(WIKI_INDEX_PATH);
  const linkGraph = readJson(LINK_GRAPH_PATH);

  // The link scanner measures wiki pages only. Do not score other routes as
  // having zero inbound links simply because they were never scanned.
  const entries = wikiIndex.filter(entry => entry.url.startsWith('/wiki/') && linkGraph[entry.url]).map(entry => {
    const url            = entry.url;
    const authorityScore = (entry.rank_signals && typeof entry.rank_signals.authority_score === 'number')
      ? entry.rank_signals.authority_score : 0;
    const inboundLinks = linkGraph[url].inbound_count || 0;

    return {
      url,
      title:            entry.title || '',
      authority_score:  authorityScore,
      inbound_links: inboundLinks,
    };
  });

  // Compare position within each distribution rather than min/max values:
  // one unusually popular hub must not make hundreds of pages look broken.
  const withAuthNorm       = percentileRanks(entries, 'authority_score');
  const withInboundNorm = percentileRanks(withAuthNorm, 'inbound_links');

  // Compute drift (absolute difference of normalized values)
  const withDrift = withInboundNorm.map(e => ({
    ...e,
    drift: Math.abs(e.authority_score_norm - e.inbound_links_norm),
  }));

  // Compute rank positions
  const authorityRankMap   = rankArray(withDrift, 'authority_score');
  const inboundRankMap    = rankArray(withDrift, 'inbound_links');

  // Assign alert levels and rank delta
  const finalEntries = withDrift.map(e => {
    const alertLevel =
      e.drift >= HIGH_DRIFT_THRESHOLD   ? 'high'   :
      e.drift >= MEDIUM_DRIFT_THRESHOLD ? 'medium' : 'ok';

    const authorityRank  = authorityRankMap.get(e.url)  || 0;
    const inboundRank   = inboundRankMap.get(e.url) || 0;
    const rankDelta     = authorityRank - inboundRank; // positive = more linked than authoritative

    return {
      url:              e.url,
      title:            e.title,
      authority_score:  e.authority_score,
      inbound_links:    e.inbound_links,
      authority_rank:   authorityRank,
      inbound_rank:     inboundRank,
      rank_delta:       rankDelta,
      drift:            Math.round(e.drift * 1000) / 1000,
      drift_direction:
        e.authority_score_norm > e.inbound_links_norm ? 'authority_exceeds_links' :
        e.inbound_links_norm > e.authority_score_norm ? 'links_exceed_authority' : 'balanced',
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
