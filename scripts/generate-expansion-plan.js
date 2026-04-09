#!/usr/bin/env node
'use strict';

/**
 * generate-expansion-plan.js
 * Phase 15: Controlled expansion engine from content gaps.
 *
 * Reads:
 *   js/content-gaps.json
 *   js/wiki-index.json
 *   js/entity-map.json
 *   js/entity-graph.json
 *   js/link-map.json
 *   js/link-graph.json
 *   js/injection-plan.json
 *
 * Writes:
 *   js/expansion-plan.json
 *
 * Rules:
 *  - Deterministic: same inputs always produce same outputs (sorted, no randomness)
 *  - Planning only: never creates pages, never touches ranking/search/frontend
 *  - All signals come from real repo data only
 *  - Prefer fewer strong actions over many weak ones
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
const contentGaps   = readJson('js/content-gaps.json');
const wikiIndexRaw  = readJson('js/wiki-index.json');
const linkGraph     = readJson('js/link-graph.json');
const injectionPlan = readJson('js/injection-plan.json');

// wiki-index is a numeric-keyed object containing an array of page entries
const wikiPages = Object.values(wikiIndexRaw);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normUrl(u) {
  return (u || '').trim().replace(/\/$/, '');
}

/** Build URL → wiki-index entry lookup. */
function buildPageLookup(pages) {
  const map = {};
  for (const p of pages) {
    map[normUrl(p.url)] = p;
  }
  return map;
}

/**
 * Derive a clean URL slug from a string.
 * Lower-case, replace spaces/special chars with hyphens, collapse consecutive hyphens.
 */
