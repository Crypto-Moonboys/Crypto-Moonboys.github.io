#!/usr/bin/env node
/**
 * scripts/generate-governance-signals.js  (Phase 6)
 *
 * Governance Signals Engine: derives per-page governance priorities by
 * cross-referencing authority/trust scores, timeline narrative weights,
 * editorial queue risk signals, and editorial activity history.
 *
 * Inputs:
 *   js/authority-trust.json
 *   js/timeline-intelligence.json
 *   js/editorial-queue.json
 *   js/editorial-changelog.json
 *
 * Output: js/governance-signals.json
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
const timelineIntel      = readJson('js/timeline-intelligence.json');
const editorialQueue     = readJsonOptional('js/editorial-queue.json');
const editorialChangelog = readJsonOptional('js/editorial-changelog.json');

// ---------------------------------------------------------------------------
// Build lookup maps
// ---------------------------------------------------------------------------

// timeline narrative_weight by canonical_url
const narrativeByUrl = new Map();
for (const ev of (timelineIntel.entries || [])) {
  if (ev.canonical_url) {
    narrativeByUrl.set(ev.canonical_url, ev.narrative_weight || 0);
  }
}

// editorial-queue: count pending items per URL
const queuePendingByUrl = new Map();
if (editorialQueue && Array.isArray(editorialQueue.queue)) {
  for (const item of editorialQueue.queue) {
    if (item.status !== 'pending') continue;
    const url = item.url || item.target_url;
    if (!url) continue;
    queuePendingByUrl.set(url, (queuePendingByUrl.get(url) || 0) + 1);
  }
}

// editorial-changelog: count applied (non-no_op) actions per URL
const editorialAppliedByUrl = new Map();
if (editorialChangelog && Array.isArray(editorialChangelog.runs)) {
  for (const run of editorialChangelog.runs) {
    if (!Array.isArray(run.actions)) continue;
    for (const action of run.actions) {
      if (action.status !== 'applied') continue;
      const url = action.target_url;
      if (!url) continue;
      editorialAppliedByUrl.set(url, (editorialAppliedByUrl.get(url) || 0) + 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Band helpers
// ---------------------------------------------------------------------------

function trustBand(score) {
  if (score >= 75) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

function authorityBand(score) {
  if (score >= 70) return 'authoritative';
  if (score >= 35) return 'developing';
  return 'weak';
}

// ---------------------------------------------------------------------------
// Build entries — iterate over all entries in authority-trust
// ---------------------------------------------------------------------------
const entries = [];

for (const trustEntry of (authorityTrust.entries || [])) {
  const url   = trustEntry.url;
  const title = trustEntry.title || '';

  const authority_score = clamp(trustEntry.authority_score || 0, 0, 100);
  const trust_score     = clamp(trustEntry.trust_score     || 0, 0, 100);

  const trust_band     = trustBand(trust_score);
  const authority_band = authorityBand(authority_score);

  // ── narrative_importance from timeline ──────────────────────────────
  const rawNarrative = narrativeByUrl.get(url) || 0;
  const narrative_importance = clamp(rawNarrative * 10, 0, 100);

  // ── editorial_risk: pending queue items drive risk up ────────────────
  const pendingCount  = queuePendingByUrl.get(url) || 0;
  const appliedCount  = editorialAppliedByUrl.get(url) || 0;
  // risk is higher when there are pending items and lower authority/trust
  const baseRisk = clamp(pendingCount * 20, 0, 60);
  const trustMitigation = Math.round(trust_score * 0.3);
  const editorial_risk = clamp(baseRisk - trustMitigation + (appliedCount > 0 ? 5 : 0), 0, 100);

  // ── governance_priority_score ─────────────────────────────────────────
  // Combines: authority (40%), trust (30%), narrative (20%), risk (10%)
  const governance_priority_score = clamp(
    Math.round(
      authority_score * 0.40 +
      trust_score     * 0.30 +
      narrative_importance * 0.20 +
      editorial_risk  * 0.10
    ),
    0, 100
  );

  // ── governance_action ────────────────────────────────────────────────
  let governance_action;
  if (governance_priority_score >= 70)      governance_action = 'prioritize';
  else if (governance_priority_score >= 45)  governance_action = 'review';
  else if (governance_priority_score >= 20)  governance_action = 'watch';
  else                                        governance_action = 'defer';

  entries.push({
    url,
    title,
    governance_priority_score,
    trust_band,
    authority_band,
    narrative_importance,
    editorial_risk,
    governance_action
  });
}

// Sort deterministically: governance_priority_score desc, then url asc
entries.sort((a, b) => {
  if (b.governance_priority_score !== a.governance_priority_score) {
    return b.governance_priority_score - a.governance_priority_score;
  }
  return a.url.localeCompare(b.url);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const actionCounts = { prioritize: 0, review: 0, watch: 0, defer: 0 };
for (const e of entries) actionCounts[e.governance_action]++;

const bandCounts = { high: 0, medium: 0, low: 0 };
for (const e of entries) bandCounts[e.trust_band]++;

const output = {
  generated_at: new Date().toISOString(),
  phase: 'phase_6',
  schema_version: '1.0',
  summary: {
    total_entries: entries.length,
    by_governance_action: actionCounts,
    by_trust_band: bandCounts
  },
  entries
};

fs.writeFileSync(path.join(ROOT, 'js', 'governance-signals.json'), JSON.stringify(output, null, 2));
console.log(`governance-signals.json written (${entries.length} entries) ✅`);
