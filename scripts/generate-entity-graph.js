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
 *   js/entity-graph.json – prior graph state for reinforcement signals (Phase 11)
 *
 * Output shape (js/entity-graph.json):
 * {
 *   "/wiki/page.html": {
 *     "related_pages": [
 *       {
 *         "target_url": "/wiki/other.html",
 *         "score": 123,
 *         "base_score": 40,
 *         "reasons": ["same_category:factions", ...],
 *         "rank_score_boost": 7,
 *         "authority_score_boost": 5,
 *         "graph_centrality_boost": 2,
 *         "reinforcement_boost": 3,
 *         "cluster_support_boost": 1,
 *         "co_citation_boost": 1
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
 *  10. content_depth_boost   – target lore depth + content quality signals (+0–8, Phase 21)
 *                              Uses paragraph_count, lore_paragraph_count, section_count,
 *                              content_quality_score from wiki-index rank_signals.
 *  11. reinforcement_boost   – prior graph inbound popularity (+0–5, Phase 11)
 *  12. cluster_support_boost – shared cluster membership in prior graph (+0–3, Phase 11)
 *  13. co_citation_boost     – co-cited by same pages in prior graph (+0–3, Phase 11)
 *  14. freshness_boost       – strong organic relationship + low prior dominance (+0–4, Phase 12)
 *  15. decay_penalty         – target over-dominant from prior reinforcement (−0–4, Phase 12)
 *
 * Rules:
 *   - No self-links
 *   - No duplicates
 *   - Authority boosts only applied when base relationship score > 0
 *   - Reinforcement boosts only applied when organic score > 0 (capped at
 *     min(REINFORCE_ABS_MAX, floor(organic_score * REINFORCE_SCORE_CAP_PCT)))
 *   - Freshness boost only applied when organic score > 0 and target has low prior dominance
 *   - Decay penalty only applied when target has high prior dominance; cannot push final
 *     score below organic (base) score
 *   - Combined freshness/decay net adjustment capped at min(RECENCY_ABS_NET_CAP,
 *     floor(organic_score * RECENCY_NET_CAP_PCT))
 *   - Output is deterministic: sorted by final_score DESC, then target_url ASC
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
const PRIOR_GRAPH_PATH = OUTPUT_PATH; // read existing output as reinforcement input

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
// Content depth boost constants (Phase 21 – content strength reinforcement)
// ---------------------------------------------------------------------------

// content_depth_boost: rewards target pages with genuine lore depth and
//   structural richness as measured by wiki-index rank_signals.
//
//   raw = floor((paragraph_count
//              + lore_paragraph_count * CONTENT_DEPTH_LORE_WEIGHT
//              + content_quality_score
//              + section_count * CONTENT_DEPTH_SECTION_WEIGHT) / DIVISOR)
//   capped at CONTENT_DEPTH_MAX.
//
//   Only applied when organicScore > 0 (same rule as all authority boosts).
//   Calibration examples (DIVISOR=55, CAP=8):
//     graffpunks  (para=117, lore=112, cqs=103, sect=6) → raw=474 → boost=8
//     alfie-blaze (para=107, lore=103, cqs=90,  sect=6) → raw=433 → boost=7
//     hodl-wars   (para=39,  lore=34,  cqs=107, sect=6) → raw=244 → boost=4
//     hodl-warriors(para=24, lore=19,  cqs=103, sect=6) → raw=195 → boost=3
//     bitcoin-btc (para=5,   lore=0,   cqs=24,  sect=2) → raw=39  → boost=0
//     tokens      (para=4,   lore=0,   cqs=6,   sect=0) → raw=10  → boost=0
const CONTENT_DEPTH_LORE_WEIGHT    = 2;   // lore_paragraph_count counts double
const CONTENT_DEPTH_SECTION_WEIGHT = 5;   // section_count weight
const CONTENT_DEPTH_DIVISOR        = 55;  // raw score divisor
const CONTENT_DEPTH_MAX            = 8;   // hard cap

// ---------------------------------------------------------------------------
// Reinforcement signal constants (Phase 11 – feedback loop)
// ---------------------------------------------------------------------------

// Only consider the top-N related_pages from the prior graph when building
// reinforcement data structures.  A smaller window keeps signals tight and
// avoids noise from low-relevance relationships.
const PRIOR_GRAPH_TOP_N = 15;

// reinforcement_boost: floor(prior_top_N_inbound_count / divisor), capped at max
//   Measures how many other pages already list this target in their top-N related.
const REINFORCE_DIVISOR = 20;
const REINFORCE_MAX     = 5;

// cluster_support_boost: floor(shared_neighbour_count / divisor), capped at max
//   Measures overlap between source and target's top-N neighbourhoods (cluster cohesion).
const CLUSTER_DIVISOR = 3;
const CLUSTER_MAX     = 3;

// co_citation_boost: floor(co_cited_by_count / divisor), capped at max
//   Measures how many pages co-cite both source and target in their top-N related lists.
const CO_CITE_DIVISOR = 2;
const CO_CITE_MAX     = 3;

// Safety cap on total reinforcement per (source, target) pair.
//   Total ≤ min(REINFORCE_ABS_MAX, floor(organic_score * REINFORCE_SCORE_CAP_PCT))
//   This prevents reinforcement from overpowering genuine organic relationships
//   and ensures weak targets never outrank strongly related ones just from graph history.
const REINFORCE_SCORE_CAP_PCT = 0.30;
const REINFORCE_ABS_MAX       = 10;

// ---------------------------------------------------------------------------
// Freshness / decay constants (Phase 12 – lifecycle control)
// ---------------------------------------------------------------------------

// freshness_boost: rewarded when organic relationship is strong but target has not
//   yet been reinforced by many prior graph runs (low prior inbound popularity).
//   raw = floor(organicScore / FRESH_DIVISOR), capped at FRESH_BOOST_MAX.
//   Only applied when organicScore >= FRESH_ORGANIC_MIN AND priorInbound < FRESH_INBOUND_THRESHOLD.
const FRESH_BOOST_MAX          = 4;
const FRESH_DIVISOR            = 20;
const FRESH_ORGANIC_MIN        = 8;   // minimum organic score to earn freshness boost
const FRESH_INBOUND_THRESHOLD  = 10;  // target priorInbound must be below this

// decay_penalty: applied when target is over-dominant from repeated prior reinforcement
//   (many pages already list it in their top-N related-pages).
//   raw = floor(priorInbound / DECAY_DIVISOR), capped at DECAY_PENALTY_MAX.
//   Only applied when priorInbound >= DECAY_INBOUND_THRESHOLD.
//   Cannot push final_score below organicScore (organic floor is always preserved).
const DECAY_PENALTY_MAX        = 4;
const DECAY_DIVISOR            = 5;
const DECAY_INBOUND_THRESHOLD  = 15;  // target priorInbound must be at or above this

// Safety cap on combined freshness/decay net adjustment per (source, target) pair.
//   |recency_balance| ≤ min(RECENCY_ABS_NET_CAP, floor(organicScore * RECENCY_NET_CAP_PCT))
//   Keeps freshness/decay a controlled minority of the total score.
const RECENCY_NET_CAP_PCT  = 0.20;
const RECENCY_ABS_NET_CAP  = 5;

// ---------------------------------------------------------------------------
// Module-level prior-graph state (populated once in main())
// ---------------------------------------------------------------------------

// url → Set of pages that include this url in their top-N related_pages
let priorRelInbound = {};

// url → Set of top-N target urls in that url's prior related_pages
let priorRelatedSets = {};

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
 * Compute organic score + reasons for a (source, target) pair.
 * tgtBoosts contains pre-computed authority boost fields for the target URL.
 * Returns null if organic relationship score === 0 (no real relationship).
 *
 * @returns {{ score, organicScore, reasons, rank_score_boost,
 *             authority_score_boost, graph_centrality_boost,
 *             content_depth_boost } | null}
 */
function computeRelationship(srcEntry, tgtEntry, srcLinks, tgtLinks, tgtBoosts) {
  let organicScore = 0;
  const reasons = [];

  // 1 / 5 – same category (covers "same faction" and "same category")
  if (srcEntry.category && srcEntry.category === tgtEntry.category) {
    organicScore += SCORE_SAME_CATEGORY;
    reasons.push(`same_category:${srcEntry.category}`);
  }

  const srcTags = contentTags(srcEntry);
  const tgtTags = contentTags(tgtEntry);

  // 2 – same storyline / event
  for (const t of srcTags) {
    if (EVENT_TAGS.has(t) && tgtTags.has(t)) {
      organicScore += SCORE_EVENT_TAG;
      reasons.push(`same_event_tag:${t}`);
    }
  }

  // 3 – same location
  for (const t of srcTags) {
    if (LOCATION_TAGS.has(t) && tgtTags.has(t)) {
      organicScore += SCORE_LOCATION_TAG;
      reasons.push(`same_location_tag:${t}`);
    }
  }

  // 4 – shared entity / character tags (non-generic, non-event, non-location)
  for (const t of srcTags) {
    if (!EVENT_TAGS.has(t) && !LOCATION_TAGS.has(t) && tgtTags.has(t)) {
      organicScore += SCORE_ENTITY_TAG;
      reasons.push(`shared_tag:${t}`);
    }
  }

  // 6 – existing link overlap
  let overlapCount = 0;
  for (const u of srcLinks) {
    if (tgtLinks.has(u)) overlapCount++;
  }
  if (overlapCount > 0) {
    organicScore += overlapCount * SCORE_LINK_OVERLAP;
    reasons.push(`link_overlap:${overlapCount}`);
  }

  // Only include authority / reinforcement boosts when there is an organic relationship
  if (organicScore === 0) return null;

  // 7–10 – authority boosts for the target page (Phase 10 + Phase 21)
  const { rank_score_boost, authority_score_boost, graph_centrality_boost, content_depth_boost } = tgtBoosts;

  let score = organicScore;
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
  if (content_depth_boost > 0) {
    score += content_depth_boost;
    reasons.push(`content_depth_boost:${content_depth_boost}`);
  }

  return {
    score,
    organicScore,
    reasons,
    rank_score_boost,
    authority_score_boost,
    graph_centrality_boost,
    content_depth_boost,
  };
}

/**
 * Compute controlled reinforcement boosts for a (source, target) pair using
 * the prior entity-graph state.
 *
 * All three boosts are:
 *   - Capped individually at their own hard limits
 *   - Capped collectively at min(REINFORCE_ABS_MAX, floor(organicScore * PCT))
 *   - Only applied when organicScore > 0 (caller enforces this)
 *   - Entirely deterministic (no randomness)
 *
 * @param {string} srcUrl
 * @param {string} tgtUrl
 * @param {number} organicScore  Organic relationship score (before any boosts)
 * @returns {{ reinforcement_boost, cluster_support_boost, co_citation_boost,
 *             reinforcementReasons: string[] }}
 */
function computeReinforcementBoosts(srcUrl, tgtUrl, organicScore) {
  // Safety cap on total reinforcement relative to organic relationship strength.
  // floor(organicScore * PCT) means: for organic=8 → cap=2; organic=40 → cap=12 (→ ABS_MAX).
  const pctCap = Math.floor(organicScore * REINFORCE_SCORE_CAP_PCT);
  const maxTotal = Math.min(REINFORCE_ABS_MAX, pctCap);

  // If organic score is too weak to allow any reinforcement, bail early.
  if (maxTotal <= 0) {
    return { reinforcement_boost: 0, cluster_support_boost: 0, co_citation_boost: 0, reinforcementReasons: [] };
  }

  // 10 – reinforcement_boost: prior graph inbound popularity of the target.
  //   How many other pages (excluding source) already list target in their top-N
  //   related pages.  Rewards targets that are organically popular across the graph.
  const tgtInbound = priorRelInbound[tgtUrl] || new Set();
  const inboundCount = tgtInbound.has(srcUrl) ? tgtInbound.size - 1 : tgtInbound.size;
  let reinforcement_boost = Math.min(Math.floor(inboundCount / REINFORCE_DIVISOR), REINFORCE_MAX);

  // 11 – cluster_support_boost: neighbourhood overlap between source and target.
  //   Counts how many URLs appear in both the source's and the target's top-N
  //   related-page sets (shared neighbours = cluster cohesion).
  const srcRel = priorRelatedSets[srcUrl] || new Set();
  const tgtRel = priorRelatedSets[tgtUrl] || new Set();
  let clusterOverlap = 0;
  for (const url of srcRel) {
    if (url !== tgtUrl && tgtRel.has(url)) clusterOverlap++;
  }
  let cluster_support_boost = Math.min(Math.floor(clusterOverlap / CLUSTER_DIVISOR), CLUSTER_MAX);

  // 12 – co_citation_boost: how many pages co-cite both source and target.
  //   Intersection of pages that have src in their top-N AND pages that have
  //   tgt in their top-N.  Co-cited pairs share context across the graph.
  const srcInbound = priorRelInbound[srcUrl] || new Set();
  const tgtInboundSet = priorRelInbound[tgtUrl] || new Set();
  let coCiteCount = 0;
  for (const pageUrl of srcInbound) {
    if (pageUrl !== tgtUrl && tgtInboundSet.has(pageUrl)) coCiteCount++;
  }
  let co_citation_boost = Math.min(Math.floor(coCiteCount / CO_CITE_DIVISOR), CO_CITE_MAX);

  // Apply collective safety cap: scale down proportionally if sum exceeds cap.
  const totalRaw = reinforcement_boost + cluster_support_boost + co_citation_boost;
  if (totalRaw > maxTotal && totalRaw > 0) {
    const factor = maxTotal / totalRaw;
    reinforcement_boost  = Math.floor(reinforcement_boost  * factor);
    cluster_support_boost = Math.floor(cluster_support_boost * factor);
    co_citation_boost     = Math.floor(co_citation_boost     * factor);
  }

  const reinforcementReasons = [];
  if (reinforcement_boost  > 0) reinforcementReasons.push(`reinforcement_boost:${reinforcement_boost}`);
  if (cluster_support_boost > 0) reinforcementReasons.push(`cluster_support_boost:${cluster_support_boost}`);
  if (co_citation_boost     > 0) reinforcementReasons.push(`co_citation_boost:${co_citation_boost}`);

  return { reinforcement_boost, cluster_support_boost, co_citation_boost, reinforcementReasons };
}

/**
 * Compute freshness boost and decay penalty for a (source, target) pair using
 * prior graph inbound popularity signals (Phase 12).
 *
 * freshness_boost: rewarded when this pair has a meaningful organic relationship
 *   but the target has not yet accumulated high graph inbound popularity —
 *   indicating a newly-relevant or under-reinforced relationship.
 *
 * decay_penalty: applied when the target is already over-dominant in the prior
 *   graph (many pages list it in their top-N), reducing stale graph centrality.
 *   Can never push final_score below organicScore (organic floor preserved).
 *
 * Both signals are deterministic (no randomness), individually capped, and the
 * combined net adjustment is capped at a small minority of organicScore.
 *
 * @param {string} tgtUrl
 * @param {number} organicScore  Organic relationship score (base_score)
 * @param {number} currentScore  Score after organic + authority + reinforcement
 * @returns {{ freshness_boost, decay_penalty, recency_balance, final_score }}
 */
function computeFreshnessDecay(tgtUrl, organicScore, currentScore) {
  const priorInbound = (priorRelInbound[tgtUrl] || new Set()).size;

  // --- freshness_boost ---
  // Conditions: strong organic relationship + target not yet graph-dominant.
  let freshness_boost = 0;
  if (organicScore >= FRESH_ORGANIC_MIN && priorInbound < FRESH_INBOUND_THRESHOLD) {
    const raw = Math.floor(organicScore / FRESH_DIVISOR);
    freshness_boost = Math.min(raw, FRESH_BOOST_MAX);
  }

  // --- decay_penalty ---
  // Condition: target has high prior inbound popularity (over-dominant).
  // Cannot bring currentScore below organicScore (organic floor).
  let decay_penalty = 0;
  if (priorInbound >= DECAY_INBOUND_THRESHOLD) {
    const raw = Math.floor(priorInbound / DECAY_DIVISOR);
    decay_penalty = Math.min(raw, DECAY_PENALTY_MAX);
    // Enforce organic floor: decay cannot exceed (currentScore - organicScore)
    const headroom = currentScore - organicScore;
    if (headroom > 0) {
      decay_penalty = Math.min(decay_penalty, headroom);
    } else {
      decay_penalty = 0;
    }
  }

  // --- net cap: combined adjustment must remain a minority of organicScore ---
  const netCap = Math.min(RECENCY_ABS_NET_CAP, Math.floor(organicScore * RECENCY_NET_CAP_PCT));
  let netRaw = freshness_boost - decay_penalty;

  if (netRaw > netCap) {
    // Freshness is too large — trim it down.
    freshness_boost = decay_penalty + netCap;
    netRaw = netCap;
  } else if (netRaw < -netCap) {
    // Decay is too large — trim it down (re-check organic floor after trim).
    decay_penalty = freshness_boost + netCap;
    netRaw = -netCap;
  }

  const recency_balance = netRaw;
  // Apply recency_balance; always respect organic floor.
  const final_score = Math.max(currentScore + recency_balance, organicScore);

  return { freshness_boost, decay_penalty, recency_balance, final_score };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const entityMap  = JSON.parse(fs.readFileSync(ENTITY_MAP_PATH, 'utf8'));
  const wikiIndex  = JSON.parse(fs.readFileSync(WIKI_INDEX_PATH, 'utf8'));
  const linkMap    = JSON.parse(fs.readFileSync(LINK_MAP_PATH,   'utf8'));
  const linkGraph  = JSON.parse(fs.readFileSync(LINK_GRAPH_PATH, 'utf8'));

  // ---------------------------------------------------------------------------
  // Load prior graph and build reinforcement data structures (Phase 11)
  // ---------------------------------------------------------------------------
  // priorRelInbound[url]  = Set of pages whose top-N related_pages include url
  // priorRelatedSets[url] = Set of the top-N target urls from url's related_pages
  //
  // Both are built from the current entity-graph.json before we overwrite it,
  // forming a controlled single-step feedback loop.
  if (fs.existsSync(PRIOR_GRAPH_PATH)) {
    const priorGraph = JSON.parse(fs.readFileSync(PRIOR_GRAPH_PATH, 'utf8'));
    for (const [srcUrl, data] of Object.entries(priorGraph)) {
      // Sort by base_score (organic relationship quality) when available, falling
      // back to score.  Using the organic-only base_score for top-N selection
      // ensures the priorRelInbound and priorRelatedSets sets are stable across
      // successive runs: reinforcement boosts never shift which neighbours are
      // considered "top-N", so the feedback loop converges deterministically.
      const relPages = data.related_pages || [];
      const sorted = relPages.slice().sort((a, b) => {
        const bBase = b.base_score !== undefined ? b.base_score : b.score;
        const aBase = a.base_score !== undefined ? a.base_score : a.score;
        if (bBase !== aBase) return bBase - aBase;
        return a.target_url.localeCompare(b.target_url);
      });
      const topRel = sorted.slice(0, PRIOR_GRAPH_TOP_N);
      priorRelatedSets[srcUrl] = new Set(topRel.map(r => r.target_url));
      for (const rel of topRel) {
        if (!priorRelInbound[rel.target_url]) priorRelInbound[rel.target_url] = new Set();
        priorRelInbound[rel.target_url].add(srcUrl);
      }
    }
  }

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

    // content_depth_boost (Phase 21): rewards pages with genuine lore depth and
    // structural richness using paragraph_count, lore_paragraph_count,
    // section_count, and content_quality_score from wiki-index rank_signals.
    const signals = (wiki && wiki.rank_signals) ? wiki.rank_signals : {};
    const paraCount    = signals.paragraph_count       || 0;
    const lorePara     = signals.lore_paragraph_count  || 0;
    const sectionCount = signals.section_count         || 0;
    const contentQuality = signals.content_quality_score || 0;
    const rawContentDepth = paraCount
      + lorePara * CONTENT_DEPTH_LORE_WEIGHT
      + contentQuality
      + sectionCount * CONTENT_DEPTH_SECTION_WEIGHT;
    const content_depth_boost = Math.min(
      Math.floor(rawContentDepth / CONTENT_DEPTH_DIVISOR),
      CONTENT_DEPTH_MAX
    );

    authorityBoosts[url] = { rank_score_boost, authority_score_boost, graph_centrality_boost, content_depth_boost };
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
        rank_score_boost: 0, authority_score_boost: 0, graph_centrality_boost: 0, content_depth_boost: 0,
      };

      const rel = computeRelationship(srcEntity, tgtEntity, srcLinks, tgtLinks, tgtBoosts);
      if (!rel) continue;

      // Compute reinforcement boosts from prior graph state (Phase 11).
      // These are capped at 30% of organic score and have hard per-boost limits.
      const reinforce = computeReinforcementBoosts(srcUrl, tgtUrl, rel.organicScore);

      const scoreAfterReinforcement = rel.score
        + reinforce.reinforcement_boost
        + reinforce.cluster_support_boost
        + reinforce.co_citation_boost;

      // Compute freshness boost and decay penalty (Phase 12).
      // freshness_boost and decay_penalty are deterministic, capped, and keep the
      // freshness/decay layer as a controlled minority of the total score.
      const recency = computeFreshnessDecay(tgtUrl, rel.organicScore, scoreAfterReinforcement);

      relatedPages.push({
        target_url:             tgtUrl,
        score:                  scoreAfterReinforcement,
        base_score:             rel.organicScore,
        reasons:                [...rel.reasons, ...reinforce.reinforcementReasons],
        rank_score_boost:       rel.rank_score_boost,
        authority_score_boost:  rel.authority_score_boost,
        graph_centrality_boost: rel.graph_centrality_boost,
        content_depth_boost:    rel.content_depth_boost,
        reinforcement_boost:    reinforce.reinforcement_boost,
        cluster_support_boost:  reinforce.cluster_support_boost,
        co_citation_boost:      reinforce.co_citation_boost,
        freshness_boost:        recency.freshness_boost,
        decay_penalty:          recency.decay_penalty,
        recency_balance:        recency.recency_balance,
        final_score:            recency.final_score,
        score_breakdown: {
          base_score:             rel.organicScore,
          rank_score_boost:       rel.rank_score_boost,
          authority_score_boost:  rel.authority_score_boost,
          graph_centrality_boost: rel.graph_centrality_boost,
          content_depth_boost:    rel.content_depth_boost,
          reinforcement_boost:    reinforce.reinforcement_boost,
          cluster_support_boost:  reinforce.cluster_support_boost,
          co_citation_boost:      reinforce.co_citation_boost,
          freshness_boost:        recency.freshness_boost,
          decay_penalty:          recency.decay_penalty,
          recency_balance:        recency.recency_balance,
          final_score:            recency.final_score,
        },
      });
    }

    // Sort: highest final_score first, then target_url alphabetically for determinism
    relatedPages.sort((a, b) => {
      if (b.final_score !== a.final_score) return b.final_score - a.final_score;
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
