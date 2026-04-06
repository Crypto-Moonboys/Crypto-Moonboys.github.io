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
 * Run after adding new pages:
 *   node scripts/generate-sitemap.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '..');
const OUTPUT     = path.join(ROOT, 'sitemap.xml');
const INDEX_FILE = path.join(ROOT, 'js', 'wiki-index.json');
const BASE_URL   = 'https://crypto-moonboys.github.io';
const TODAY      = new Date().toISOString().slice(0, 10);

/** Build a <url> entry */
function url(loc, lastmod, changefreq, priority) {
  return `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

/** Collect all .html files in a directory (non-recursive) */
function htmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.html'))
    .sort();
}

/**
 * Return wiki page filenames for the sitemap.
 * Loads canonical URLs from wiki-index.json when available; falls back to
 * scanning wiki/*.html so the script stays self-contained.
 */
function wikiPageFiles() {
  if (fs.existsSync(INDEX_FILE)) {
    try {
      const entries = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
      // Extract just the filename portion from each canonical URL
      return entries
        .map(e => (e.url || '').replace(/^\/wiki\//, ''))
        .filter(f => f.endsWith('.html'))
        .sort();
    } catch (e) {
      console.warn('Could not parse wiki-index.json for sitemap; falling back to file scan.', e.message);
    }
  }
  return htmlFiles(path.join(ROOT, 'wiki'));
}

const entries = [];

/* ── 1. Homepage ─────────────────────────────────────────────────────────── */
entries.push(url(`${BASE_URL}/`, TODAY, 'weekly', '1.0'));

/* ── 2. Root pages (fixed priority list, only if they exist) ─────────────── */
const ROOT_PAGES = [
  { file: 'about.html',    changefreq: 'weekly',  priority: '1.0' },
  { file: 'search.html',   changefreq: 'weekly',  priority: '1.0' },
  { file: 'articles.html', changefreq: 'weekly',  priority: '1.0' },
  { file: 'agent.html',    changefreq: 'weekly',  priority: '0.9' },
  { file: 'block-topia.html', changefreq: 'daily', priority: '0.9' },
];

for (const p of ROOT_PAGES) {
  if (fs.existsSync(path.join(ROOT, p.file))) {
    entries.push(url(`${BASE_URL}/${p.file}`, TODAY, p.changefreq, p.priority));
  }
}

/* ── 3. /about/*.html ────────────────────────────────────────────────────── */
for (const f of htmlFiles(path.join(ROOT, 'about'))) {
  entries.push(url(`${BASE_URL}/about/${f}`, TODAY, 'monthly', '0.6'));
}

/* ── 4. /categories/*.html ───────────────────────────────────────────────── */
for (const f of htmlFiles(path.join(ROOT, 'categories'))) {
  const priority = f === 'index.html' ? '1.0' : '0.9';
  entries.push(url(`${BASE_URL}/categories/${f}`, TODAY, 'weekly', priority));
}

/* ── 5. /wiki/*.html (canonical only) ───────────────────────────────────── */
for (const f of wikiPageFiles()) {
  entries.push(url(`${BASE_URL}/wiki/${f}`, TODAY, 'weekly', '0.7'));
}

/* ── Write output ────────────────────────────────────────────────────────── */
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...entries,
  '</urlset>',
].join('\n') + '\n';

fs.writeFileSync(OUTPUT, xml, 'utf8');
console.log(`sitemap.xml written — ${entries.length} URLs (${TODAY})`);

