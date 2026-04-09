#!/usr/bin/env node
'use strict';

/**
 * generate-content-gaps.js
 * Phase 14: Graph gap detection and content expansion signals.
 *
 * Reads:
 *   js/wiki-index.json
 *   js/entity-map.json
 *   js/link-map.json
 *   js/link-graph.json
 *   js/entity-graph.json
 *   js/injection-plan.json
 *
 * Writes:
 *   js/content-gaps.json
 *
 * Rules:
 *  - Deterministic: same inputs always produce same outputs (sorted, no randomness)
 *  - Analysis only: never creates pages, never touches ranking/search/frontend
 *  - All signals come from real repo data only
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, '..');
const JS = path.join(ROOT, 'js');

function readJson(relPath) {
  const abs = path.join(ROOT, relPath);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

// ---------------------------------------------------------------------------
// Load inputs
// ---------------------------------------------------------------------------
const wikiIndexRaw = readJson('js/wiki-index.json');
const entityMapRaw = readJson('js/entity-map.json');
const linkMap      = readJson('js/link-map.json');
const linkGraph    = readJson('js/link-graph.json');
const entityGraph  = readJson('js/entity-graph.json');
const injectionPlan = readJson('js/injection-plan.json');

// wiki-index and entity-map are stored as plain arrays (numeric-keyed objects)
const wikiPages = Object.values(wikiIndexRaw);
const entityMap = Object.values(entityMapRaw);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a lookup from canonical URL → wiki-index entry.
 */
function buildPageLookup(pages) {
  const map = {};
  for (const p of pages) {
    map[p.url] = p;
  }
  return map;
}

/**
 * Normalise a URL for consistent keying.
 */
function normUrl(u) {
  return (u || '').trim().replace(/\/$/, '');
}

/**
 * Count how many times each target URL appears in the injection plan.
 */
