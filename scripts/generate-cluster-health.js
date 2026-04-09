#!/usr/bin/env node
/**
 * scripts/generate-cluster-health.js
 *
 * Computes cluster health metrics from wiki-index.json and entity-graph.json.
 * Groups pages by category (cluster) and calculates aggregate signals.
 *
 * Inputs:
 *   js/wiki-index.json   – per-page rank signals
 *   js/entity-graph.json – related_pages graph for centrality/connectivity
 *
 * Output: js/cluster-health.json
 * {
 *   "generated_at": "...",
 *   "summary": { "total_clusters", "total_pages" },
 *   "clusters": [
 *     {
 *       "cluster_id", "page_count",
 *       "avg_internal_links", "avg_rank_score", "avg_authority_score",
 *       "avg_content_quality", "avg_word_count",
 *       "total_internal_links", "centrality_score",
 *       "content_depth_score", "health_score"
 *     },
 *     ...
 *   ]
 * }
 *
 * Usage: node scripts/generate-cluster-health.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT              = path.resolve(__dirname, '..');
const WIKI_INDEX_PATH   = path.join(ROOT, 'js', 'wiki-index.json');
const ENTITY_GRAPH_PATH = path.join(ROOT, 'js', 'entity-graph.json');
const OUTPUT_PATH       = path.join(ROOT, 'js', 'cluster-health.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function main() {
  const wikiIndex   = readJson(WIKI_INDEX_PATH);
  const entityGraph = readJson(ENTITY_GRAPH_PATH);

  // Compute in-degree per page from entity-graph
  const inDegree = new Map();
  for (const [, data] of Object.entries(entityGraph)) {
    const relatedPages = Array.isArray(data.related_pages) ? data.related_pages : [];
    for (const rp of relatedPages) {
      const target = rp.target_url;
      inDegree.set(target, (inDegree.get(target) || 0) + 1);
    }
  }

  // Group pages by category
  const clusters = new Map();

  for (const entry of wikiIndex) {
    const rs  = entry.rank_signals || {};
    const cat = (rs.category || 'unknown').toLowerCase();

    if (!clusters.has(cat)) {
      clusters.set(cat, []);
    }

    clusters.get(cat).push({
      url:             entry.url,
      rank_score:      entry.rank_score || 0,
      authority_score: rs.authority_score     || 0,
      internal_links:  rs.internal_link_count || 0,
      content_quality: rs.content_quality_score || 0,
      word_count:      rs.article_word_count  || 0,
      heading_count:   rs.heading_count       || 0,
      centrality:      inDegree.get(entry.url) || 0,
    });
  }

  // Compute cluster metrics
  const clusterList = [];

  for (const [clusterId, pages] of [...clusters.entries()].sort()) {
    const internalLinks  = pages.map(p => p.internal_links);
    const rankScores     = pages.map(p => p.rank_score);
    const authorityScores = pages.map(p => p.authority_score);
    const contentQuality = pages.map(p => p.content_quality);
    const wordCounts     = pages.map(p => p.word_count);
    const centralityVals = pages.map(p => p.centrality);

    const avgLinks      = avg(internalLinks);
    const avgRank       = avg(rankScores);
    const avgAuthority  = avg(authorityScores);
    const avgContent    = avg(contentQuality);
    const avgWords      = avg(wordCounts);
    const totalLinks    = internalLinks.reduce((s, v) => s + v, 0);
    const totalCentrality = centralityVals.reduce((s, v) => s + v, 0);

    // Centrality score: average in-degree, normalised to page count
    const centralityScore = round2(totalCentrality / Math.max(pages.length, 1));

    // Content depth score: blend of word count, quality, and heading density
    const contentDepthScore = round2((avgWords / 100 * 0.4) + (avgContent * 0.4) + (avg(pages.map(p => p.heading_count)) * 0.2));

    // Health score: composite of link density (40%), rank (30%), authority (20%), content (10%)
    const maxLinks = 30;   // expected upper bound for normalisation
    const maxRank  = 1000;
    const maxAuth  = 100;
    const maxQual  = 100;

    const healthScore = round2(
      Math.min(avgLinks / maxLinks, 1)    * 40 +
      Math.min(avgRank  / maxRank,  1)    * 30 +
      Math.min(avgAuthority / maxAuth, 1) * 20 +
      Math.min(avgContent / maxQual, 1)   * 10
    );

    clusterList.push({
      cluster_id:         clusterId,
      page_count:         pages.length,
      avg_internal_links: round2(avgLinks),
      total_internal_links: totalLinks,
      avg_rank_score:     round2(avgRank),
      avg_authority_score: round2(avgAuthority),
      avg_content_quality: round2(avgContent),
      avg_word_count:     round2(avgWords),
      centrality_score:   centralityScore,
      content_depth_score: contentDepthScore,
      health_score:       healthScore,
    });
  }

  // Sort by health_score descending for readability
  clusterList.sort((a, b) => b.health_score - a.health_score);

  const output = {
    generated_at: new Date().toISOString(),
    summary: {
      total_clusters: clusterList.length,
      total_pages:    wikiIndex.length,
    },
    clusters: clusterList,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(
    `js/cluster-health.json written — ${clusterList.length} clusters across ${wikiIndex.length} pages`
  );
}

main();
