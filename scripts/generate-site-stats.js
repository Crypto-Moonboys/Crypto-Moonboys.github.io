#!/usr/bin/env node
/**
 * scripts/generate-site-stats.js
 *
 * Generates js/site-stats.json from canonical generated assets:
 *   - totalArticles / article_count   : number of canonical entries in js/wiki-index.json
 *   - totalEntities / entity_count    : number of canonical entities in js/entity-map.json
 *   - totalCategories / category_count: number of /categories/*.html files, excluding index.html
 *   - last_updated                    : ISO timestamp of the build; preserved if counts are unchanged
 *
 * Also writes index_stats.json for older consumers.
 *
 * Canonical article hub:
 *   /search.html
 *
 * Legacy page excluded from all generated data:
 *   /wiki/index.html
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX_JSON = path.join(ROOT, 'js', 'wiki-index.json');
const ENTITY_MAP = path.join(ROOT, 'js', 'entity-map.json');
const CATS_DIR = path.join(ROOT, 'categories');
const OUTPUT = path.join(ROOT, 'js', 'site-stats.json');
const LEGACY_OUTPUT = path.join(ROOT, 'index_stats.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function countCanonicalArticles() {
  if (!fs.existsSync(INDEX_JSON)) {
    console.error('Warning: js/wiki-index.json not found — article counts will be 0');
    return 0;
  }

  try {
    const entries = readJson(INDEX_JSON);
    if (!Array.isArray(entries)) return 0;

    return entries.filter(entry => {
      return (
        entry &&
        typeof entry === 'object' &&
        typeof entry.url === 'string' &&
        entry.url.startsWith('/wiki/') &&
        entry.url !== '/wiki/index.html'
      );
    }).length;
  } catch (err) {
    console.error('Warning: could not parse js/wiki-index.json:', err.message);
    return 0;
  }
}

function countCanonicalEntities() {
  if (!fs.existsSync(ENTITY_MAP)) {
    console.error('Warning: js/entity-map.json not found — entity counts will be 0');
    return 0;
  }

  try {
    const entries = readJson(ENTITY_MAP);
    if (!Array.isArray(entries)) return 0;

    return entries.filter(entry => {
      return (
        entry &&
        typeof entry === 'object' &&
        typeof entry.canonical_url === 'string' &&
        entry.canonical_url.startsWith('/wiki/') &&
        entry.canonical_url !== '/wiki/index.html'
      );
    }).length;
  } catch (err) {
    console.error('Warning: could not parse js/entity-map.json:', err.message);
    return 0;
  }
}

function countCategories() {
  if (!fs.existsSync(CATS_DIR)) {
    console.error('Warning: categories/ directory not found — category counts will be 0');
    return 0;
  }

  return fs.readdirSync(CATS_DIR)
    .filter(file => file.endsWith('.html') && file !== 'index.html')
    .length;
}

function preserveTimestampIfStable(articleCount, entityCount, categoryCount) {
  let lastUpdated = new Date().toISOString();

  if (!fs.existsSync(OUTPUT)) {
    return lastUpdated;
  }

  try {
    const existing = readJson(OUTPUT);

    const existingArticleCount =
      existing.article_count ?? existing.totalArticles ?? existing.total_articles;

    const existingEntityCount =
      existing.entity_count ?? existing.totalEntities ?? existing.total_entities;

    const existingCategoryCount =
      existing.category_count ?? existing.totalCategories ?? existing.total_categories;

    if (
      existingArticleCount === articleCount &&
      existingEntityCount === entityCount &&
      existingCategoryCount === categoryCount &&
      typeof existing.last_updated === 'string' &&
      existing.last_updated.trim()
    ) {
      lastUpdated = existing.last_updated;
    }
  } catch (err) {
    // Ignore parse errors and use fresh timestamp.
  }

  return lastUpdated;
}

const articleCount = countCanonicalArticles();
const entityCount = countCanonicalEntities();
const categoryCount = countCategories();

if (entityCount > 0 && articleCount > 0 && entityCount !== articleCount) {
  console.warn(
    `Note: entity_count (${entityCount}) differs from article_count (${articleCount}) — this is expected when some articles cover multiple entities or alias pages are excluded.`
  );
}

const lastUpdated = preserveTimestampIfStable(articleCount, entityCount, categoryCount);

const stats = {
  article_count: articleCount,
  entity_count: entityCount,
  category_count: categoryCount,
  totalArticles: articleCount,
  totalEntities: entityCount,
  totalCategories: categoryCount,
  total_articles: articleCount,
  total_entities: entityCount,
  total_categories: categoryCount,
  canonical_hub: '/search.html',
  excluded_legacy_paths: ['/wiki/index.html'],
  last_updated: lastUpdated,
};

fs.writeFileSync(OUTPUT, JSON.stringify(stats, null, 2) + '\n', 'utf8');
console.log(
  `js/site-stats.json written — ${articleCount} articles, ${entityCount} entities, ${categoryCount} categories (${lastUpdated})`
);

const legacyStats = {
  total_articles: articleCount,
  total_entities: entityCount,
  total_categories: categoryCount,
  last_updated: lastUpdated.slice(0, 10),
};

fs.writeFileSync(LEGACY_OUTPUT, JSON.stringify(legacyStats) + '\n', 'utf8');
console.log(
  `index_stats.json written — ${articleCount} articles, ${entityCount} entities, ${categoryCount} categories`
);