function toSlug(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Extract the slug portion from a wiki URL path.
 * e.g. "/wiki/graffpunks.html" → "graffpunks"
 */
function slugFromUrl(url) {
  return path.basename(url, '.html');
}

/**
 * Clean a display topic string derived from wiki titles.
 * Strips trailing " — Crypto Moonboys Wiki", replaces underscores with spaces,
 * and trims whitespace.
 */
function cleanTopic(raw) {
  return raw
    .replace(/ — Crypto Moonboys Wiki$/, '')
    .replace(/_/g, ' ')
    .trim();
}

/**
 * Collect unique tags from a list of page URLs using the wiki-index lookup.
 * Returns alphabetically sorted array of distinct tags.
 */
function keywordsFromPages(urls, pageLookup, maxKeywords) {
  const seen = new Set();
  for (const u of urls) {
    const entry = pageLookup[normUrl(u)];
    if (!entry || !Array.isArray(entry.tags)) continue;
    for (const tag of entry.tags) {
      const t = tag.toLowerCase().trim();
      if (t && t !== 'crypto' && t !== 'moonboys' && t !== 'wiki') {
        seen.add(t);
      }
    }
  }
  return Array.from(seen).sort().slice(0, maxKeywords);
}

/**
 * Count how many times each URL appears as an injection target.
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

/** Parse a numeric value from a "key:value" reason string, return 0 if not found. */
function reasonValue(reasons, prefix) {
  for (const r of reasons) {
    if (r.startsWith(prefix + ':')) {
      const n = parseInt(r.slice(prefix.length + 1), 10);
      return Number.isNaN(n) ? 0 : n;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Pre-build lookups
// ---------------------------------------------------------------------------
const pageLookup         = buildPageLookup(wikiPages);
const injectionHitCounts = buildInjectionTargetCounts(injectionPlan);

// Set of URLs that appear in stale_coverage_gaps — these get expand_cluster_support,
// not strengthen_existing_page.
const staleUrls = new Set(
  (contentGaps.stale_coverage_gaps || []).map(s => normUrl(s.url))
);

// ---------------------------------------------------------------------------
// Confidence scoring helpers
// ---------------------------------------------------------------------------

function bridgeConfidence(score) {
  if (score >= 250) return 'high';
  if (score >= 150) return 'medium';
  return 'low';
}

function topicConfidence(score, dedicatedPages) {
  if (dedicatedPages === 0 && score >= 150) return 'high';
  if (dedicatedPages === 0 && score >= 60)  return 'medium';
  return 'low';
}

function strengthenConfidence(rankScore) {
  if (rankScore >= 600) return 'high';
  if (rankScore >= 400) return 'medium';
  return 'low';
}

function expandClusterConfidence(injectionHits, strongRelatedCount) {
  if (injectionHits >= 15 && strongRelatedCount >= 50) return 'high';
  if (injectionHits >= 10) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Generic section recommendations per action type
// ---------------------------------------------------------------------------
const SECTION_TEMPLATES = {
  strengthen_existing_page: [
    'Key related pages to link',
    'Cross-cluster connections',
    'Authority-building context'
  ],
  create_bridge_page: [
    'Bridge overview',
    'Cluster A context',
    'Cluster B context',
    'Key cross-cluster entities',
    'Related topics'
  ],
  create_topic_page: [
    'Topic overview',
    'Key pages in this topic',
    'Related entities',
    'Cross-topic connections'
  ],
  expand_cluster_support: [
    'Cluster overview',
    'Under-covered adjacent pages',
    'Strong adjacents to strengthen',
    'Key connections to develop'
  ]
};

// ---------------------------------------------------------------------------
// PLAN A: strengthen_existing_page
// Source: underlinked_pages with high authority, not already in stale_coverage_gaps
// Threshold: rank_score >= 400 and gap score >= 100
// ---------------------------------------------------------------------------
const MIN_STRENGTHEN_RANK   = 400;
const MIN_STRENGTHEN_SCORE  = 100;

function buildStrengthenActions() {
  const actions = [];

  for (const page of (contentGaps.underlinked_pages || [])) {
    const url = normUrl(page.url);

    if (staleUrls.has(url)) continue; // handled by expand_cluster_support
    if (page.rank_score < MIN_STRENGTHEN_RANK) continue;
    if (page.score < MIN_STRENGTHEN_SCORE) continue;

    const conf = strengthenConfidence(page.rank_score);
    if (conf === 'low') continue; // filter low-confidence noise

    const entry      = pageLookup[url] || {};
    const urlSlug    = slugFromUrl(page.url);
    const topic      = entry.title
      ? cleanTopic(entry.title)
      : urlSlug.replace(/-/g, ' ');

    // Related pages: outbound suggestions from link-graph if available
    const lgEntry      = linkGraph[url] || {};
    const relatedPages = (lgEntry.suggested_outbound || []).slice(0, 5);

    const keywords = keywordsFromPages([url, ...relatedPages], pageLookup, 8);

    // Priority = gap_score + rank_score contribution
    const priorityScore = Math.round(page.score + page.rank_score * 0.05);

    actions.push({
      action_type:           'strengthen_existing_page',
      priority_score:        priorityScore,
      target_topic:          topic,
      target_url_slug:       urlSlug,
      reasons:               page.reasons,
      source_signals:        [
        `gap_score:${page.score}`,
        `rank_score:${page.rank_score}`,
        `inbound_links:${page.inbound_links}`,
        `injection_plan_hits:${page.injection_plan_hits}`
      ],
      related_pages:         relatedPages,
      supporting_clusters:   Array.isArray(entry.tags)
        ? entry.tags.filter(t => t !== 'crypto' && t !== 'moonboys' && t !== 'wiki').slice(0, 3)
        : [],
      recommended_sections:  SECTION_TEMPLATES.strengthen_existing_page,
      recommended_keywords:  keywords,
      confidence:            conf
    });
  }

  return actions;
}

// ---------------------------------------------------------------------------
// PLAN B: create_bridge_page
// Source: bridge_opportunities where score >= 150 and existing_bridge_pages === 0
// Dedup by sorted cluster pair to avoid redundant variations.
// ---------------------------------------------------------------------------
const MIN_BRIDGE_SCORE = 150;
// Tags too generic to form a meaningful standalone bridge page slug
const GENERIC_CLUSTER_TAGS = new Set(['free', 'radio', 'crypto', 'moonboys', 'wiki', 'the']);

/** Normalise a cluster name for dedup: strip trailing 's' from 4+ char names. */
function normCluster(c) {
  // Only strip if result is still >= 3 chars
  if (c.length >= 4 && c.endsWith('s')) return c.slice(0, -1);
  return c;
}

function buildBridgeActions() {
  const actions     = [];
  const seenPairs   = new Set();

  for (const bridge of (contentGaps.bridge_opportunities || [])) {
    if (bridge.score < MIN_BRIDGE_SCORE) continue;

    const existingBridges = reasonValue(bridge.reasons, 'existing_bridge_pages');
    if (existingBridges > 0) continue;

    // Skip if either cluster is too generic for a named bridge page
    if (GENERIC_CLUSTER_TAGS.has(bridge.cluster_a) || GENERIC_CLUSTER_TAGS.has(bridge.cluster_b)) continue;

    // Dedup: treat (a,b) and (b,a) as the same pair; also collapse plurals
    const pairKey = [normCluster(bridge.cluster_a), normCluster(bridge.cluster_b)].sort().join('::');
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    const conf = bridgeConfidence(bridge.score);
    if (conf === 'low') continue;

    // Derive a slug from both cluster names
    const bridgeTopic = `${bridge.cluster_a}-${bridge.cluster_b}`;
    const urlSlug     = toSlug(bridgeTopic);

    // Gather related pages from wiki-index that match either cluster tag
    const clusterTags    = new Set([bridge.cluster_a, bridge.cluster_b]);
    const relatedPages   = wikiPages
      .filter(p => Array.isArray(p.tags) && p.tags.some(t => clusterTags.has(t.toLowerCase())))
      .sort((a, b) => b.rank_score - a.rank_score)
      .slice(0, 5)
      .map(p => p.url);

    const keywords = keywordsFromPages(relatedPages, pageLookup, 8);

    const priorityScore = Math.round(bridge.score);

    const sections = [
      `Bridge overview: ${bridge.cluster_a} and ${bridge.cluster_b}`,
      `${bridge.cluster_a} context`,
      `${bridge.cluster_b} context`,
      'Key cross-cluster entities',
      'Related topics'
    ];

    actions.push({
      action_type:          'create_bridge_page',
      priority_score:       priorityScore,
      target_topic:         bridgeTopic,
      target_url_slug:      urlSlug,
      reasons:              bridge.reasons,
      source_signals:       [
        `bridge_score:${bridge.score}`,
        `cross_cluster_edge_count:${bridge.cross_cluster_edge_count}`,
        `cluster_a:${bridge.cluster_a}`,
        `cluster_b:${bridge.cluster_b}`,
        `suggested_page_topic:${bridge.suggested_page_topic}`
      ],
      related_pages:        relatedPages,
      supporting_clusters:  [bridge.cluster_a, bridge.cluster_b],
      recommended_sections: sections,
      recommended_keywords: keywords,
      confidence:           conf
    });
  }

  return actions;
}

// ---------------------------------------------------------------------------
// PLAN C: create_topic_page
// Source: topic_expansion_opportunities where dedicated_strong_pages === 0
// Filter out generic/noise tags
// ---------------------------------------------------------------------------
const GENERIC_TOPICS = new Set(['free', 'radio', 'the', 'crypto', 'moonboys', 'wiki']);

function buildTopicActions() {
  const actions = [];

  for (const topic of (contentGaps.topic_expansion_opportunities || [])) {
    if (topic.dedicated_strong_pages > 0) continue;
    if (GENERIC_TOPICS.has(topic.suggested_topic)) continue;

    const conf = topicConfidence(topic.score, topic.dedicated_strong_pages);
    if (conf === 'low') continue;

    const urlSlug    = toSlug(topic.suggested_topic);
    const topicLabel = topic.suggested_topic;

    const relatedPages = (topic.candidate_related_pages || []).slice(0, 5);
    const keywords     = keywordsFromPages(relatedPages, pageLookup, 8);

    // Parse avg_rank_score from source_signals for priority boost
    let avgRank = 0;
    for (const sig of (topic.source_signals || [])) {
      if (sig.startsWith('avg_rank_score:')) {
        avgRank = parseInt(sig.slice('avg_rank_score:'.length), 10) || 0;
        break;
      }
    }

    const priorityScore = Math.round(topic.score + avgRank * 0.05);

    actions.push({
      action_type:          'create_topic_page',
      priority_score:       priorityScore,
      target_topic:         topicLabel,
      target_url_slug:      urlSlug,
      reasons:              [
        `dedicated_strong_pages:${topic.dedicated_strong_pages}`,
        `tag_page_count:${topic.tag_page_count}`,
        `topic_score:${topic.score}`
      ],
      source_signals:       topic.source_signals || [],
      related_pages:        relatedPages,
      supporting_clusters:  [topicLabel],
      recommended_sections: SECTION_TEMPLATES.create_topic_page,
      recommended_keywords: keywords,
      confidence:           conf
    });
  }

  return actions;
}

// ---------------------------------------------------------------------------
// PLAN D: expand_cluster_support
// Source: stale_coverage_gaps — pages with reinforcement concentration and
//         many under-covered adjacent pages
// ---------------------------------------------------------------------------
function buildExpandClusterActions() {
  const actions = [];

  for (const stale of (contentGaps.stale_coverage_gaps || [])) {
    const url    = normUrl(stale.url);
    const entry  = pageLookup[url] || {};
    const urlSlug = slugFromUrl(stale.url);

    const topic = entry.title
      ? cleanTopic(entry.title)
      : urlSlug.replace(/-/g, ' ');

    const injHits        = stale.injection_plan_hits || 0;
    const strongRelated  = stale.strong_related_count || 0;
    const conf           = expandClusterConfidence(injHits, strongRelated);

    const relatedPages = (stale.under_covered_adjacents || []).slice(0, 5);
    const keywords     = keywordsFromPages([url, ...relatedPages], pageLookup, 8);

    // Priority: stale gap score + injection pressure
    const priorityScore = Math.round(stale.score + injHits * 3);

    actions.push({
      action_type:          'expand_cluster_support',
      priority_score:       priorityScore,
      target_topic:         topic,
      target_url_slug:      urlSlug,
      reasons:              stale.reasons,
      source_signals:       [
        `gap_score:${stale.score}`,
        `rank_score:${stale.rank_score}`,
        `injection_plan_hits:${injHits}`,
        `strong_related_count:${strongRelated}`,
        `under_covered_adjacents:${(stale.under_covered_adjacents || []).length}`
      ],
      related_pages:        relatedPages,
      supporting_clusters:  Array.isArray(entry.tags)
        ? entry.tags.filter(t => t !== 'crypto' && t !== 'moonboys' && t !== 'wiki').slice(0, 3)
        : [],
      recommended_sections: SECTION_TEMPLATES.expand_cluster_support,
      recommended_keywords: keywords,
      confidence:           conf
    });
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Assemble and sort all actions
// Sort: priority_score DESC, then target_topic ASC (deterministic tiebreak)
// ---------------------------------------------------------------------------
function sortActions(actions) {
  return actions.slice().sort((a, b) => {
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
    return a.target_topic.localeCompare(b.target_topic);
  });
}

// ---------------------------------------------------------------------------
// Build summary
// ---------------------------------------------------------------------------
function buildSummary(actions) {
  const counts = {
    strengthen_existing_page: 0,
    create_bridge_page:       0,
    create_topic_page:        0,
    expand_cluster_support:   0
  };
  for (const a of actions) {
    if (counts[a.action_type] !== undefined) counts[a.action_type]++;
  }
  return {
    total_actions:            actions.length,
    strengthen_existing_page: counts.strengthen_existing_page,
    create_bridge_page:       counts.create_bridge_page,
    create_topic_page:        counts.create_topic_page,
    expand_cluster_support:   counts.expand_cluster_support
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const allActions = sortActions([
  ...buildStrengthenActions(),
  ...buildBridgeActions(),
  ...buildTopicActions(),
  ...buildExpandClusterActions()
]);

const output = {
  generated_at: new Date().toISOString(),
  summary:      buildSummary(allActions),
  actions:      allActions
};

const outPath = path.join(ROOT, 'js', 'expansion-plan.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');

console.log(`expansion-plan.json written: ${allActions.length} actions`);
for (const [type, count] of Object.entries(output.summary)) {
  if (type !== 'total_actions') {
    console.log(`  ${type}: ${count}`);
  }
}
console.log('Done ✅');
