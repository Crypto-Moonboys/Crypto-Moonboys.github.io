#!/usr/bin/env node
/**
 * scripts/generate-publishing-readiness.js  (Phase 6)
 *
 * Publishing Readiness Engine: evaluates every canonical wiki page against
 * quality, authority, narrative, and platform criteria to produce a per-page
 * readiness score and platform-specific readiness flags.
 *
 * This is planning only — it never modifies any wiki page or triggers live
 * publishing.
 *
 * Inputs:
 *   js/wiki-index.json
 *   js/authority-trust.json
 *   js/timeline-intelligence.json
 *   js/editorial-changelog.json
 *
 * Output: js/publishing-readiness.json
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
const wikiIndex          = readJson('js/wiki-index.json');
const authorityTrust     = readJson('js/authority-trust.json');
const timelineIntel      = readJsonOptional('js/timeline-intelligence.json');
const editorialChangelog = readJsonOptional('js/editorial-changelog.json');

// ---------------------------------------------------------------------------
// Build lookup maps
// ---------------------------------------------------------------------------

// authority-trust by url
const trustByUrl = new Map();
for (const entry of (authorityTrust.entries || [])) {
  trustByUrl.set(entry.url, entry);
}

// timeline narrative_weight by canonical_url
const narrativeByUrl = new Map();
if (timelineIntel) {
  for (const ev of (timelineIntel.entries || [])) {
    if (ev.canonical_url) {
      narrativeByUrl.set(ev.canonical_url, ev.narrative_weight || 0);
    }
  }
}

// editorial-changelog: last edit date per target_url
const lastEditByUrl = new Map();
if (editorialChangelog && Array.isArray(editorialChangelog.runs)) {
  for (const run of editorialChangelog.runs) {
    if (!Array.isArray(run.actions)) continue;
    const ts = run.timestamp ? run.timestamp.slice(0, 10) : null;
    for (const action of run.actions) {
      const url = action.target_url;
      if (!url || !ts) continue;
      if (!lastEditByUrl.has(url) || ts > lastEditByUrl.get(url)) {
        lastEditByUrl.set(url, ts);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Platform readiness thresholds
// ---------------------------------------------------------------------------
const PLATFORM_THRESHOLDS = {
  fandom:    { readiness: 50, authority: 30, words: 300  },
  telegram:  { readiness: 30, authority: 20, words: 100  },
  substack:  { readiness: 65, authority: 50, words: 500  },
  paragraph: { readiness: 55, authority: 40, words: 400  }
};

// ---------------------------------------------------------------------------
// Build entries — iterate over wiki-index (canonical pages)
// ---------------------------------------------------------------------------
const entries = [];

for (const page of wikiIndex) {
  const url   = page.url;
  const title = page.title || '';

  const signals = page.rank_signals || {};

  // ── readable_title: strip " — Crypto Moonboys Wiki" suffix ────────────
  const readable_title = title.replace(/\s*[—–-]\s*Crypto Moonboys Wiki\s*$/i, '').trim() || title;

  // ── authority_score / trust_score from authority-trust ────────────────
  const trustEntry    = trustByUrl.get(url) || {};
  const authority_score = clamp(trustEntry.authority_score || 0, 0, 100);
  const trust_score     = clamp(trustEntry.trust_score     || 0, 0, 100);

  // ── summary_quality from rank signals ────────────────────────────────
  // Combines: has_description (20), word_count (0–40), content_quality (0–40)
  const hasDesc         = signals.has_description ? 20 : 0;
  const wordCount       = signals.article_word_count || 0;
  const wordPoints      = clamp(Math.round((wordCount / 2000) * 40), 0, 40);
  const qualityScore    = clamp(signals.content_quality_score || 0, 0, 103);
  const qualityPoints   = Math.round((qualityScore / 103) * 40);
  const summary_quality = clamp(hasDesc + wordPoints + qualityPoints, 0, 100);

  // ── narrative_strength from timeline ─────────────────────────────────
  const rawNarrative     = narrativeByUrl.get(url) || 0;
  const narrative_strength = clamp(rawNarrative * 10, 0, 100);

  // ── readiness_score ────────────────────────────────────────────────────
  // authority(30%) + trust(25%) + summary_quality(25%) + narrative(20%)
  const readiness_score = clamp(
    Math.round(
      authority_score  * 0.30 +
      trust_score      * 0.25 +
      summary_quality  * 0.25 +
      narrative_strength * 0.20
    ),
    0, 100
  );

  // ── platform_readiness ────────────────────────────────────────────────
  const platform_readiness = {};
  for (const [platform, thresh] of Object.entries(PLATFORM_THRESHOLDS)) {
    platform_readiness[platform] =
      readiness_score >= thresh.readiness &&
      authority_score >= thresh.authority &&
      wordCount       >= thresh.words;
  }

  entries.push({
    url,
    readable_title,
    readiness_score,
    summary_quality,
    authority_score,
    trust_score,
    narrative_strength,
    platform_readiness
  });
}

// Sort deterministically: readiness_score desc, then url asc
entries.sort((a, b) => {
  if (b.readiness_score !== a.readiness_score) return b.readiness_score - a.readiness_score;
  return a.url.localeCompare(b.url);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const readyCounts = Object.fromEntries(
  Object.keys(PLATFORM_THRESHOLDS).map(p => [p, entries.filter(e => e.platform_readiness[p]).length])
);

const output = {
  generated_at: new Date().toISOString(),
  phase: 'phase_6',
  schema_version: '1.0',
  summary: {
    total_entries: entries.length,
    ready_by_platform: readyCounts
  },
  entries
};

fs.writeFileSync(path.join(ROOT, 'js', 'publishing-readiness.json'), JSON.stringify(output, null, 2));
console.log(`publishing-readiness.json written (${entries.length} entries) ✅`);
