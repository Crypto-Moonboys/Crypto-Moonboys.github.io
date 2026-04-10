#!/usr/bin/env node
'use strict';

/**
 * generate-editorial-queue.js
 * Phase 3: Editorial Intelligence — Editorial Approval Queue.
 *
 * Reads:
 *   js/wiki-index.json
 *   js/external-lore.json
 *   js/hub-recommendations.json
 *   js/narrative-paths.json
 *   js/growth-priority.json
 *   js/draft-index.json
 *
 * Writes:
 *   js/editorial-queue.json
 *
 * Rules:
 *  - Deterministic: same inputs always produce same outputs
 *  - No randomness; confidence derived from numeric score fields
 *  - Root-relative paths only
 *  - Does not modify any existing files
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

const wikiIndexRaw      = readJson('js/wiki-index.json');
const externalLore      = readJson('js/external-lore.json');
const hubRecommendations = readJson('js/hub-recommendations.json');
const narrativePaths    = readJson('js/narrative-paths.json');
const growthPriority    = readJson('js/growth-priority.json');
const draftIndex        = readJson('js/draft-index.json');

const wikiPages = Array.isArray(wikiIndexRaw) ? wikiIndexRaw : Object.values(wikiIndexRaw);

// Build quick lookup: url → rank_score
const rankLookup = {};
for (const page of wikiPages) {
  rankLookup[page.url] = page.rank_score || 0;
}

// ---------------------------------------------------------------------------
// Normalise helpers
// ---------------------------------------------------------------------------

/**
 * Clamp a value to [0, 1].
 */
function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

/**
 * Normalise a raw score to [0, 1] given a known max (or a reasonable ceiling).
 */
function normalise(score, max) {
  if (!max || max === 0) return 0;
  return clamp01(score / max);
}

/**
 * Round to 4 decimal places for clean JSON output.
 */
function round4(v) {
  return Math.round(v * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// 1. external-lore-candidate
// ---------------------------------------------------------------------------

const loreEntries = externalLore.entries || [];
const loreItems = loreEntries.map(entry => {
  const id = `external-lore-candidate::${entry.id}`;
  const reasons = [];
  if (entry.source_id) reasons.push(`source_id:${entry.source_id}`);
  if (entry.category) reasons.push(`category:${entry.category}`);
  if (Array.isArray(entry.tags) && entry.tags.length) reasons.push(`tags:${entry.tags.join(',')}`);

  // Confidence: no score field available; default to 0.5 (framework-ready placeholder)
  const confidence = round4(0.5);

  return {
    id,
    type:       'external-lore-candidate',
    title:      entry.title || entry.id,
    url:        entry.url || null,
    target_url: null,
    source:     'js/external-lore.json',
    confidence,
    status:     'pending',
    reasons,
  };
});

// ---------------------------------------------------------------------------
// 2. hub-recommendation
// ---------------------------------------------------------------------------

const MAX_HUB_SCORE = 500; // reasonable ceiling for normalisation
const recommendations = hubRecommendations.recommendations || [];
const hubItems = recommendations.map(rec => {
  const id = `hub-recommendation::${rec.cluster_id || rec.anchor_slug}`;
  const confidence = round4(normalise(rec.hub_score || 0, MAX_HUB_SCORE));
  const reasons = Array.isArray(rec.reasons) ? rec.reasons.slice() : [];

  return {
    id,
    type:       'hub-recommendation',
    title:      rec.anchor_title || rec.anchor_slug,
    url:        rec.anchor_url || null,
    target_url: rec.suggested_hub_url || null,
    source:     'js/hub-recommendations.json',
    confidence,
    status:     'pending',
    reasons,
  };
});

// ---------------------------------------------------------------------------
// 3. narrative-path
// ---------------------------------------------------------------------------

const MAX_AVG_RANK = 1000; // reasonable ceiling
const paths = narrativePaths.paths || [];
const pathItems = paths.map(p => {
  const id = `narrative-path::${p.id}`;
  const confidence = round4(normalise(p.avg_rank_score || 0, MAX_AVG_RANK));
  const reasons = [
    `step_count:${p.step_count}`,
    `avg_rank_score:${p.avg_rank_score}`,
  ];
  if (p.category) reasons.push(`category:${p.category}`);

  return {
    id,
    type:       'narrative-path',
    title:      p.name || p.id,
    url:        p.gateway_url || null,
    target_url: null,
    source:     'js/narrative-paths.json',
    confidence,
    status:     'pending',
    reasons,
  };
});

// ---------------------------------------------------------------------------
// 4. stub-promotion-candidate
// ---------------------------------------------------------------------------

const MAX_PRIORITY_SCORE = 200; // reasonable ceiling
const ELIGIBLE_ACTION_TYPES = new Set(['reinforce_hub', 'expand_existing_page']);
const priorities = (growthPriority.priorities || []).filter(p =>
  ELIGIBLE_ACTION_TYPES.has(p.action_type)
);

const stubItems = priorities.map(p => {
  const id = `stub-promotion-candidate::${p.target_slug || p.target_url}`;
  const confidence = round4(normalise(p.priority_score || 0, MAX_PRIORITY_SCORE));

  // Pull title from wiki-index if available
  const page = wikiPages.find(wp => wp.url === p.target_url);
  const title = page ? page.title : (p.target_slug || p.target_url);

  const reasons = Array.isArray(p.reasons) ? p.reasons.slice() : [];
  reasons.unshift(`action_type:${p.action_type}`);

  return {
    id,
    type:       'stub-promotion-candidate',
    title,
    url:        p.target_url || null,
    target_url: p.target_url || null,
    source:     'js/growth-priority.json',
    confidence,
    status:     'pending',
    reasons,
  };
});

// ---------------------------------------------------------------------------
// Merge and sort deterministically: type ASC, then id ASC
// ---------------------------------------------------------------------------

const queue = [
  ...loreItems,
  ...hubItems,
  ...pathItems,
  ...stubItems,
].sort((a, b) => {
  if (a.type !== b.type) return a.type.localeCompare(b.type);
  return a.id.localeCompare(b.id);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const byType = {
  'external-lore-candidate':  loreItems.length,
  'hub-recommendation':       hubItems.length,
  'narrative-path':           pathItems.length,
  'stub-promotion-candidate': stubItems.length,
};

const pendingCount  = queue.filter(q => q.status === 'pending').length;
const approvedCount = queue.filter(q => q.status === 'approved').length;
const rejectedCount = queue.filter(q => q.status === 'rejected').length;

// ---------------------------------------------------------------------------
// Build output
// ---------------------------------------------------------------------------

const output = {
  generated_at:   new Date().toISOString(),
  phase:          'phase_3',
  schema_version: '1.0',

  summary: {
    total_items: queue.length,
    by_type:     byType,
    pending:     pendingCount,
    approved:    approvedCount,
    rejected:    rejectedCount,
  },

  queue,
};

const outPath = path.join(ROOT, 'js', 'editorial-queue.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');

console.log('generate-editorial-queue.js complete ✅');
console.log(`  Total queue items: ${queue.length}`);
console.log(`  external-lore-candidate:  ${byType['external-lore-candidate']}`);
console.log(`  hub-recommendation:       ${byType['hub-recommendation']}`);
console.log(`  narrative-path:           ${byType['narrative-path']}`);
console.log(`  stub-promotion-candidate: ${byType['stub-promotion-candidate']}`);
console.log('  Output: js/editorial-queue.json');
