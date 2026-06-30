#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIKI_DIR = path.join(ROOT, 'wiki');
const failures = [];

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function readJson(relPath) {
  return JSON.parse(read(relPath));
}

function fail(message) {
  failures.push(message);
}

function check(condition, message) {
  if (!condition) fail(message);
}

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeWikiUrl(url) {
  return String(url || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/\/+/g, '/');
}

function slugFromFile(file) {
  return file.replace(/\.html$/i, '');
}

function hasClassTag(html, tag, className) {
  const re = new RegExp(`<${tag}\\b[^>]*class=["'][^"']*\\b${escapeRe(className)}\\b[^"']*["']`, 'i');
  return re.test(html);
}

function hasScript(html, src) {
  const re = new RegExp(`<script\\b[^>]*\\bsrc=["']${escapeRe(src)}["'][^>]*>\\s*<\\/script>`, 'i');
  return re.test(html);
}

function isNftTemplatePage(file, html) {
  if (isNftCollectionPage(html)) return false;
  return /data-page-type=["']nft_template["']/i.test(html) ||
    /class=["'][^"']*\bnft-template-article\b/i.test(html) ||
    /<template\b[^>]*class=["'][^"']*\bnft-battle-media-template\b/i.test(html) ||
    /^gkniftyheads-.+-\d{5,}\.html$/i.test(file);
}

function isNftCollectionPage(html) {
  return /data-page-type=["']nft_collection["']/i.test(html) ||
    /class=["'][^"']*\bnft-collection\b/i.test(html);
}

function extractTemplateBlock(html) {
  return html.match(/<template\b[^>]*class=["'][^"']*\bnft-battle-media-template\b[^"']*["'][^>]*data-battle-media=["']nft["'][^>]*>[\s\S]*?<\/template>/i)?.[0] ||
    html.match(/<template\b[^>]*data-battle-media=["']nft["'][^>]*class=["'][^"']*\bnft-battle-media-template\b[^"']*["'][^>]*>[\s\S]*?<\/template>/i)?.[0] ||
    '';
}

function extractCategorySlugs(indexEntry) {
  const categories = new Set();
  const push = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized) categories.add(normalized);
  };

  push(indexEntry.category);
  if (indexEntry.rank_signals) push(indexEntry.rank_signals.category);
  return [...categories];
}

function countSitemapWikiUrls(xml) {
  return (xml.match(/https:\/\/cryptomoonboys\.com\/wiki\/[^<]+\.html/g) || [])
    .filter((url) => normalizeWikiUrl(url) !== '/wiki/index.html')
    .length;
}

function auditNftPage(file, html) {
  const slug = slugFromFile(file);
  const rel = `wiki/${file}`;
  const templateBlock = extractTemplateBlock(html);
  const outsideTemplate = templateBlock ? html.replace(templateBlock, '') : html;

  check(/<body\b[^>]*class=["'][^"']*\bpage-wiki\b/i.test(html), `${rel}: body must include page-wiki`);
  check(/<body\b[^>]*class=["'][^"']*\bpage-has-right-panel\b/i.test(html), `${rel}: body must include page-has-right-panel`);
  for (const src of [
    '/js/core/daily-loop-state.js',
    '/js/site-shell.js',
    '/js/components/connection-status-panel.js',
    '/js/components/global-player-header.js',
    '/js/components/live-activity-summary.js',
  ]) {
    check(hasScript(html, src), `${rel}: missing ${src}`);
  }

  check(new RegExp(`<div\\b[^>]*class=["'][^"']*\\bwiki-comments\\b[^"']*["'][^>]*data-page-id=["']${escapeRe(slug)}["']`, 'i').test(html), `${rel}: wiki-comments data-page-id must match slug`);
  check(Boolean(templateBlock), `${rel}: missing template.nft-battle-media-template[data-battle-media="nft"]`);
  check(new RegExp(`<template\\b[^>]*class=["'][^"']*\\bnft-battle-media-template\\b[^"']*["']`, 'i').test(templateBlock), `${rel}: NFT template missing nft-battle-media-template class`);
  check(/<template\b[^>]*data-battle-media=["']nft["']/i.test(templateBlock), `${rel}: NFT template missing data-battle-media="nft"`);
  check(new RegExp(`<template\\b[^>]*data-page-id=["']${escapeRe(slug)}["']`, 'i').test(templateBlock), `${rel}: NFT template data-page-id must match slug`);
  check(/<figure\b[^>]*class=["'][^"']*\bbattle-page-media\b[^"']*\bnft-template-media-card\b[^"']*["']/i.test(templateBlock), `${rel}: NFT template missing figure.battle-page-media.nft-template-media-card`);
  check(/<img\b[^>]*class=["'][^"']*\bwiki-hero-image\b[^"']*\bnft-image\b[^"']*["']/i.test(templateBlock), `${rel}: NFT image must be inside Battle Heat template`);
  check(!/<img\b[^>]*class=["'][^"']*\bnft-image\b/i.test(outsideTemplate), `${rel}: loose duplicate NFT image outside Battle Heat template`);
}

const wikiFiles = fs.readdirSync(WIKI_DIR)
  .filter((file) => file.endsWith('.html') && file !== 'index.html')
  .sort();

const pages = wikiFiles.map((file) => ({
  file,
  slug: slugFromFile(file),
  url: `/wiki/${file}`,
  html: fs.readFileSync(path.join(WIKI_DIR, file), 'utf8'),
}));
const nftPages = pages.filter(({ file, html }) => isNftTemplatePage(file, html));
const nftCollectionPages = pages.filter(({ html }) => isNftCollectionPage(html));

check(nftPages.length >= 140, `Expected at least 140 NFT template pages, found ${nftPages.length}`);
for (const page of nftPages) auditNftPage(page.file, page.html);

const wikiIndex = readJson('js/wiki-index.json');
const entityMap = readJson('js/entity-map.json');
const timelineData = readJson('js/timeline-data.json');
const entityGraph = readJson('js/entity-graph.json');
const graphData = readJson('js/graph-data.json');
const samMemory = readJson('sam-memory.json');
const siteStats = readJson('js/site-stats.json');
const sitemap = read('sitemap.xml');

const wikiIndexByUrl = new Map(wikiIndex.map((entry) => [normalizeWikiUrl(entry.url), entry]));
const entityUrls = new Set(entityMap.map((entry) => normalizeWikiUrl(entry.canonical_url)));
const timelineUrls = new Set((timelineData.events || []).map((entry) => normalizeWikiUrl(entry.url || entry.canonical_url)));
const entityGraphUrls = new Set(Object.keys(entityGraph).map(normalizeWikiUrl));
const graphUrls = new Set((graphData.nodes || []).map((node) => normalizeWikiUrl(node.url || node.id)));
const samUrls = new Set(Object.values(samMemory.entities || {}).map((entry) => normalizeWikiUrl(entry.canonical_url)));

for (const page of nftPages) {
  const entry = wikiIndexByUrl.get(page.url);
  check(Boolean(entry), `${page.url}: missing from js/wiki-index.json search source`);
  check(entityUrls.has(page.url), `${page.url}: missing from js/entity-map.json`);
  check(sitemap.includes(`https://cryptomoonboys.com${page.url}`), `${page.url}: missing from sitemap.xml`);
  check(timelineUrls.has(page.url), `${page.url}: missing from js/timeline-data.json`);
  check(entityGraphUrls.has(page.url), `${page.url}: missing from js/entity-graph.json`);
  check(graphUrls.has(page.url), `${page.url}: missing from js/graph-data.json`);
  check(samUrls.has(page.url), `${page.url}: missing from sam-memory.json`);

  if (entry) {
    for (const categorySlug of extractCategorySlugs(entry)) {
      const categoryPath = path.join(ROOT, 'categories', `${categorySlug}.html`);
      check(fs.existsSync(categoryPath), `${page.url}: category surface missing categories/${categorySlug}.html`);
      if (fs.existsSync(categoryPath)) {
        check(fs.readFileSync(categoryPath, 'utf8').includes(page.url), `${page.url}: missing from categories/${categorySlug}.html`);
      }
    }
  }
}

const wikiIndexPages = wikiIndex.filter((entry) => normalizeWikiUrl(entry.url).startsWith('/wiki/') && normalizeWikiUrl(entry.url) !== '/wiki/index.html').length;
const indexedArticlePages = wikiIndex.filter((entry) => {
  const url = normalizeWikiUrl(entry.url);
  if (!url.startsWith('/wiki/') || url === '/wiki/index.html') return false;
  const file = url.replace(/^\/wiki\//, '');
  const page = pages.find((candidate) => candidate.file === file);
  return page && !isNftTemplatePage(page.file, page.html) && !isNftCollectionPage(page.html);
}).length;
const graphNodes = (graphData.nodes || []).filter((node) => normalizeWikiUrl(node.url || node.id).startsWith('/wiki/')).length;
const sitemapWikiUrls = countSitemapWikiUrls(sitemap);
const categoryCount = fs.readdirSync(path.join(ROOT, 'categories')).filter((file) => file.endsWith('.html') && file !== 'index.html').length;
const nonArticleRegressionUrls = [
  '/wiki/alfie-blaze.html',
  '/wiki/bitcoin-nfts.html',
  '/wiki/bitcoin-tokens.html',
  '/wiki/bitcoin-graffpunks.html',
  '/wiki/games-graffpunks.html',
];

assert.equal(siteStats.total_wiki_pages, pages.length, 'site-stats total_wiki_pages must match real wiki files');
assert.equal(siteStats.nft_template_pages, nftPages.length, 'site-stats nft_template_pages must match real NFT pages');
assert.equal(siteStats.nft_collection_pages, nftCollectionPages.length, 'site-stats nft_collection_pages must match real NFT collection pages');
assert.equal(siteStats.total_articles, indexedArticlePages, 'site-stats total_articles must match indexed non-NFT/non-collection articles');
assert.equal(siteStats.indexed_pages, wikiIndexPages, 'site-stats indexed_pages must match wiki-index');
assert.equal(siteStats.search_index_pages, wikiIndexPages, 'site-stats search_index_pages must match search source');
assert.equal(siteStats.entity_count, entityMap.length, 'site-stats entity_count must match entity-map');
assert.equal(siteStats.graph_nodes, graphNodes, 'site-stats graph_nodes must match graph-data nodes');
assert.equal(siteStats.sitemap_wiki_urls, sitemapWikiUrls, 'site-stats sitemap_wiki_urls must match sitemap');
assert.equal(siteStats.total_categories, categoryCount, 'site-stats total_categories must match categories directory');
for (const url of nonArticleRegressionUrls) {
  check(!wikiIndexByUrl.has(url), `${url}: redirect/noindex/stub page must not be indexed as an article`);
}

const indexHtml = read('index.html');
const dashboardJs = read('js/dashboard.js');
const samJs = read('js/sam-dashboard.js');
check(indexHtml.includes('<div class="stat-label">Wiki Pages</div>'), 'homepage inclusive count label must be Wiki Pages');
check(!indexHtml.includes('<div class="stat-label">Articles</div>'), 'homepage must not label inclusive page count as Articles');
check(dashboardJs.includes('Wiki Pages'), 'dashboard must label inclusive count as Wiki Pages');
check(dashboardJs.includes('Articles excluding NFT templates'), 'dashboard must expose article count meaning');
check(dashboardJs.includes('NFT Template Pages'), 'dashboard must expose NFT template count');
check(samJs.includes('Articles Excl NFT Templates'), 'SAM must expose article count meaning');
check(samJs.includes('NFT Templates'), 'SAM must expose NFT template count');
check(samJs.includes('Last data build:'), 'SAM timestamp must be labelled as data build, not live sync');

const csp = read('js/components/connection-status-panel.js');
check(csp.includes("el.innerHTML = '<div class=\"csp-loading\">Checking status…</div>';"), 'right rail may show Checking status only as a loading placeholder');
check(csp.includes('var html = await buildSectionHTML(panelSectionKind(el), el);') && csp.includes('el.innerHTML = html;'), 'right rail must replace Checking status after async state resolves');
check(csp.includes("wtf.source_state === 'preview'") && csp.includes("badgeLabel = 'PREVIEW'"), 'preview daily-loop source must render PREVIEW, not LIVE');
check(csp.includes("statusState === 'query_failed'") && csp.includes("status: 'error'"), 'query_failed daily-loop source must render unavailable/error, not LIVE');
check(csp.includes("statusState === 'query_failed' || statusState === 'migration_pending' || statusState === 'unavailable'"), 'unavailable daily-loop states must use non-live path');
check(csp.includes('LIVE SYNC requires confirmed auth'), 'LIVE SYNC badge must require confirmed signed auth');

if (failures.length) {
  console.error(`NFT page/feed audit failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`NFT page/feed audit passed: ${nftPages.length} NFT template pages, ${wikiIndexPages} indexed wiki pages, ${graphNodes} graph nodes, ${sitemapWikiUrls} sitemap wiki URLs.`);
