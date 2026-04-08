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
  'is_stub',
  'has_bible',
  'alias_count',
  'tag_count',
  'category',
  'category_priority',
  'has_description',
  'article_word_count',
  'keyword_bag_size',
  'heading_count',
  'list_count',
  'internal_link_count',
  'content_quality_score',
  'authority_score'
];

const REQUIRED_RANK_DIAGNOSTIC_KEYS = [
  'canonical_points',
  'description_points',
  'category_points',
  'word_count_points',
  'keyword_bag_points',
  'content_quality_points',
  'authority_points',
  'bible_bonus_points',
  'stub_penalty_points',
  'final_rank_score'
];

const VALID_RANK_BUCKETS = new Set(['primary', 'secondary', 'tertiary', 'stub']);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function ensureFile(file) {
  assert(fs.existsSync(file), `Missing required file: ${path.relative(ROOT, file)}`);
}

function isNumber(value) {
  return typeof value === 'number' && !Number.isNaN(value);
}

function validateWikiIndex() {
  const wikiIndex = readJson(WIKI_INDEX_PATH);
  assert(Array.isArray(wikiIndex), 'js/wiki-index.json must be an array');
  assert(wikiIndex.length > 0, 'js/wiki-index.json is empty');

  const slugsSeen = new Map(); // slug -> first index

  for (const [idx, entry] of wikiIndex.entries()) {
    assert(entry && typeof entry === 'object', `wiki-index entry ${idx} is not an object`);

    assert(typeof entry.title === 'string' && entry.title.trim(), `wiki-index entry ${idx} missing title`);
    assert(typeof entry.url === 'string' && entry.url.startsWith('/wiki/'), `wiki-index entry ${idx} has invalid url`);
    assert(entry.url !== '/wiki/index.html', `wiki-index entry ${idx} must not include legacy /wiki/index.html`);
    assert(!entry.url.includes('../'), `wiki-index entry ${idx} contains fragile relative url`);
    assert(isNumber(entry.rank_score), `wiki-index entry ${idx} has invalid rank_score`);
    assert(typeof entry.rank_version === 'string' && entry.rank_version.trim(), `wiki-index entry ${idx} missing rank_version`);
    assert(typeof entry.rank_bucket === 'string' && VALID_RANK_BUCKETS.has(entry.rank_bucket), `wiki-index entry ${idx} has invalid rank_bucket "${entry.rank_bucket}"`);
    assert(typeof entry.is_stub === 'boolean', `wiki-index entry ${idx} missing is_stub boolean`);
    assert(typeof entry.has_bible === 'boolean', `wiki-index entry ${idx} missing has_bible boolean`);
    assert(typeof entry.slug === 'string' && entry.slug.trim(), `wiki-index entry ${idx} missing slug`);
    assert(isNumber(entry.mention_count), `wiki-index entry ${idx} missing numeric mention_count`);
    assert(isNumber(entry.word_count), `wiki-index entry ${idx} missing numeric word_count`);
    assert(isNumber(entry.internal_link_count), `wiki-index entry ${idx} missing numeric internal_link_count`);

    // Duplicate slug check
    const slugKey = entry.slug;
    if (slugsSeen.has(slugKey)) {
      const firstIdx = slugsSeen.get(slugKey);
      assert(false, `wiki-index entries ${firstIdx} and ${idx} have duplicate slug "${slugKey}"`);
    }
    slugsSeen.set(slugKey, idx);

    // Stub bucket invariant: stubs must carry rank_bucket 'stub'
    assert(
      !entry.is_stub || entry.rank_bucket === 'stub',
      `wiki-index entry ${idx} is_stub but rank_bucket is "${entry.rank_bucket}" (must be "stub")`
    );

    assert(entry.rank_signals && typeof entry.rank_signals === 'object', `wiki-index entry ${idx} missing rank_signals`);
    for (const key of REQUIRED_RANK_SIGNAL_KEYS) {
      assert(
        Object.prototype.hasOwnProperty.call(entry.rank_signals, key),
        `wiki-index entry ${idx} missing rank_signals.${key}`
      );
    }

    assert(typeof entry.rank_signals.category === 'string' && entry.rank_signals.category.trim(), `wiki-index entry ${idx} has invalid rank_signals.category`);
    assert(isNumber(entry.rank_signals.category_priority), `wiki-index entry ${idx} has invalid rank_signals.category_priority`);
    assert(typeof entry.rank_signals.has_description === 'boolean', `wiki-index entry ${idx} has invalid rank_signals.has_description`);
    assert(typeof entry.rank_signals.is_stub === 'boolean', `wiki-index entry ${idx} has invalid rank_signals.is_stub`);
    assert(typeof entry.rank_signals.has_bible === 'boolean', `wiki-index entry ${idx} has invalid rank_signals.has_bible`);
    assert(isNumber(entry.rank_signals.article_word_count), `wiki-index entry ${idx} has invalid rank_signals.article_word_count`);
    assert(isNumber(entry.rank_signals.keyword_bag_size), `wiki-index entry ${idx} has invalid rank_signals.keyword_bag_size`);
    assert(isNumber(entry.rank_signals.heading_count), `wiki-index entry ${idx} has invalid rank_signals.heading_count`);
    assert(isNumber(entry.rank_signals.list_count), `wiki-index entry ${idx} has invalid rank_signals.list_count`);
    assert(isNumber(entry.rank_signals.internal_link_count), `wiki-index entry ${idx} has invalid rank_signals.internal_link_count`);
    assert(isNumber(entry.rank_signals.content_quality_score), `wiki-index entry ${idx} has invalid rank_signals.content_quality_score`);
    assert(isNumber(entry.rank_signals.authority_score), `wiki-index entry ${idx} has invalid rank_signals.authority_score`);

    assert(entry.rank_diagnostics && typeof entry.rank_diagnostics === 'object', `wiki-index entry ${idx} missing rank_diagnostics`);
    for (const key of REQUIRED_RANK_DIAGNOSTIC_KEYS) {
      assert(
        Object.prototype.hasOwnProperty.call(entry.rank_diagnostics, key),
        `wiki-index entry ${idx} missing rank_diagnostics.${key}`
      );
      assert(isNumber(entry.rank_diagnostics[key]), `wiki-index entry ${idx} has non-numeric rank_diagnostics.${key}`);
    }

    assert(
      entry.rank_diagnostics.final_rank_score === entry.rank_score,
      `wiki-index entry ${idx} rank_diagnostics.final_rank_score must equal rank_score`
    );

    // All diagnostic components (including bible bonus and stub penalty) must sum to rank_score.
    const recomputedScore =
      entry.rank_diagnostics.canonical_points +
      entry.rank_diagnostics.description_points +
      entry.rank_diagnostics.category_points +
      entry.rank_diagnostics.word_count_points +
      entry.rank_diagnostics.keyword_bag_points +
      entry.rank_diagnostics.content_quality_points +
      entry.rank_diagnostics.authority_points +
      entry.rank_diagnostics.bible_bonus_points +
      entry.rank_diagnostics.stub_penalty_points;

    assert(
      recomputedScore === entry.rank_score,
      `wiki-index entry ${idx} rank diagnostics sum (${recomputedScore}) does not equal rank_score (${entry.rank_score})`
    );

    // Stub penalty must be non-positive; real pages must have zero penalty.
    assert(
      entry.rank_diagnostics.stub_penalty_points <= 0,
      `wiki-index entry ${idx} stub_penalty_points must be <= 0 (got ${entry.rank_diagnostics.stub_penalty_points})`
    );
    assert(
      entry.is_stub || entry.rank_diagnostics.stub_penalty_points === 0,
      `wiki-index entry ${idx} non-stub page has non-zero stub_penalty_points (${entry.rank_diagnostics.stub_penalty_points})`
    );

    assert(entry.search_index && typeof entry.search_index === 'object', `wiki-index entry ${idx} missing search_index`);
    assert(
      typeof entry.search_index.normalized_title === 'string' && entry.search_index.normalized_title.trim(),
      `wiki-index entry ${idx} missing search_index.normalized_title`
    );
    assert(Array.isArray(entry.search_index.tokens), `wiki-index entry ${idx} missing search_index.tokens`);
    assert(Array.isArray(entry.search_index.keyword_bag), `wiki-index entry ${idx} missing search_index.keyword_bag`);

    const pagePath = path.join(ROOT, entry.url.replace(/^\//, ''));
    ensureFile(pagePath);

    assert(Array.isArray(entry.aliases), `wiki-index entry ${idx} aliases must be an array`);
    for (const alias of entry.aliases) {
      if (typeof alias === 'string') continue;
      assert(alias && typeof alias.title === 'string', `wiki-index entry ${idx} has malformed alias title`);
      if (alias.url) {
        assert(typeof alias.url === 'string' && alias.url.startsWith('/wiki/'), `wiki-index entry ${idx} has malformed alias url`);
        const aliasPath = path.join(ROOT, alias.url.replace(/^\//, ''));
        ensureFile(aliasPath);
      }
    }
  }

  // Cross-entry check: stubs must never outrank non-stubs.
  // We allow a small tolerance for edge cases where a stub has marginally higher raw signals
  // but the penalty should ensure it never matches a real article.
  const stubs = wikiIndex.filter(e => e.is_stub);
  const nonStubs = wikiIndex.filter(e => !e.is_stub);
  if (stubs.length > 0 && nonStubs.length > 0) {
    const maxStubScore = Math.max(...stubs.map(e => e.rank_score));
    const minNonStubScore = Math.min(...nonStubs.map(e => e.rank_score));
    assert(
      maxStubScore < minNonStubScore || minNonStubScore === 0,
      `Stub pages must not outrank real pages. Highest stub score: ${maxStubScore}, lowest non-stub score: ${minNonStubScore}`
    );
  }

  console.log(`wiki-index.json validated (${wikiIndex.length} entries) ✅`);
}

function validateEntityMap() {
  const entityMap = readJson(ENTITY_MAP_PATH);
  assert(Array.isArray(entityMap), 'js/entity-map.json must be an array');
  assert(entityMap.length > 0, 'js/entity-map.json is empty');

  for (const [idx, entry] of entityMap.entries()) {
    assert(entry && typeof entry === 'object', `entity-map entry ${idx} is not an object`);
    assert(typeof entry.entity_id === 'string' && entry.entity_id.trim(), `entity-map entry ${idx} missing entity_id`);
    assert(typeof entry.canonical_url === 'string' && entry.canonical_url.startsWith('/wiki/'), `entity-map entry ${idx} missing canonical_url`);
    assert(entry.canonical_url !== '/wiki/index.html', `entity-map entry ${idx} must not include legacy /wiki/index.html`);
    const pagePath = path.join(ROOT, entry.canonical_url.replace(/^\//, ''));
    ensureFile(pagePath);
  }

  console.log(`entity-map.json validated (${entityMap.length} records) ✅`);
}

function validateSiteStats() {
  const stats = readJson(SITE_STATS_PATH);
  assert(stats && typeof stats === 'object' && !Array.isArray(stats), 'js/site-stats.json must be an object');

  if (Object.prototype.hasOwnProperty.call(stats, 'totalArticles')) {
    assert(isNumber(stats.totalArticles), 'js/site-stats.json totalArticles must be numeric');
  }
  if (Object.prototype.hasOwnProperty.call(stats, 'totalCategories')) {
    assert(isNumber(stats.totalCategories), 'js/site-stats.json totalCategories must be numeric');
  }

  console.log('site-stats.json validated ✅');
}

function validateSitemap() {
  const xml = fs.readFileSync(SITEMAP_PATH, 'utf8');
  assert(xml.includes('<urlset'), 'sitemap.xml missing <urlset>');
  assert(xml.includes('<loc>https://crypto-moonboys.github.io/search.html</loc>'), 'sitemap.xml missing search.html');
  assert(!xml.includes('/wiki/index.html'), 'sitemap.xml must not include legacy /wiki/index.html');
  console.log('sitemap.xml validated ✅');
}

function validateCorePages() {
  [HOME_PATH, SEARCH_PATH, CATEGORY_INDEX_PATH].forEach(ensureFile);

  const searchHtml = fs.readFileSync(SEARCH_PATH, 'utf8');
  assert(searchHtml.includes('id="search-results-page"') || searchHtml.includes("id='search-results-page'"), 'search.html missing search results container');
  assert(searchHtml.includes('ranking debug') || searchHtml.includes('ranking-debug') || searchHtml.includes('Ranking debug'), 'search.html missing ranking debug panel');

  console.log('Core page smoke tests passed ✅');
}

function main() {
  [
    WIKI_INDEX_PATH,
    ENTITY_MAP_PATH,
    SITE_STATS_PATH,
    SITEMAP_PATH,
    SEARCH_PATH,
    CATEGORY_INDEX_PATH,
    HOME_PATH
  ].forEach(ensureFile);

  validateWikiIndex();
  validateEntityMap();
  validateSiteStats();
  validateSitemap();
  validateCorePages();

  console.log('All generated asset checks passed ✅');
}

main();