#!/usr/bin/env node
/**
 * scripts/generate-sitemap.js
 *
 * Generates sitemap.xml from real files that exist in the repository.
 * Includes root pages, about pages, category pages, and wiki pages.
 *
 * Wiki URLs are sourced from js/wiki-index.json (canonical entries only),
 * so alias/redirect pages are automatically excluded from the sitemap.
 * Falls back to scanning wiki/*.html when the index is unavailable.
 *
 * lastmod is intentionally omitted. A repository checkout does not provide a
 * reliable per-page publication date, and stamping every URL with the build
 * date would publish false freshness signals to search engines.
 *
 * Canonical article hub:
 *   /search.html
 *
 * Legacy page explicitly excluded:
 *   /wiki/index.html
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { APPROVED_ROOT_PAGES } = require('./root-pages-config.js');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'sitemap.xml');
const INDEX_FILE = path.join(ROOT, 'js', 'wiki-index.json');
const BASE_URL = 'https://cryptomoonboys.com';

const EXCLUDED_URLS = new Set([
  '/wiki/index.html'
]);

// These public routes do not belong in the wiki's search index or graph.
const SITEMAP_ONLY_PLAY_ROUTES = [
  '/games/',
  '/games/chain-maze/',
  '/games/forkfield/',
  '/games/bullrun-brick-smash/',
  '/battle-chamber/factions/',
  '/battle-chamber/factions/blockstars.html',
  '/battle-chamber/factions/crypto-stoned-boys.html',
];

function url(loc, changefreq, priority) {
  return `  <url><loc>${loc}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

function htmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(file => file.endsWith('.html'))
    .sort();
}

function normalizeUrlPath(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/\/+/g, '/');
}

function isAllowedWikiUrl(urlPath) {
  const normalized = normalizeUrlPath(urlPath);
  return normalized.startsWith('/wiki/') && !EXCLUDED_URLS.has(normalized);
}

function wikiPageFiles() {
  if (fs.existsSync(INDEX_FILE)) {
    try {
      const entries = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));

      if (Array.isArray(entries)) {
        return [...new Set(
          entries
            .map(entry => normalizeUrlPath(entry.url || ''))
            .filter(isAllowedWikiUrl)
            .map(urlPath => urlPath.replace(/^\/wiki\//, ''))
            .filter(file => file.endsWith('.html'))
        )].sort();
      }
    } catch (err) {
      console.warn(
        'Could not parse wiki-index.json; falling back to scanning wiki/*.html directly.',
        err.message
      );
    }
  }

  return htmlFiles(path.join(ROOT, 'wiki'))
    .filter(file => file !== 'index.html')
    .sort();
}

// Shared with the visual graph so public hubs follow the same discovery policy.
function publicSitePages() {
  const pages = new Map();
  function addEntry(route, changefreq, priority) {
    if (!pages.has(route)) pages.set(route, { route, changefreq, priority });
  }

  /* 1. Homepage */
  addEntry('/', 'weekly', '1.0');

  /* 2. Approved root/tool pages */
  const SITEMAP_ROOT_PAGE_DEFAULTS = {
    '/about.html': { changefreq: 'weekly', priority: '0.9' },
    '/hubs.html': { changefreq: 'weekly', priority: '0.8' },
    '/sam.html': { changefreq: 'weekly', priority: '0.8' },
  };
  const SITEMAP_ONLY_ROOT_PAGES = [
    { path: '/moonboy-builder.html', changefreq: 'monthly', priority: '0.6' },
    { path: '/search.html', changefreq: 'weekly', priority: '1.0' },
    { path: '/graph.html', changefreq: 'weekly', priority: '0.7' },
    { path: '/block-topia.html', changefreq: 'daily', priority: '0.9' },
  ];

  for (const page of APPROVED_ROOT_PAGES) {
    const urlPath = normalizeUrlPath(page.path);
    if (urlPath.startsWith('/categories/')) continue;
    const defaults = SITEMAP_ROOT_PAGE_DEFAULTS[urlPath] || {};
    if (fs.existsSync(path.join(ROOT, urlPath.slice(1)))) {
      addEntry(
        urlPath,
        page.changefreq || defaults.changefreq || 'monthly',
        page.priority || defaults.priority || '0.6',
      );
    }
  }

  for (const page of SITEMAP_ONLY_ROOT_PAGES) {
    const urlPath = normalizeUrlPath(page.path);
    if (fs.existsSync(path.join(ROOT, urlPath.slice(1)))) {
      addEntry(urlPath, page.changefreq, page.priority);
    }
  }

  /* 3. /about/*.html */
  // about/index.html is a noindex redirect to /about.html - excluded from sitemap
  for (const file of htmlFiles(path.join(ROOT, 'about')).filter(f => f !== 'index.html')) {
    addEntry(`/about/${file}`, 'monthly', '0.6');
  }

  /* 4. /categories/*.html */
  for (const file of htmlFiles(path.join(ROOT, 'categories'))) {
    const priority = file === 'index.html' ? '1.0' : '0.9';
    addEntry(`/categories/${file}`, 'weekly', priority);
  }

  return [...pages.values()];
}

function sitemapOnlyPlayRoutes() {
  return SITEMAP_ONLY_PLAY_ROUTES.filter(route => {
    const file = route.endsWith('/') ? route + 'index.html' : route;
    return fs.existsSync(path.join(ROOT, file.slice(1)));
  });
}

function writeSitemap() {
  const entries = publicSitePages().map(({ route, changefreq, priority }) =>
    url(BASE_URL + route, changefreq, priority));
  for (const route of sitemapOnlyPlayRoutes()) {
    entries.push(url(BASE_URL + route, 'monthly', '0.6'));
  }
  for (const file of wikiPageFiles()) {
    entries.push(url(`${BASE_URL}/wiki/${file}`, 'weekly', '0.7'));
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
  ].join('\n') + '\n';

  fs.writeFileSync(OUTPUT, xml, 'utf8');
  console.log(`sitemap.xml written - ${entries.length} URLs (lastmod omitted: no reliable per-page dates)`);
}

if (require.main === module) writeSitemap();
module.exports = { publicSitePages, sitemapOnlyPlayRoutes, BASE_URL };
