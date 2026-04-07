#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WIKI_INDEX_PATH = path.join(ROOT, 'js', 'wiki-index.json');
const ENTITY_MAP_PATH = path.join(ROOT, 'js', 'entity-map.json');
const SITE_STATS_PATH = path.join(ROOT, 'js', 'site-stats.json');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const SEARCH_PATH = path.join(ROOT, 'search.html');
const CATEGORY_INDEX_PATH = path.join(ROOT, 'categories', 'index.html');
const HOME_PATH = path.join(ROOT, 'index.html');

const REQUIRED_RANK_SIGNAL_KEYS = [
  'is_canonical',
  'alias_count',
  'tag_count',
  'category_priority',
  'has_description',
  'article_word_count',
  'keyword_bag_size',
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function ensureFile(file) {
  assert(fs.existsSync(file), `Missing required file: ${path.relative(ROOT, file)}`);
}

function validateWikiIndex() {
  const wikiIndex = readJson(WIKI_INDEX_PATH);
  assert(Array.isArray(wikiIndex), 'js/wiki-index.json must be an array');
  assert(wikiIndex.length > 0, 'js/wiki-index.json is empty');

  for (const [idx, entry] of wikiIndex.entries()) {
    assert(typeof entry.title === 'string' && entry.title.trim(), `wiki-index entry ${idx} missing title`);
    assert(typeof entry.url === 'string' && entry.url.startsWith('/wiki/'), `wiki-index entry ${idx} has invalid url`);
    assert(typeof entry.rank_score === 'number' && !Number.isNaN(entry.rank_score), `wiki-index entry ${idx} has invalid rank_score`);
    assert(entry.rank_signals && typeof entry.rank_signals === 'object', `wiki-index entry ${idx} missing rank_signals`);
    for (const key of REQUIRED_RANK_SIGNAL_KEYS) {
      assert(Object.prototype.hasOwnProperty.call(entry.rank_signals, key), `wiki-index entry ${idx} missing rank_signals.${key}`);
    }
    assert(entry.rank_diagnostics && typeof entry.rank_diagnostics === 'object', `wiki-index entry ${idx} missing rank_diagnostics`);
    assert(entry.search_index && typeof entry.search_index === 'object', `wiki-index entry ${idx} missing search_index`);
    assert(Array.isArray(entry.search_index.keyword_bag), `wiki-index entry ${idx} missing search_index.keyword_bag`);
    assert(Array.isArray(entry.search_index.title_tokens), `wiki-index entry ${idx} missing search_index.title_tokens`);
    assert(Array.isArray(entry.search_index.alias_tokens), `wiki-index entry ${idx} missing search_index.alias_tokens`);

    const pagePath = path.join(ROOT, entry.url.replace(/^\//, ''));
    ensureFile(pagePath);

    for (const alias of entry.aliases || []) {
      assert(alias && typeof alias.title === 'string', `wiki-index entry ${idx} has malformed alias title`);
      assert(alias && typeof alias.url === 'string' && alias.url.startsWith('/wiki/'), `wiki-index entry ${idx} has malformed alias url`);
      const aliasPath = path.join(ROOT, alias.url.replace(/^\//, ''));
      ensureFile(aliasPath);
    }
  }

  console.log(`wiki-index.json validated (${wikiIndex.length} entries) ✅`);
}

function validateEntityMap() {
  const entityMap = readJson(ENTITY_MAP_PATH);
  assert(Array.isArray(entityMap), 'js/entity-map.json must be an array');
  assert(entityMap.length > 0, 'js/entity-map.json is empty');
  console.log(`entity-map.json validated (${entityMap.length} records) ✅`);
}

function validateSiteStats() {
  const stats = readJson(SITE_STATS_PATH);
  assert(stats && typeof stats === 'object', 'js/site-stats.json must be an object');
  console.log('site-stats.json validated ✅');
}

function validateSitemap() {
  const xml = fs.readFileSync(SITEMAP_PATH, 'utf8');
  assert(xml.includes('<urlset'), 'sitemap.xml missing <urlset>');
  assert(xml.includes('<loc>https://crypto-moonboys.github.io/search.html</loc>'), 'sitemap.xml missing search.html');
  console.log('sitemap.xml validated ✅');
}

function validateCorePages() {
  [HOME_PATH, SEARCH_PATH, CATEGORY_INDEX_PATH].forEach(ensureFile);
  const searchHtml = fs.readFileSync(SEARCH_PATH, 'utf8');
  assert(searchHtml.includes('id="search-results-page"'), 'search.html missing search results container');
  assert(searchHtml.includes('id="ranking-debug"'), 'search.html missing ranking debug panel');
  console.log('Core page smoke tests passed ✅');
}

function main() {
  [WIKI_INDEX_PATH, ENTITY_MAP_PATH, SITE_STATS_PATH, SITEMAP_PATH, SEARCH_PATH, CATEGORY_INDEX_PATH, HOME_PATH].forEach(ensureFile);
  validateWikiIndex();
  validateEntityMap();
  validateSiteStats();
  validateSitemap();
  validateCorePages();
  console.log('All generated asset checks passed ✅');
}

main();
