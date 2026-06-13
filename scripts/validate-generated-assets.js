#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { loadNonApprovedUrls } = require('./wiki-publish-gate.js');

const ROOT = path.resolve(__dirname, '..');
const WIKI_INDEX_PATH = path.join(ROOT, 'js', 'wiki-index.json');
const ENTITY_MAP_PATH = path.join(ROOT, 'js', 'entity-map.json');
const SITE_STATS_PATH = path.join(ROOT, 'js', 'site-stats.json');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const SEARCH_PATH = path.join(ROOT, 'search.html');
const CATEGORY_INDEX_PATH = path.join(ROOT, 'categories', 'index.html');
const HOME_PATH = path.join(ROOT, 'index.html');
const ENTITY_GRAPH_PATH = path.join(ROOT, 'js', 'entity-graph.json');

const AUDIT_PATH = path.join(ROOT, 'js', 'wiki-publish-audit.json');

const PHASE5_6_PATHS = {
  'js/authority-trust.json':      path.join(ROOT, 'js', 'authority-trust.json'),
  'js/timeline-intelligence.json': path.join(ROOT, 'js', 'timeline-intelligence.json'),
  'js/predictive-growth.json':    path.join(ROOT, 'js', 'predictive-growth.json'),
  'js/governance-signals.json':   path.join(ROOT, 'js', 'governance-signals.json'),
  'js/publishing-readiness.json': path.join(ROOT, 'js', 'publishing-readiness.json'),
};

