#!/usr/bin/env node
/**
 * scripts/generate-timeline-intelligence.js  (Phase 5)
 *
 * Enriches timeline events with narrative weights, related entities, and
 * chronological positioning to support narrative-coherent navigation.
 *
 * Inputs:
 *   js/timeline-data.json    – canonical event list with sort_key + era
 *   js/narrative-paths.json  – guided narrative paths (optional)
 *   js/wiki-index.json       – per-page metadata used to resolve related entities
 *
 * Output: js/timeline-intelligence.json
 *
 * Usage: node scripts/generate-timeline-intelligence.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT                 = path.resolve(__dirname, '..');
const TIMELINE_DATA_PATH   = path.join(ROOT, 'js', 'timeline-data.json');
const NARRATIVE_PATHS_PATH = path.join(ROOT, 'js', 'narrative-paths.json');
const WIKI_INDEX_PATH      = path.join(ROOT, 'js', 'wiki-index.json');
const OUTPUT_PATH          = path.join(ROOT, 'js', 'timeline-intelligence.json');

const MAX_RELATED_ENTITIES = 10;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readJsonOptional(file) {
  if (!fs.existsSync(file)) return null;
  try { return readJson(file); } catch (_) { return null; }
}

function main() {
  const timelineData   = readJson(TIMELINE_DATA_PATH);
  const narrativePaths = readJsonOptional(NARRATIVE_PATHS_PATH);
  const wikiIndex      = readJson(WIKI_INDEX_PATH);

  const events = Array.isArray(timelineData.events) ? timelineData.events : [];
  const paths  = (narrativePaths && Array.isArray(narrativePaths.paths))
    ? narrativePaths.paths : [];

  // ── tag → pages lookup from wiki-index ──────────────────────────────────
  const tagToPages = new Map();
  for (const entry of wikiIndex) {
    const tags = Array.isArray(entry.tags) ? entry.tags : [];
    for (const tag of tags) {
      if (!tagToPages.has(tag)) tagToPages.set(tag, []);
      tagToPages.get(tag).push({ url: entry.url, title: entry.title });
    }
  }

  // ── narrative weight: count path references per URL ──────────────────────
  const narrativeWeightMap = new Map();
  for (const p of paths) {
    if (p.gateway_url) {
      narrativeWeightMap.set(
        p.gateway_url,
        (narrativeWeightMap.get(p.gateway_url) || 0) + 1
      );
    }
    if (Array.isArray(p.steps)) {
      for (const step of p.steps) {
        if (step.url) {
          narrativeWeightMap.set(
            step.url,
            (narrativeWeightMap.get(step.url) || 0) + 1
          );
        }
      }
    }
  }

  // ── timeline_position: rank by sort_key (1-based) ────────────────────────
  const sortedIds = [...events]
    .sort((a, b) => (a.sort_key || 0) - (b.sort_key || 0) || (a.id || '').localeCompare(b.id || ''))
    .map(e => e.id);
  const positionMap = new Map(sortedIds.map((id, idx) => [id, idx + 1]));

  // ── build enriched entries ────────────────────────────────────────────────
  const entries = events.map(evt => {
    const evtTags = Array.isArray(evt.tags) ? evt.tags : [];

    // Collect related entities from matching tags (deduplicated, exclude self)
    const relatedUrls = new Set();
    const related_entities = [];
    for (const tag of evtTags) {
      for (const page of (tagToPages.get(tag) || [])) {
        if (!relatedUrls.has(page.url) && page.url !== evt.url) {
          relatedUrls.add(page.url);
          related_entities.push({ url: page.url, title: page.title });
          if (related_entities.length >= MAX_RELATED_ENTITIES) break;
        }
      }
      if (related_entities.length >= MAX_RELATED_ENTITIES) break;
    }

    return {
      event_name:        evt.title || '',
      event_id:          evt.id    || '',
      era:               evt.era   || '',
      canonical_url:     evt.url   || '',
      category:          evt.category || '',
      sort_key:          evt.sort_key  || 0,
      timeline_position: positionMap.get(evt.id) || 0,
      narrative_weight:  narrativeWeightMap.get(evt.url) || 0,
      related_entities,
      is_event_page:     evt.is_event_page || false,
      rank_score:        evt.rank_score    || 0,
    };
  });

  // Sort by sort_key ascending, then event_name for full determinism
  entries.sort((a, b) =>
    a.sort_key - b.sort_key || a.event_name.localeCompare(b.event_name)
  );

  const totalEvents    = entries.length;
  const withNarrative  = entries.filter(e => e.narrative_weight > 0).length;
  const withRelated    = entries.filter(e => e.related_entities.length > 0).length;
  const uniqueEras     = [...new Set(entries.map(e => e.era).filter(Boolean))];

  const output = {
    generated_at: new Date().toISOString(),
    phase: 'phase_5',
    schema_version: '1.0',
    summary: {
      total_events:                 totalEvents,
      total_with_narrative_weight:  withNarrative,
      total_with_related_entities:  withRelated,
      unique_eras:                  uniqueEras.length,
      era_list:                     uniqueEras,
    },
    entries,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(
    `js/timeline-intelligence.json written — ${totalEvents} events, ` +
    `${withNarrative} with narrative weight, ${uniqueEras.length} eras`
  );
}

main();
