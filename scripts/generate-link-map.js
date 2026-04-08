#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WIKI_DIR = path.join(ROOT, 'wiki');
const INDEX_PATH = path.join(ROOT, 'js', 'wiki-index.json');
const OUTPUT_PATH = path.join(ROOT, 'js', 'link-map.json');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);

  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else if (file.endsWith('.html')) {
      results.push(fullPath);
    }
  });

  return results;
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function extractInternalLinks(html) {
  const matches = html.match(/href=["']\/wiki\/[^"']+["']/gi) || [];
  return matches.map(m => m.replace(/href=["']/, '').replace(/["']$/, ''));
}

function slug(url) {
  return url.replace(/^\/wiki\//, '').replace(/\.html$/, '');
}

function run() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.error('Missing wiki-index.json. Run generate-wiki-index first.');
    process.exit(1);
  }

  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));

  const titleMap = {};
  index.forEach(entry => {
    titleMap[entry.title.toLowerCase()] = entry.url;
  });

  const files = walk(WIKI_DIR);
  const output = {};

  files.forEach(file => {
    const html = fs.readFileSync(file, 'utf8');
    const clean = stripHtml(html);

    const relative = path.relative(ROOT, file).replace(/\\/g, '/');
    const url = '/' + relative;

    const existing = extractInternalLinks(html);
    const existingSet = new Set(existing);

    const suggestions = [];

    Object.entries(titleMap).forEach(([title, targetUrl]) => {
      if (clean.includes(title) && !existingSet.has(targetUrl)) {
        suggestions.push(targetUrl);
      }
    });

    output[url] = {
      existing_links: Array.from(existingSet).sort(),
      suggested_links: Array.from(new Set(suggestions)).sort()
    };
  });

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Generated link-map.json for ${Object.keys(output).length} pages`);
}

run();