const REQUIRED_RANK_SIGNAL_KEYS = [
  'is_canonical',
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
  'final_rank_score'
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

function isNumber(value) {
  return typeof value === 'number' && !Number.isNaN(value);
}

function validateWikiIndex() {
  const wikiIndex = readJson(WIKI_INDEX_PATH);
  assert(Array.isArray(wikiIndex), 'js/wiki-index.json must be an array');
  assert(wikiIndex.length > 0, 'js/wiki-index.json is empty');

  for (const [idx, entry] of wikiIndex.entries()) {
    assert(entry && typeof entry === 'object', `wiki-index entry ${idx} is not an object`);

    assert(typeof entry.title === 'string' && entry.title.trim(), `wiki-index entry ${idx} missing title`);
    assert(typeof entry.url === 'string' && entry.url.startsWith('/wiki/'), `wiki-index entry ${idx} has invalid url`);
    assert(entry.url !== '/wiki/index.html', `wiki-index entry ${idx} must not include legacy /wiki/index.html`);
    assert(!entry.url.includes('../'), `wiki-index entry ${idx} contains fragile relative url`);
    assert(isNumber(entry.rank_score), `wiki-index entry ${idx} has invalid rank_score`);

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

    const recomputedScore =
      entry.rank_diagnostics.canonical_points +
      entry.rank_diagnostics.description_points +
      entry.rank_diagnostics.category_points +
      entry.rank_diagnostics.word_count_points +
      entry.rank_diagnostics.keyword_bag_points +
      entry.rank_diagnostics.content_quality_points +
      entry.rank_diagnostics.authority_points;

    assert(
      recomputedScore === entry.rank_score,
      `wiki-index entry ${idx} rank diagnostics sum (${recomputedScore}) does not equal rank_score (${entry.rank_score})`
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
  assert(xml.includes('<loc>https://cryptomoonboys.com/search.html</loc>'), 'sitemap.xml missing search.html');
  assert(!xml.includes('/wiki/index.html'), 'sitemap.xml must not include legacy /wiki/index.html');
  console.log('sitemap.xml validated ✅');
}

function validateCorePages() {
  [HOME_PATH, SEARCH_PATH, CATEGORY_INDEX_PATH].forEach(ensureFile);

  const searchHtml = fs.readFileSync(SEARCH_PATH, 'utf8');
  assert(searchHtml.includes('id="search-results-page"') || searchHtml.includes("id='search-results-page'"), 'search.html missing search results container');
  assert(searchHtml.includes('ranking debug') || searchHtml.includes('ranking-debug') || searchHtml.includes('Ranking debug'), 'search.html missing ranking debug panel');

  console.log('Core page validation checks passed ✅');
}

const PHASE5_6_REQUIRED_KEYS = ['generated_at', 'phase', 'schema_version', 'summary', 'entries'];

function validatePublishAudit() {
  assert(fs.existsSync(AUDIT_PATH), 'js/wiki-publish-audit.json is missing. Run: node scripts/wiki-publish-gate.js');

  const audit = readJson(AUDIT_PATH);
  assert(audit && typeof audit === 'object' && !Array.isArray(audit), 'js/wiki-publish-audit.json must be an object');
  assert(Array.isArray(audit.blocked), 'js/wiki-publish-audit.json must have a blocked array');
  assert(Array.isArray(audit.approved), 'js/wiki-publish-audit.json must have an approved array');
  assert(audit.summary && typeof audit.summary === 'object', 'js/wiki-publish-audit.json must have a summary object');

  // Build the set of all non-approved URLs (BLOCKED_* + NEEDS_BRAND_REVIEW).
  // None of these may appear anywhere in public discovery assets.
  const nonApprovedUrls = loadNonApprovedUrls();

  if (nonApprovedUrls.size > 0) {
    // ── wiki-index.json ──────────────────────────────────────────────────────
    const wikiIndex = readJson(WIKI_INDEX_PATH);
    for (const entry of wikiIndex) {
      assert(
        !nonApprovedUrls.has(entry.url),
        `Non-approved page leaked into wiki-index.json as entry.url: ${entry.url}`
      );
      for (const alias of (entry.aliases || [])) {
        if (alias && typeof alias === 'object' && alias.url) {
          assert(
            !nonApprovedUrls.has(alias.url),
            `Non-approved URL leaked into wiki-index.json as alias.url for "${entry.url}": ${alias.url}`
          );
        }
      }
    }

    // ── entity-map.json ──────────────────────────────────────────────────────
    if (fs.existsSync(ENTITY_MAP_PATH)) {
      const entityMap = readJson(ENTITY_MAP_PATH);
      for (const record of entityMap) {
        assert(
          !nonApprovedUrls.has(record.canonical_url),
          `Non-approved URL leaked into entity-map.json as canonical_url: ${record.canonical_url}`
        );
        for (const srcUrl of (record.source_urls || [])) {
          assert(
            !nonApprovedUrls.has(srcUrl),
            `Non-approved URL leaked into entity-map.json source_urls for "${record.canonical_url}": ${srcUrl}`
          );
        }
      }
    }

    // ── entity-graph.json ────────────────────────────────────────────────────
    if (fs.existsSync(ENTITY_GRAPH_PATH)) {
      const entityGraph = readJson(ENTITY_GRAPH_PATH);
      for (const [nodeUrl, nodeData] of Object.entries(entityGraph)) {
        assert(
          !nonApprovedUrls.has(nodeUrl),
          `Non-approved URL leaked into entity-graph.json as a node key: ${nodeUrl}`
        );
        for (const rel of (nodeData.related_pages || [])) {
          assert(
            !nonApprovedUrls.has(rel.target_url),
            `Non-approved URL leaked into entity-graph.json as related_pages target_url for "${nodeUrl}": ${rel.target_url}`
          );
        }
      }
    }
  }

  console.log(`js/wiki-publish-audit.json validated (${audit.approved.length} approved, ${audit.blocked.length} blocked, ${(audit.review || []).length} review) ✅`);
}

function validatePhase5And6() {
  for (const [relPath, absPath] of Object.entries(PHASE5_6_PATHS)) {
    ensureFile(absPath);

    let data;
    try {
      data = readJson(absPath);
    } catch (e) {
      throw new Error(`${relPath} is not valid JSON: ${e.message}`);
    }

    assert(data && typeof data === 'object' && !Array.isArray(data), `${relPath} top-level must be an object`);

    for (const key of PHASE5_6_REQUIRED_KEYS) {
      assert(
        Object.prototype.hasOwnProperty.call(data, key),
        `${relPath} missing required key: ${key}`
      );
    }

    assert(
      Array.isArray(data.entries) && data.entries.length > 0,
      `${relPath} entries must be a non-empty array`
    );

    assert(
      data.summary && typeof data.summary === 'object' && !Array.isArray(data.summary),
      `${relPath} summary must be an object`
    );

    console.log(`${relPath} validated (${data.entries.length} entries) ✅`);
  }
}

function main() {
  [
    WIKI_INDEX_PATH,
    ENTITY_MAP_PATH,
    SITE_STATS_PATH,
    SITEMAP_PATH,
    SEARCH_PATH,
    CATEGORY_INDEX_PATH,
    HOME_PATH,
    ...Object.values(PHASE5_6_PATHS)
  ].forEach(ensureFile);

  validateWikiIndex();
  validateEntityMap();
  validateSiteStats();
  validateSitemap();
  validateCorePages();
  validatePublishAudit();
  validatePhase5And6();

  console.log('All generated asset checks passed ✅');
}

main();