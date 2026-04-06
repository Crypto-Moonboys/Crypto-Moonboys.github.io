#!/usr/bin/env node
/**
 * scripts/generate-sitemap.js
 *
 * Generates sitemap.xml from real files that exist in the repository.
 * Includes root pages, about pages, category pages, and wiki pages.
 *
 * Run after adding new pages:
 *   node scripts/generate-sitemap.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..');
const OUTPUT   = path.join(ROOT, 'sitemap.xml');
const BASE_URL = 'https://crypto-moonboys.github.io';
const TODAY    = new Date().toISOString().slice(0, 10);

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

/* ── 5. /wiki/*.html ─────────────────────────────────────────────────────── */
for (const f of htmlFiles(path.join(ROOT, 'wiki'))) {
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
