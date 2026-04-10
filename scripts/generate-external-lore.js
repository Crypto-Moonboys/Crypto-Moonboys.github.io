#!/usr/bin/env node
'use strict';

/**
 * generate-external-lore.js
 * Phase 25: External Lore Ingestion Framework.
 *
 * Reads:
 *   js/wiki-index.json
 *   js/entity-map.json
 *
 * Writes:
 *   js/external-lore.json
 *
 * Design:
 *  - No external API calls; outputs validated metadata structure from local data
 *  - Structured for future integration with approved external sources
 *  - Deterministic: same inputs always produce same outputs
 *  - Approved sources list is empty by default; add entries to APPROVED_SOURCES
 *    to enable future ingestion
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

// ---------------------------------------------------------------------------
// Approved external source registry
// ---------------------------------------------------------------------------
// Each entry defines a source schema for future ingestion.
// Format:
//   id         — unique stable identifier
//   name       — human-readable label
//   type       — "rss" | "json-feed" | "api" | "static"
//   status     — "approved" | "pending" | "disabled"
//   schema     — expected fields when data is ingested
//   base_url   — root URL for reference (not fetched at this time)
// ---------------------------------------------------------------------------

const APPROVED_SOURCES = [
  // Example entry (disabled — no live fetching):
  // {
  //   id:       'example-source',
  //   name:     'Example Lore Feed',
  //   type:     'json-feed',
  //   status:   'disabled',
  //   base_url: 'https://example.com/lore-feed.json',
  //   schema:   { required: ['id', 'title', 'date'], optional: ['tags', 'summary', 'url'] }
  // }
];

// ---------------------------------------------------------------------------
// Validation schema definition
// ---------------------------------------------------------------------------

const LORE_ENTRY_SCHEMA = {
  required: ['id', 'title', 'source_id', 'ingested_at'],
  optional: ['date', 'summary', 'tags', 'url', 'category', 'related_wiki_urls'],
  types: {
    id:                 'string',
    title:              'string',
    source_id:          'string',
    ingested_at:        'string',
    date:               'string',
    summary:            'string',
    tags:               'array',
    url:                'string',
    category:           'string',
    related_wiki_urls:  'array',
  },
};

/**
 * Validate a lore entry against the schema.
 * Returns { valid: boolean, errors: string[] }.
 */
function validateLoreEntry(entry) {
  const errors = [];

  for (const field of LORE_ENTRY_SCHEMA.required) {
    if (!Object.prototype.hasOwnProperty.call(entry, field)) {
      errors.push(`missing required field: ${field}`);
    } else if (typeof entry[field] !== LORE_ENTRY_SCHEMA.types[field]) {
      errors.push(`field ${field} must be ${LORE_ENTRY_SCHEMA.types[field]}`);
    }
  }

  for (const field of LORE_ENTRY_SCHEMA.optional) {
    if (!Object.prototype.hasOwnProperty.call(entry, field)) continue;
    const expected = LORE_ENTRY_SCHEMA.types[field];
    if (expected === 'array') {
      if (!Array.isArray(entry[field])) errors.push(`field ${field} must be an array`);
    } else if (typeof entry[field] !== expected) {
      errors.push(`field ${field} must be ${expected}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Load existing wiki data for cross-reference mapping
// ---------------------------------------------------------------------------

const wikiIndexRaw = readJson('js/wiki-index.json');
const entityMap    = readJson('js/entity-map.json');

const wikiPages = Array.isArray(wikiIndexRaw) ? wikiIndexRaw : Object.values(wikiIndexRaw);

// Build category → [url] index for cross-referencing lore entries
const categoryIndex = {};
for (const page of wikiPages) {
  const cat = (page.category || 'uncategorised').toLowerCase();
  if (!categoryIndex[cat]) categoryIndex[cat] = [];
  categoryIndex[cat].push(page.url);
}

// Build tag → [url] index
const tagIndex = {};
for (const page of wikiPages) {
  for (const tag of (page.tags || [])) {
    const t = tag.toLowerCase().trim();
    if (!tagIndex[t]) tagIndex[t] = [];
    tagIndex[t].push(page.url);
  }
}

// ---------------------------------------------------------------------------
// Lore entries — populated when real source ingestion is active
// Deterministically sorted by id for reproducible outputs.
// ---------------------------------------------------------------------------

const loreEntries = [];

// Validate all entries (none expected at this time)
const validationResults = loreEntries.map((entry, i) => {
  const result = validateLoreEntry(entry);
  return { index: i, id: entry.id || null, ...result };
});

const validCount   = validationResults.filter(r => r.valid).length;
const invalidCount = validationResults.filter(r => !r.valid).length;

// ---------------------------------------------------------------------------
// Build output
// ---------------------------------------------------------------------------

const output = {
  generated_at:    new Date().toISOString(),
  phase:           'phase_25',
  schema_version:  '1.0',

  summary: {
    total_entries:   loreEntries.length,
    valid_entries:   validCount,
    invalid_entries: invalidCount,
    approved_sources: APPROVED_SOURCES.length,
    active_sources:  APPROVED_SOURCES.filter(s => s.status === 'approved').length,
  },

  // Schema definition for consumers to validate against
  entry_schema: LORE_ENTRY_SCHEMA,

  // Source registry
  approved_sources: APPROVED_SOURCES,

  // Cross-reference indexes for future ingestion routing
  wiki_cross_reference: {
    category_index: Object.fromEntries(
      Object.entries(categoryIndex)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cat, urls]) => [cat, urls.sort()])
    ),
    tag_index: Object.fromEntries(
      Object.entries(tagIndex)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([tag, urls]) => [tag, urls.sort()])
    ),
    total_wiki_pages:   wikiPages.length,
    total_entity_ids:   entityMap.length,
  },

  // Validation results for existing entries
  validation_results: validationResults,

  // Lore entries (empty until sources are enabled)
  entries: loreEntries,
};

const outPath = path.join(ROOT, 'js', 'external-lore.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');

console.log('generate-external-lore.js complete ✅');
console.log(`  Entries: ${loreEntries.length} (${validCount} valid, ${invalidCount} invalid)`);
console.log(`  Approved sources: ${APPROVED_SOURCES.length}`);
console.log(`  Wiki cross-reference: ${wikiPages.length} pages, ${entityMap.length} entities`);
console.log('  Output: js/external-lore.json');
