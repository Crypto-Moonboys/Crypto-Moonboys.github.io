#!/usr/bin/env node
'use strict';

/**
 * generate-growth-priority.js
 * Phase 24: Automatic content growth priority engine.
 *
 * Reads:
 *   js/content-gaps.json
 *   js/expansion-plan.json
 *   js/entity-graph.json
 *   js/wiki-index.json
 *   js/draft-index.json
 *   js/link-graph.json
 *
 * Writes:
 *   js/growth-priority.json
 *
 * Rules:
 *  - Deterministic: same inputs always produce same outputs (sorted, no randomness)
 *  - Planning only: never creates pages, never touches ranking/search/frontend
 *  - All signals come from real repo data only
 *  - Does NOT modify any existing pipeline outputs
 *  - Supports four action types:
 *      expand_existing_page    – page exists but needs more depth / internal support
 *      generate_bridge_page    – gap between clusters still needs a connecting page
 *      reinforce_hub           – hub/-ecosystem page needs deeper content
 *      strengthen_cluster_member – cluster member page deserves promotion
 */

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, '..');

function readJson(relPath) {
  const abs = path.join(ROOT, relPath);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

// ---------------------------------------------------------------------------
// Load inputs
// ---------------------------------------------------------------------------
const contentGaps    = readJson('js/content-gaps.json');
const expansionPlan  = readJson('js/expansion-plan.json');
const entityGraph    = readJson('js/entity-graph.json');
const wikiIndexRaw   = readJson('js/wiki-index.json');
const draftIndex     = readJson('js/draft-index.json');
const linkGraph      = readJson('js/link-graph.json');

// wiki-index.json is an array
const wikiPages = Array.isArray(wikiIndexRaw) ? wikiIndexRaw : Object.values(wikiIndexRaw);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normUrl(u) {
  return (u || '').trim().replace(/\/$/, '');
}

function slugFromUrl(url) {
  return path.basename(url, '.html');
}

/** Build URL → wiki-index entry lookup (normalised keys). */
function buildPageLookup(pages) {
  const map = {};
  for (const p of pages) {
    map[normUrl(p.url)] = p;
  }
  return map;
}

/** Build URL → entity-graph entry lookup. */
function buildGraphLookup(graph) {
  const map = {};
  for (const [url, data] of Object.entries(graph)) {
    map[normUrl(url)] = data;
  }
  return map;
}

/** Build URL → link-graph entry lookup. */
function buildLinkLookup(lg) {
  const map = {};
  for (const [url, data] of Object.entries(lg)) {
    map[normUrl(url)] = data;
  }
  return map;
}

/**
 * Count how many times each URL appears as a target in entity-graph related_pages.
 * Higher count → higher graph centrality (relationship demand).
 */
function computeGraphCentrality(graph) {
  const centrality = {};
  for (const data of Object.values(graph)) {
    for (const rel of (data.related_pages || [])) {
      const target = normUrl(rel.target_url || '');
      if (target) {
        centrality[target] = (centrality[target] || 0) + 1;
      }
    }
  }
  return centrality;
}

/**
 * For each URL, compute the mean score of its inbound entity-graph edges.
 * Captures average relationship quality, not just count.
 */
function computeGraphMeanScore(graph) {
  const totals   = {};
  const counts   = {};
  for (const data of Object.values(graph)) {
    for (const rel of (data.related_pages || [])) {
      const target = normUrl(rel.target_url || '');
      if (target) {
        totals[target]  = (totals[target]  || 0) + (rel.score || 0);
        counts[target]  = (counts[target]  || 0) + 1;
      }
    }
  }
  const means = {};
  for (const url of Object.keys(totals)) {
    means[url] = counts[url] > 0 ? totals[url] / counts[url] : 0;
  }
  return means;
}

/**
 * Build a set of URLs that already appear in the draft-index.
 * Used to flag candidates that are already being tracked for generation.
 */
function buildDraftUrlSet(draftIdx) {
  const set = new Set();
  for (const draft of (draftIdx.drafts || [])) {
    if (draft.target_path) set.add(normUrl(draft.target_path));
  }
  return set;
}

/**
 * Identify hub page URLs (pages whose slug ends with -ecosystem).
 */
function buildHubUrlSet(pages) {
  const set = new Set();
  for (const p of pages) {
    if (slugFromUrl(p.url).endsWith('-ecosystem')) {
      set.add(normUrl(p.url));
    }
  }
  return set;
}

/**
 * Derive cluster membership from entity-graph related_pages using union-find.
 * Returns a Map<url, clusterId> and a Map<clusterId, url[]>.
 */
function detectClusters(graph, pages) {
  const urls     = pages.map(p => normUrl(p.url));
  const parent   = {};
  urls.forEach(u => { parent[u] = u; });

  function find(x) {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(a, b) {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pb] = pa;
  }

  // Strong edges: score ≥ 50 in entity-graph
  for (const [url, data] of Object.entries(graph)) {
    const srcNorm = normUrl(url);
    if (!parent[srcNorm]) continue;
    for (const rel of (data.related_pages || [])) {
      const tgt = normUrl(rel.target_url || '');
      if ((rel.score || 0) >= 50 && parent[tgt]) {
        union(srcNorm, tgt);
      }
    }
  }

  const memberOf  = {};
  const members   = {};
  for (const u of urls) {
    const cid = find(u);
    memberOf[u] = cid;
    if (!members[cid]) members[cid] = [];
    members[cid].push(u);
  }

  return { memberOf, members };
}

/**
 * Clamp a numeric value between min and max.
 */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Clean a display title from wiki format.
 */
function cleanTopic(raw) {
  return (raw || '')
    .replace(/ — Crypto Moonboys Wiki$/, '')
    .replace(/_/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Build shared data structures
// ---------------------------------------------------------------------------

const pageLookup     = buildPageLookup(wikiPages);
const graphLookup    = buildGraphLookup(entityGraph);
const linkLookup     = buildLinkLookup(linkGraph);
const graphCentrality = computeGraphCentrality(entityGraph);
const graphMeanScore  = computeGraphMeanScore(entityGraph);
const draftUrlSet     = buildDraftUrlSet(draftIndex);
const hubUrlSet       = buildHubUrlSet(wikiPages);
const { memberOf, members } = detectClusters(entityGraph, wikiPages);

// ---------------------------------------------------------------------------
// Score utilities
// ---------------------------------------------------------------------------

/**
 * Return a normalised rank score in [0, 100].
 * Uses the actual rank_score from wiki-index divided by a ceiling of 1000.
 */
function normRank(url) {
  const entry = pageLookup[normUrl(url)];
  if (!entry) return 0;
  return clamp(Math.round((entry.rank_score || 0) / 10), 0, 100);
}

/**
 * Content depth weakness score.
 * Penalises pages that are short or have very few structural elements.
 * Returns a value in [0, 50] (higher = weaker content depth).
 */
function contentWeakness(url) {
  const entry = pageLookup[normUrl(url)];
  if (!entry || !entry.rank_signals) return 25;
  const rs  = entry.rank_signals;
  const wc  = rs.article_word_count  || 0;
  const hc  = rs.heading_count       || 0;
  const sc  = rs.section_count       || 0;
  const lc  = rs.list_count          || 0;
  const il  = rs.internal_link_count || 0;

  let score = 0;
  if (wc  < 300)  score += 20;
  else if (wc < 800)  score += 10;
  else if (wc < 2000) score += 5;

  if (hc + sc < 2) score += 10;
  if (lc === 0)    score += 5;
  if (il < 2)      score += 10;
  if (il > 10)     score -= 5;  // already well-linked

  return clamp(score, 0, 50);
}

/**
 * Link demand score.
 * How many suggested outbound links does this page still need?
 * Returns a value in [0, 30].
 */
function linkDemand(url) {
  const lg = linkLookup[normUrl(url)];
  if (!lg) return 0;
  const suggested = (lg.suggested_outbound || []).length;
  return clamp(Math.round(suggested * 1.5), 0, 30);
}

/**
 * Cluster size bonus.
 * Pages inside large, active clusters get a bonus.
 * Returns a value in [0, 20].
 */
function clusterBonus(url) {
  const cid  = memberOf[normUrl(url)];
  if (!cid) return 0;
  const size = (members[cid] || []).length;
  if (size >= 20) return 20;
  if (size >= 10) return 12;
  if (size >= 5)  return 6;
  return 0;
}

/**
 * Hub relevance bonus.
 * Hub pages themselves and their cluster members get extra priority.
 * Returns a value in [0, 25].
 */
function hubBonus(url) {
  const norm = normUrl(url);
  if (hubUrlSet.has(norm)) return 25;

  // member of same cluster as a hub?
  const cid = memberOf[norm];
  if (!cid) return 0;
  for (const hubUrl of hubUrlSet) {
    if (memberOf[normUrl(hubUrl)] === cid) return 10;
  }
  return 0;
}

/**
 * Graph centrality score in [0, 40].
 * Normalised against top-observed centrality.
 */
function graphCentralityScore(url) {
  const val = graphCentrality[normUrl(url)] || 0;
  return clamp(Math.round((val / 200) * 40), 0, 40);
}

// ---------------------------------------------------------------------------
// Candidate collectors
// ---------------------------------------------------------------------------

/**
 * A. expand_existing_page
 * Strong existing pages that need more depth or internal support.
 * Source: underlinked_pages and stale_coverage_gaps from content-gaps.json
 * + expansion-plan actions of type strengthen_existing_page.
 */
function collectExpandExisting() {
  const seen = new Set();
  const candidates = [];

  // From content-gaps underlinked pages
  for (const gap of (contentGaps.underlinked_pages || [])) {
    const url = normUrl(gap.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const entry   = pageLookup[url];
    if (!entry)   continue;

    const reasons  = ['underlinked_page'];
    const signals  = [`gap_score:${gap.score}`, `rank_score:${gap.rank_score || 0}`, `inbound_links:${gap.inbound_links || 0}`];

    // Base: gap score contribution (0–50), scaled down
    let score = clamp(Math.round((gap.score || 0) / 12), 0, 50);

    const cws  = contentWeakness(url);
    const ld   = linkDemand(url);
    const cb   = clusterBonus(url);
    const hb   = hubBonus(url);
    const gc   = graphCentralityScore(url);

    if (cws > 0) { score += cws; signals.push(`content_weakness:${cws}`); reasons.push('weak_content_depth'); }
    if (ld  > 0) { score += ld;  signals.push(`link_demand:${ld}`); reasons.push('high_link_demand'); }
    if (cb  > 0) { score += cb;  signals.push(`cluster_size_bonus:${cb}`); reasons.push('strong_cluster_member'); }
    if (hb  > 0) { score += hb;  signals.push(`hub_bonus:${hb}`); reasons.push('hub_adjacent'); }
    if (gc  > 0) { score += gc;  signals.push(`graph_centrality:${gc}`); reasons.push('high_graph_centrality'); }

    candidates.push({
      target_url:         url,
      target_slug:        slugFromUrl(url),
      action_type:        'expand_existing_page',
      priority_score:     score,
      reasons:            [...new Set(reasons)],
      supporting_signals: signals,
      cluster_context:    memberOf[url] ? slugFromUrl(memberOf[url]) : null,
      recommended_source_pages: (linkLookup[url] && linkLookup[url].inbound_from || []).slice(0, 5),
    });
  }

  // From stale_coverage_gaps
  for (const gap of (contentGaps.stale_coverage_gaps || [])) {
    const url = normUrl(gap.url || '');
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const entry = pageLookup[url];
    if (!entry) continue;

    const reasons  = ['stale_coverage'];
    const signals  = [`stale_score:${gap.score || 0}`, `rank_score:${gap.rank_score || 0}`];

    let score = clamp(Math.round((gap.score || 0) / 10), 0, 50);
    score += contentWeakness(url) + clusterBonus(url) + hubBonus(url) + graphCentralityScore(url);

    candidates.push({
      target_url:         url,
      target_slug:        slugFromUrl(url),
      action_type:        'expand_existing_page',
      priority_score:     score,
      reasons:            [...new Set(reasons)],
      supporting_signals: signals,
      cluster_context:    memberOf[url] ? slugFromUrl(memberOf[url]) : null,
      recommended_source_pages: (linkLookup[url] && linkLookup[url].inbound_from || []).slice(0, 5),
    });
  }

  // From expansion-plan strengthen_existing_page actions
  for (const action of (expansionPlan.actions || [])) {
    if (action.action_type !== 'strengthen_existing_page') continue;
    const slug   = action.target_url_slug || '';
    const url    = slug ? `/wiki/${slug}.html` : '';
    const norm   = normUrl(url);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);

    const entry  = pageLookup[norm];
    if (!entry)  continue;

    const reasons  = ['expansion_plan_target', ...((action.reasons || []).slice(0, 3))];
    const signals  = [...(action.source_signals || []).slice(0, 4)];

    let score = clamp(action.priority_score || 0, 0, 80);
    score += clusterBonus(norm) + hubBonus(norm) + graphCentralityScore(norm);

    candidates.push({
      target_url:         norm,
      target_slug:        slug,
      action_type:        'expand_existing_page',
      priority_score:     score,
      reasons:            [...new Set(reasons)],
      supporting_signals: signals,
      cluster_context:    memberOf[norm] ? slugFromUrl(memberOf[norm]) : null,
      recommended_source_pages: (action.related_pages || []).slice(0, 5),
    });
  }

  return candidates;
}

/**
 * B. generate_bridge_page
 * Missing pages that would connect two clusters or cover a topic gap.
 * Source: bridge_opportunities and topic_expansion_opportunities from content-gaps.json
 * + expansion-plan create_bridge_page and create_topic_page actions.
 */
function collectBridgePages() {
  const seen = new Set();
  const candidates = [];

  // From content-gaps bridge_opportunities
  for (const opp of (contentGaps.bridge_opportunities || [])) {
    const topic   = opp.suggested_page_topic || `${opp.cluster_a} + ${opp.cluster_b}`;
    const slug    = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const url     = `/wiki/${slug}.html`;
    const norm    = normUrl(url);
    if (seen.has(norm)) continue;
    seen.add(norm);

    // Skip if already exists as a real page
    if (pageLookup[norm]) continue;

    const reasons  = ['bridge_opportunity', `cluster_a:${opp.cluster_a}`, `cluster_b:${opp.cluster_b}`];
    const signals  = [
      `cross_cluster_edge_count:${opp.cross_cluster_edge_count || 0}`,
      `gap_score:${opp.score || 0}`,
      `cluster_a_pages:${opp.reasons && opp.reasons.find(r => r.startsWith('cluster_a_pages')) || '?'}`,
    ];

    let score = clamp(Math.round((opp.score || 0) / 5), 0, 80);
    // No hub/cluster bonuses for new pages, but add graph centrality of referenced pages
    const related = (opp.candidate_related_pages || []).slice(0, 5);
    const avgGC   = related.length
      ? Math.round(related.reduce((s, u) => s + graphCentralityScore(u), 0) / related.length)
      : 0;
    if (avgGC > 0) { score += avgGC; signals.push(`related_avg_centrality:${avgGC}`); }

    candidates.push({
      target_url:         null,
      target_slug:        slug,
      action_type:        'generate_bridge_page',
      priority_score:     score,
      reasons:            [...new Set(reasons)],
      supporting_signals: signals,
      cluster_context:    `${opp.cluster_a}↔${opp.cluster_b}`,
      recommended_source_pages: related,
    });
  }

  // From content-gaps topic_expansion_opportunities
  for (const opp of (contentGaps.topic_expansion_opportunities || [])) {
    const slug  = (opp.suggested_topic || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const url   = `/wiki/${slug}.html`;
    const norm  = normUrl(url);
    if (!slug || seen.has(norm)) continue;
    seen.add(norm);

    if (pageLookup[norm]) continue;

    const reasons  = ['topic_gap', `topic:${opp.suggested_topic}`];
    const signals  = [...(opp.source_signals || []).slice(0, 4)];

    let score = clamp(Math.round((opp.score || 0) / 3), 0, 70);
    const related = (opp.candidate_related_pages || []).slice(0, 5);
    const avgGC   = related.length
      ? Math.round(related.reduce((s, u) => s + graphCentralityScore(u), 0) / related.length)
      : 0;
    if (avgGC > 0) { score += avgGC; signals.push(`related_avg_centrality:${avgGC}`); }

    candidates.push({
      target_url:         null,
      target_slug:        slug,
      action_type:        'generate_bridge_page',
      priority_score:     score,
      reasons:            [...new Set(reasons)],
      supporting_signals: signals,
      cluster_context:    opp.suggested_topic || null,
      recommended_source_pages: related,
    });
  }

  // From expansion-plan create_bridge_page and create_topic_page
  for (const action of (expansionPlan.actions || [])) {
    if (action.action_type !== 'create_bridge_page' && action.action_type !== 'create_topic_page') continue;
    const slug  = action.target_url_slug || '';
    const url   = slug ? `/wiki/${slug}.html` : '';
    const norm  = normUrl(url);
    if (!slug || seen.has(norm)) continue;
    seen.add(norm);

    if (pageLookup[norm]) continue;   // already exists

    const reasons  = ['expansion_plan_target', action.action_type, ...((action.reasons || []).slice(0, 2))];
    const signals  = [...(action.source_signals || []).slice(0, 4)];

    let score = clamp(action.priority_score || 0, 0, 80);
    const related = (action.related_pages || []).slice(0, 5);
    const avgGC   = related.length
      ? Math.round(related.reduce((s, u) => s + graphCentralityScore(u), 0) / related.length)
      : 0;
    if (avgGC > 0) { score += avgGC; signals.push(`related_avg_centrality:${avgGC}`); }

    candidates.push({
      target_url:         null,
      target_slug:        slug,
      action_type:        'generate_bridge_page',
      priority_score:     score,
      reasons:            [...new Set(reasons)],
      supporting_signals: signals,
      cluster_context:    (action.supporting_clusters || []).join(',') || null,
      recommended_source_pages: related,
    });
  }

  return candidates;
}

/**
 * C. reinforce_hub
 * Hub pages that deserve deeper content or stronger related coverage.
 * Source: hub pages from wiki-index (slugs ending in -ecosystem)
 * + expansion-plan expand_cluster_support actions.
 */
function collectReinforceHub() {
  const seen = new Set();
  const candidates = [];

  // Direct hub pages from wiki-index
  for (const hubUrl of hubUrlSet) {
    const norm  = normUrl(hubUrl);
    if (seen.has(norm)) continue;
    seen.add(norm);

    const entry  = pageLookup[norm];
    if (!entry)  continue;

    const reasons  = ['hub_page', 'ecosystem_anchor'];
    const signals  = [`rank_score:${entry.rank_score || 0}`];

    let score = 60; // base priority for hubs
    const cws  = contentWeakness(norm);
    const ld   = linkDemand(norm);
    const gc   = graphCentralityScore(norm);

    if (cws > 0) { score += cws; signals.push(`content_weakness:${cws}`); reasons.push('needs_depth'); }
    if (ld  > 0) { score += ld;  signals.push(`link_demand:${ld}`);        reasons.push('link_gaps'); }
    if (gc  > 0) { score += gc;  signals.push(`graph_centrality:${gc}`);   reasons.push('high_centrality'); }

    const cid        = memberOf[norm];
    const clusterMembers = cid ? members[cid] || [] : [];
    const weakMembers    = clusterMembers.filter(u => contentWeakness(u) > 20);
    if (weakMembers.length > 0) {
      reasons.push(`weak_cluster_members:${weakMembers.length}`);
      signals.push(`weak_cluster_members:${weakMembers.length}`);
      score += clamp(weakMembers.length * 3, 0, 20);
    }

    candidates.push({
      target_url:         norm,
      target_slug:        slugFromUrl(norm),
      action_type:        'reinforce_hub',
      priority_score:     score,
      reasons:            [...new Set(reasons)],
      supporting_signals: signals,
      cluster_context:    cid ? slugFromUrl(cid) : null,
      recommended_source_pages: clusterMembers.slice(0, 5),
    });
  }

  // From expansion-plan expand_cluster_support
  for (const action of (expansionPlan.actions || [])) {
    if (action.action_type !== 'expand_cluster_support') continue;
    const slug  = action.target_url_slug || '';
    const url   = slug ? `/wiki/${slug}.html` : '';
    const norm  = normUrl(url);
    if (!slug || seen.has(norm)) continue;
    seen.add(norm);

    const entry  = pageLookup[norm];
    if (!entry)  continue;

    const reasons  = ['expansion_plan_cluster_support', ...((action.reasons || []).slice(0, 3))];
    const signals  = [...(action.source_signals || []).slice(0, 4)];

    let score = clamp(action.priority_score || 0, 0, 100);
    score += hubBonus(norm) + graphCentralityScore(norm);

    candidates.push({
      target_url:         norm,
      target_slug:        slug,
      action_type:        'reinforce_hub',
      priority_score:     score,
      reasons:            [...new Set(reasons)],
      supporting_signals: signals,
      cluster_context:    (action.supporting_clusters || []).join(',') || null,
      recommended_source_pages: (action.related_pages || []).slice(0, 5),
    });
  }

  return candidates;
}

/**
 * D. strengthen_cluster_member
 * Member pages inside strong clusters that deserve promotion / more support.
 * Source: isolated_pages from content-gaps + entity-graph pages that are
 * inside large clusters but have low rank and high graph centrality.
 */
function collectStrengthClusterMember() {
  const seen = new Set();
  const candidates = [];

  // From content-gaps isolated_pages
  for (const gap of (contentGaps.isolated_pages || [])) {
    const url  = normUrl(gap.url || '');
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const entry = pageLookup[url];
    if (!entry) continue;

    const reasons  = ['isolated_page', 'needs_cluster_integration'];
    const signals  = [
      `gap_score:${gap.score || 0}`,
      `rank_score:${gap.rank_score || 0}`,
      `inbound_links:${gap.inbound_links || 0}`,
      `strong_peers:${gap.strong_peers || 0}`,
    ];

    let score = clamp(Math.round((gap.score || 0) / 8), 0, 40);
    score += contentWeakness(url) + clusterBonus(url) + graphCentralityScore(url);

    candidates.push({
      target_url:         url,
      target_slug:        slugFromUrl(url),
      action_type:        'strengthen_cluster_member',
      priority_score:     score,
      reasons:            [...new Set(reasons)],
      supporting_signals: signals,
      cluster_context:    memberOf[url] ? slugFromUrl(memberOf[url]) : null,
      recommended_source_pages: (linkLookup[url] && linkLookup[url].inbound_from || []).slice(0, 5),
    });
  }

  // Pages inside large clusters with low rank but high graph centrality
  for (const pageEntry of wikiPages) {
    const url  = normUrl(pageEntry.url);
    if (!url || seen.has(url)) continue;

    const cid  = memberOf[url];
    if (!cid)  continue;
    const clusterSize = (members[cid] || []).length;
    if (clusterSize < 5) continue;   // only meaningful clusters

    const gc  = graphCentrality[url] || 0;
    if (gc < 30) continue;           // must have real relationship demand

    const rank = pageEntry.rank_score || 0;
    if (rank > 400) continue;        // already strong enough

    seen.add(url);

    const reasons  = ['strong_cluster_weak_page', `cluster_size:${clusterSize}`];
    const signals  = [
      `rank_score:${rank}`,
      `graph_centrality_raw:${gc}`,
      `cluster_size:${clusterSize}`,
    ];

    let score = 0;
    score += graphCentralityScore(url) * 2;  // centrality is key here
    score += clamp(Math.round((400 - rank) / 20), 0, 20);  // lower rank → more room to grow
    score += clusterBonus(url);
    score += contentWeakness(url);

    candidates.push({
      target_url:         url,
      target_slug:        slugFromUrl(url),
      action_type:        'strengthen_cluster_member',
      priority_score:     score,
      reasons:            [...new Set(reasons)],
      supporting_signals: signals,
      cluster_context:    slugFromUrl(cid),
      recommended_source_pages: (linkLookup[url] && linkLookup[url].inbound_from || []).slice(0, 5),
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Merge and deduplicate
// ---------------------------------------------------------------------------

/**
 * Merge candidate lists, keeping highest-scored entry per unique target_slug.
 * Hub entries are never overwritten by non-hub entries.
 */
function mergeAndDeduplicate(candidateLists) {
  const best = {};

  for (const list of candidateLists) {
    for (const c of list) {
      const key = c.target_slug || c.target_url || '';
      if (!key) continue;

      const existing = best[key];
      if (!existing || c.priority_score > existing.priority_score) {
        best[key] = c;
      } else if (c.priority_score === existing.priority_score) {
        // Merge reasons and signals to surface richer context
        existing.reasons            = [...new Set([...existing.reasons, ...c.reasons])];
        existing.supporting_signals = [...new Set([...existing.supporting_signals, ...c.supporting_signals])];
      }
    }
  }

  return Object.values(best);
}

/**
 * Sort candidates deterministically:
 * 1. priority_score descending
 * 2. target_slug ascending (tie-breaker)
 */
function sortCandidates(candidates) {
  return candidates.slice().sort((a, b) => {
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
    return (a.target_slug || '').localeCompare(b.target_slug || '');
  });
}

// ---------------------------------------------------------------------------
// Noise filters
// ---------------------------------------------------------------------------

const MIN_PRIORITY_SCORE = 10;

/**
 * Remove low-signal candidates that would not meaningfully improve the wiki.
 */
function filterCandidates(candidates) {
  return candidates.filter(c => {
    if (c.priority_score < MIN_PRIORITY_SCORE) return false;

    // Skip pages with no wiki-index entry AND no slug (unresolvable bridge)
    if (!c.target_url && !c.target_slug) return false;

    return true;
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const expandExisting     = collectExpandExisting();
  const bridgePages        = collectBridgePages();
  const reinforceHub       = collectReinforceHub();
  const strengthenCluster  = collectStrengthClusterMember();

  const merged   = mergeAndDeduplicate([reinforceHub, expandExisting, bridgePages, strengthenCluster]);
  const filtered = filterCandidates(merged);
  const sorted   = sortCandidates(filtered);

  // Summary breakdown by action_type
  const summary = {};
  for (const c of sorted) {
    summary[c.action_type] = (summary[c.action_type] || 0) + 1;
  }

  const output = {
    generated_at:  new Date().toISOString(),
    phase:         'phase_24',
    summary: {
      total_targets:           sorted.length,
      expand_existing_page:    summary.expand_existing_page    || 0,
      generate_bridge_page:    summary.generate_bridge_page    || 0,
      reinforce_hub:           summary.reinforce_hub           || 0,
      strengthen_cluster_member: summary.strengthen_cluster_member || 0,
    },
    priorities: sorted,
  };

  const outPath = path.join(ROOT, 'js', 'growth-priority.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');

  console.log(`growth-priority.json written (${sorted.length} targets)`);
  console.log(`  expand_existing_page:       ${summary.expand_existing_page    || 0}`);
  console.log(`  generate_bridge_page:       ${summary.generate_bridge_page    || 0}`);
  console.log(`  reinforce_hub:              ${summary.reinforce_hub           || 0}`);
  console.log(`  strengthen_cluster_member:  ${summary.strengthen_cluster_member || 0}`);
}

main();
