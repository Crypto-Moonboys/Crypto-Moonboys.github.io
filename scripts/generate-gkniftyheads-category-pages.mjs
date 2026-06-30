#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIKI_INDEX = path.join(ROOT, 'js', 'wiki-index.json');
const CATEGORIES_DIR = path.join(ROOT, 'categories');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isWikiUrl(url) {
  return String(url || '').startsWith('/wiki/') && String(url || '') !== '/wiki/index.html';
}

function isGkniftyNftEntry(entry) {
  const url = String(entry.url || '');
  const desc = String(entry.desc || '');
  return /^\/wiki\/gkniftyheads-.+-\d+\.html$/i.test(url) ||
    url === '/wiki/gkniftyheads-nft-collection.html' ||
    desc.includes('gkniftyheads WAX AtomicAssets collection');
}

function uniqueEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (!entry || !isWikiUrl(entry.url) || seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
}

function listItems(entries) {
  if (!entries.length) {
    return '        <p style="color:var(--color-text-muted);padding:16px 0">No articles in this category yet. Check back soon!</p>';
  }

  return entries.map((entry) => `        <a href="${escapeHtml(entry.url)}" class="article-list-item">
          <div class="ali-icon">NFT</div>
          <div><div class="ali-title">${escapeHtml(entry.title)}</div><div class="ali-desc">${escapeHtml(entry.desc || 'GKniftyHEADS NFT collection page.')}</div></div>
        </a>`).join('\n');
}

function pageHtml({ slug, title, description, entries }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow">
  <meta property="og:title" content="${escapeHtml(title)} - Crypto Moonboys Wiki">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://cryptomoonboys.com/categories/${escapeHtml(slug)}.html">
  <meta property="og:image" content="https://cryptomoonboys.com/img/CRYPTO-MOONBOYS-BITCOIN-LOGO.png">
  <meta name="twitter:card" content="summary_large_image">
  <title>${escapeHtml(title)} - Crypto Moonboys Wiki</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap">
  <link rel="stylesheet" href="/css/wiki.css">
  <link rel="stylesheet" href="/css/retro-16bit-theme.css">
  <link rel="icon" type="image/png" href="/favicon.png">
</head>
<body class="page-category page-has-right-panel">
<main id="content" role="main">
      <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/index.html">Home</a><span class="sep">&rsaquo;</span><a href="/categories/index.html">Categories</a><span class="sep">&rsaquo;</span><span aria-current="page">${escapeHtml(title)}</span></nav>
      <div class="category-header"><span class="cat-big-icon" aria-hidden="true">NFT</span><div><h1 class="page-title">${escapeHtml(title)}</h1><p style="color:var(--color-text-muted)">${escapeHtml(description)}</p></div></div>
      <div class="page-title-line" aria-hidden="true"></div>
      <p style="color:var(--color-text-muted);margin-bottom:24px">This public category page is generated from <code>js/wiki-index.json</code> so NFT category buttons resolve to real website pages.</p>
      <div class="article-list" aria-label="Articles in ${escapeHtml(title)}">
${listItems(entries)}
      </div>
    </main>

<!-- Canonical script boot -->
<script data-cfasync="false" src="/js/api-config.js"></script>
<script data-cfasync="false" src="/js/arcade/core/global-event-bus.js"></script>
<script data-cfasync="false" src="/js/identity-gate.js"></script>
<script data-cfasync="false" src="/js/core/moonboys-state.js"></script>
<script data-cfasync="false" src="/js/core/daily-loop-state.js"></script>
<script data-cfasync="false" src="/js/site-shell.js"></script>
<script data-cfasync="false" src="/js/components/connection-status-panel.js"></script>
<script data-cfasync="false" src="/js/components/global-player-header.js"></script>
<script data-cfasync="false" src="/js/components/live-activity-summary.js"></script>
<script data-cfasync="false" src="/js/wiki.js"></script>
<script data-cfasync="false" src="/js/faction-alignment.js"></script>
</body>
</html>
`;
}

const wikiIndex = readJson(WIKI_INDEX);
const entries = Array.isArray(wikiIndex) ? wikiIndex : [];
const gkniftyHub = entries.filter((entry) => [
  '/wiki/gkniftyheads.html',
  '/wiki/gkniftyheads-nft-collection.html',
  '/wiki/graffpunks.html',
  '/wiki/graffiti-kings.html',
  '/wiki/hodl-wars.html',
].includes(entry.url));
const nftEntries = uniqueEntries([
  ...entries.filter(isGkniftyNftEntry),
  ...gkniftyHub,
]).sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
const gkniftyEntries = uniqueEntries([
  ...gkniftyHub,
  ...entries.filter(isGkniftyNftEntry),
]).sort((a, b) => {
  const priority = new Map([
    ['/wiki/gkniftyheads.html', 0],
    ['/wiki/gkniftyheads-nft-collection.html', 1],
    ['/wiki/graffpunks.html', 2],
    ['/wiki/graffiti-kings.html', 3],
    ['/wiki/hodl-wars.html', 4],
  ]);
  return (priority.get(a.url) ?? 20) - (priority.get(b.url) ?? 20) ||
    String(a.title || '').localeCompare(String(b.title || ''));
});

const pages = [
  {
    slug: 'nfts',
    title: 'NFTs',
    description: 'NFT collection and template pages in the Crypto Moonboys wiki, including GKniftyHEADS WAX AtomicAssets pages.',
    entries: nftEntries,
  },
  {
    slug: 'wax-nfts',
    title: 'WAX NFTs',
    description: 'WAX NFT collection and template pages sourced from AtomicAssets records.',
    entries: nftEntries,
  },
  {
    slug: 'gkniftyheads',
    title: 'GKniftyHEADS',
    description: 'Parent category for the GKniftyHEADS hub, collection index, NFT templates, and related GraffPUNKS context.',
    entries: gkniftyEntries,
  },
];

fs.mkdirSync(CATEGORIES_DIR, { recursive: true });
for (const page of pages) {
  const outPath = path.join(CATEGORIES_DIR, `${page.slug}.html`);
  fs.writeFileSync(outPath, pageHtml(page), 'utf8');
  console.log(`wrote categories/${page.slug}.html (${page.entries.length} entries)`);
}
