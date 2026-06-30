#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_CATEGORY_FILES = [
  'categories/nfts.html',
  'categories/wax-nfts.html',
  'categories/gkniftyheads.html',
];
const FULL_COLLECTION_URL = '/wiki/gkniftyheads-nft-collection.html';
const REQUIRED_SHELL_SCRIPTS = [
  '/js/core/daily-loop-state.js',
  '/js/site-shell.js',
  '/js/components/connection-status-panel.js',
  '/js/components/global-player-header.js',
  '/js/components/live-activity-summary.js',
];

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function hrefs(html) {
  return [...html.matchAll(/\bhref=["']([^"']+)["']/gi)].map((match) => match[1]);
}

function htmlFiles(dirRel) {
  const dir = path.join(ROOT, dirRel);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.html'))
    .map((file) => `${dirRel}/${file}`);
}

function isNftTemplateHtml(html) {
  if (/data-page-type=["']nft_collection["']/i.test(html)) return false;
  return /data-page-type=["']nft_template["']/i.test(html) ||
    /class=["'][^"']*\bnft-template-article\b/i.test(html) ||
    /<template\b[^>]*class=["'][^"']*\bnft-battle-media-template\b/i.test(html);
}

function gkniftyTemplateHrefs(html) {
  return new Set(
    hrefs(html).filter((href) => /^\/wiki\/gkniftyheads-.+-\d+\.html$/i.test(href))
  );
}

for (const relPath of REQUIRED_CATEGORY_FILES) {
  assert.ok(exists(relPath), `${relPath} must exist`);
  const html = read(relPath);
  assert.match(html, /<body\b[^>]*class=["'][^"']*\bpage-category\b/i, `${relPath} must use category shell body`);
  for (const src of REQUIRED_SHELL_SCRIPTS) {
    assert.ok(html.includes(`src="${src}"`), `${relPath} missing shell script ${src}`);
  }
  assert.match(html, /class=["'][^"']*\bcategory-grid\b/i, `${relPath} must contain a card/grid section`);
  assert.match(html, /class=["'][^"']*\bcategory-card\b/i, `${relPath} must contain card links`);
  assert.doesNotMatch(html, /class=["'][^"']*\barticle-list-item\b/i, `${relPath} must not render a flat article-list dump`);
  assert.ok(html.includes('Main Hubs'), `${relPath} must include a Main Hubs section`);
  assert.ok(html.includes(FULL_COLLECTION_URL), `${relPath} must link to the full GKniftyHEADS collection index`);
  assert.ok(
    gkniftyTemplateHrefs(html).size <= 12,
    `${relPath} must not contain more than 12 direct NFT template links`
  );
}

const categoriesIndex = read('categories/index.html');
for (const relPath of REQUIRED_CATEGORY_FILES) {
  const href = `/${relPath.replace(/\\/g, '/')}`;
  assert.ok(categoriesIndex.includes(`href="${href}"`), `categories/index.html must link to ${href}`);
}

const sitemap = read('sitemap.xml');
for (const relPath of REQUIRED_CATEGORY_FILES) {
  assert.ok(
    sitemap.includes(`https://cryptomoonboys.com/${relPath}`),
    `sitemap.xml must include public category ${relPath}`
  );
}

const gkniftyHub = read('wiki/gkniftyheads.html');
assert.ok(
  gkniftyHub.includes('href="/wiki/gkniftyheads-nft-collection.html"'),
  '/wiki/gkniftyheads.html must link to /wiki/gkniftyheads-nft-collection.html'
);
for (const href of ['/categories/gkniftyheads.html', '/categories/nfts.html', '/categories/wax-nfts.html']) {
  assert.ok(gkniftyHub.includes(`href="${href}"`), `/wiki/gkniftyheads.html must link to ${href}`);
}

const collection = read('wiki/gkniftyheads-nft-collection.html');
assert.ok(
  collection.includes('href="/wiki/gkniftyheads.html"'),
  '/wiki/gkniftyheads-nft-collection.html must link back to /wiki/gkniftyheads.html'
);
assert.ok(
  gkniftyTemplateHrefs(collection).size >= 140,
  '/wiki/gkniftyheads-nft-collection.html must remain the full GKniftyHEADS template index'
);

const gkniftyCategory = read('categories/gkniftyheads.html');
assert.ok(
  gkniftyCategory.includes('href="/wiki/gkniftyheads-nft-collection.html"') &&
    gkniftyCategory.includes('href="/wiki/gkniftyheads.html"'),
  'categories/gkniftyheads.html must connect the collection and parent hub'
);

const nftTemplatePages = htmlFiles('wiki').filter((relPath) => {
  const html = read(relPath);
  return isNftTemplateHtml(html) && relPath.startsWith('wiki/gkniftyheads-');
});
assert.ok(nftTemplatePages.length >= 140, `expected at least 140 GKniftyHEADS NFT template pages, found ${nftTemplatePages.length}`);

for (const relPath of nftTemplatePages) {
  const html = read(relPath);
  const linksCollection = html.includes('href="/wiki/gkniftyheads-nft-collection.html"');
  const hasCategoryPath = html.includes('href="/categories/gkniftyheads.html"');
  assert.ok(
    linksCollection || hasCategoryPath,
    `${relPath} must link to the collection page or have a GKniftyHEADS category path`
  );
}

const scanFiles = [
  ...htmlFiles('wiki'),
  ...htmlFiles('categories'),
  ...fs.readdirSync(ROOT)
    .filter((file) => file.endsWith('.html') && !file.startsWith('_'))
    .map((file) => file),
];
const missingCategoryLinks = [];
for (const relPath of scanFiles) {
  const html = read(relPath);
  for (const href of hrefs(html)) {
    if (!href.startsWith('/categories/') || !href.endsWith('.html')) continue;
    const target = href.replace(/^\/+/, '');
    if (!exists(target)) missingCategoryLinks.push(`${relPath} -> ${href}`);
  }
}
assert.equal(
  missingCategoryLinks.length,
  0,
  `Found category hrefs that point to missing files:\n${missingCategoryLinks.join('\n')}`
);

console.log(`GKniftyHEADS hub/category audit passed: ${nftTemplatePages.length} NFT template pages checked.`);