function buildInjectionTargetCounts(plan) {
  const counts = {};
  for (const sourceUrl of Object.keys(plan)) {
    for (const inj of plan[sourceUrl]) {
      const t = normUrl(inj.target_url);
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  return counts;
}

/**
 * Build inbound-count map from link-graph.
 * link-graph keys are page URLs; each entry has inbound_count.
 */
function buildInboundMap(graph) {
  const map = {};
  for (const [url, data] of Object.entries(graph)) {
    map[normUrl(url)] = data.inbound_count || 0;
  }
  return map;
}

/**
 * Build outbound-count map from link-graph.
 */
function buildOutboundMap(graph) {
  const map = {};
  for (const [url, data] of Object.entries(graph)) {
    map[normUrl(url)] = data.outbound_count || 0;
  }
  return map;
}

/**
 * Count how many co-related pages exist per page via entity-graph.
 */
function buildEntityRelatedCounts(graph) {
  const map = {};
  for (const [url, data] of Object.entries(graph)) {
    map[normUrl(url)] = Array.isArray(data.related_pages) ? data.related_pages.length : 0;
  }
  return map;
}

/**
 * Build average entity-graph relationship score per page.
 */
function buildEntityRelatedAvgScore(graph) {
  const map = {};
  for (const [url, data] of Object.entries(graph)) {
    const related = Array.isArray(data.related_pages) ? data.related_pages : [];
    if (related.length === 0) {
      map[normUrl(url)] = 0;
    } else {
      const sum = related.reduce((acc, r) => acc + (r.final_score || r.score || 0), 0);
      map[normUrl(url)] = Math.round(sum / related.length);
    }
  }
  return map;
}

/**
 * For each page, collect all *other* pages it shares strong entity-graph
 * connections with (score >= threshold). Returns Map<url, Set<url>>.
 */
function buildStrongPeerSets(graph, threshold) {
  const peers = {};
  for (const [url, data] of Object.entries(graph)) {
    const u = normUrl(url);
    peers[u] = peers[u] || new Set();
    for (const rel of (data.related_pages || [])) {
      if ((rel.final_score || rel.score || 0) >= threshold) {
        const t = normUrl(rel.target_url);
        peers[u].add(t);
        // Bidirectional
        peers[t] = peers[t] || new Set();
        peers[t].add(u);
      }
    }
  }
  return peers;
}

/**
 * Extract shared-tag frequencies across all pages.
 * Returns Map<tag, count>.
 */
function buildTagFrequency(pages) {
  const freq = {};
  for (const p of pages) {
    for (const tag of (p.tags || [])) {
      freq[tag] = (freq[tag] || 0) + 1;
    }
  }
  return freq;
}

/**
 * For each tag, collect all page URLs that carry it.
 */
function buildTagPageMap(pages) {
  const map = {};
  for (const p of pages) {
    for (const tag of (p.tags || [])) {
      map[tag] = map[tag] || [];
      map[tag].push(p.url);
    }
  }
  return map;
}

/**
 * Find the best-ranked page for a given tag.
 */
function bestPageForTag(tag, tagPageMap, pageLookup) {
  const urls = tagPageMap[tag] || [];
  let best = null;
  let bestScore = -1;
  for (const u of urls) {
    const entry = pageLookup[u];
    if (entry && entry.rank_score > bestScore) {
      bestScore = entry.rank_score;
      best = entry;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Thresholds (deterministic constants, not magic numbers — tuned to dataset)
// ---------------------------------------------------------------------------
const UNDERLINKED_RANK_PERCENTILE    = 0.75; // top 25% by rank_score
const UNDERLINKED_INBOUND_THRESHOLD  = 3;    // fewer than N inbound edges
const UNDERLINKED_INJECTION_THRESHOLD = 5;   // fewer than N injection plan hits
const ISOLATED_RELATED_THRESHOLD     = 2;    // fewer than N strong entity peers
const STRONG_PEER_SCORE_THRESHOLD    = 60;   // min score to count as strong peer
const BRIDGE_MIN_CLUSTER_SIZE        = 5;    // min pages per tag-cluster to test
const BRIDGE_CO_OCCUR_THRESHOLD      = 15;   // min cross-cluster entity-graph links to flag
const TOPIC_TAG_MIN_PAGES            = 5;    // tag must appear on N+ pages to be expansion candidate
const TOPIC_DEDICATED_THRESHOLD      = 2;    // tag needs <N strongly matching dedicated pages
const STALE_COVERAGE_INJECTION_MIN   = 15;   // injection targets with this many hits considered "over-saturated"
const STALE_COVERAGE_ADJACENCY_MAX   = 3;    // if a saturated target has fewer than N strong adjacents, flag it

// ---------------------------------------------------------------------------
// A. Underlinked high-value pages
// ---------------------------------------------------------------------------
function detectUnderlinkedPages(pages, inboundMap, injectionTargetCounts, pageLookup) {
  const scores = pages.map(p => p.rank_score);
  scores.sort((a, b) => a - b);
  const threshold = scores[Math.floor(scores.length * UNDERLINKED_RANK_PERCENTILE)];

  const results = [];

  for (const page of pages) {
    if (page.rank_score < threshold) continue;

    const url = normUrl(page.url);
    const inbound = inboundMap[url] || 0;
    const injections = injectionTargetCounts[url] || 0;
    const authority = (page.rank_signals && page.rank_signals.authority_score) || 0;

    const reasons = [];
    let gapScore = 0;

    if (inbound < UNDERLINKED_INBOUND_THRESHOLD) {
      reasons.push(`low_inbound_links:${inbound}`);
      gapScore += 30 + (UNDERLINKED_INBOUND_THRESHOLD - inbound) * 5;
    }

    if (injections < UNDERLINKED_INJECTION_THRESHOLD) {
      reasons.push(`low_injection_plan_coverage:${injections}`);
      gapScore += 20 + (UNDERLINKED_INJECTION_THRESHOLD - injections) * 2;
    }

    if (authority > 10 && inbound < UNDERLINKED_INBOUND_THRESHOLD) {
      reasons.push(`high_authority_underserved:${authority}`);
      gapScore += 15;
    }

    if (reasons.length === 0) continue;

    // Normalise gap score relative to page rank_score (high-rank underlinked = bigger gap)
    const normalised = Math.round(gapScore + page.rank_score * 0.05);

    results.push({
      url: page.url,
      score: normalised,
      rank_score: page.rank_score,
      inbound_links: inbound,
      injection_plan_hits: injections,
      reasons
    });
  }

  // Sort deterministically: score desc, then url asc for ties
  results.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
  return results;
}

// ---------------------------------------------------------------------------
// B. Over-isolated pages
// ---------------------------------------------------------------------------
function detectIsolatedPages(pages, strongPeerSets, inboundMap, outboundMap) {
  const results = [];

  for (const page of pages) {
    const url = normUrl(page.url);
    const strongPeers = strongPeerSets[url] ? strongPeerSets[url].size : 0;
    const inbound = inboundMap[url] || 0;
    const outbound = outboundMap[url] || 0;

    const reasons = [];
    let gapScore = 0;

    if (strongPeers < ISOLATED_RELATED_THRESHOLD) {
      reasons.push(`weak_entity_graph_peers:${strongPeers}`);
      gapScore += 25 + (ISOLATED_RELATED_THRESHOLD - strongPeers) * 8;
    }

    if (inbound === 0) {
      reasons.push('zero_inbound_links');
      gapScore += 20;
    } else if (inbound < 2) {
      reasons.push(`minimal_inbound_links:${inbound}`);
      gapScore += 10;
    }

    if (outbound < 2) {
      reasons.push(`minimal_outbound_links:${outbound}`);
      gapScore += 10;
    }

    if (reasons.length < 2) continue; // Only flag genuinely isolated pages (multiple signals)

    const normalised = Math.round(gapScore);

    results.push({
      url: page.url,
      score: normalised,
      rank_score: page.rank_score,
      strong_peers: strongPeers,
      inbound_links: inbound,
      outbound_links: outbound,
      reasons
    });
  }

  results.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
  return results;
}

// ---------------------------------------------------------------------------
// C. Cluster bridge gaps
//
// Uses tag-based sub-clusters (rather than the 3 broad categories) to find
// tag-group pairs that co-occur heavily in entity-graph signals but lack a
// dedicated bridge page covering both tag areas.
// ---------------------------------------------------------------------------
function detectBridgeGaps(pages, entityGraphData, pageLookup, tagFreq, tagPageMap) {
  // Build tag-clusters: only tags that appear on enough pages to be meaningful
  const clusterTags = Object.keys(tagFreq)
    .filter(t => tagFreq[t] >= BRIDGE_MIN_CLUSTER_SIZE)
    .sort();

  // Noise tags to exclude from cluster analysis
  const NOISE_TAGS = new Set(['crypto', 'moonboys', 'wiki', 'the', 'of', 'and', 'in', 'a', 'an', 'is']);
  const meaningfulTags = clusterTags.filter(t => !NOISE_TAGS.has(t) && !/^\d+$/.test(t));

  if (meaningfulTags.length < 2) return [];

  // For each page, determine which cluster-tags it belongs to
  const pageTagSet = {}; // url -> Set<clusterTag>
  for (const page of pages) {
    const u = normUrl(page.url);
    pageTagSet[u] = new Set((page.tags || []).filter(t => meaningfulTags.includes(t)));
  }

  // Count entity-graph cross-tag-cluster co-occurrences:
  // For a source page with tagA but NOT tagB, count edges to target pages with tagB
  const crossTagEdges = {}; // "tagA|tagB" -> {count, fromUrls, toUrls}

  for (const [url, data] of Object.entries(entityGraphData)) {
    const srcTags = pageTagSet[normUrl(url)];
    if (!srcTags || srcTags.size === 0) continue;

    for (const rel of (data.related_pages || [])) {
      const dstTags = pageTagSet[normUrl(rel.target_url)];
      if (!dstTags || dstTags.size === 0) continue;

      // Find cross-tag pairs (source has tagA, dest has tagB, source lacks tagB)
      for (const tagA of srcTags) {
        for (const tagB of dstTags) {
          if (tagA === tagB) continue;
          if (srcTags.has(tagB) && dstTags.has(tagA)) continue; // same cluster
          const pairKey = [tagA, tagB].sort().join('|');
          if (!crossTagEdges[pairKey]) {
            crossTagEdges[pairKey] = { count: 0, srcUrls: new Set(), dstUrls: new Set() };
          }
          crossTagEdges[pairKey].count++;
          crossTagEdges[pairKey].srcUrls.add(normUrl(url));
          crossTagEdges[pairKey].dstUrls.add(normUrl(rel.target_url));
        }
      }
    }
  }

  const results = [];

  for (const [pairKey, edgeData] of Object.entries(crossTagEdges)) {
    if (edgeData.count < BRIDGE_CO_OCCUR_THRESHOLD) continue;

    const [tagA, tagB] = pairKey.split('|');
    const pagesA = tagPageMap[tagA] || [];
    const pagesB = tagPageMap[tagB] || [];
    if (pagesA.length < BRIDGE_MIN_CLUSTER_SIZE || pagesB.length < BRIDGE_MIN_CLUSTER_SIZE) continue;

    // Check if a strong bridge page already exists:
    // A bridge page is one that carries BOTH tagA and tagB with a high rank_score
    const bridgeCandidates = pages.filter(p => {
      const tags = new Set(p.tags || []);
      return tags.has(tagA) && tags.has(tagB) && p.rank_score >= 250;
    });

    if (bridgeCandidates.length >= 2) continue; // Already well-bridged

    // Compute a uniqueness score: how many pages bridge both tags vs. total pages in either cluster
    const existingBridgeCount = bridgeCandidates.length;
    const clusterASize = pagesA.length;
    const clusterBSize = pagesB.length;

    const gapScore = Math.round(
      edgeData.count * 2 +
      (clusterASize + clusterBSize) * 0.3 +
      (1 - existingBridgeCount * 0.5) * 10
    );

    // Suggested topic: the two tags + any third tag that frequently appears on pages in both clusters
    const combinedTagFreq = {};
    for (const u of [...edgeData.srcUrls, ...edgeData.dstUrls]) {
      const p = pageLookup[u];
      if (!p) continue;
      for (const t of (p.tags || [])) {
        if (t !== tagA && t !== tagB && !NOISE_TAGS.has(t) && !/^\d+$/.test(t)) {
          combinedTagFreq[t] = (combinedTagFreq[t] || 0) + 1;
        }
      }
    }
    const topSharedTag = Object.keys(combinedTagFreq)
      .sort((a, b) => combinedTagFreq[b] - combinedTagFreq[a] || a.localeCompare(b))[0];

    const suggestedTopic = topSharedTag
      ? `${tagA} + ${tagB} (via ${topSharedTag})`
      : `${tagA} + ${tagB}`;

    results.push({
      cluster_a: tagA,
      cluster_b: tagB,
      score: gapScore,
      cross_cluster_edge_count: edgeData.count,
      reasons: [
        `cross_tag_cluster_edges:${edgeData.count}`,
        `cluster_a_pages:${clusterASize}`,
        `cluster_b_pages:${clusterBSize}`,
        `existing_bridge_pages:${existingBridgeCount}`
      ],
      suggested_page_topic: suggestedTopic
    });
  }

  results.sort((a, b) => b.score - a.score || a.cluster_a.localeCompare(b.cluster_a));
  return results;
}

// ---------------------------------------------------------------------------
// D. Topic expansion gaps
// ---------------------------------------------------------------------------
function detectTopicExpansionGaps(pages, tagFreq, tagPageMap, pageLookup, entityGraphData, injectionTargetCounts) {
  const results = [];

  // Generic noise tags that don't represent meaningful expansion topics
  const NOISE_TAGS = new Set(['crypto', 'moonboys', 'wiki', 'the', 'of', 'and', 'in', 'a', 'an', 'is']);

  for (const [tag, count] of Object.entries(tagFreq)) {
    if (count < TOPIC_TAG_MIN_PAGES) continue;
    if (NOISE_TAGS.has(tag)) continue;

    const tagPages = (tagPageMap[tag] || []).map(u => pageLookup[u]).filter(Boolean);

    // Check if a dedicated strong page already exists for this concept
    // A dedicated page: its title or entity_id closely matches the tag AND has high rank_score
    const dedicatedPages = tagPages.filter(p => {
      const titleLower = p.title.toLowerCase();
      return titleLower.includes(tag) && p.rank_score >= 300;
    });

    if (dedicatedPages.length >= TOPIC_DEDICATED_THRESHOLD) continue;

    // Calculate aggregate signals
    const avgRank = Math.round(tagPages.reduce((s, p) => s + p.rank_score, 0) / tagPages.length);
    const totalInjectionHits = tagPages.reduce((s, p) => s + (injectionTargetCounts[normUrl(p.url)] || 0), 0);

    const sourceSignals = [
      `tag_page_count:${count}`,
      `avg_rank_score:${avgRank}`,
      `total_injection_hits:${totalInjectionHits}`,
      `dedicated_strong_pages:${dedicatedPages.length}`
    ];

    // Check for entity-graph co-citation: how many related-page reasons mention this tag
    let coCitationCount = 0;
    for (const page of tagPages) {
      const eg = entityGraphData[normUrl(page.url)];
      if (!eg) continue;
      for (const rel of (eg.related_pages || [])) {
        if (rel.reasons && rel.reasons.some(r => r.includes(tag))) {
          coCitationCount++;
        }
      }
    }
    if (coCitationCount > 0) sourceSignals.push(`entity_graph_co_citations:${coCitationCount}`);

    // Candidate related pages: top 5 by rank_score that carry this tag
    const candidatePages = tagPages
      .slice()
      .sort((a, b) => b.rank_score - a.rank_score || a.url.localeCompare(b.url))
      .slice(0, 5)
      .map(p => p.url);

    const gapScore = Math.round(
      count * 4 +
      avgRank * 0.02 +
      coCitationCount * 2 +
      totalInjectionHits * 0.5
    );

    results.push({
      suggested_topic: tag,
      score: gapScore,
      tag_page_count: count,
      dedicated_strong_pages: dedicatedPages.length,
      source_signals: sourceSignals.sort(),
      candidate_related_pages: candidatePages
    });
  }

  results.sort((a, b) => b.score - a.score || a.suggested_topic.localeCompare(b.suggested_topic));
  return results;
}

// ---------------------------------------------------------------------------
// E. Stale coverage gaps (over-saturated injection targets missing adjacents)
// ---------------------------------------------------------------------------
function detectStaleCoverageGaps(pages, injectionTargetCounts, entityGraphData, pageLookup, strongPeerSets) {
  const results = [];

  const saturatedTargets = Object.entries(injectionTargetCounts)
    .filter(([, count]) => count >= STALE_COVERAGE_INJECTION_MIN)
    .map(([url]) => url);

  for (const targetUrl of saturatedTargets) {
    const page = pageLookup[targetUrl];
    if (!page) continue;

    const strongPeers = strongPeerSets[normUrl(targetUrl)] || new Set();

    // Find pages with high entity-graph overlap to this target but NOT also high-injection targets
    const eg = entityGraphData[normUrl(targetUrl)];
    if (!eg) continue;

    const relatedUrls = (eg.related_pages || [])
      .filter(r => (r.final_score || r.score || 0) >= STRONG_PEER_SCORE_THRESHOLD)
      .map(r => normUrl(r.target_url));

    const adjacentsWithWeakCoverage = relatedUrls.filter(u => {
      const hits = injectionTargetCounts[u] || 0;
      return hits < UNDERLINKED_INJECTION_THRESHOLD;
    });

    if (adjacentsWithWeakCoverage.length > STALE_COVERAGE_ADJACENCY_MAX) {
      // The saturated target has many strong adjacents that are under-covered
      const injHits = injectionTargetCounts[targetUrl] || 0;
      const gapScore = Math.round(injHits * 0.4 + adjacentsWithWeakCoverage.length * 5);

      results.push({
        url: targetUrl,
        score: gapScore,
        rank_score: page.rank_score,
        injection_plan_hits: injHits,
        strong_related_count: relatedUrls.length,
        under_covered_adjacents: adjacentsWithWeakCoverage.slice(0, 5),
        reasons: [
          `over_saturated_injection_target:${injHits}`,
          `under_covered_strong_adjacents:${adjacentsWithWeakCoverage.length}`,
          `reinforcement_concentration_signal`
        ]
      });
    }
  }

  results.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const pageLookup = buildPageLookup(wikiPages);
  const inboundMap = buildInboundMap(linkGraph);
  const outboundMap = buildOutboundMap(linkGraph);
  const injectionTargetCounts = buildInjectionTargetCounts(injectionPlan);
  const strongPeerSets = buildStrongPeerSets(entityGraph, STRONG_PEER_SCORE_THRESHOLD);
  const tagFreq = buildTagFrequency(wikiPages);
  const tagPageMap = buildTagPageMap(wikiPages);

  // A. Underlinked high-value pages
  const underlinkedPages = detectUnderlinkedPages(wikiPages, inboundMap, injectionTargetCounts, pageLookup);

  // B. Over-isolated pages
  const isolatedPages = detectIsolatedPages(wikiPages, strongPeerSets, inboundMap, outboundMap);

  // C. Cluster bridge gaps
  const bridgeOpportunities = detectBridgeGaps(wikiPages, entityGraph, pageLookup, tagFreq, tagPageMap);

  // D. Topic expansion gaps
  const topicExpansionOpportunities = detectTopicExpansionGaps(
    wikiPages, tagFreq, tagPageMap, pageLookup, entityGraph, injectionTargetCounts
  );

  // E. Stale coverage gaps — embedded in underlinked_pages as "stale_coverage" reasons,
  //    and also surfaced separately for visibility
  const staleCoverageGaps = detectStaleCoverageGaps(
    wikiPages, injectionTargetCounts, entityGraph, pageLookup, strongPeerSets
  );

  // Merge stale coverage signals into underlinked_pages where pages overlap
  const underlinkedUrls = new Set(underlinkedPages.map(p => p.url));
  for (const stale of staleCoverageGaps) {
    if (!underlinkedUrls.has(stale.url)) {
      underlinkedPages.push({
        url: stale.url,
        score: stale.score,
        rank_score: stale.rank_score,
        inbound_links: inboundMap[normUrl(stale.url)] || 0,
        injection_plan_hits: stale.injection_plan_hits,
        reasons: stale.reasons
      });
    }
  }
  // Re-sort after merge
  underlinkedPages.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));

  // ---------------------------------------------------------------------------
  // Build output
  // ---------------------------------------------------------------------------
  const output = {
    generated_at: new Date().toISOString(),
    summary: {
      total_pages: wikiPages.length,
      underlinked_targets: underlinkedPages.length,
      isolated_pages: isolatedPages.length,
      bridge_gaps: bridgeOpportunities.length,
      topic_gaps: topicExpansionOpportunities.length,
      stale_coverage_gaps: staleCoverageGaps.length
    },
    underlinked_pages: underlinkedPages,
    isolated_pages: isolatedPages,
    bridge_opportunities: bridgeOpportunities,
    topic_expansion_opportunities: topicExpansionOpportunities,
    stale_coverage_gaps: staleCoverageGaps
  };

  const outPath = path.join(JS, 'content-gaps.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${outPath}`);
  console.log(`Summary: ${JSON.stringify(output.summary, null, 2)}`);
}

main();
