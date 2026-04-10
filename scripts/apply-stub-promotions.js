#!/usr/bin/env node
'use strict';

/**
 * apply-stub-promotions.js
 * Phase 4: Autonomous Editorial Operations — Stub Promotion Applicator.
 *
 * Reads:
 *   js/stub-promotion.json
 *   js/wiki-index.json
 *   js/editorial-changelog.json
 *
 * Writes:
 *   js/editorial-changelog.json  — appends a new run record
 *
 * What it does:
 *   - Reads the promotion recommendations from stub-promotion.json
 *   - Records all "promote" candidates in the editorial changelog
 *   - Does NOT modify any wiki HTML files (preserving data-wiki-stub and
 *     noindex integrity per canonical rules)
 *   - Deterministic: same inputs always produce the same action set
 *   - Idempotent: running twice on the same day updates the existing run
 *     record rather than appending a duplicate
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

function writeJson(relPath, data) {
  fs.writeFileSync(path.join(ROOT, relPath), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Load inputs
// ---------------------------------------------------------------------------

const stubPromotion  = readJson('js/stub-promotion.json');
const wikiIndexRaw   = readJson('js/wiki-index.json');
const changelog      = readJson('js/editorial-changelog.json');

const wikiPages  = Array.isArray(wikiIndexRaw) ? wikiIndexRaw : Object.values(wikiIndexRaw);
const wikiByUrl  = Object.fromEntries(wikiPages.map(p => [p.url, p]));

// ---------------------------------------------------------------------------
// Process candidates
// ---------------------------------------------------------------------------

const candidates = stubPromotion.candidates || [];

const actions = [];

// Sort by url for determinism
const sorted = candidates.slice().sort((a, b) => a.url.localeCompare(b.url));

for (const candidate of sorted) {
  if (candidate.recommendation !== 'promote') continue;

  const wikiEntry = wikiByUrl[candidate.url];

  actions.push({
    action_type:       'stub_promotion_recorded',
    status:            'applied',
    target_url:        candidate.url,
    target_title:      candidate.title,
    promotion_score:   candidate.promotion_score,
    rank_score:        candidate.rank_score,
    inbound_links:     candidate.inbound_links,
    entity_relevance:  candidate.entity_relevance,
    reasons:           candidate.reasons,
    category:          wikiEntry ? (wikiEntry.rank_signals || {}).category || null : null,
    note:              'Stub page identified as promotion-ready. HTML noindex preserved per canonical rules.',
  });
}

const promoteCount = actions.filter(a => a.status === 'applied').length;

// ---------------------------------------------------------------------------
// Append run to editorial changelog
// ---------------------------------------------------------------------------

const today   = new Date().toISOString().slice(0, 10);
const runId   = `apply-stub-promotions:${today}`;
const nowIso  = new Date().toISOString();

const run = {
  run_id:    runId,
  script:    'apply-stub-promotions',
  timestamp: nowIso,
  summary: {
    total_candidates: candidates.length,
    promote_count:    promoteCount,
    monitor_count:    candidates.filter(c => c.recommendation === 'monitor').length,
    hold_count:       candidates.filter(c => c.recommendation === 'hold').length,
  },
  actions,
};

// Replace existing run for same run_id (idempotent) or append new
const existingIdx = changelog.runs.findIndex(r => r.run_id === runId);
if (existingIdx >= 0) {
  changelog.runs[existingIdx] = run;
} else {
  changelog.runs.push(run);
}

writeJson('js/editorial-changelog.json', changelog);

// ---------------------------------------------------------------------------
// Console output
// ---------------------------------------------------------------------------

console.log('apply-stub-promotions.js complete ✅');
console.log(`  Promotion candidates recorded: ${promoteCount}`);
console.log(`  Total candidates assessed: ${candidates.length}`);
console.log(`  Output: js/editorial-changelog.json (run: ${runId})`);
