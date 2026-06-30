#!/usr/bin/env node
/**
 * scripts/generate-site-stats.js
 *
 * Generates js/site-stats.json from current repo files and generated public
 * discovery assets. The public contract distinguishes all wiki pages from
 * article pages that exclude NFT template/collection pages.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX_JSON = path.join(ROOT, 'js', 'wiki-index.json');
const ENTITY_MAP = path.join(ROOT, 'js', 'entity-map.json');
const GRAPH_DATA = path.join(ROOT, 'js', 'graph-data.json');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const WIKI_DIR = path.join(ROOT, 'wiki');
const CATS_DIR = path.join(ROOT, 'categories');
const OUTPUT = path.join(ROOT, 'js', 'site-stats.json');
const LEGACY_OUTPUT = path.join(ROOT, 'index_stats.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeWikiUrl(url) {
  return String(url || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/\/+/g, '/');
}

function isWikiUrl(url) {
  const normalized = normalizeWikiUrl(url);
  return normalized.startsWith('/wiki/') && normalized !== '/wiki/index.html';
}

function isNftTemplateHtml(html) {
  if (isNftCollectionHtml(html)) return false;
  return /data-page-type=["']nft_template["']/i.test(html) ||
         /class=["'][^"']*\bnft-template-article\b/i.test(html) ||
         /<template\b[^>]*class=["'][^"']*\bnft-battle-media-template\b/i.test(html);
}

function isNftCollectionHtml(html) {
  return /data-page-type=["']nft_collection["']/i.test(html) ||
         /class=["'][^"']*\bnft-collection\b/i.test(html);
}

function wikiHtmlFiles() {
  if (!fs.existsSync(WIKI_DIR)) return [];
  return fs.readdirSync(WIKI_DIR)
    .filter(file => file.endsWith('.html') && file !== 'index.html')
    .sort();
}

function countWikiFiles() {
  let totalWikiPages = 0;
  let nftTemplatePages = 0;
  let nftCollectionPages = 0;

  for (const file of wikiHtmlFiles()) {
    totalWikiPages += 1;
    const html = fs.readFileSync(path.join(WIKI_DIR, file), 'utf8');
    if (isNftCollectionHtml(html)) nftCollectionPages += 1;
    else if (isNftTemplateHtml(html)) nftTemplatePages += 1;
  }

  return {
    totalWikiPages,
    nftTemplatePages,
    nftCollectionPages,
    totalArticles: totalWikiPages - nftTemplatePages - nftCollectionPages,
  };
}

function readWikiIndexEntries() {
  if (!fs.existsSync(INDEX_JSON)) {
    console.error('Warning: js/wiki-index.json not found; indexed page counts will be 0');
    return [];
  }

  try {
    const entries = readJson(INDEX_JSON);
    return Array.isArray(entries) ? entries : [];
  } catch (err) {
    console.error('Warning: could not parse js/wiki-index.json:', err.message);
    return [];
  }
}

function htmlForWikiIndexEntry(entry) {
  const url = normalizeWikiUrl(entry && entry.url);
  if (!isWikiUrl(url)) return '';
  const relative = url.replace(/^\/+/, '');
  const filePath = path.join(ROOT, relative);
  if (!filePath.startsWith(WIKI_DIR + path.sep) || !fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8');
}

function countWikiIndexPages(entries) {
  return entries.filter(entry => entry && typeof entry === 'object' && isWikiUrl(entry.url)).length;
}

function countIndexedArticles(entries) {
  return entries.filter(entry => {
    if (!entry || typeof entry !== 'object' || !isWikiUrl(entry.url)) return false;
    const html = htmlForWikiIndexEntry(entry);
    if (!html) return false;
    return !isNftTemplateHtml(html) && !isNftCollectionHtml(html);
  }).length;
}

function countCanonicalEntities() {
  if (!fs.existsSync(ENTITY_MAP)) {
    console.error('Warning: js/entity-map.json not found; entity counts will be 0');
    return 0;
  }

  try {
    const entries = readJson(ENTITY_MAP);
    if (!Array.isArray(entries)) return 0;
    return entries.filter(entry => entry && typeof entry === 'object' && isWikiUrl(entry.canonical_url)).length;
  } catch (err) {
    console.error('Warning: could not parse js/entity-map.json:', err.message);
    return 0;
  }
}

function countGraphNodes() {
  if (!fs.existsSync(GRAPH_DATA)) return 0;
  try {
    const graph = readJson(GRAPH_DATA);
    return Array.isArray(graph.nodes)
      ? graph.nodes.filter(node => isWikiUrl(node.url || node.id)).length
      : 0;
  } catch (err) {
    console.error('Warning: could not parse js/graph-data.json:', err.message);
    return 0;
  }
}

function countSitemapWikiUrls() {
  if (!fs.existsSync(SITEMAP)) return 0;
  const xml = fs.readFileSync(SITEMAP, 'utf8');
  const matches = xml.match(/https:\/\/cryptomoonboys\.com\/wiki\/[^<]+\.html/g) || [];
  return matches.filter(isWikiUrl).length;
}

function countCategories() {
  if (!fs.existsSync(CATS_DIR)) {
    console.error('Warning: categories/ directory not found; category counts will be 0');
    return 0;
  }

  return fs.readdirSync(CATS_DIR)
    .filter(file => file.endsWith('.html') && file !== 'index.html')
    .length;
}

function preserveTimestampIfStable(stats) {
  let lastUpdated = new Date().toISOString();
  if (!fs.existsSync(OUTPUT)) return lastUpdated;

  try {
    const existing = readJson(OUTPUT);
    const stableKeys = [
      'total_wiki_pages',
      'total_articles',
      'nft_template_pages',
      'nft_collection_pages',
      'indexed_pages',
      'search_index_pages',
      'entity_count',
      'graph_nodes',
      'sitemap_wiki_urls',
      'category_count',
    ];

    if (
      stableKeys.every(key => existing[key] === stats[key]) &&
      typeof existing.last_updated === 'string' &&
      existing.last_updated.trim()
    ) {
      lastUpdated = existing.last_updated;
    }
  } catch (err) {
    // Ignore parse errors and use a fresh timestamp.
  }

  return lastUpdated;
}

const wikiFileCounts = countWikiFiles();
const wikiIndexEntries = readWikiIndexEntries();
const indexedPages = countWikiIndexPages(wikiIndexEntries);
const indexedArticles = countIndexedArticles(wikiIndexEntries);
const entityCount = countCanonicalEntities();
const categoryCount = countCategories();
const graphNodes = countGraphNodes();
const sitemapWikiUrls = countSitemapWikiUrls();

const stats = {
  total_wiki_pages: wikiFileCounts.totalWikiPages,
  total_articles: indexedArticles,
  nft_template_pages: wikiFileCounts.nftTemplatePages,
  nft_collection_pages: wikiFileCounts.nftCollectionPages,
  indexed_pages: indexedPages,
  search_index_pages: indexedPages,
  graph_nodes: graphNodes,
  sitemap_wiki_urls: sitemapWikiUrls,
  total_categories: categoryCount,

  // Backward-compatible fields. These represent all public wiki pages because
  // existing UI now labels the value as Wiki Pages rather than Articles.
  article_count: wikiFileCounts.totalWikiPages,
  totalArticles: wikiFileCounts.totalWikiPages,
  entity_count: entityCount,
  totalEntities: entityCount,
  category_count: categoryCount,
  totalCategories: categoryCount,
  total_entities: entityCount,
  total_categories: categoryCount,

  canonical_hub: '/search.html',
  excluded_legacy_paths: ['/wiki/index.html'],
};

stats.last_updated = preserveTimestampIfStable(stats);

if (entityCount > 0 && indexedPages > 0 && entityCount !== indexedPages) {
  console.warn(
    `Note: entity_count (${entityCount}) differs from indexed_pages (${indexedPages}); audit scripts will fail if this is unintentional.`
  );
}

fs.writeFileSync(OUTPUT, JSON.stringify(stats, null, 2) + '\n', 'utf8');
console.log(
  `js/site-stats.json written - ${stats.total_wiki_pages} wiki pages, ${stats.total_articles} articles excluding NFT templates, ${stats.nft_template_pages} NFT templates, ${stats.entity_count} entities, ${stats.category_count} categories (${stats.last_updated})`
);

const legacyStats = {
  total_articles: stats.total_articles,
  total_wiki_pages: stats.total_wiki_pages,
  nft_template_pages: stats.nft_template_pages,
  total_entities: stats.total_entities,
  total_categories: stats.total_categories,
  last_updated: stats.last_updated.slice(0, 10),
};

fs.writeFileSync(LEGACY_OUTPUT, JSON.stringify(legacyStats) + '\n', 'utf8');
console.log(
  `index_stats.json written - ${stats.total_wiki_pages} wiki pages, ${stats.total_articles} articles excluding NFT templates, ${stats.total_entities} entities, ${stats.total_categories} categories`
);
