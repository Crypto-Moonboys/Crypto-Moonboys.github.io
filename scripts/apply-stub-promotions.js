#!/usr/bin/env node
'use strict';

/**
 * apply-stub-promotions.js
 * Phase 4: Autonomous Editorial Operations — Stub Promotion Executor.
 *
 * Reads:
 *   js/stub-promotion.json
 *   js/wiki-index.json
 *   js/editorial-changelog.json
 *   wiki/{slug}.html  (for each promote candidate)
 *
 * Writes:
 *   wiki/{slug}.html             — removes data-wiki-stub="true" from <body>
 *                                  and <article>; changes noindex → index on
 *                                  the robots meta tag (only when stub attrs
 *                                  are present — no-op otherwise)
 *   js/editorial-changelog.json  — appends a new run record
 *
 * What it does:
 *   - Reads the promotion recommendations from stub-promotion.json
 *   - For each "promote" candidate whose HTML file contains data-wiki-stub:
 *       • Removes data-wiki-stub="true" from the <body> opening tag
 *       • Removes data-wiki-stub="true" from the <article> opening tag
 *       • Changes <meta name="robots" content="noindex, follow"> to
 *         <meta name="robots" content="index, follow">
 *   - Pages that have already been promoted (no stub attr present) are
 *     recorded as stub_promotion_skipped (no_op)
 *   - Deterministic: same inputs always produce the same action set
 *   - Idempotent: running twice on the same day updates the existing run
 *     record rather than appending a duplicate; re-running on an already-
 *     promoted page produces a no_op action
 */

const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..');
const WIKI_DIR = path.join(ROOT, 'wiki');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

function writeJson(relPath, data) {
  fs.writeFileSync(path.join(ROOT, relPath), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

/**
 * Remove data-wiki-stub="true" from opening <body> and <article> tags, and
 * flip `noindex, follow` → `index, follow` in the robots meta tag.
 *
 * Returns { html: string, changed: boolean }.
 */
function applyStubPromotion(html) {
  let out = html;

  // Remove data-wiki-stub="true" from <body ...> (attribute may be the only
  // one or preceded by other attributes; handle leading space variants).
  out = out.replace(
    /(<body\b[^>]*?) data-wiki-stub="true"([^>]*>)/g,
    '$1$2',
  );
  // Also catch case where it's the only attribute (no leading space before it
  // after the tag name):  <body data-wiki-stub="true">
  out = out.replace(
    /(<body) data-wiki-stub="true"(>)/g,
    '$1$2',
  );

  // Remove data-wiki-stub="true" from <article ...>
  out = out.replace(
    /(<article\b[^>]*?) data-wiki-stub="true"([^>]*>)/g,
    '$1$2',
  );
  out = out.replace(
    /(<article) data-wiki-stub="true"(>)/g,
    '$1$2',
  );

  // Flip noindex → index in the robots meta tag only
  out = out.replace(
    /(<meta\s+name="robots"\s+content=")noindex,\s*(follow"[^>]*>)/gi,
    '$1index, $2',
  );

  const changed = out !== html;
  return { html: out, changed };
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
  const filePath  = path.join(WIKI_DIR, candidate.url.replace(/^\/wiki\//, ''));

  if (!fs.existsSync(filePath)) {
    actions.push({
      action_type:  'stub_promotion_skipped',
      status:       'skipped',
      target_url:   candidate.url,
      target_title: candidate.title,
      reason:       'file_not_found',
    });
    continue;
  }

  const originalHtml = fs.readFileSync(filePath, 'utf8');
  const { html: updatedHtml, changed } = applyStubPromotion(originalHtml);

  if (changed) {
    fs.writeFileSync(filePath, updatedHtml, 'utf8');
  }

  actions.push({
    action_type:      changed ? 'stub_promotion_applied' : 'stub_promotion_skipped',
    status:           changed ? 'applied' : 'no_op',
    target_url:       candidate.url,
    target_title:     candidate.title,
    promotion_score:  candidate.promotion_score,
    rank_score:       candidate.rank_score,
    inbound_links:    candidate.inbound_links,
    entity_relevance: candidate.entity_relevance,
    reasons:          candidate.reasons,
    category:         wikiEntry ? (wikiEntry.rank_signals || {}).category || null : null,
    note:             changed
      ? 'Removed data-wiki-stub from <body> and <article>; set robots to index, follow.'
      : 'No stub attributes found; page already promoted or not a stub.',
  });
}

const appliedCount = actions.filter(a => a.action_type === 'stub_promotion_applied').length;
const skippedCount = actions.filter(a => a.action_type === 'stub_promotion_skipped').length;

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
    applied_count:    appliedCount,
    skipped_count:    skippedCount,
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
console.log(`  Stub promotions applied (HTML modified): ${appliedCount}`);
console.log(`  Skipped / already promoted: ${skippedCount}`);
console.log(`  Total candidates assessed: ${candidates.length}`);
console.log(`  Output: js/editorial-changelog.json (run: ${runId})`);
