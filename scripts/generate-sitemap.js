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
 * Canonical article hub:
 *   /search.html
 *
 * Legacy page explicitly excluded:
 *   /wiki/index.html
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'sitemap.xml');
const INDEX_FILE = path.join(ROOT, 'js', 'wiki-index.json');
const BASE_URL = 'https://crypto-moonboys.github.io';
const TODAY = new Date().toISOString().slice(0, 10);

const EXCLUDED_URLS = new Set([
  '/wiki/index.html'
]);

function url(loc, lastmod, changefreq, priority) {
  return `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
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

const entries = [];
const seenLocs = new Set();

function addEntry(loc, changefreq, priority, lastmod = TODAY) {
  if (seenLocs.has(loc)) return;
  seenLocs.add(loc);
  entries.push(url(loc, lastmod, changefreq, priority));
}

/* ── 1. Homepage ─────────────────────────────────────────────────────────── */
addEntry(`${BASE_URL}/`, 'weekly', '1.0');

/* ── 2. Root pages ──────────────────────────────────────────────────────── */
const ROOT_PAGES = [
  { file: 'about.html', changefreq: 'weekly', priority: '0.9' },
  { file: 'search.html', changefreq: 'weekly', priority: '1.0' },
  { file: 'articles.html', changefreq: 'weekly', priority: '0.9' },
  { file: 'agent.html', changefreq: 'weekly', priority: '0.9' },
  { file: 'block-topia.html', changefreq: 'daily', priority: '0.9' },
];

for (const page of ROOT_PAGES) {
  if (fs.existsSync(path.join(ROOT, page.file))) {
    addEntry(`${BASE_URL}/${page.file}`, page.changefreq, page.priority);
  }
}

/* ── 3. /about/*.html ───────────────────────────────────────────────────── */
for (const file of htmlFiles(path.join(ROOT, 'about'))) {
  addEntry(`${BASE_URL}/about/${file}`, 'monthly', '0.6');
}

/* ── 4. /categories/*.html ──────────────────────────────────────────────── */
for (const file of htmlFiles(path.join(ROOT, 'categories'))) {
  const priority = file === 'index.html' ? '1.0' : '0.9';
  addEntry(`${BASE_URL}/categories/${file}`, 'weekly', priority);
}

/* ── 5. /wiki/*.html (canonical only, no legacy wiki index) ────────────── */
for (const file of wikiPageFiles()) {
  addEntry(`${BASE_URL}/wiki/${file}`, 'weekly', '0.7');
}

/* ── Write output ───────────────────────────────────────────────────────── */
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...entries,
  '</urlset>',
].join('\n') + '\n';

fs.writeFileSync(OUTPUT, xml, 'utf8');
console.log(`sitemap.xml written — ${entries.length} URLs (${TODAY})`);