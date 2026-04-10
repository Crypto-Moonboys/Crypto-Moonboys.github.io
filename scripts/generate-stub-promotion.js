#!/usr/bin/env node
'use strict';

/**
 * generate-stub-promotion.js
 * Phase 3: Editorial Intelligence — Stub Promotion Engine.
 *
 * Reads:
 *   js/wiki-index.json
 *   js/link-graph.json
 *   js/growth-priority.json
 *   js/entity-map.json
 *   js/narrative-paths.json
 *
 * Writes:
 *   js/stub-promotion.json
 *
 * Identifies stub pages ready for promotion based on:
 *  - inbound_links: count of inbound links from link-graph.json
 *  - entity_relevance: whether page appears in entity-map.json
 *  - rank_support: rank_score from wiki-index.json
 *  - narrative_path_inclusion: whether URL appears in any narrative-paths step
 *  - growth_priority_action: action_type from growth-priority.json
 *
 * Promotion score formula (deterministic):
 *   promotion_score =
 *     (inbound_links * 3) +
 *     (entity_relevance ? 20 : 0) +
 *     Math.min(rank_score / 10, 50) +
 *     (narrative_path_inclusion ? 25 : 0) +
 *     (growth_action === 'reinforce_hub' ? 30 : growth_action === 'expand_existing_page' ? 15 : 0)
 *
 * Recommendation thresholds:
 *  - promotion_score >= 80 → "promote"
 *  - promotion_score >= 40 → "monitor"
 *  - else → "hold"
 *
 * Rules:
 *  - Deterministic: same inputs always produce same outputs
 *  - No randomness
 *  - Root-relative paths only
 *  - Does not modify any existing wiki pages
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

// ---------------------------------------------------------------------------
// Load inputs
// ---------------------------------------------------------------------------

const wikiIndexRaw   = readJson('js/wiki-index.json');
const linkGraph      = readJson('js/link-graph.json');
const growthPriority = readJson('js/growth-priority.json');
const entityMapRaw   = readJson('js/entity-map.json');
const narrativePaths = readJson('js/narrative-paths.json');

const wikiPages = Array.isArray(wikiIndexRaw) ? wikiIndexRaw : Object.values(wikiIndexRaw);

// ---------------------------------------------------------------------------
// Build lookup structures
// ---------------------------------------------------------------------------

// entity URLs set
const entityUrls = new Set(
  (Array.isArray(entityMapRaw) ? entityMapRaw : Object.values(entityMapRaw))
    .map(e => e.canonical_url)
);

// narrative path URLs set: any URL that appears in any step of any path
const narrativePathUrls = new Set();
for (const p of (narrativePaths.paths || [])) {
  for (const step of (p.steps || [])) {
    if (step.url) narrativePathUrls.add(step.url);
  }
}

// growth priority lookup: url → action_type
const growthActionLookup = {};
for (const p of (growthPriority.priorities || [])) {
  if (p.target_url) growthActionLookup[p.target_url] = p.action_type;
}

// inbound link counts from link-graph
// link-graph.json is keyed by URL; each entry has inbound_count
const inboundCounts = {};
for (const [url, data] of Object.entries(linkGraph)) {
  inboundCounts[url] = typeof data.inbound_count === 'number' ? data.inbound_count : 0;
}

// ---------------------------------------------------------------------------
// Assess all wiki pages
// ---------------------------------------------------------------------------

function getRecommendation(score) {
  if (score >= 80) return 'promote';
  if (score >= 40) return 'monitor';
  return 'hold';
}

const candidates = wikiPages.map(page => {
  const url            = page.url;
  const title          = page.title;
  const rankScore      = typeof page.rank_score === 'number' ? page.rank_score : 0;

  const inboundLinks         = inboundCounts[url] || 0;
  const entityRelevance      = entityUrls.has(url);
  const narrativePathIncl    = narrativePathUrls.has(url);
  const growthAction         = growthActionLookup[url] || null;

  const promotionScore = Math.round(
    (inboundLinks * 3) +
    (entityRelevance ? 20 : 0) +
    Math.min(rankScore / 10, 50) +
    (narrativePathIncl ? 25 : 0) +
    (growthAction === 'reinforce_hub' ? 30 : growthAction === 'expand_existing_page' ? 15 : 0)
  );

  const recommendation = getRecommendation(promotionScore);

  const reasons = [];
  if (inboundLinks > 0) reasons.push(`inbound_links:${inboundLinks}`);
  if (entityRelevance) reasons.push('entity_relevance:true');
  if (rankScore > 0) reasons.push(`rank_score:${rankScore}`);
  if (narrativePathIncl) reasons.push('narrative_path_inclusion:true');
  if (growthAction) reasons.push(`growth_priority_action:${growthAction}`);

  return {
    url,
    title,
    promotion_score:          promotionScore,
    rank_score:                rankScore,
    inbound_links:             inboundLinks,
    entity_relevance:          entityRelevance,
    narrative_path_inclusion:  narrativePathIncl,
    growth_priority_action:    growthAction,
    recommendation,
    reasons,
  };
});

// Sort: promotion_score DESC, then url ASC
candidates.sort((a, b) => {
  if (b.promotion_score !== a.promotion_score) return b.promotion_score - a.promotion_score;
  return a.url.localeCompare(b.url);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const promoteCount = candidates.filter(c => c.recommendation === 'promote').length;
const monitorCount = candidates.filter(c => c.recommendation === 'monitor').length;
const holdCount    = candidates.filter(c => c.recommendation === 'hold').length;

// ---------------------------------------------------------------------------
// Build output
// ---------------------------------------------------------------------------

const output = {
  generated_at:   new Date().toISOString(),
  phase:          'phase_3',
  schema_version: '1.0',

  summary: {
    total_assessed: candidates.length,
    promote:        promoteCount,
    monitor:        monitorCount,
    hold:           holdCount,
  },

  candidates,
};

const outPath = path.join(ROOT, 'js', 'stub-promotion.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');

console.log('generate-stub-promotion.js complete ✅');
console.log(`  Total assessed: ${candidates.length}`);
console.log(`  promote:  ${promoteCount}`);
console.log(`  monitor:  ${monitorCount}`);
console.log(`  hold:     ${holdCount}`);
console.log('  Output: js/stub-promotion.json');
