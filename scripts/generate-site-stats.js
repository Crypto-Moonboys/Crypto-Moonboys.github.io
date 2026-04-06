#!/usr/bin/env node
/**
 * scripts/generate-site-stats.js
 *
 * Generates js/site-stats.json from real repository contents:
 *   - article_count  : number of entries in js/wiki-index.json
 *   - category_count : number of /categories/*.html files, excluding index.html
 *   - last_updated   : ISO timestamp of the build; preserved if counts are unchanged
 *
 * Also writes the legacy keys (total_articles / total_entities) so that
 * js/index_stats_v2.js can read the same file without changes.
 *
 * Run:
 *   node scripts/generate-site-stats.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT        = path.resolve(__dirname, '..');
const INDEX_JSON  = path.join(ROOT, 'js', 'wiki-index.json');
const CATS_DIR    = path.join(ROOT, 'categories');
const OUTPUT      = path.join(ROOT, 'js', 'site-stats.json');

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

/* ── Timestamp: preserve existing timestamp if counts haven't changed ────── */
let lastUpdated = new Date().toISOString();
if (fs.existsSync(OUTPUT)) {
  try {
    const existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
    if (existing.article_count === articleCount && existing.category_count === categoryCount) {
      lastUpdated = existing.last_updated;
    }
  } catch (e) { /* ignore parse errors — use fresh timestamp */ }
}

/* ── Write output ────────────────────────────────────────────────────────── */
const stats = {
  article_count:   articleCount,
  category_count:  categoryCount,
  last_updated:    lastUpdated,
  /* legacy keys consumed by js/index_stats_v2.js */
  total_articles:  articleCount,
  total_entities:  categoryCount,
};

fs.writeFileSync(OUTPUT, JSON.stringify(stats, null, 2) + '\n', 'utf8');
console.log(`js/site-stats.json written — ${articleCount} articles, ${categoryCount} categories (${lastUpdated})`);
