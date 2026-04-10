#!/usr/bin/env node
'use strict';

/**
 * generate-timeline-data.js
 * Phase 25: Timeline-Based Navigation data builder.
 *
 * Reads:
 *   js/wiki-index.json
 *   js/entity-map.json
 *
 * Writes:
 *   js/timeline-data.json
 *
 * Derives chronological events from existing metadata:
 *   1. Pages with year patterns in their slugs (e.g. 2025-metaverse-launch-party)
 *   2. Pages with temporal keywords in tags (genesis, launch, drop, event, etc.)
 *   3. Era groupings by category and cluster signals
 *
 * Rules:
 *  - Deterministic: same inputs always produce same outputs
 *  - No external APIs, no randomness
 *  - Root-relative paths only
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

// ---------------------------------------------------------------------------
// Temporal signal extraction
// ---------------------------------------------------------------------------

/**
 * Derive a sort-key year from a page slug.
 * Returns a number (e.g. 2025) or null.
 */
function extractYearFromSlug(slug) {
  const m = slug.match(/(?:^|-)(20\d\d)(?:-|$)/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Tags that strongly imply a temporal/event context.
 * Sorted for deterministic matching order.
 */
const EVENT_TAGS = new Set([
  'genesis', 'launch', 'drop', 'event', 'party', 'release',
  'airdrop', 'mint', 'sale', 'presale', 'ico', 'ido',
  'season', 'phase', 'update', 'anniversary', 'battle',
]);

/**
 * Keywords in titles/slugs that imply an event era.
 * Used as fallback when no year is present.
 */
const ERA_KEYWORDS = {
  genesis:   'Genesis Era',
  origin:    'Genesis Era',
  founding:  'Genesis Era',
  launch:    'Launch Era',
  drop:      'Drop Era',
  airdrop:   'Drop Era',
  mint:      'Mint Era',
  sale:      'Market Era',
  ico:       'Market Era',
  ido:       'Market Era',
  token:     'Token Era',
  metaverse: 'Metaverse Era',
  battle:    'Battle Era',
  war:       'Battle Era',
  party:     'Event Era',
  event:     'Event Era',
};

/**
 * Category display labels.
 */
const CATEGORY_LABELS = {
  characters: 'Characters',
  factions:   'Factions',
  tokens:     'Tokens & Crypto',
};

/**
 * Determine the era label for a page given its slug and tags.
 */
function deriveEra(slug, tags) {
  // Year-based era takes priority
  const year = extractYearFromSlug(slug);
  if (year) return `${year}`;

  // Tag-based era
  for (const tag of (tags || [])) {
    const t = tag.toLowerCase().trim();
    if (ERA_KEYWORDS[t]) return ERA_KEYWORDS[t];
  }

  // Slug keyword-based era
  const slugParts = slug.split('-');
  for (const part of slugParts) {
    if (ERA_KEYWORDS[part]) return ERA_KEYWORDS[part];
  }

  return null;
}

/**
 * Build a clean display title from a wiki-index entry.
 */
function cleanTitle(raw) {
  return String(raw || '')
    .replace(/\s+[—–-]\s+Crypto Moonboys Wiki$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Era sort ordering
// ---------------------------------------------------------------------------

/**
 * Map era labels to a numeric sort key for chronological ordering.
 * Named eras come after numeric years.
 */
const ERA_SORT_ORDER = {
  'Genesis Era': 1000,
  'Launch Era':  1001,
  'Mint Era':    1002,
  'Drop Era':    1003,
  'Market Era':  1004,
  'Token Era':   1005,
  'Battle Era':  1006,
  'Event Era':   1007,
  'Metaverse Era': 1008,
};

function eraSortKey(era) {
  if (/^\d{4}$/.test(era)) return parseInt(era, 10);
  return ERA_SORT_ORDER[era] || 9999;
}

// ---------------------------------------------------------------------------
// Load inputs
// ---------------------------------------------------------------------------

const wikiIndexRaw = readJson('js/wiki-index.json');
const entityMap    = readJson('js/entity-map.json');

const wikiPages = Array.isArray(wikiIndexRaw) ? wikiIndexRaw : Object.values(wikiIndexRaw);

// ---------------------------------------------------------------------------
// Build timeline events
// ---------------------------------------------------------------------------

/**
 * Classify each wiki page into a timeline event.
 * Each event has: id, era, title, url, category, tags, is_event_page, sort_key.
 */
const events = [];

for (const page of wikiPages) {
  const slug     = (page.url || '').replace('/wiki/', '').replace('.html', '');
  const title    = cleanTitle(page.title);
  const tags     = Array.isArray(page.tags) ? page.tags : [];
  const category = page.category || 'unknown';

  // Determine if this page has strong event signals
  const hasEventTag = tags.some(t => EVENT_TAGS.has(t.toLowerCase().trim()));
  const hasYearInSlug = /(?:^|-)(20\d\d)(?:-|$)/.test(slug);
  const isEventPage = hasEventTag || hasYearInSlug;

  const era = deriveEra(slug, tags) || category;

  events.push({
    id:           slug,
    era,
    sort_key:     eraSortKey(era),
    title,
    url:          page.url,
    category,
    tags:         tags.slice().sort(),
    is_event_page: isEventPage,
    rank_score:   typeof page.rank_score === 'number' ? page.rank_score : 0,
  });
}

// ---------------------------------------------------------------------------
// Sort events: by sort_key ASC, then rank_score DESC, then title ASC
// ---------------------------------------------------------------------------

events.sort((a, b) => {
  if (a.sort_key !== b.sort_key) return a.sort_key - b.sort_key;
  if (b.rank_score !== a.rank_score) return b.rank_score - a.rank_score;
  return a.title.localeCompare(b.title);
});

// ---------------------------------------------------------------------------
// Group into eras
// ---------------------------------------------------------------------------

const eraMap = new Map();

for (const event of events) {
  if (!eraMap.has(event.era)) {
    eraMap.set(event.era, {
      era:        event.era,
      sort_key:   event.sort_key,
      is_dated:   /^\d{4}$/.test(event.era),
      page_count: 0,
      event_pages: 0,
      pages:      [],
    });
  }
  const bucket = eraMap.get(event.era);
  bucket.page_count++;
  if (event.is_event_page) bucket.event_pages++;
  bucket.pages.push({
    id:           event.id,
    title:        event.title,
    url:          event.url,
    category:     event.category,
    is_event_page: event.is_event_page,
    rank_score:   event.rank_score,
  });
}

const eras = Array.from(eraMap.values()).sort((a, b) => a.sort_key - b.sort_key);

// ---------------------------------------------------------------------------
// Category timeline — group by category with rank ordering
// ---------------------------------------------------------------------------

const categoryTimeline = {};
for (const [cat, label] of Object.entries(CATEGORY_LABELS)) {
  const catPages = wikiPages
    .filter(p => p.category === cat)
    .map(p => ({
      id:         (p.url || '').replace('/wiki/', '').replace('.html', ''),
      title:      cleanTitle(p.title),
      url:        p.url,
      rank_score: typeof p.rank_score === 'number' ? p.rank_score : 0,
      tags:       Array.isArray(p.tags) ? p.tags.slice().sort() : [],
    }))
    .sort((a, b) => {
      if (b.rank_score !== a.rank_score) return b.rank_score - a.rank_score;
      return a.title.localeCompare(b.title);
    });

  categoryTimeline[cat] = {
    label,
    page_count: catPages.length,
    pages:      catPages,
  };
}

// ---------------------------------------------------------------------------
// Build output
// ---------------------------------------------------------------------------

const output = {
  generated_at:   new Date().toISOString(),
  phase:          'phase_25',
  schema_version: '1.0',

  summary: {
    total_events:      events.length,
    total_eras:        eras.length,
    dated_eras:        eras.filter(e => e.is_dated).length,
    named_eras:        eras.filter(e => !e.is_dated).length,
    event_pages:       events.filter(e => e.is_event_page).length,
    categories:        Object.keys(categoryTimeline).length,
  },

  // Flat event list for simple rendering
  events,

  // Era-grouped view for timeline navigation
  eras,

  // Category-based grouping
  category_timeline: categoryTimeline,
};

const outPath = path.join(ROOT, 'js', 'timeline-data.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');

console.log('generate-timeline-data.js complete ✅');
console.log(`  Events: ${events.length}`);
console.log(`  Eras: ${eras.length} (${eras.filter(e => e.is_dated).length} dated, ${eras.filter(e => !e.is_dated).length} named)`);
console.log(`  Event pages: ${events.filter(e => e.is_event_page).length}`);
console.log('  Output: js/timeline-data.json');
