#!/usr/bin/env node
/**
 * scripts/generate-authority-trust.js  (Phase 5)
 *
 * Computes authority and trust scores for every canonical wiki page using
 * deterministic, local-only signals.
 *
 * Inputs:
 *   js/wiki-index.json        – per-page rank signals
 *   js/entity-map.json        – entity metadata
 *   js/link-graph.json        – inbound/outbound link counts
 *   js/source-trust.json      – tier weights (optional)
 *   js/narrative-paths.json   – narrative step URLs (optional)
 *
 * Output: js/authority-trust.json
 *
 * Scoring formulas (spec-defined, capped to [0, 100]):
 *   authority_score = (inbound_links * 2) + (entity_mentions * 3) + (rank_score / 10)
 *   trust_score     = (source_trust_average * 50)
 *                   + (narrative_presence ? 25 : 0)
 *                   + (entity_relevance   ? 25 : 0)
 *
 * Usage: node scripts/generate-authority-trust.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT                = path.resolve(__dirname, '..');
const WIKI_INDEX_PATH     = path.join(ROOT, 'js', 'wiki-index.json');
const ENTITY_MAP_PATH     = path.join(ROOT, 'js', 'entity-map.json');
const LINK_GRAPH_PATH     = path.join(ROOT, 'js', 'link-graph.json');
const SOURCE_TRUST_PATH   = path.join(ROOT, 'js', 'source-trust.json');
const NARRATIVE_PATHS_PATH = path.join(ROOT, 'js', 'narrative-paths.json');
const OUTPUT_PATH         = path.join(ROOT, 'js', 'authority-trust.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readJsonOptional(file) {
  if (!fs.existsSync(file)) return null;
  try { return readJson(file); } catch (_) { return null; }
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function main() {
  const wikiIndex     = readJson(WIKI_INDEX_PATH);
  const entityMap     = readJson(ENTITY_MAP_PATH);
  const linkGraph     = readJson(LINK_GRAPH_PATH);
  const sourceTrust   = readJsonOptional(SOURCE_TRUST_PATH);
  const narrativePaths = readJsonOptional(NARRATIVE_PATHS_PATH);

  // ── entity-map lookup by canonical_url ─────────────────────────────────
  const entityByUrl = new Map();
  for (const entity of entityMap) {
    entityByUrl.set(entity.canonical_url, entity);
  }

  // ── source_trust_average from tier weights ──────────────────────────────
  // Use the average score_weight of all defined tiers; default = 1.0 (official)
  let sourceTrustAverage = 1.0;
  if (sourceTrust && Array.isArray(sourceTrust.tiers) && sourceTrust.tiers.length > 0) {
    const weights = sourceTrust.tiers
      .map(t => (typeof t.score_weight === 'number' ? t.score_weight : 1.0));
    sourceTrustAverage = weights.reduce((a, b) => a + b, 0) / weights.length;
  }

  // ── narrative presence: URLs referenced in any narrative path step ──────
  const narrativePresenceUrls = new Set();
  if (narrativePaths && Array.isArray(narrativePaths.paths)) {
    for (const p of narrativePaths.paths) {
      if (p.gateway_url) narrativePresenceUrls.add(p.gateway_url);
      if (Array.isArray(p.steps)) {
        for (const step of p.steps) {
          if (step.url) narrativePresenceUrls.add(step.url);
        }
      }
    }
  }

  // ── build entries ──────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);

  const entries = wikiIndex.map(entry => {
    const url        = entry.url;
    const linkData   = linkGraph[url] || {};
    const entityData = entityByUrl.get(url) || null;

    // inbound_links from link-graph
    const inbound_links = typeof linkData.inbound_count === 'number'
      ? linkData.inbound_count : 0;

    // entity_mentions: wiki-index mention_count + confirmed alias count
    const mention_count = (entry.rank_signals && typeof entry.rank_signals.mention_count === 'number')
      ? entry.rank_signals.mention_count : 0;
    const confirmed_aliases = entityData && Array.isArray(entityData.aliases)
      ? entityData.aliases.length : 0;
    const entity_mentions = mention_count + confirmed_aliases;

    const rank_score = typeof entry.rank_score === 'number' ? entry.rank_score : 0;

    // authority_score formula (spec-defined), capped to [0, 100]
    const authority_score_raw = (inbound_links * 2) + (entity_mentions * 3) + (rank_score / 10);
    const authority_score     = clamp(Math.round(authority_score_raw), 0, 100);

    // narrative_presence
    const narrative_presence = narrativePresenceUrls.has(url);

    // entity_relevance: has confirmed aliases or tags
    const entity_relevance = Boolean(
      (entityData && Array.isArray(entityData.aliases) && entityData.aliases.length > 0) ||
      (Array.isArray(entry.tags) && entry.tags.length > 0)
    );

    // trust_score formula (spec-defined), capped to [0, 100]
    const trust_score_raw = (sourceTrustAverage * 50)
      + (narrative_presence ? 25 : 0)
      + (entity_relevance   ? 25 : 0);
    const trust_score = clamp(Math.round(trust_score_raw), 0, 100);

    const category = (entry.rank_signals && entry.rank_signals.category)
      || (entityData && entityData.category) || 'unknown';

    return {
      url,
      title:              entry.title || '',
      authority_score,
      trust_score,
      inbound_links,
      entity_mentions,
      narrative_presence,
      category,
      last_updated:       today,
    };
  });

  // Sort: authority_score descending, then url ascending (deterministic)
  entries.sort((a, b) => b.authority_score - a.authority_score || a.url.localeCompare(b.url));

  const totalEntries    = entries.length;
  const avgAuthority    = totalEntries > 0
    ? Math.round(entries.reduce((s, e) => s + e.authority_score, 0) / totalEntries) : 0;
  const avgTrust        = totalEntries > 0
    ? Math.round(entries.reduce((s, e) => s + e.trust_score, 0) / totalEntries) : 0;
  const highAuthority   = entries.filter(e => e.authority_score >= 50).length;
  const highTrust       = entries.filter(e => e.trust_score >= 75).length;
  const withNarrative   = entries.filter(e => e.narrative_presence).length;

  const output = {
    generated_at: new Date().toISOString(),
    phase: 'phase_5',
    schema_version: '1.0',
    summary: {
      total_entries:        totalEntries,
      avg_authority_score:  avgAuthority,
      avg_trust_score:      avgTrust,
      high_authority_count: highAuthority,
      high_trust_count:     highTrust,
      narrative_present_count: withNarrative,
    },
    entries,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(
    `js/authority-trust.json written — ${totalEntries} entries, ` +
    `avg authority: ${avgAuthority}, avg trust: ${avgTrust}`
  );
}

main();
