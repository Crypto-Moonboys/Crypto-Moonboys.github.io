#!/usr/bin/env node
'use strict';

/**
 * ingest-external-intelligence.js
 * Phase 4: Autonomous Editorial Operations — External Intelligence Ingestion.
 *
 * Reads:
 *   js/external-lore.json
 *   js/source-trust.json
 *   js/wiki-index.json
 *   js/editorial-changelog.json
 *
 * Writes:
 *   js/ingested-intelligence.json  — trust-filtered intelligence manifest
 *   js/editorial-changelog.json   — appends a new run record
 *
 * Rules:
 *  - Applies trust tiers from source-trust.json to filter/score lore entries
 *  - No external API calls; operates solely on local data
 *  - Deterministic: same inputs → same outputs
 *  - Idempotent: re-running on the same day updates the run record in-place
 *  - Only entries from "approved" or "community" tier sources (score_weight >= 0.6)
 *    are eligible for ingestion; "speculative" sources are logged but not applied
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
// Trust tier constants
// ---------------------------------------------------------------------------

const MIN_INGEST_WEIGHT = 0.6;   // minimum source score_weight to allow ingestion

// ---------------------------------------------------------------------------
// SAM provenance guard
// ---------------------------------------------------------------------------
// External intelligence ingest must only consume SAM-approved export data,
// not independently sourced external feeds. This script requires a valid
// SAM export manifest (js/sam-export-manifest.json) with a valid sam_export_id
// or approved_source_pack_id before it will run.
// While SAM is paused, exit cleanly with no changes.

const SAM_MANIFEST = path.join(ROOT, 'js/sam-export-manifest.json');
if (!fs.existsSync(SAM_MANIFEST)) {
  console.log('[SAM guard] js/sam-export-manifest.json not found.');
  console.log('[SAM guard] SAM is paused or no approved export is present.');
  console.log('[SAM guard] Intelligence ingest requires SAM provenance. No data ingested. Exiting cleanly.');
  process.exit(0);
}
let samManifest;
try {
  samManifest = JSON.parse(fs.readFileSync(SAM_MANIFEST, 'utf8'));
} catch (e) {
  console.error('::error file=js/sam-export-manifest.json::Invalid JSON in js/sam-export-manifest.json: ' + e.message);
  process.exit(1);
}
if (!samManifest.sam_export_id && !samManifest.approved_source_pack_id) {
  console.log('[SAM guard] sam_export_id / approved_source_pack_id missing in js/sam-export-manifest.json.');
  console.log('[SAM guard] No intelligence ingested. Exiting cleanly.');
  process.exit(0);
}
console.log('[SAM guard] Provenance OK — export id:', samManifest.sam_export_id || samManifest.approved_source_pack_id);

// ---------------------------------------------------------------------------
// Load inputs
// ---------------------------------------------------------------------------

const externalLore  = readJson('js/external-lore.json');
const sourceTrust   = readJson('js/source-trust.json');
const wikiIndexRaw  = readJson('js/wiki-index.json');
const changelog     = readJson('js/editorial-changelog.json');

const wikiPages = Array.isArray(wikiIndexRaw) ? wikiIndexRaw : Object.values(wikiIndexRaw);

// Build category → wiki URLs cross-reference
const categoryIndex = {};
for (const page of wikiPages) {
  const cat = ((page.rank_signals && page.rank_signals.category) || 'uncategorised').toLowerCase();
  if (!categoryIndex[cat]) categoryIndex[cat] = [];
  categoryIndex[cat].push(page.url);
}

// ---------------------------------------------------------------------------
// Build trust tier lookup: tier_id → { label, score_weight, confidence_floor,
//                                      confidence_ceiling }
// ---------------------------------------------------------------------------

const tierLookup = {};
for (const tier of (sourceTrust.tiers || [])) {
  tierLookup[tier.id] = tier;
}

// Build source registry lookup: source_id → tier info
const sourceLookup = {};
for (const source of (externalLore.approved_sources || [])) {
  const tier = tierLookup[source.trust_tier] || null;
  sourceLookup[source.id] = {
    name:         source.name,
    type:         source.type,
    status:       source.status,
    trust_tier:   source.trust_tier,
    score_weight: tier ? tier.score_weight : 0,
    tier_label:   tier ? tier.label : 'unknown',
  };
}

// ---------------------------------------------------------------------------
// Process lore entries through trust tiers
// ---------------------------------------------------------------------------

const entries = externalLore.entries || [];
const actions = [];

// Sort entries deterministically by id
const sortedEntries = entries.slice().sort((a, b) => (a.id || '').localeCompare(b.id || ''));

for (const entry of sortedEntries) {
  const sourceInfo   = sourceLookup[entry.source_id] || null;
  const scoreWeight  = sourceInfo ? sourceInfo.score_weight : 0;
  const tierId       = sourceInfo ? sourceInfo.trust_tier : 'unknown';
  const sourceStatus = sourceInfo ? sourceInfo.status : 'unknown';

  // Skip entries from disabled or unknown sources
  if (!sourceInfo || sourceStatus === 'disabled') {
    actions.push({
      action_type:  'intelligence_skipped',
      status:       'skipped',
      entry_id:     entry.id,
      entry_title:  entry.title,
      reason:       'source_disabled_or_unknown',
      source_id:    entry.source_id,
    });
    continue;
  }

  // Apply trust tier weight threshold
  if (scoreWeight < MIN_INGEST_WEIGHT) {
    actions.push({
      action_type:   'intelligence_skipped',
      status:        'skipped',
      entry_id:      entry.id,
      entry_title:   entry.title,
      reason:        `trust_weight_below_threshold:${scoreWeight}<${MIN_INGEST_WEIGHT}`,
      source_id:     entry.source_id,
      trust_tier:    tierId,
      score_weight:  scoreWeight,
    });
    continue;
  }

  // Find related wiki URLs from the cross-reference index
  const relatedWikiUrls = [];
  if (entry.category) {
    const catKey = entry.category.toLowerCase();
    (categoryIndex[catKey] || []).slice(0, 5).forEach(u => relatedWikiUrls.push(u));
  }
  if (Array.isArray(entry.related_wiki_urls)) {
    for (const u of entry.related_wiki_urls) {
      if (!relatedWikiUrls.includes(u)) relatedWikiUrls.push(u);
    }
  }

  actions.push({
    action_type:        'intelligence_ingested',
    status:             'applied',
    entry_id:           entry.id,
    entry_title:        entry.title,
    source_id:          entry.source_id,
    trust_tier:         tierId,
    score_weight:       scoreWeight,
    adjusted_confidence: Math.min(
      0.95,
      (entry.confidence || 0.5) * scoreWeight
    ),
    related_wiki_urls:  relatedWikiUrls.slice(0, 10),
    tags:               entry.tags || [],
  });
}

const ingestedCount = actions.filter(a => a.action_type === 'intelligence_ingested').length;
const skippedCount  = actions.filter(a => a.action_type === 'intelligence_skipped').length;

// ---------------------------------------------------------------------------
// Write ingested-intelligence.json manifest
// ---------------------------------------------------------------------------

const ingestManifest = {
  generated_at:    new Date().toISOString(),
  phase:           'phase_4',
  schema_version:  '1.0',

  summary: {
    total_entries:       entries.length,
    ingested:            ingestedCount,
    skipped:             skippedCount,
    approved_sources:    (externalLore.approved_sources || []).length,
    active_sources:      (externalLore.approved_sources || []).filter(s => s.status === 'approved').length,
    min_ingest_weight:   MIN_INGEST_WEIGHT,
  },

  trust_tiers: (sourceTrust.tiers || []).map(t => ({
    id:           t.id,
    label:        t.label,
    score_weight: t.score_weight,
    eligible:     t.score_weight >= MIN_INGEST_WEIGHT,
  })),

  ingested_entries: actions
    .filter(a => a.action_type === 'intelligence_ingested')
    .map(a => ({
      entry_id:             a.entry_id,
      entry_title:          a.entry_title,
      source_id:            a.source_id,
      trust_tier:           a.trust_tier,
      score_weight:         a.score_weight,
      adjusted_confidence:  a.adjusted_confidence,
      related_wiki_urls:    a.related_wiki_urls,
      tags:                 a.tags,
    })),

  skipped_entries: actions
    .filter(a => a.action_type === 'intelligence_skipped')
    .map(a => ({
      entry_id:    a.entry_id,
      entry_title: a.entry_title,
      source_id:   a.source_id,
      reason:      a.reason,
    })),

  wiki_cross_reference: {
    category_index: Object.fromEntries(
      Object.entries(categoryIndex)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cat, urls]) => [cat, urls.sort()])
    ),
    total_wiki_pages: wikiPages.length,
  },
};

writeJson('js/ingested-intelligence.json', ingestManifest);

// ---------------------------------------------------------------------------
// Append run to editorial changelog
// ---------------------------------------------------------------------------

const today  = new Date().toISOString().slice(0, 10);
const runId  = `ingest-external-intelligence:${today}`;
const nowIso = new Date().toISOString();

const run = {
  run_id:    runId,
  script:    'ingest-external-intelligence',
  timestamp: nowIso,
  summary: {
    total_entries: entries.length,
    ingested:      ingestedCount,
    skipped:       skippedCount,
  },
  actions,
};

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

console.log('ingest-external-intelligence.js complete ✅');
console.log(`  Entries ingested: ${ingestedCount}`);
console.log(`  Entries skipped: ${skippedCount}`);
console.log(`  Output: js/ingested-intelligence.json`);
console.log(`  Changelog: js/editorial-changelog.json (run: ${runId})`);
