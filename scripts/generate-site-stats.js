#!/usr/bin/env node
/**
 * scripts/generate-site-stats.js
 *
 * Generates js/site-stats.json from real repository contents:
 *   - article_count  : number of entries in js/wiki-index.json
 *   - entity_count   : number of entries in js/entity-map.json
 *   - category_count : number of /categories/*.html files, excluding index.html
 *   - last_updated   : ISO timestamp of the build; preserved if counts are unchanged
 *
 * Also writes the legacy keys (total_articles / total_entities) so that
 * js/index_stats_v2.js can read the same file without changes.
 *
 * NOTE: total_entities mirrors entity_count (actual entity count from entity-map),
 * NOT category_count.
 *
 * Run:
 *   node scripts/generate-site-stats.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT            = path.resolve(__dirname, '..');
const INDEX_JSON      = path.join(ROOT, 'js', 'wiki-index.json');
const ENTITY_MAP      = path.join(ROOT, 'js', 'entity-map.json');
const CATS_DIR        = path.join(ROOT, 'categories');
const OUTPUT          = path.join(ROOT, 'js', 'site-stats.json');
const LEGACY_OUTPUT   = path.join(ROOT, 'index_stats.json');

/* ── Article count from search index ────────────────────────────────────── */
let articleCount = 0;
if (fs.existsSync(INDEX_JSON)) {
  const raw = fs.readFileSync(INDEX_JSON, 'utf8');
  try {
    articleCount = JSON.parse(raw).length;
  } catch (e) {
    console.error('Warning: could not parse js/wiki-index.json:', e.message);
  }
} else {
  console.error('Warning: js/wiki-index.json not found — article_count will be 0');
}

/* ── Category count: categories/*.html excluding index.html ─────────────── */
let categoryCount = 0;
if (fs.existsSync(CATS_DIR)) {
  categoryCount = fs.readdirSync(CATS_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .length;
} else {
  console.error('Warning: categories/ directory not found — category_count will be 0');
}

/* ── Entity count from entity-map ───────────────────────────────────────── */
let entityCount = 0;
if (fs.existsSync(ENTITY_MAP)) {
  const raw = fs.readFileSync(ENTITY_MAP, 'utf8');
  try {
    entityCount = JSON.parse(raw).length;
  } catch (e) {
    console.error('Warning: could not parse js/entity-map.json:', e.message);
  }
} else {
  console.error('Warning: js/entity-map.json not found — entity_count will be 0');
}

/* ── Consistency check ───────────────────────────────────────────────────── */
if (entityCount > 0 && articleCount > 0 && entityCount !== articleCount) {
  console.warn(`Note: entity_count (${entityCount}) differs from article_count (${articleCount}) — this is expected when some articles cover multiple entities.`);
}

/* ── Timestamp: preserve existing timestamp if counts haven't changed ────── */
let lastUpdated = new Date().toISOString();
if (fs.existsSync(OUTPUT)) {
  try {
    const existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
    if (
      existing.article_count  === articleCount  &&
      existing.entity_count   === entityCount   &&
      existing.category_count === categoryCount
    ) {
      lastUpdated = existing.last_updated;
    }
  } catch (e) { /* ignore parse errors — use fresh timestamp */ }
}

/* ── Write output ────────────────────────────────────────────────────────── */
const stats = {
  article_count:   articleCount,
  entity_count:    entityCount,
  category_count:  categoryCount,
  last_updated:    lastUpdated,
  /* legacy keys consumed by js/index_stats_v2.js */
  total_articles:  articleCount,
  total_entities:  entityCount,
};

fs.writeFileSync(OUTPUT, JSON.stringify(stats, null, 2) + '\n', 'utf8');
console.log(`js/site-stats.json written — ${articleCount} articles, ${entityCount} entities, ${categoryCount} categories (${lastUpdated})`);

/* ── Write legacy index_stats.json (root) ───────────────────────────────── */
// index_stats.json is a root-level legacy file kept in sync for consistency.
// It mirrors the core fields from js/site-stats.json.
// Written as a compact single-line JSON to match its original format.
const legacyStats = {
  total_articles: articleCount,
  total_entities: entityCount,
  last_updated:   lastUpdated.slice(0, 10), // date-only string (YYYY-MM-DD)
};
fs.writeFileSync(LEGACY_OUTPUT, JSON.stringify(legacyStats) + '\n', 'utf8');
console.log(`index_stats.json written — ${articleCount} articles, ${entityCount} entities`);
