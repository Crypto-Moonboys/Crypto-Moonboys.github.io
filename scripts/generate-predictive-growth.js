#!/usr/bin/env node
/**
 * scripts/generate-predictive-growth.js  (Phase 6)
 *
 * Predictive Growth Engine: combines authority/trust trends, entity rank
 * history, editorial activity, and growth-priority signals to produce a
 * forward-looking recommendation for every canonical page.
 *
 * Inputs:
 *   js/authority-trust.json
 *   js/entity-changelog.json
 *   js/editorial-changelog.json
 *   js/growth-priority.json
 *
 * Output: js/predictive-growth.json
 *
 * All logic is deterministic and idempotent. No external APIs.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

function readJsonOptional(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return null;
  try { return readJson(relPath); } catch (_) { return null; }
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// ---------------------------------------------------------------------------
// Load inputs
// ---------------------------------------------------------------------------
const authorityTrust     = readJson('js/authority-trust.json');
const entityChangelog    = readJson('js/entity-changelog.json');
const editorialChangelog = readJsonOptional('js/editorial-changelog.json');
const growthPriority     = readJson('js/growth-priority.json');

// ---------------------------------------------------------------------------
// Build lookup maps
// ---------------------------------------------------------------------------

// authority-trust by url
const trustByUrl = new Map();
for (const entry of (authorityTrust.entries || [])) {
  trustByUrl.set(entry.url, entry);
}

// entity-changelog by url
const changelogByUrl = new Map();
for (const entry of (entityChangelog.entries || [])) {
  changelogByUrl.set(entry.url, entry);
}

// editorial actions count by target_url (across all runs)
const editorialCountByUrl = new Map();
if (editorialChangelog && Array.isArray(editorialChangelog.runs)) {
  for (const run of editorialChangelog.runs) {
    if (!Array.isArray(run.actions)) continue;
    for (const action of run.actions) {
      const url = action.target_url;
      if (!url) continue;
      if (action.status === 'applied' || action.status === 'no_op' || action.status === 'skipped') {
        editorialCountByUrl.set(url, (editorialCountByUrl.get(url) || 0) + 1);
      }
    }
  }
}

// growth-priority by target_url
const priorityByUrl = new Map();
for (const p of (growthPriority.priorities || [])) {
  priorityByUrl.set(p.target_url, p);
}

// ---------------------------------------------------------------------------
// Recommendation thresholds
// ---------------------------------------------------------------------------
const EXPAND_THRESHOLD    = 70;
const REINFORCE_THRESHOLD = 45;
const MONITOR_THRESHOLD   = 20;

// ---------------------------------------------------------------------------
// Build entries — iterate over all URLs in authority-trust
// ---------------------------------------------------------------------------
const entries = [];

for (const trustEntry of (authorityTrust.entries || [])) {
  const url   = trustEntry.url;
  const title = trustEntry.title || '';

  // ── authority_trend from entity-changelog rank delta ──────────────────
  const changelogEntry = changelogByUrl.get(url);
  let authority_trend = 'stable';
  if (changelogEntry) {
    if (changelogEntry.rank_trend === 'up')   authority_trend = 'rising';
    else if (changelogEntry.rank_trend === 'down') authority_trend = 'declining';
  }

  // ── momentum_score: combines authority delta + trust score ────────────
  // rank_delta capped to ±200, mapped to 0–40 points (0-based)
  const rankDelta = changelogEntry ? (changelogEntry.rank_delta || 0) : 0;
  const deltaNorm  = clamp(rankDelta, -200, 200);
  const deltaPoints = Math.round(((deltaNorm + 200) / 400) * 40); // 0–40

  // authority_score 0–100 → 0–40 points
  const authorityPoints = Math.round(clamp(trustEntry.authority_score || 0, 0, 100) * 0.40);

  // trust_score 0–100 → 0–20 points
  const trustPoints = Math.round(clamp(trustEntry.trust_score || 0, 0, 100) * 0.20);

  const momentum_score = clamp(deltaPoints + authorityPoints + trustPoints, 0, 100);

  // ── editorial_activity_score ──────────────────────────────────────────
  // count of editorial actions recorded for this URL, capped to 0–100
  const rawActivity = editorialCountByUrl.get(url) || 0;
  const editorial_activity_score = clamp(rawActivity * 5, 0, 100);

  // ── predicted_priority from growth-priority.json ─────────────────────
  const growthEntry = priorityByUrl.get(url);
  const predicted_priority = growthEntry ? clamp(growthEntry.priority_score || 0, 0, 999) : 0;

  // ── recommendation ────────────────────────────────────────────────────
  const combined = momentum_score * 0.5 + (predicted_priority / 10) * 0.3 + editorial_activity_score * 0.2;
  let recommendation;
  if (combined >= EXPAND_THRESHOLD)    recommendation = 'expand';
  else if (combined >= REINFORCE_THRESHOLD) recommendation = 'reinforce';
  else if (combined >= MONITOR_THRESHOLD)   recommendation = 'monitor';
  else                                      recommendation = 'hold';

  entries.push({
    url,
    title,
    momentum_score,
    authority_trend,
    editorial_activity_score,
    predicted_priority,
    recommendation
  });
}

// Sort deterministically: by momentum_score desc, then url asc
entries.sort((a, b) => {
  if (b.momentum_score !== a.momentum_score) return b.momentum_score - a.momentum_score;
  return a.url.localeCompare(b.url);
});

// ---------------------------------------------------------------------------
// Build summary
// ---------------------------------------------------------------------------
const byCounts = { expand: 0, reinforce: 0, monitor: 0, hold: 0 };
for (const e of entries) byCounts[e.recommendation]++;

const output = {
  generated_at: new Date().toISOString(),
  phase: 'phase_6',
  schema_version: '1.0',
  summary: {
    total_entries: entries.length,
    expand: byCounts.expand,
    reinforce: byCounts.reinforce,
    monitor: byCounts.monitor,
    hold: byCounts.hold
  },
  entries
};

fs.writeFileSync(path.join(ROOT, 'js', 'predictive-growth.json'), JSON.stringify(output, null, 2));
console.log(`predictive-growth.json written (${entries.length} entries) ✅`);
